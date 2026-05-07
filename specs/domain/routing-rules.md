# Routing Rules Contract

> Source: `api/src/router/routing-rules.ts`  
> Last updated: 2026-05-01

---

## Overview

The classifier uses **keyword first-match routing**: each message is scanned against `ROUTING_RULES` in array order. The first rule whose `keywords` array contains a substring match is selected. If no rule matches, `DEFAULT_RULE` applies.

This design is deterministic and transparent, but cannot handle mixed-intent or ambiguous messages (see `docs/evals/voc-classifier-eval.md`).

---

## RoutingRule Interface

```typescript
interface RoutingRule {
  intent: string;                    // classifier intent label
  risk_level: 'low' | 'medium' | 'high';
  requires_commerce_api: boolean;    // whether Commerce API call is needed
  requires_customer_identifier: boolean; // whether order ID or email is required
  requires_human_review: boolean;    // whether Slack review is required
  recommended_path: RecommendedPath; // routing destination
  reason: string;                    // human-readable explanation
}
```

## RecommendedPath Values

| Path | Meaning | Human Review | Auto-Reply |
|------|---------|-------------|-----------|
| `auto_reply` | FAQ — Notion lookup + auto draft | No | Yes |
| `review_required` | Customer-specific — Commerce API + human review | Yes | No |
| `pending` | Missing identifier — request info from customer | Yes | No |
| `escalation` | High-risk — Slack escalation, no draft | Yes | No |
| `no_source_backlog` | Unknown topic — add to improvement backlog | No | No |

---

## Rules by Risk Level

### High Risk → escalation (requires_human_review=true, auto_reply=FORBIDDEN)

| Intent | Keywords (subset) | Reason |
|--------|-------------------|--------|
| `legal_threat` | 법적, 소송, 법원, 고소, 고발, 변호사, legal, lawsuit | 법적 대응 언급 |
| `privacy_request` | 개인정보, 삭제 요청, gdpr, data deletion, privacy | 개인정보/GDPR |
| `payment_incident` | 결제 사고, 이중 청구, 불법 청구, double charge | 결제 사고 긴급 처리 |

### Medium Risk → review_required (Commerce API + human review)

| Intent | Keywords (subset) | Commerce API |
|--------|-------------------|-------------|
| `subscription.customer_specific` | 제 구독, 내 구독, 구독 환불 | ✅ |
| `refund.customer_specific` | 제 환불, 환불 해주세요, 환불 가능한가요 | ✅ |
| `payment.status` | 결제가 안, 결제 실패, 결제 오류, 입금 확인 | ✅ |
| `shipping.status` | 배송 언제, 주문번호, ORD-, 배송이 안 | ✅ |
| `coupon_inquiry` | 쿠폰이 안, 쿠폰 오류, 할인 코드 오류 | ✅ |
| `exchange.request` | 교환 요청, 교환하고 싶어요 | ✅ |
| `return.request` | 반품 요청, 반품하고 싶어요 | ✅ |
| `product.availability` | 품절, 재입고, 언제 들어와요 | ✅ |
| `review_reward` | 리뷰 적립금, 포인트 안 왔, 리뷰 보상 | ✅ |

### Low Risk → auto_reply (no Commerce API, no human review)

| Intent | Keywords (subset) |
|--------|-------------------|
| `policy_faq` | 환불 정책, 반품 정책, 구독 해지 방법, 배송 기간, 쿠폰 사용 방법 |

---

## Default Rule

When no keyword matches:

```typescript
DEFAULT_RULE = {
  intent: 'unknown',
  risk_level: 'medium',
  requires_commerce_api: false,
  requires_customer_identifier: false,
  requires_human_review: true,
  recommended_path: 'review_required',
  reason: '분류 불가 — 기본 검토 경로',
}
```

Actual `no_source_backlog` routing is applied post-classification when `requires_human_review=true` and no Notion knowledge source is found (see `detect_no_source()`).

---

## Key Invariants

- `high` risk_level → `escalation` path → `requires_human_review=true` always
- `auto_reply` path → `requires_human_review=false` always
- `requires_customer_identifier=true` → caller must check for order ID or email in message
- Rule order is load-bearing — ambiguous messages match the **first** rule that fires
