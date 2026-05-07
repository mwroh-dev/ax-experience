import { get_db } from '../db/sqlite';
import { post_message } from '@slack/slack-client';
import { config } from '../config';

export interface StaleCaseAlertResult {
  status: 'sent' | 'skipped';
  stale_count: number;
  slack_ts?: string;
  reason?: string;
}

const MAX_CASE_IDS_IN_MESSAGE = 10;

export async function post_stale_case_alert(): Promise<StaleCaseAlertResult> {
  const ops_channel = config.slack.ops_channel_id;
  if (!ops_channel) {
    return {
      status: 'skipped',
      stale_count: 0,
      reason: 'SLACK_OPS_CHANNEL_ID not set',
    };
  }

  const db = get_db();
  const rows = db
    .prepare(
      `SELECT id
       FROM cases
       WHERE status = 'pending'
         AND updated_at < datetime('now', '-24 hours')
       ORDER BY updated_at ASC`,
    )
    .all() as { id: string }[];

  const stale_count = rows.length;

  if (stale_count === 0) {
    return {
      status: 'skipped',
      stale_count: 0,
      reason: 'no stale cases',
    };
  }

  const shown = rows.slice(0, MAX_CASE_IDS_IN_MESSAGE);
  const id_lines = shown.map((r, i) => `${i + 1}. \`${r.id}\``).join('\n');
  const overflow =
    stale_count > MAX_CASE_IDS_IN_MESSAGE
      ? `\n…and ${stale_count - MAX_CASE_IDS_IN_MESSAGE} more`
      : '';
  const text =
    `:warning: *Stale Case Alert* — ${stale_count} case(s) stuck in *pending* >24h:\n` +
    `${id_lines}${overflow}`;

  let ts: string;
  try {
    const resp = await post_message(ops_channel, text);
    ts = resp.ts;
  } catch (err) {
    return {
      status: 'skipped',
      stale_count,
      reason: err instanceof Error ? err.message : 'slack post failed',
    };
  }

  return { status: 'sent', stale_count, slack_ts: ts };
}
