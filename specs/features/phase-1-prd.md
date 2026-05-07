# Phase 1 PRD — Commerce Entity & Mock Commerce API

**Product**: D2C Commerce CS/VOC AX Ops Hub  
**Phase**: 1 of 8  
**Type**: Backend — Mock API + Client Wrapper  
**Depends on**: Phase 0 (Foundation Contracts)

---

## 1. 목적

Commerce 도메인 엔티티를 fixture 기반 Mock API로 제공한다.
api가 Commerce 데이터(고객, 주문, 배송, 결제, 환불, 쿠폰, 상품, 리뷰 이벤트)를
내부 DB 없이 외부 API 호출 패턴으로 조회할 수 있게 한다.

Phase 2+ 에서 EvidencePacket 조립 시 Commerce API client를 그대로 사용한다.

---

## 2. 범위

### 포함

- Mock Commerce API (`/commerce/*`) — fixture 데이터 반환, write 없음
- Commerce API Client (`tools/commerce-api-client.ts`) — api 내부 호출 래퍼
- 10개 QA 시나리오 — email/order_id prefix 기반 라우팅
- 5초 타임아웃, AbortController 적용

### 제외

- 실제 Commerce DB 연결 (Phase 1은 mock 전용)
- 결제 처리, 실제 환불 실행 (dry-run만 허용)
- Slack 필드 수신/전달 (channel_id, thread_ts 완전 미사용)
- Customer/Order 데이터를 api SQLite에 저장하는 것 (Phase 0 원칙)

---

## 3. QA 시나리오

| 시나리오 키 | Email prefix | Order ID contains | 설명 |
|---|---|---|---|
| `eligible_refund` | `eligible_` | `REFUNDABLE`, `ELIGIBLE` | 환불 가능, 7일 이내 |
| `ineligible_digital` | `ineligible_` | `DIGITAL` | 디지털 콘텐츠 다운로드 완료 — 환불 불가 |
| `conflict_payment` | `conflict_` | `CONFLICT` | 결제 기록 없음 — 수동 조사 필요 |
| `shipping_delayed` | `delayed_` | `DELAYED` | 배송 지연 |
| `order_delivered` | (기본값) | `DELIVERED`, `DONE` | 배송 완료 |
| `payment_pending` | — | `PENDING` | 가상계좌 입금 대기 |
| `coupon_expired` | — | — | 쿠폰 만료 (QA-EXPIRED 코드) |
| `coupon_min_amount` | — | — | 최소 주문금액 미충족 (QA-MIN-AMOUNT 코드) |
| `product_oos` | — | — | 품절 (PROD-QA-OOS) |
| `review_reward` | — | — | 리뷰 적립금 지급 대기 (EVT-QA-REVIEW-001) |
| `not_found` | `notfound_` | — | 고객 없음 |
| `timeout` | `timeout_` | — | 6초 딜레이 → 클라이언트 5초 타임아웃 트리거 |

---

## 4. API Endpoints

전체 스펙: `docs/contracts/commerce-api.md`

| Method | Path | 설명 |
|---|---|---|
| GET | `/commerce/health` | 헬스체크 |
| GET | `/commerce/customers/lookup?email=` | 고객 조회 |
| GET | `/commerce/orders/:orderId` | 주문 조회 |
| GET | `/commerce/orders/:orderId/shipment` | 배송 조회 |
| GET | `/commerce/orders/:orderId/payment` | 결제 조회 |
| GET | `/commerce/refunds/eligibility?orderId=` | 환불 가능 여부 조회 |
| POST | `/commerce/refunds/dry-run` | 환불 dry-run (write 없음) |
| GET | `/commerce/coupons/:code/validation` | 쿠폰 유효성 검증 |
| GET | `/commerce/products/:productId` | 상품 조회 |
| GET | `/commerce/review-events/:eventId/reward-status` | 리뷰 이벤트 적립금 상태 |

---

## 5. 아키텍처

```
api process (port 3100)
  └── /commerce/* → CommerceModule (NestJS)
                        └── fixtures.ts (in-memory QA data)

외부 클라이언트 (Phase 2+ 내부 서비스)
  └── commerce-api-client.ts
        └── COMMERCE_API_BASE_URL (기본: http://localhost:3100/commerce)
```

`COMMERCE_API_BASE_URL=http://localhost:3101` 설정 시 별도 서버 사용 가능.

---

## 6. 보안 원칙

- Slack 필드 완전 미수신 (channel_id, thread_ts 없음)
- 실제 고객 데이터 없음 — QA 합성 데이터만
- dry-run은 허용, 실제 write 없음
- Commerce 데이터를 api DB에 저장하지 않음

---

## 7. 파일 목록

| 파일 | 역할 |
|---|---|
| `api/src/commerce/fixtures.ts` | QA 시나리오 데이터 + 라우팅 함수 |
| `api/src/commerce/` | NestJS CommerceModule — 10개 엔드포인트 |
| `api/src/tools/commerce-api-client.ts` | 내부 호출 래퍼 (11개 함수) |
| `api/src/app.module.ts` | CommerceModule 마운트 |
| `docs/contracts/commerce-api.md` | API 계약 문서 |

---

## 8. Acceptance Criteria

```bash
# 서버 기동 후 전체 엔드포인트 응답 확인
curl -s http://localhost:3100/commerce/health | jq .ok
# → true

curl -s "http://localhost:3100/commerce/customers/lookup?email=eligible_test@test.com" | jq .found
# → true

curl -s "http://localhost:3100/commerce/orders/ORD-QA-REFUNDABLE" | jq .order_id
# → "ORD-QA-REFUNDABLE"

curl -s "http://localhost:3100/commerce/refunds/eligibility?orderId=ORD-QA-DIGITAL" | jq .eligible
# → false

curl -s -X POST http://localhost:3100/commerce/refunds/dry-run \
  -H "Content-Type: application/json" \
  -d '{"order_id":"ORD-QA-REFUNDABLE"}' | jq .would_refund
# → true

curl -s "http://localhost:3100/commerce/coupons/QA-EXPIRED/validation" | jq .reason_code
# → "COUPON_EXPIRED"
```
