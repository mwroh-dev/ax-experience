// api/src/workflows/on_accept.ts
import { config } from '../config';
import { Case, add_event, save_tool_call, update_tool_call } from '../cases/case-store';
import { start_automation_run, complete_automation_run } from '../cases/automation-run-store';
import { save_draft_version } from '../cases/draft-version-store';
import { search_notion_knowledge, KnowledgeHit, write_improvement_backlog } from '../tools/notion-client';
import { build_commerce_evidence } from '../tools/commerce-evidence-builder';
import { call_cs_bot } from '../llm/claude-cli-adapter';
import { post_message, post_thread_reply } from '@slack/slack-client';
import { build_cs_bot_draft_blocks } from '@slack/blocks';
import { CommerceResult } from '../tools/commerce-evidence-builder';
import { eval_draft, type DraftEvalResult } from '../tools/draft-eval';

function detect_conflict(notion_hits: KnowledgeHit[], commerce: CommerceResult | null) {
  if (!commerce?.found) return { detected: false };
  if (commerce.requires_human_review) {
    return { detected: true, reason: 'Commerce API requires_human_review=true' };
  }
  const notion_says_ok = notion_hits.some(
    h => h.content.includes('7일 이내') || h.content.includes('전액 환불 가능'),
  );
  if (notion_says_ok && commerce.refund_eligible === false) {
    return { detected: true, reason: '정책상 환불 가능하나 Commerce API 불가' };
  }
  return { detected: false };
}

function build_evidence_snippets(notion_hits: KnowledgeHit[], commerce: CommerceResult | null): string[] {
  const snippets: string[] = [];
  for (const h of notion_hits) {
    snippets.push(`[${h.source_db}] ${h.title}: ${h.content.slice(0, 200)}`);
  }
  if (commerce?.found) {
    snippets.push(`[Commerce] order=${commerce.order_id ?? 'N/A'} refund_eligible=${commerce.refund_eligible}`);
  }
  return snippets;
}

export async function on_accept(
  c: Case,
  channel_id: string | undefined,
  thread_ts: string | undefined,
): Promise<{ draft: string; confidence: string }> {
  const tool_call_id = save_tool_call({
    case_id: c.id,
    tool_name: 'claude_cli_answer_draft',
    input: { case_id: c.id, mode: 'answer_draft', user_message: c.raw_text },
  });

  // Steps 1+2: retrieve_evidence and commerce_lookup — independent, run in parallel
  const ev_run = start_automation_run({
    ticket_id: c.id, run_type: 'retrieve_evidence',
    input: { query: c.raw_text.slice(0, 100) },
  });
  const cl_run = start_automation_run({
    ticket_id: c.id, run_type: 'commerce_lookup',
    input: { text_snippet: c.raw_text.slice(0, 100) },
  });
  const [notion_hits, commerce_result] = await Promise.all([
    search_notion_knowledge(c.raw_text, 3).catch((): KnowledgeHit[] => []),
    build_commerce_evidence(c.id, c.raw_text).catch(() => null),
  ]);
  complete_automation_run(ev_run.id, {
    output_summary: `${notion_hits.length} hits`,
    evidence_source_ids: notion_hits.map(h => `${h.source_db}:${h.source_id.slice(0, 8)}`),
    status: 'success',
    latency_ms: Date.now() - ev_run.started_at,
  });
  complete_automation_run(cl_run.id, {
    output_summary: commerce_result
      ? `found=${commerce_result.found} eligible=${commerce_result?.refund_eligible}`
      : 'no_identifier',
    status: commerce_result !== null ? 'success' : 'skipped',
    latency_ms: Date.now() - cl_run.started_at,
  });

  const conflict = detect_conflict(notion_hits, commerce_result);
  const evidence_snippets = build_evidence_snippets(notion_hits, commerce_result);
  const auto_send_allowed = !conflict.detected;

  // Step 3: draft_reply
  const dr_run = start_automation_run({
    ticket_id: c.id, run_type: 'draft_reply',
    prompt_version_id: 'pv_draft_v1',
    input: { intent: c.intent, evidence_count: evidence_snippets.length },
  });

  let draft = '';
  let confidence = 'unknown';
  let eval_result: DraftEvalResult | null = null;

  try {
    const bot_response = await call_cs_bot({
      case_id: c.id,
      mode: 'answer_draft',
      user_message: c.raw_text,
      known_context: {
        source: c.source_type,
        commerce_api_called: !!commerce_result,
        customer_identifier_present: !!commerce_result,
      },
      evidence_snippets,
    });

    update_tool_call(tool_call_id, bot_response, 'success');
    draft = bot_response.draft;
    confidence = bot_response.confidence;

    complete_automation_run(dr_run.id, {
      output_summary: `confidence=${confidence} auto_send=${auto_send_allowed}`,
      evidence_source_ids: notion_hits.map(h => `${h.source_db}:${h.source_id.slice(0, 8)}`),
      status: 'success',
      latency_ms: Date.now() - dr_run.started_at,
    });

    save_draft_version(c.id, draft, confidence, 'initial');
    add_event(c.id, 'cs_bot_draft_ready', 'bot', 'on_accept', { confidence, auto_send_allowed });

    // If the bot needs more info, log the knowledge gap to Notion backlog
    if (bot_response.needs_more_info) {
      write_improvement_backlog({
        case_id: c.id,
        missing_topic: bot_response.draft.slice(0, 100),
        raw_query: c.raw_text,
        suggested_doc_type: 'policy_or_faq',
      }).catch(err => console.warn('[on_accept] improvement_backlog write failed:', err.message));
    }

    const ev_eval = start_automation_run({
      ticket_id: c.id, run_type: 'eval_draft',
      input: { draft_length: draft.length, confidence },
    });
    eval_result = await Promise.race([
      eval_draft(c.raw_text, draft),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 5_000)),
    ]).catch(() => null);
    complete_automation_run(ev_eval.id, eval_result
      ? {
          output_summary: `pass=${eval_result.pass} score=${eval_result.score} polite=${eval_result.polite} relevant=${eval_result.relevant}`,
          status: 'success',
          latency_ms: Date.now() - ev_eval.started_at,
        }
      : { status: 'error', latency_ms: Date.now() - ev_eval.started_at, error: 'eval_failed' }
    );

  } catch (err: any) {
    complete_automation_run(dr_run.id, {
      status: 'error', latency_ms: Date.now() - dr_run.started_at, error: err.message,
    });
    update_tool_call(tool_call_id, { error: err.message }, 'error');
    add_event(c.id, 'cs_bot_failed', 'bot', 'on_accept', { error: err.message });
    throw err;
  }

  // Step 4: Post draft to Slack thread
  if (channel_id && thread_ts) {
    const evidence_labels = notion_hits.length > 0
      ? notion_hits.map(h => h.source_db)
      : commerce_result ? ['Commerce API'] : [];
    const mode = conflict.detected ? 'conflict_detected' : confidence;
    const draft_blocks = build_cs_bot_draft_blocks(c.id, mode, draft, evidence_labels, eval_result ?? undefined);
    await post_thread_reply({
      channel: channel_id,
      thread_ts,
      text: `[CS Bot Draft] case_id: ${c.id} | confidence: ${confidence}`,
      blocks: draft_blocks,
    }).catch(err => console.warn('[on_accept] thread reply failed:', err.message));
  }

  if (config.slack.voc_log_channel) {
    await post_message(
      config.slack.voc_log_channel,
      `[voc-log] draft_ready | case_id: ${c.id} | confidence: ${confidence} | notion_hits: ${notion_hits.length}`,
    ).catch(err => console.warn('[on_accept] voc-log post failed:', err.message));
  }

  return { draft, confidence };
}
