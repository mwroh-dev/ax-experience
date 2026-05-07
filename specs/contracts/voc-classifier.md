# VOC Classifier Contract

**Phase**: Phase 2  
**Implementation**: keyword-based (MVP) — LLM-enhanced in future phase  
**Entry point**: `api/src/router/decision-router.ts → route(text)`

---

## RoutingRule Type

```typescript
type RiskLevel = 'low' | 'medium' | 'high';
type RecommendedPath = 'auto_reply' | 'review_required' | 'pending' | 'escalation' | 'no_source_backlog';

interface RoutingRule {
  intent: string;                   // semantic label
  risk_level: RiskLevel;
  requires_commerce_api: boolean;   // needs Commerce API lookup for EvidencePacket
  requires_customer_identifier: boolean; // needs email or order_id to proceed
  requires_human_review: boolean;
  recommended_path: RecommendedPath;
  reason: string;                   // shown in Slack review card
}
```

---

## Intent Taxonomy

### High-risk (escalation required)

| Intent | Trigger keywords | Commerce API |
|---|---|---|
| `legal_threat` | 법적, 소송, 변호사, lawsuit | ❌ |
| `privacy_request` | 개인정보, 삭제 요청, GDPR | ❌ |
| `payment_incident` | 결제 사고, 이중 청구, double charge | ✅ |

### Medium-risk (review_required, Commerce API lookup)

| Intent | Trigger keywords | Customer ID required |
|---|---|---|
| `subscription.customer_specific` | 제 구독, 내 구독, 구독 환불 | ✅ |
| `refund.customer_specific` | 제 환불, 환불 해주세요, 환불 가능한가요 | ✅ |
| `shipping.status` | 배송 언제, 배송 현황, 주문번호, ord- | ✅ |
| `payment.status` | 결제가 안, 가상계좌, 입금 확인 | ✅ |
| `coupon_inquiry` | 쿠폰이 안, 쿠폰 오류, 할인코드 | ❌ |
| `product.availability` | 품절, 재입고, 재고 없음 | ❌ |
| `review_reward` | 리뷰 적립금, 포인트 안 왔, 리뷰 보상 | ✅ |

### Low-risk (auto_reply candidate)

| Intent | Trigger keywords |
|---|---|
| `policy_faq` | 환불 정책, 반품 정책, 구독 해지 방법, 배송 기간, 쿠폰 사용 방법 |

### Default (fallback)

| Intent | Condition | Path |
|---|---|---|
| `unknown` | No keyword matched | review_required |

---

## Routing Path Semantics

| Path | Meaning | Human review? | Auto send? |
|---|---|---|---|
| `auto_reply` | Policy FAQ — can be answered from knowledge base | Optional | ✅ (if knowledge hit found) |
| `review_required` | Needs reviewer before sending | ✅ | ❌ |
| `escalation` | High-risk — immediate human attention | ✅ mandatory | ❌ |
| `pending` | Cannot resolve now — awaiting info | ✅ | ❌ |
| `no_source_backlog` | No knowledge source found — log for improvement | ✅ | ❌ |

---

## Commerce API Lookup Integration

When `requires_commerce_api: true`, the EvidencePacket assembler (Phase 3+) should:
1. Extract `email` or `order_id` from the VOC text
2. Call relevant Commerce API endpoints (customer lookup, order, refund eligibility, etc.)
3. Include results in `EvidencePacket.commerce_result`

When `requires_customer_identifier: true` and no identifier found in text:
- Route to `pending` — cannot proceed without order_id or email
- Add event: `pending_missing_identifier`

---

## API Contract

### POST /api/voc/classify
Classifies text without creating a case. For testing and preview.

**Request:**
```json
{ "text": "환불 받을 수 있나요? eligible_test@test.com" }
```

**Response** (RoutingRule fields + input text):
```json
{
  "text": "...",
  "intent": "refund.customer_specific",
  "risk_level": "medium",
  "requires_commerce_api": true,
  "requires_customer_identifier": true,
  "requires_human_review": true,
  "recommended_path": "review_required",
  "reason": "고객별 환불 가능 여부는 Commerce API 조회 필요"
}
```

### POST /api/voc/generate
Generates a test VOC and shows expected vs. actual classification.

**Request:**
```json
{ "scenario": "eligible_refund", "message_index": 0 }
```

**Response** (GeneratedVoc):
```json
{
  "scenario": "eligible_refund",
  "text": "구독을 취소했는데 환불 받을 수 있나요? ...",
  "sample_email": "eligible_test@test.com",
  "sample_order_id": "ORD-QA-REFUNDABLE",
  "expected_intent": "refund.customer_specific",
  "expected_path": "review_required",
  "requires_commerce_api": true,
  "classified": {
    "intent": "refund.customer_specific",
    "risk_level": "medium",
    "recommended_path": "review_required",
    "requires_commerce_api": true,
    "reason": "..."
  }
}
```

### GET /api/voc/scenarios
```json
{ "scenarios": ["eligible_refund", "ineligible_digital", ...] }
```
