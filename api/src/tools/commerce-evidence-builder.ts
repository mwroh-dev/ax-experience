export interface CommerceResult {
  found: boolean;
  customer_id?: string;
  email_masked?: string;
  tier?: string;
  subscription_status?: string;
  order_id?: string;
  order_status?: string;
  shipment_status?: string;
  tracking_number?: string;
  payment_status?: string;
  refund_eligible?: boolean;
  refund_reason_codes?: string[];
  dry_run?: { would_refund: boolean; would_refund_amount?: number; processing_days?: number };
  requires_human_review?: boolean;
  notes?: string[];
}

/**
 * Commerce Evidence Builder
 *
 * Extracts identifiers from VOC text and assembles CommerceResult
 * via Commerce API. No Slack fields passed. No data stored in cs-ops-core.
 */

import {
  lookup_commerce_customer,
  get_order,
  get_shipment,
  get_payment,
  check_refund_eligibility_by_order,
  check_refund_eligibility_by_email,
  dry_run_commerce_refund,
} from './commerce-api-client';

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;
const ORDER_RE = /\b(ORD-[A-Z0-9\-]+)\b/i;

export async function build_commerce_evidence(
  _case_id: string,
  raw_text: string
): Promise<CommerceResult | null> {
  const email_match = raw_text.match(EMAIL_RE);
  const order_match = raw_text.match(ORDER_RE);

  if (!email_match && !order_match) return null;

  try {
    const result: CommerceResult = { found: false };

    // ── Customer lookup ─────────────────────────────────────────────────────
    if (email_match) {
      const customer = await lookup_commerce_customer(email_match[0]) as Record<string, any>;
      if (!customer.found) return { found: false };
      result.found = true;
      result.customer_id = customer.customer_id;
      result.email_masked = customer.email_masked;
      result.tier = customer.tier;
      result.subscription_status = customer.subscription_status;
    }

    // ── Order lookup ─────────────────────────────────────────────────────────
    const order_id = order_match?.[1] ?? null;
    if (order_id) {
      result.found = true;
      const order = await get_order(order_id) as Record<string, any>;
      if (order.found) {
        result.order_id = order.order_id;
        result.order_status = order.status;
        if (!result.customer_id && order.customer_id) result.customer_id = order.customer_id;
      }

      const shipment = await get_shipment(order_id) as Record<string, any>;
      if (shipment.found) {
        result.shipment_status = shipment.status;
        result.tracking_number = shipment.tracking_number ?? undefined;
      }

      const payment = await get_payment(order_id) as Record<string, any>;
      if (payment.found) {
        result.payment_status = payment.status;
      }
    }

    // ── Refund eligibility ────────────────────────────────────────────────────
    let eligibility: Record<string, any> | null = null;
    if (order_id) {
      eligibility = await check_refund_eligibility_by_order(order_id) as Record<string, any>;
    } else if (email_match) {
      eligibility = await check_refund_eligibility_by_email(email_match[0]) as Record<string, any>;
    }

    if (eligibility?.found) {
      result.refund_eligible = eligibility.eligible;
      result.refund_reason_codes = eligibility.reason_codes ?? [];
      result.requires_human_review = eligibility.requires_human_review ?? false;
      result.notes = eligibility.notes ?? [];

      // Dry-run only if eligible
      if (eligibility.eligible === true) {
        const dry = await dry_run_commerce_refund(order_id, result.customer_id ?? null).catch(() => null) as Record<string, any> | null;
        if (dry) {
          result.dry_run = {
            would_refund: dry.would_refund,
            would_refund_amount: dry.would_refund_amount,
            processing_days: dry.processing_days,
          };
        }
      }
    }

    return result;
  } catch {
    return null;
  }
}
