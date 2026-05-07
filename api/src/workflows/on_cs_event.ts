// api/src/workflows/on_cs_event.ts
import { config } from '../config';
import {
  create_case, find_case_by_external_request_id,
  save_review_message, add_event,
} from '../cases/case-store';
import { post_message } from '@slack/slack-client';
import { build_intake_review_blocks } from '@slack/blocks';
import { start_automation_run, complete_automation_run } from '../cases/automation-run-store';
import { ROUTING_RULES, DEFAULT_RULE } from '../router/routing-rules';

function classify(text: string) {
  const normalized = text.toLowerCase();
  for (const { keywords, rule } of ROUTING_RULES) {
    if (keywords.some(kw => normalized.includes(kw.toLowerCase()))) return rule;
  }
  return DEFAULT_RULE;
}

export interface CsEventPayload {
  source: string;
  event_type?: string;
  message: string;
  customer_ref?: { email?: string };
  metadata?: { request_id?: string };
}

export async function on_cs_event(
  payload: CsEventPayload,
): Promise<{ case_id: string; slack_ts: string; duplicate?: boolean }> {
  const ext_id = payload.metadata?.request_id;

  if (ext_id) {
    const existing = find_case_by_external_request_id(ext_id);
    if (existing) {
      add_event(existing.id, 'duplicate_received', 'system', undefined, { external_request_id: ext_id });
      return { case_id: existing.id, slack_ts: 'duplicate', duplicate: true };
    }
  }

  const t0 = Date.now();
  const decision = classify(payload.message);

  const c = create_case({
    source_type: payload.source ?? 'unknown',
    external_request_id: ext_id,
    raw_text: payload.message,
    intent: decision.intent,
    risk_level: decision.risk_level,
    recommended_path: decision.recommended_path,
  });

  const cl_run = start_automation_run({
    ticket_id: c.id, run_type: 'classify',
    prompt_version_id: 'pv_classifier_v1',
    input: { text_snippet: payload.message.slice(0, 100) },
  });
  complete_automation_run(cl_run.id, {
    output_summary: `intent=${decision.intent} path=${decision.recommended_path}`,
    status: 'success',
    latency_ms: Date.now() - t0,
  });

  if (!config.slack.voc_review_channel) {
    throw new Error('SLACK_VOC_REVIEW_CHANNEL is not configured');
  }

  const blocks = build_intake_review_blocks(c, payload.source, decision);
  const fallback_text = `[CS Intake Review] Case ${c.id}: ${payload.message.slice(0, 100)}`;

  const sp_run = start_automation_run({
    ticket_id: c.id, run_type: 'slack_post',
    input: { channel: config.slack.voc_review_channel },
  });
  const { ts, channel } = await post_message(
    config.slack.voc_review_channel, fallback_text, blocks,
  );
  complete_automation_run(sp_run.id, {
    output_summary: `posted ts=${ts}`,
    status: 'success',
    latency_ms: Date.now() - sp_run.started_at,
  });

  save_review_message({
    case_id: c.id,
    review_channel_id: channel,
    review_message_ts: ts,
    blocks_json: JSON.stringify(blocks),
  });

  if (config.slack.voc_log_channel) {
    await post_message(
      config.slack.voc_log_channel,
      `[voc-log] case_received | case_id: ${c.id} | source: ${payload.source} | text: ${payload.message.slice(0, 80)}`,
    ).catch(err => console.warn('[voc-log] post failed:', err.message));
  }

  add_event(c.id, 'slack_review_posted', 'system', undefined, { channel, ts });
  return { case_id: c.id, slack_ts: ts };
}
