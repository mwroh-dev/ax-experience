// cs-ops-core/src/classifier/ticket.ts
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { FlowResult } from '@api/pipeline/index';
import { ClassifyLLM } from '../llm/ports';
import { claude_cli_classify_adapter } from '../llm/claude-cli-classify-adapter';
import { detect_language } from '../lib/language';
import { Ticket } from '../types';

const TicketSchema = z.object({
  customer_intent: z.enum([
    'refund_request', 'exchange_request', 'delivery_inquiry',
    'subscription_cancel', 'privacy_request', 'product_defect_report',
    'general_inquiry', 'complaint',
  ]),
  issue_reason: z.enum([
    'changed_mind', 'defective_product', 'not_as_described', 'late_delivery',
    'wrong_item', 'payment_dispute', 'subscription_billing', 'data_breach_concern', 'other',
  ]).catch('other'),
  order_state: z.enum([
    'not_shipped', 'in_transit', 'delivered', 'returned', 'cancelled', 'unknown', 'no_order',
  ]).catch('unknown'),
  risk_level: z.enum(['low', 'medium', 'high', 'critical']).catch('medium'),
  evidence_required: z.array(z.enum([
    'order_status', 'delivery_proof', 'customer_history', 'refund_eligibility',
    'faq_entry', 'policy_rule', 'legal_reference',
  ])).catch([]),
  human_review_required: z.boolean().optional(),
  recommended_action: z.enum([
    'auto_respond', 'human_review', 'escalate', 'request_more_info',
  ]).catch('human_review'),
});

function safe_parse_ticket(raw: string): Ticket | null {
  try {
    const json_match = raw.match(/\{[\s\S]*\}/);
    if (!json_match) return null;

    const result = TicketSchema.safeParse(JSON.parse(json_match[0]));
    if (!result.success) return null;

    const d = result.data;
    const risk = d.risk_level;
    const human_review = d.human_review_required ?? (risk === 'high' || risk === 'critical');

    return {
      ticket_id: uuidv4(),
      customer_intent: d.customer_intent,
      issue_reason: d.issue_reason,
      order_state: d.order_state,
      risk_level: risk,
      evidence_required: d.evidence_required,
      human_review_required: human_review,
      recommended_action: d.recommended_action,
    };
  } catch {
    return null;
  }
}

export async function normalize_ticket(
  message: string,
  llm: ClassifyLLM = claude_cli_classify_adapter,
): Promise<FlowResult<Ticket>> {
  const started_at = Date.now();
  try {
    const response = await llm.classifyTicket(message);

    const ticket = safe_parse_ticket(response.raw_llm_response);
    if (!ticket) {
      return {
        ok: false,
        error: 'Failed to parse ticket from LLM response',
        step: 'normalize_ticket',
        trace: [{ step: 'normalize_ticket', started_at, duration_ms: Date.now() - started_at, ok: false }],
      };
    }

    ticket.raw_message = message;
    ticket.language = detect_language(message);

    return {
      ok: true,
      value: ticket,
      trace: [{ step: 'normalize_ticket', started_at, duration_ms: Date.now() - started_at, ok: true }],
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      step: 'normalize_ticket',
      trace: [{ step: 'normalize_ticket', started_at, duration_ms: Date.now() - started_at, ok: false }],
    };
  }
}
