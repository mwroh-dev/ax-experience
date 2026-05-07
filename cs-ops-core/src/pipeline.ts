// cs-ops-core/src/pipeline.ts
import { v4 as uuidv4 } from 'uuid';
import { match } from 'ts-pattern';
import { FlowResult } from '@api/pipeline/index';
import { normalize_ticket } from './classifier/ticket';
import { retrieve_evidence } from './evidence/retriever';
import { match_policies } from './policy/matcher';
import { generate_draft } from './draft/generator';
import { apply_risk_gate } from './gate/risk';
import { log_automation_run } from './logging/automation-run';
import { call_cs_bot } from './lib/openclaw-client';
import { make_failed_run } from './pipeline/run-log-builder';
import { route_by_risk } from './pipeline/router';
import { notify_auto, notify_review, notify_escalate } from './pipeline/notifier';
import { AutomationRunLog, EvidenceBundle, PolicyMatch } from './types';
import { get_kb, is_auto_safe, log_run_sample, log_judge_decision } from './knowledge/db';
import { claude_cli_judge, LLMJudge } from './lib/llm-judge';

export const KB_FAST_PATH_REASON = 'knowledge DB fast-path' as const;

export async function process_cs_message(
  message: string,
  _slack_ts: string,
  judge: LLMJudge = claude_cli_judge,
): Promise<FlowResult<AutomationRunLog>> {
  const run_id = uuidv4();
  const steps: string[] = [];
  const allow_auto_send = process.env.CS_OPS_ALLOW_AUTO_SEND === 'true';

  if (!message || !message.trim()) {
    return {
      ok: false,
      error: 'message is empty — cannot process empty CS message',
      step: 'validate_input',
      trace: [{ step: 'validate_input', started_at: Date.now(), duration_ms: 0, ok: false }],
    };
  }

  // Step 1: Classify ticket
  steps.push('normalize_ticket');
  const ticket_result = await normalize_ticket(message);
  if (!ticket_result.ok) {
    const run = make_failed_run(run_id, 'unknown', 'classify_failed', steps, ticket_result.error);
    await log_automation_run(run).catch(() => {});
    return { ok: false, error: ticket_result.error, step: 'normalize_ticket', trace: ticket_result.trace };
  }
  const ticket = ticket_result.value;

  // Step 1.5: Knowledge DB fast-path — skip gate for known consumer-resolvable queries.
  // human_review_required is a hard block regardless of KB match.
  const kb = get_kb();
  const kb_safe =
    !ticket.human_review_required &&
    is_auto_safe(kb, ticket.customer_intent, ticket.order_state, ticket.risk_level);

  // Carry forward successful evidence from fast-path to avoid redundant network calls.
  let cached_evidence: FlowResult<EvidenceBundle> | null = null;

  if (kb_safe) {
    steps.push('knowledge_db_fast_path');
    const kb_sub_start = steps.length;

    steps.push('retrieve_evidence');
    const kb_evidence = await retrieve_evidence(ticket);

    steps.push('generate_draft');
    const draft_result = kb_evidence.ok
      ? await generate_draft(kb_evidence.value, [])
      : null;

    let fallthrough_reason = 'evidence/draft failed';

    if (kb_evidence.ok && draft_result?.ok) {
      const is_refund_eligible =
        ticket.customer_intent !== 'refund_request' ||
        kb_evidence.value.refund_eligibility?.eligible === true;

      if (is_refund_eligible) {
        const reviewer_action = allow_auto_send ? 'auto_sent' : 'auto_suppressed';
        await notify_auto(draft_result.value, ticket.ticket_id).catch(() => {});

        const kb_run: AutomationRunLog = {
          run_id,
          ticket_id: ticket.ticket_id,
          phase: 'complete',
          steps,
          risk_decision: { action: 'auto', reason: KB_FAST_PATH_REASON },
          reviewer_action,
          evidence_ids: draft_result.value.evidence_ids,
          final_answer: draft_result.value.text,
          detected_intent: ticket.customer_intent,
        };

        log_run_sample(kb, {
          run_id,
          intent: ticket.customer_intent,
          order_state: ticket.order_state,
          risk_level: ticket.risk_level,
          route: 'auto',
        });
        await log_automation_run(kb_run).catch(() => {});

        return { ok: true, value: kb_run, trace: ticket_result.trace };
      }
      fallthrough_reason = 'refund eligibility not confirmed';
    }

    // Preserve successful evidence so the normal pipeline can skip re-fetching.
    if (kb_evidence.ok) cached_evidence = kb_evidence;

    // Rollback fast-path sub-steps so the normal pipeline re-records them cleanly.
    steps.splice(kb_sub_start);
    console.warn(`[pipeline] KB fast-path ${fallthrough_reason} — falling through to normal pipeline`);
  }

  // Step 2: Retrieve evidence (reuse from fast-path if available)
  steps.push('retrieve_evidence');
  const evidence_result = cached_evidence ?? await retrieve_evidence(ticket);
  if (!evidence_result.ok) {
    const run = make_failed_run(run_id, ticket.ticket_id, 'evidence_failed', steps, evidence_result.error);
    await log_automation_run(run).catch(() => {});
    return { ok: false, error: evidence_result.error, step: 'retrieve_evidence', trace: evidence_result.trace };
  }
  const bundle = evidence_result.value;

  // Step 3: Match policies (pure)
  steps.push('match_policies');
  const matches: PolicyMatch[] = match_policies(bundle);

  // Step 4: Generate draft
  steps.push('generate_draft');
  const draft_result = await generate_draft(bundle, matches);
  if (!draft_result.ok) {
    const run = make_failed_run(
      run_id,
      ticket.ticket_id,
      'draft_failed',
      steps,
      draft_result.error,
      matches.flatMap((m) => m.evidence_used),
    );
    await log_automation_run(run).catch(() => {});
    return { ok: false, error: draft_result.error, step: 'generate_draft', trace: draft_result.trace };
  }
  const draft = draft_result.value;

  // Step 5: Apply risk gate (pure)
  steps.push('apply_risk_gate');
  const risk_decision = apply_risk_gate(ticket, matches);

  // Step 6: Route based on risk decision
  steps.push('route');
  let reviewer_action: string | undefined;
  let hold_summary: string | undefined;

  const route = route_by_risk(risk_decision);

  try {
    await match(route)
      .with('auto', async () => {
        // Step 6b: LLM Judge — safety check before auto-send for non-KB cases
        const judge_result = await judge({ ticket });
        const judge_log_base = { run_id, intent: ticket.customer_intent, order_state: ticket.order_state, risk_level: ticket.risk_level };
        if (judge_result.ok) {
          log_judge_decision(kb, {
            ...judge_log_base,
            is_auto_safe: judge_result.value.is_auto_safe,
            reason: judge_result.value.reason,
            confidence: judge_result.value.confidence,
          });
        } else {
          // Judge call failed — log sentinel so the run_id is traceable in judge_decisions.
          // Fail-open: auto-send proceeds below as if is_auto_safe=true.
          log_judge_decision(kb, {
            ...judge_log_base,
            is_auto_safe: true,
            reason: `judge call failed — fail-open: ${judge_result.error}`,
            confidence: 'low',
          });
        }
        if (judge_result.ok && !judge_result.value.is_auto_safe) {
          // Judge overrides gate: demote to review
          await notify_review(bundle, matches, draft, run_id);
          reviewer_action = 'judge_demoted_to_review';
        } else {
          await notify_auto(draft, ticket.ticket_id);
          reviewer_action = allow_auto_send ? 'auto_sent' : 'auto_suppressed';
        }
      })
      .with('escalate', async () => {
        await notify_escalate(bundle, matches, draft, risk_decision.reason);
        reviewer_action = 'escalated';
      })
      .with('review', async () => {
        await notify_review(bundle, matches, draft, run_id);
        reviewer_action = 'pending_review';
      })
      .exhaustive();
  } catch (slack_err) {
    console.warn('[pipeline] Slack notification failed:', slack_err);
  }

  await match(route)
    .with('review', async () => {
      try {
        const summary_result = await call_cs_bot({
          case_id: ticket.ticket_id,
          mode: 'keep_summary',
          user_message: message,
        });
        hold_summary = summary_result.draft;
      } catch (summary_err) {
        console.warn('[pipeline] keep_summary failed — continuing without hold summary:', summary_err);
      }
    })
    .with('auto', () => undefined)
    .with('escalate', () => undefined)
    .exhaustive();

  // Step 7: Log to Notion (non-blocking)
  steps.push('log_automation_run');
  let audit_log_failed = false;

  log_run_sample(kb, {
    run_id,
    intent: ticket.customer_intent,
    order_state: ticket.order_state,
    risk_level: ticket.risk_level,
    route,
  });

  const final_run: AutomationRunLog = {
    run_id,
    ticket_id: ticket.ticket_id,
    phase: 'complete',
    steps,
    risk_decision,
    reviewer_action,
    evidence_ids: draft.evidence_ids,
    final_answer: route === 'auto' ? draft.text : hold_summary,
    hold_summary,
    detected_intent: ticket.customer_intent,
  };

  try {
    await log_automation_run(final_run);
  } catch (err) {
    console.warn('[pipeline] log_automation_run failed — audit trail gap:', err);
    audit_log_failed = true;
  }

  return {
    ok: true,
    value: { ...final_run, audit_log_failed },
    trace: [
      ...ticket_result.trace,
      ...evidence_result.trace,
      ...draft_result.trace,
    ],
  };
}
