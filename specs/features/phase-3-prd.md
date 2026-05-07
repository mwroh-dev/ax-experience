# Phase 3 PRD — Decision Router & Commerce Evidence Pipeline

**Product**: D2C Commerce CS/VOC AX Ops Hub  
**Phase**: 3 of 8  
**Type**: Backend — Evidence pipeline pivot: Admin API → Commerce API  
**Depends on**: Phase 0 (Foundation), Phase 1 (Commerce API), Phase 2 (Classifier)

---

## 1. 목적

Phase 0에서 정의한 `commerce_result` 계약을 실제 코드에 적용한다.
기존 `admin_result` (admin-stub 기반)를 `commerce_result` (Commerce API 기반)으로 교체하여
EvidencePacket이 Phase 1 Commerce API의 풍부한 데이터를 활용하도록 한다.

---

## 2. 주요 변경

| 변경 전 | 변경 후 |
|---|---|
| `AdminLookupResult` (evidence-packet.ts) | `CommerceResult` — 확장된 필드셋 |
| `EvidencePacket.admin_result` | `EvidencePacket.commerce_result` |
| `admin-evidence-builder.ts` | `commerce-evidence-builder.ts` |
| `admin-api-client.ts` 호출 | `commerce-api-client.ts` 호출 |
| 고객 조회 + 환불 가능 여부만 | 고객 + 주문 + 배송 + 결제 + 환불 + dry-run |
| `detect_conflict(notion_hits, admin_result)` | `detect_conflict(notion_hits, commerce_result)` |

---

## 3. CommerceResult 타입

```typescript
interface CommerceResult {
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
```

---

## 4. Commerce Evidence Builder 로직

`tools/commerce-evidence-builder.ts`:

1. VOC 텍스트에서 email 또는 order_id 추출
2. email 있음 → `/commerce/customers/lookup?email=`
3. order_id 있음 → `/commerce/orders/:id` + shipment + payment
4. 환불 가능 여부 → order_id 기반 또는 email 기반
5. `refund_eligible === true` → dry-run 실행

---

## 5. 충돌 감지 업데이트

`decision/conflict-detector.ts`:
- `admin_result` → `commerce_result`
- `requires_human_review: true` → 충돌 감지
- Notion "7일 이내 환불 가능" + Commerce API 불가 → 충돌 감지

---

## 6. 파일 변경 목록

| 파일 | 변경 내용 |
|---|---|
| `evidence/evidence-packet.ts` | `AdminLookupResult` → `CommerceResult`, `admin_result` → `commerce_result` |
| `tools/commerce-evidence-builder.ts` | 신규 — Commerce API 기반 증거 조립 |
| `decision/conflict-detector.ts` | `CommerceResult` 사용 |
| `draft/draft-service.ts` | `commerce-evidence-builder` 사용 |
| `slack/actions.ts` | `case_lookup` 액션 → Commerce API |
| `app.ts` | `/api/test/admin-lookup` 엔드포인트 → Commerce API |
| `tools/admin-evidence-builder.ts` | `CommerceResult` 타입으로 업데이트 (레거시 호환) |

---

## 7. Acceptance Criteria

```bash
# 주문번호 포함 케이스 → Commerce API 조회 성공
curl -s -X POST http://localhost:3100/api/cases \
  -H "Content-Type: application/json" \
  -d '{"source_type":"test","raw_text":"주문번호 ORD-QA-REFUNDABLE 환불해주세요"}' \
  | jq .id

# → 케이스 생성됨

curl -s -X POST http://localhost:3100/api/test/admin-lookup \
  -H "Content-Type: application/json" \
  -d '{"case_id":"<case_id>"}' \
  | jq '.commerce_result | {order_id, refund_eligible}'

# → { order_id: "ORD-QA-REFUNDABLE", refund_eligible: true }
```
