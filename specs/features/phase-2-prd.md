# Phase 2 PRD — VOC Generator & Classifier

**Product**: D2C Commerce CS/VOC AX Ops Hub  
**Phase**: 2 of 8  
**Type**: Backend — VOC pipeline (classifier + test data generator)  
**Depends on**: Phase 0 (Foundation), Phase 1 (Commerce API)

---

## 1. 목적

CS 파이프라인에 입력될 VOC(Voice of Customer) 메시지를:
1. **분류(Classify)**: intent, risk_level, routing path 결정
2. **생성(Generate)**: Commerce API 시나리오에 매핑된 합성 테스트 데이터 생성

Phase 3(Decision Router), Phase 4(Human Review), Phase 5(AutomationRun)의
기반 테스트 데이터를 안정적으로 공급한다.

---

## 2. 범위

### 포함

- VOC Classifier 확장: `requires_admin_api` → `requires_commerce_api`, 4개 신규 intent 추가
- VOC Templates: 12개 시나리오 × 3개 메시지 샘플
- VOC Generator: 시나리오 → 생성된 VOC + 분류 결과 반환
- API: `GET /api/voc/scenarios`, `POST /api/voc/classify`, `POST /api/voc/generate`

### 제외

- DB 저장 (VocItem SQLite — Phase 3에서 구현)
- 실제 Slack 이벤트 수신 (Phase 4)
- LLM 기반 분류 (현재는 keyword-based; Phase 3에서 개선 가능)

---

## 3. 신규 Intent 분류

| Intent | 시나리오 | Commerce API 필요 | 경로 |
|---|---|---|---|
| `payment.status` | 가상계좌 입금 대기, 결제 실패 | ✅ | review_required |
| `coupon_inquiry` | 쿠폰 오류, 할인코드 | ✅ | review_required |
| `product.availability` | 품절, 재입고 | ✅ | review_required |
| `review_reward` | 리뷰 적립금 미지급 | ✅ | review_required |

기존 intent 변경:
- `requires_admin_api` → `requires_commerce_api` (Phase 1 Commerce API 반영)
- 쿠폰 정책 FAQ 규칙 추가 (low risk, auto_reply)

---

## 4. VOC 시나리오 목록 (12개)

| 시나리오 | Expected Intent | Expected Path | Commerce API |
|---|---|---|---|
| eligible_refund | refund.customer_specific | review_required | ✅ |
| ineligible_digital | refund.customer_specific | review_required | ✅ |
| shipping_delayed | shipping.status | review_required | ✅ |
| payment_conflict | payment_incident | escalation | ✅ |
| payment_pending | payment.status | review_required | ✅ |
| coupon_expired | coupon_inquiry | review_required | ✅ |
| coupon_min_amount | coupon_inquiry | review_required | ✅ |
| product_oos | product.availability | review_required | ✅ |
| review_reward | review_reward | review_required | ✅ |
| legal_threat | legal_threat | escalation | ❌ |
| policy_faq_refund | policy_faq | auto_reply | ❌ |
| policy_faq_shipping | policy_faq | auto_reply | ❌ |

---

## 5. API Endpoints

### GET /api/voc/scenarios
```json
{
  "scenarios": ["eligible_refund", "ineligible_digital", "shipping_delayed", ...]
}
```

### POST /api/voc/classify
**Request:**
```json
{ "text": "환불 받을 수 있나요? eligible_test@test.com" }
```
**Response:**
```json
{
  "text": "환불 받을 수 있나요? ...",
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
**Request:**
```json
{ "scenario": "eligible_refund", "message_index": 0 }
```
**Response:**
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

---

## 6. 파일 목록

| 파일 | 역할 |
|---|---|
| `api/src/voc/voc-templates.ts` | 12개 시나리오 × 3개 메시지 템플릿 |
| `api/src/voc/voc-generator.ts` | 시나리오 → GeneratedVoc 변환 |
| `api/src/router/routing-rules.ts` | RoutingRule에 `requires_commerce_api` 추가, 4개 신규 rule |
| `api/src/app.ts` | 3개 VOC API 엔드포인트 추가 |
| `docs/contracts/voc-classifier.md` | 분류기 계약 문서 |

---

## 7. Acceptance Criteria

```bash
# 시나리오 목록
curl -s http://localhost:3100/api/voc/scenarios | jq '.scenarios | length'
# → 12

# 분류 테스트
curl -s -X POST http://localhost:3100/api/voc/classify \
  -H "Content-Type: application/json" \
  -d '{"text":"환불 받을 수 있나요?"}' | jq .recommended_path
# → "review_required"

# VOC 생성
curl -s -X POST http://localhost:3100/api/voc/generate \
  -H "Content-Type: application/json" \
  -d '{"scenario":"legal_threat"}' | jq .classified.recommended_path
# → "escalation"

# FAQ 자동 응답
curl -s -X POST http://localhost:3100/api/voc/generate \
  -H "Content-Type: application/json" \
  -d '{"scenario":"policy_faq_refund"}' | jq .classified.recommended_path
# → "auto_reply"
```
