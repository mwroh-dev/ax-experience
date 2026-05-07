// cs-ops-core/src/lib/slack-client.e2e.spec.ts
// E2E integration tests for the Slack atomic client — calls the real Slack API.
// Guard: only runs when E2E=true AND SLACK_BOT_TOKEN is set.
// Run: E2E=true npx jest slack-client.e2e --no-coverage

// Load .env from cs-ops-core/ without dotenv dependency
import * as fs from 'fs';
import * as path from 'path';
(function load_env() {
  const env_path = path.resolve(__dirname, '../../.env');
  if (!fs.existsSync(env_path)) return;
  for (const line of fs.readFileSync(env_path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const sep = trimmed.indexOf('=');
    if (sep === -1) continue;
    const key = trimmed.slice(0, sep);
    const val = trimmed.slice(sep + 1);
    if (!(key in process.env)) process.env[key] = val;
  }
})();

import { WebClient } from '@slack/web-api';
import { post_message, update_message, get_user_info } from './slack-client';

// ── E2E Guard ─────────────────────────────────────────────────────────────────
// All tests are skipped unless E2E=true and SLACK_BOT_TOKEN is present.

const describeE2E =
  !process.env.E2E || !process.env.SLACK_BOT_TOKEN ? describe.skip : describe;

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHANNEL = process.env.SLACK_CS_REVIEW_CHANNEL_ID ?? '';

/** Best-effort cleanup: delete a Slack message. Does not throw. */
async function delete_message(channel: string, ts: string): Promise<void> {
  try {
    const client = new WebClient(process.env.SLACK_BOT_TOKEN);
    await client.chat.delete({ channel, ts });
  } catch {
    // best-effort — do not fail the test on cleanup errors
  }
}

// ── E2E Suite ─────────────────────────────────────────────────────────────────

describeE2E('Slack Client E2E', () => {
  let bot_user_id: string | undefined;

  /**
   * Pending cleanups: all (channel, ts) pairs posted during a test.
   * afterEach flushes this list regardless of whether the test passed or failed,
   * guaranteeing no real Slack messages are left behind after the suite.
   */
  let pending_cleanups: { channel: string; ts: string }[] = [];

  beforeAll(async () => {
    // Resolve the bot's own user ID via auth.test() so Test 3 can look it up.
    try {
      const client = new WebClient(process.env.SLACK_BOT_TOKEN);
      const auth = await client.auth.test();
      bot_user_id = (auth.user_id as string | undefined) ?? undefined;
    } catch {
      bot_user_id = undefined;
    }
  }, 30000);

  afterEach(async () => {
    // Flush all pending message cleanups — runs even when the test assertion failed.
    for (const { channel, ts } of pending_cleanups) {
      await delete_message(channel, ts);
    }
    pending_cleanups = [];
  }, 30000);

  // ── Test 1: post_message → ok:true, ts is non-empty string ─────────────────

  test(
    'post_message returns ok:true with a non-empty ts',
    async () => {
      const result = await post_message(
        CHANNEL,
        '[E2E TEST] post_message smoke test — please ignore',
      );

      expect(result.ok).toBe(true);

      if (result.ok) {
        // Register for afterEach cleanup BEFORE any further assertions so the
        // message is always deleted even if the expectations below fail.
        pending_cleanups.push({ channel: CHANNEL, ts: result.value.ts });

        expect(typeof result.value.ts).toBe('string');
        expect(result.value.ts.length).toBeGreaterThan(0);
      }
    },
    30000,
  );

  // ── Test 2: post_message → update_message, both ok:true ────────────────────

  test(
    'post_message then update_message both return ok:true',
    async () => {
      const post = await post_message(
        CHANNEL,
        '[E2E TEST] original message — please ignore',
      );

      expect(post.ok).toBe(true);
      if (!post.ok) return; // type narrowing — guard already checked above

      const { ts } = post.value;

      // Register for afterEach cleanup immediately after receiving ts so the
      // message is deleted even if update_message or subsequent assertions fail.
      pending_cleanups.push({ channel: CHANNEL, ts });

      const update = await update_message({
        channel: CHANNEL,
        ts,
        text: '[E2E TEST] updated — please ignore',
      });

      expect(update.ok).toBe(true);
    },
    30000,
  );

  // ── Test 3: get_user_info for the bot's own user ID ────────────────────────
  // Skipped gracefully when the bot user ID cannot be resolved.
  // This test does not post any messages, so no cleanup is needed.

  test(
    'get_user_info returns name for the bot owner user',
    async () => {
      if (!bot_user_id) {
        // user_id unavailable — skip gracefully without failing
        console.warn(
          '[E2E] Skipping get_user_info test: bot user_id could not be resolved via auth.test()',
        );
        return;
      }

      const result = await get_user_info(bot_user_id);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(typeof result.value.name).toBe('string');
        expect(typeof result.value.real_name).toBe('string');
      }
    },
    30000,
  );
});
