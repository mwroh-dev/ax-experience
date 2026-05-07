// cs-ops-core/src/evidence/retriever.ts
import { FlowResult } from '@api/pipeline/index';
import { search_faq, search_policies } from '../lib/notion-client';
import { score_documents } from '../lib/scorer';
import { fetch_order_status, fetch_customer, fetch_refund_eligibility } from '../lib/admin-client';
import {
  Ticket,
  EvidenceBundle,
  FaqMatch,
  PolicyRuleMatch,
  LegalReference,
  OrderStatus,
  CustomerInfo,
  RefundEligibility,
} from '../types';

export function extract_identifiers(message: string): { order_id?: string; email?: string } {
  const order_match = message.match(
    /(?:주문번호?|order(?:\s+no\.?)?|order\s*#)\s*(\d{4,10})/i
  );
  const email_match = message.match(
    /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/
  );
  return {
    order_id: order_match?.[1],
    email: email_match?.[0],
  };
}

export async function retrieve_evidence(ticket: Ticket): Promise<FlowResult<EvidenceBundle>> {
  const started_at = Date.now();
  try {
    const search_query = `${ticket.customer_intent} ${ticket.issue_reason}`.replace(/_/g, ' ');

    const [faq_raw, policy_raw] = await Promise.all([
      search_faq(search_query, 5),
      search_policies(search_query, 5),
    ]);

    // Re-rank results with TF-IDF scoring
    const faq_hits = score_documents(search_query, faq_raw);
    const policy_hits = score_documents(search_query, policy_raw);

    const faq_matches: FaqMatch[] = faq_hits.map((h) => ({
      id: h.source_id,
      title: h.title,
      content: h.content,
      relevance_score: h.score > 0 ? h.score : 0.7,
    }));

    const policy_rule_matches: PolicyRuleMatch[] = policy_hits.map((h) => ({
      id: h.source_id,
      title: h.title,
      content: h.content,
      relevance_score: h.score > 0 ? h.score : 0.8,
    }));

    const legal_references: LegalReference[] = [];

    let order: OrderStatus | undefined;
    let customer: CustomerInfo | undefined;
    let refund_eligibility: RefundEligibility | undefined;

    const skip_admin =
      ticket.order_state === 'no_order' ||
      ticket.customer_intent === 'privacy_request';

    if (!skip_admin) {
      const { order_id: extracted_order, email: extracted_email } = extract_identifiers(
        ticket.raw_message ?? ''
      );
      const order_id = extracted_order ?? process.env.TEST_ORDER_ID ?? '12345';
      const email = extracted_email ?? process.env.TEST_CUSTOMER_EMAIL ?? '';

      const [ord, cust] = await Promise.all([
        fetch_order_status(order_id),
        email ? fetch_customer(email) : Promise.resolve(undefined),
      ]);

      order = ord;
      customer = cust;

      // Only check refund eligibility when we have an actual order ID from the message.
      // Without one, retrieve_evidence falls back to a fixture default, which would
      // let the KB eligibility gate pass against the wrong order — a silent misfire.
      const has_explicit_order = !!(extracted_order ?? process.env.TEST_ORDER_ID);
      if (ord && ticket.customer_intent === 'refund_request' && has_explicit_order) {
        refund_eligibility = await fetch_refund_eligibility(order_id);
      }
    }

    const bundle: EvidenceBundle = {
      ticket,
      order,
      customer,
      refund_eligibility,
      faq_matches,
      policy_matches: policy_rule_matches,
      legal_references,
    };

    return {
      ok: true,
      value: bundle,
      trace: [
        {
          step: 'retrieve_evidence',
          started_at,
          duration_ms: Date.now() - started_at,
          ok: true,
          meta: { faq_count: faq_matches.length, policy_count: policy_rule_matches.length },
        },
      ],
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      step: 'retrieve_evidence',
      trace: [
        {
          step: 'retrieve_evidence',
          started_at,
          duration_ms: Date.now() - started_at,
          ok: false,
        },
      ],
    };
  }
}
