import { App } from '@slack/bolt';
import { config } from '@api/config';
import { process_cs_message } from '@cs-ops-core/pipeline';

// NOTE: This uses Socket Mode (outbound WebSocket to Slack).
// For cloud deployments, replace with HTTP Events API endpoint:
// POST /api/slack/events with X-Slack-Signature HMAC-SHA256 verification.
export function register_messages(app: App): void {
  app.message(async ({ message }) => {
    const msg = message as any;
    const target = config.slack.cs_events_channel;
    if (!target) return;
    if (msg.channel !== target) return;
    if (msg.subtype) return;
    if (!msg.text?.trim()) return;

    const result = await process_cs_message(msg.text, msg.ts);
    if (!result.ok) {
      console.error(`[slack/messages] pipeline error at ${result.step}: ${result.error}`);
    }
  });
}
