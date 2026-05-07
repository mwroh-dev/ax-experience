// cs-ops-core/src/slack/review-block.ts
import type { KnownBlock } from '@slack/types';
import { Ticket, EvidenceBundle, Draft } from '../types';

const RISK_BADGE: Record<Ticket['risk_level'], string> = {
  low: '🟢 LOW',
  medium: '🟡 MEDIUM',
  high: '🔴 HIGH',
  critical: '🚨 CRITICAL',
};

function truncate(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function build_evidence_section(bundle: EvidenceBundle): string {
  const items: string[] = [];

  if (bundle.order) {
    items.push(
      `📦 *Order ${bundle.order.orderId}*: ${bundle.order.status}` +
        (bundle.order.carrier ? ` via ${bundle.order.carrier}` : '')
    );
  }
  if (bundle.refund_eligibility) {
    items.push(
      `💰 *Refund*: ${bundle.refund_eligibility.eligible ? '✅ eligible' : '❌ ineligible'} — ${bundle.refund_eligibility.reason}`
    );
  }
  for (const faq of bundle.faq_matches.slice(0, 1)) {
    items.push(`❓ *FAQ*: ${truncate(faq.title, 80)}`);
  }

  return items.slice(0, 3).join('\n');
}

export function build_review_block(
  ticket: Ticket,
  bundle: EvidenceBundle,
  draft: Draft,
  run_id: string,
): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🎫 CS Review Required — ${RISK_BADGE[ticket.risk_level]}`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Ticket ID:*\n\`${ticket.ticket_id}\`` },
        { type: 'mrkdwn', text: `*Risk Level:*\n${RISK_BADGE[ticket.risk_level]}` },
        {
          type: 'mrkdwn',
          text: `*Customer Intent:*\n${ticket.customer_intent.replace(/_/g, ' ')}`,
        },
        {
          type: 'mrkdwn',
          text: `*Recommended:*\n${ticket.recommended_action.replace(/_/g, ' ')}`,
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*📋 Evidence (top 3):*\n${build_evidence_section(bundle) || '_No evidence retrieved_'}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*✏️ Draft Response:*\n${truncate(draft.text, 500)}`,
      },
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          action_id: 'cs_review_approve',
          text: { type: 'plain_text', text: '✅ Approve', emoji: true },
          style: 'primary',
          value: JSON.stringify({ run_id, ticket_id: ticket.ticket_id }),
        },
        {
          type: 'button',
          action_id: 'cs_review_revise',
          text: { type: 'plain_text', text: '✏️ Revise', emoji: true },
          value: JSON.stringify({ run_id, ticket_id: ticket.ticket_id }),
        },
        {
          type: 'button',
          action_id: 'cs_review_hold',
          text: { type: 'plain_text', text: '⏸️ Hold', emoji: true },
          value: JSON.stringify({ run_id, ticket_id: ticket.ticket_id }),
        },
        {
          type: 'button',
          action_id: 'cs_review_escalate',
          text: { type: 'plain_text', text: '⬆️ Escalate', emoji: true },
          style: 'danger',
          value: JSON.stringify({ run_id, ticket_id: ticket.ticket_id }),
        },
        {
          type: 'button',
          action_id: 'cs_review_evidence',
          text: { type: 'plain_text', text: '🔍 Evidence', emoji: true },
          value: JSON.stringify({ run_id, ticket_id: ticket.ticket_id }),
        },
      ],
    },
  ];

  return blocks;
}
