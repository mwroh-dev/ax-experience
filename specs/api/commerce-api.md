# Commerce API Contract

**Service**: Commerce API Mock  
**Mount point**: `/commerce` (within api process)  
**Base URL env var**: `COMMERCE_API_BASE_URL` (default: `http://localhost:3100/commerce`)  
**Phase**: Phase 1 — Mock only. Real Commerce API connection in future phase.

---

## Principles

- Slack-specific fields (`channel_id`, `thread_ts`, etc.) are never accepted or returned
- All data is synthetic QA fixtures — no real customer data
- Read-only: `POST /refunds/dry-run` is the only POST endpoint, and it performs no actual write
- Commerce entities (`Customer`, `Order`, etc.) are never stored in api SQLite

---

## QA Scenario Routing

### Email-based (GET /customers/lookup)

| Email prefix | Scenario |
|---|---|
| `eligible_*` | eligible_refund |
| `ineligible_*` | ineligible_digital |
| `conflict_*` | conflict_payment |
| `delayed_*` | shipping_delayed |
| `notfound_*` | not_found |
| `timeout_*` | timeout (6s delay → client 5s timeout) |
| *(anything else)* | eligible_refund (default) |

### Order ID-based

| Order ID contains | Scenario |
|---|---|
| `REFUNDABLE`, `ELIGIBLE` | eligible_refund |
| `DIGITAL` | ineligible_digital |
| `CONFLICT` | conflict_payment |
| `DELAYED` | shipping_delayed |
| `DELIVERED`, `DONE` | order_delivered |
| `PENDING` | payment_pending |
| *(anything else)* | order_delivered (default) |

---

## Endpoints

### GET /health

```json
{ "ok": true, "service": "commerce-api", "ts": "2026-04-30T00:00:00Z" }
```

---

### GET /customers/lookup?email={email}

**Found:**
```json
{
  "found": true,
  "customer_id": "cust_qa_eligible_001",
  "email_masked": "eli***@test.com",
  "tier": "standard",
  "subscription_status": "active",
  "created_at": "2025-01-15T00:00:00Z"
}
```

**Not found:**
```json
{ "found": false, "customer_id": null, "email_masked": null }
```

---

### GET /orders/:orderId

**Found:**
```json
{
  "found": true,
  "order_id": "ORD-QA-REFUNDABLE",
  "customer_id": "cust_qa_eligible_001",
  "status": "completed",
  "items": [{ "product_id": "PROD-SUB-MONTHLY", "name": "월간 구독", "quantity": 1, "price_krw": 9900 }],
  "total_krw": 9900,
  "created_at": "2026-04-28T10:00:00Z"
}
```

**Not found:** HTTP 404
```json
{ "found": false, "error": "Order ORD-UNKNOWN not found" }
```

---

### GET /orders/:orderId/shipment

**Shipped (delayed):**
```json
{
  "found": true,
  "order_id": "ORD-QA-DELAYED",
  "carrier": "CJ대한통운",
  "tracking_number": "CJ-QA-123456",
  "status": "delayed",
  "estimated_delivery": "2026-05-03T23:59:00Z",
  "reason_code": "SHIPMENT_DELAYED",
  "delay_reason": "물류 센터 적체"
}
```

**No shipment (digital/subscription):**
```json
{ "found": false, "order_id": "...", "note": "배송 정보 없음 (디지털/구독 상품)" }
```

---

### GET /orders/:orderId/payment

**Completed:**
```json
{
  "found": true,
  "order_id": "ORD-QA-REFUNDABLE",
  "payment_id": "PAY-QA-ELIGIBLE-001",
  "amount": 9900,
  "method": "card",
  "status": "completed",
  "transaction_id": "TXN-QA-001",
  "paid_at": "2026-04-28T10:01:00Z"
}
```

**Conflict (no payment record):**
```json
{
  "found": true,
  "payment_id": null,
  "amount": null,
  "status": "not_found",
  "reason_code": "PAYMENT_NOT_FOUND"
}
```

**Pending (bank transfer):**
```json
{
  "found": true,
  "payment_id": "PAY-QA-PENDING-003",
  "amount": 9900,
  "method": "bank_transfer",
  "status": "pending",
  "note": "가상계좌 입금 대기 중"
}
```

---

### GET /refunds/eligibility?orderId={orderId}

Also accepts `?email={email}` for email-based lookup.

**Eligible:**
```json
{
  "found": true,
  "order_id": "ORD-QA-REFUNDABLE",
  "eligible": true,
  "reason_codes": ["WITHIN_REFUND_WINDOW"],
  "within_window": true,
  "dry_run_result": { "refund_amount": 9900, "processing_days": 3 },
  "notes": ["구독 해지 후 7일 이내 환불 가능"]
}
```

**Ineligible (digital content):**
```json
{
  "found": true,
  "eligible": false,
  "reason_codes": ["DIGITAL_CONTENT_DOWNLOADED"],
  "within_window": true,
  "notes": ["디지털 콘텐츠 다운로드 완료 — 정책상 환불 불가"]
}
```

**Requires human review:**
```json
{
  "found": true,
  "eligible": null,
  "reason_codes": [],
  "within_window": null,
  "requires_human_review": true,
  "notes": ["환불 가능 여부 확인을 위해 주문번호 또는 고객 정보가 필요합니다"]
}
```

---

### POST /refunds/dry-run

**Request:**
```json
{ "order_id": "ORD-QA-REFUNDABLE", "customer_id": null, "reason": "고객 요청" }
```
One of `order_id` or `customer_id` required.

**Response (would refund):**
```json
{
  "dry_run": true,
  "order_id": "ORD-QA-REFUNDABLE",
  "would_refund": true,
  "would_refund_amount": 9900,
  "processing_days": 3,
  "warnings": [
    "This is a dry-run. No actual refund was processed.",
    "Real execution requires admin approval."
  ]
}
```

**Response (would not refund):**
```json
{
  "dry_run": true,
  "would_refund": false,
  "reason_codes": ["DIGITAL_CONTENT_DOWNLOADED"],
  "warnings": [
    "This is a dry-run. No actual refund was processed.",
    "Refund not eligible per current policy."
  ]
}
```

---

### GET /coupons/:code/validation

**Valid:**
```json
{
  "found": true,
  "code": "QA-VALID-10",
  "valid": true,
  "discount_type": "percentage",
  "discount_value": 10,
  "expiry": "2026-12-31T23:59:59Z",
  "min_order_amount": 0
}
```

**Expired:**
```json
{
  "found": true,
  "code": "QA-EXPIRED",
  "valid": false,
  "reason_code": "COUPON_EXPIRED",
  "message": "쿠폰 유효기간이 만료됐습니다"
}
```

**Invalid code:**
```json
{
  "found": false,
  "code": "UNKNOWN",
  "valid": false,
  "reason_code": "INVALID_CODE",
  "message": "존재하지 않는 쿠폰 코드입니다"
}
```

---

### GET /products/:productId

**Found:**
```json
{
  "found": true,
  "product_id": "PROD-PHYSICAL-001",
  "name": "웰니스 키트",
  "category": "건강/뷰티",
  "in_stock": true,
  "restock_eta": null
}
```

**Out of stock:**
```json
{
  "found": true,
  "product_id": "PROD-QA-OOS",
  "in_stock": false,
  "restock_eta": "2026-05-15",
  "reason_code": "PRODUCT_OUT_OF_STOCK",
  "message": "현재 품절 상태입니다. 재입고 예정일: 2026-05-15"
}
```

**Not found:** HTTP 404
```json
{ "found": false, "product_id": "...", "error": "상품을 찾을 수 없습니다" }
```

---

### GET /review-events/:eventId/reward-status

**Pending:**
```json
{
  "found": true,
  "event_id": "EVT-QA-REVIEW-001",
  "customer_id": "cust_qa_eligible_001",
  "product_id": "PROD-PHYSICAL-001",
  "review_submitted_at": "2026-04-25T10:00:00Z",
  "reward_status": "pending",
  "reward_points": 500,
  "reason_code": "REVIEW_REWARD_PENDING",
  "expected_credit_at": "2026-05-02T10:00:00Z",
  "message": "리뷰 적립금은 리뷰 작성 후 7일 이내 지급됩니다"
}
```

**Credited:**
```json
{
  "found": true,
  "event_id": "EVT-QA-REVIEW-002",
  "reward_status": "credited",
  "reward_points": 500,
  "credited_at": "2026-04-08T10:00:00Z"
}
```

**Not found:**
```json
{
  "found": false,
  "event_id": "...",
  "reward_status": "not_found",
  "message": "리뷰 이벤트를 찾을 수 없습니다"
}
```

---

## Error Responses

| Status | Condition |
|---|---|
| 400 | Required param missing |
| 404 | Resource not found |
| 5xx | Internal error (fixture lookup failure) |

---

## Client Usage (api internal)

```typescript
import {
  lookup_commerce_customer, get_order, get_shipment, get_payment,
  check_refund_eligibility_by_order, check_refund_eligibility_by_email,
  dry_run_commerce_refund, validate_coupon, get_product,
  get_review_reward_status, commerce_health,
} from './tools/commerce-api-client';

// Example: assemble EvidencePacket
const customer = await lookup_commerce_customer(email);
const eligibility = await check_refund_eligibility_by_order(order_id);
const dry_run = await dry_run_commerce_refund(order_id, null, 'user request');
```

All functions throw on HTTP error or timeout (5000ms).
