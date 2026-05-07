// cs-ops-core/src/lib/slack-client.ts
// Atomic Slack client — all functions return FlowResult<T>. No classes.

import { WebClient } from '@slack/web-api';
import type { KnownBlock } from '@slack/types';
import { FlowResult, TraceEntry } from '@api/pipeline/index';

// ── Internal helpers ──────────────────────────────────────────────────────────

function get_token(): string {
  return process.env.SLACK_BOT_TOKEN ?? '';
}

function make_client(): WebClient {
  return new WebClient(get_token());
}

function ok_trace(step: string, started_at: number): TraceEntry {
  return { step, started_at, duration_ms: Date.now() - started_at, ok: true };
}

function err_trace(step: string, started_at: number): TraceEntry {
  return { step, started_at, duration_ms: Date.now() - started_at, ok: false };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Post a plain-text message to a channel.
 * Returns the Slack message timestamp (ts) on success.
 */
export async function post_message(
  channel: string,
  text: string,
): Promise<FlowResult<{ ts: string }>> {
  const step = 'post_message';
  const started_at = Date.now();

  const token = get_token();
  if (!token) {
    return {
      ok: false,
      error: 'SLACK_BOT_TOKEN is not set — cannot post message',
      step,
      trace: [err_trace(step, started_at)],
    };
  }

  try {
    const client = make_client();
    const res = await client.chat.postMessage({ channel, text });
    const ts = (res.ts as string | undefined) ?? '';
    return {
      ok: true,
      value: { ts },
      trace: [ok_trace(step, started_at)],
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      step,
      trace: [err_trace(step, started_at)],
    };
  }
}

/**
 * Post a Block Kit message to a channel (used for CS review cards).
 * Returns the Slack message timestamp (ts) on success.
 */
export async function post_review_block(
  channel: string,
  blocks: KnownBlock[],
  text: string,
): Promise<FlowResult<{ ts: string }>> {
  const step = 'post_review_block';
  const started_at = Date.now();

  const token = get_token();
  if (!token) {
    return {
      ok: false,
      error: 'SLACK_BOT_TOKEN is not set — cannot post review block',
      step,
      trace: [err_trace(step, started_at)],
    };
  }

  try {
    const client = make_client();
    const res = await client.chat.postMessage({ channel, text, blocks });
    const ts = (res.ts as string | undefined) ?? '';
    return {
      ok: true,
      value: { ts },
      trace: [ok_trace(step, started_at)],
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      step,
      trace: [err_trace(step, started_at)],
    };
  }
}

/**
 * Update an existing message identified by channel + ts.
 */
export async function update_message(
  { channel, ts, text }: { channel: string; ts: string; text: string },
): Promise<FlowResult<void>> {
  const step = 'update_message';
  const started_at = Date.now();

  const token = get_token();
  if (!token) {
    return {
      ok: false,
      error: 'SLACK_BOT_TOKEN is not set — cannot update message',
      step,
      trace: [err_trace(step, started_at)],
    };
  }

  try {
    const client = make_client();
    await client.chat.update({ channel, ts, text });
    return {
      ok: true,
      value: undefined,
      trace: [ok_trace(step, started_at)],
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      step,
      trace: [err_trace(step, started_at)],
    };
  }
}

/**
 * Fetch basic profile info for a Slack user.
 */
export async function get_user_info(
  user_id: string,
): Promise<FlowResult<{ name: string; real_name: string }>> {
  const step = 'get_user_info';
  const started_at = Date.now();

  const token = get_token();
  if (!token) {
    return {
      ok: false,
      error: 'SLACK_BOT_TOKEN is not set — cannot fetch user info',
      step,
      trace: [err_trace(step, started_at)],
    };
  }

  try {
    const client = make_client();
    const res = await client.users.info({ user: user_id });
    const user = res.user as { name?: string; real_name?: string } | undefined;
    return {
      ok: true,
      value: {
        name: user?.name ?? '',
        real_name: user?.real_name ?? '',
      },
      trace: [ok_trace(step, started_at)],
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      step,
      trace: [err_trace(step, started_at)],
    };
  }
}
