# VOC Taxonomy — D2C CS/VOC AX Ops Hub

> Version: 1.0  
> Purpose: Canonical set of intent categories for classifying customer inquiries.

---

## Intent Categories

| Intent | Description | Routing Path | Risk Level |
|--------|-------------|-------------|------------|
| `shipping.status` | Customer asking about delivery status or tracking | review_required (customer-specific) | low |
| `shipping.delay` | Complaint about delayed shipment | review_required | medium |
| `refund.policy` | General refund policy question | auto_reply_candidate | low |
| `refund.customer_specific` | Customer requesting refund for specific order | review_required | medium |
| `exchange.request` | Request to exchange a product | review_required | medium |
| `return.request` | Request to return a product | review_required | medium |
| `coupon.not_applied` | Coupon not working at checkout | review_required | low |
| `coupon.expired` | Expired coupon inquiry | auto_reply_candidate | low |
| `product.question` | General product information question | auto_reply_candidate | low |
| `product.out_of_stock` | Restock inquiry | auto_reply_candidate | low |
| `review_event.reward` | Review reward points not credited | review_required | low |
| `payment.issue` | Payment failure, duplicate charge, billing concern | review_required | high |
| `high_risk.legal` | Legal threats, GDPR requests, chargeback threats | high_risk_escalation | high |
| `privacy.request` | Data deletion, account data requests | high_risk_escalation | high |
| `unknown.no_source` | Cannot classify or no knowledge base match | no_source_backlog | unknown |

---

## Routing Path Rules

```
customer-specific intents (has order_id or customer identifier):
  → review_required (NEVER auto_reply_candidate)

high_risk intents (payment.issue with chargeback, high_risk.legal, privacy.request):
  → high_risk_escalation

no knowledge hit:
  → no_source_backlog

policy / product questions without customer context:
  → auto_reply_candidate
```

---

## Classifier Type

Current implementation: **keyword-based (first-match substring scanning)**

Known limitations:
- Colloquial Korean (~20% miss rate based on holdout eval)
- Mixed-intent messages: first matching keyword wins; secondary intent lost
- Ambiguous cases: rule ordering determines outcome, not semantics
- Holdout accuracy: 0.80 (BORDERLINE — original target was <0.80)

Future path: LLM-based intent classification for colloquial + mixed cases.

---

## Mapping to Current routing-rules.ts

The following taxonomy intents are NOT yet in routing-rules.ts:
- `exchange.request`
- `return.request`  
- `coupon.expired` (covered by `coupon_inquiry` — mapping unclear)
- `product.question` (covered by `policy_faq` partially)
- `product.out_of_stock` (covered by `product.availability`)
- `shipping.delay` (covered by `shipping.status` — delay not separately handled)

These gaps should be addressed in Phase 3/4 iteration.
