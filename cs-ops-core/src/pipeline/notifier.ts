// cs-ops-core/src/pipeline/notifier.ts
import { build_review_block } from '../slack/review-block';
import { mask_pii } from '../lib/pii';
import { post_message, post_review_block } from '../lib/slack-client';
import { EvidenceBundle, PolicyMatch, Draft } from '../types';

export async function notify_auto(draft: Draft, ticket_id: string): Promise<void> {
  const allow_auto = process.env.CS_OPS_ALLOW_AUTO_SEND === 'true';
  if (!allow_auto) {
    console.warn('[pipeline] auto-send suppressed: CS_OPS_ALLOW_AUTO_SEND not set to "true"');
    return;
  }

  const voc_log_channel = process.env.SLACK_VOC_LOG_CHANNEL_ID ?? '';
  if (voc_log_channel) {
    const res = await post_message(voc_log_channel, mask_pii(draft.text));
    if (!res.ok) {
      console.warn('[pipeline] post_message (auto draft) failed:', res.error);
    }
  }
}

export async function notify_review(
  bundle: EvidenceBundle,
  matches: PolicyMatch[],
  draft: Draft,
  run_id: string,
): Promise<void> {
  void matches;
  const review_channel = process.env.SLACK_CS_REVIEW_CHANNEL_ID ?? '';

  if (review_channel) {
    // Note: review channel (SLACK_CS_REVIEW_CHANNEL_ID) is a trusted operator-only internal channel.
    // draft.text is intentionally NOT masked here so CS agents can review the full customer message.
    // Only the auto-send path (VOC log channel) masks PII, as it may be more broadly visible.
    const blocks = build_review_block(bundle.ticket, bundle, draft, run_id);
    const res = await post_review_block(
      review_channel,
      blocks,
      `CS Review Required — Ticket ${bundle.ticket.ticket_id}`,
    );
    if (!res.ok) {
      console.warn('[pipeline] post_review_block failed:', res.error);
    }
  }
}

export async function notify_escalate(
  bundle: EvidenceBundle,
  matches: PolicyMatch[],
  draft: Draft,
  reason: string,
): Promise<void> {
  void matches;
  void draft;
  const manager_channel = process.env.SLACK_CS_MANAGER_CHANNEL_ID ?? '';

  if (manager_channel) {
    const res = await post_message(
      manager_channel,
      `🚨 *Auto-Escalation*\nTicket: \`${bundle.ticket.ticket_id}\`\nReason: ${reason}`,
    );
    if (!res.ok) {
      console.warn('[pipeline] post_message (escalation) failed:', res.error);
    }
  }
}
