import { get_db } from '../db/sqlite';
import { post_message } from '@slack/slack-client';
import { config } from '../config';

export interface DigestResult {
  status: 'sent' | 'skipped';
  topics_reported: number;
  slack_ts?: string;
  reason?: string;
}

export async function post_knowledge_gap_digest(): Promise<DigestResult> {
  const ops_channel = config.slack.ops_channel_id;
  if (!ops_channel) {
    return { status: 'skipped', topics_reported: 0, reason: 'SLACK_OPS_CHANNEL_ID not set' };
  }

  const db = get_db();
  const rows = db
    .prepare(
      `SELECT missing_topic, COUNT(*) as cnt
       FROM improvement_backlog
       WHERE status = 'open'
       GROUP BY missing_topic
       ORDER BY cnt DESC
       LIMIT 10`,
    )
    .all() as { missing_topic: string; cnt: number }[];

  if (rows.length === 0) {
    return { status: 'skipped', topics_reported: 0, reason: 'no open improvement_backlog items' };
  }

  const lines = rows.map((r, i) => `${i + 1}. *${r.missing_topic}* — ${r.cnt} case(s)`).join('\n');
  const text = `:mag: *Knowledge Gap Digest* — Top ${rows.length} missing topics:\n${lines}`;

  let ts: string;
  try {
    const resp = await post_message(ops_channel, text);
    ts = resp.ts;
  } catch (err) {
    return {
      status: 'skipped',
      topics_reported: 0,
      reason: err instanceof Error ? err.message : 'slack post failed',
    };
  }

  return { status: 'sent', topics_reported: rows.length, slack_ts: ts };
}
