# Admin API Contract

## 원칙

- **Slack-independent**: channel_id, thread_ts, action_id 등 Slack field 완전 미수신
- **read-only 우선**: GET 엔드포인트만 구현. POST는 dry-run까지만.
- **No real DB**: 현재 stub. 실 연결 시 ADMIN_API_BASE_URL 환경변수로 교체.

## Endpoints

### GET /admin/customers/lookup?email=

고객 이메일로 customer_id 조회.

Response:
```json
{
  "found": true,
  "customer_id": "cust_...",
  "email_masked": "te***@example.com",
  "created_at": "ISO8601",
  "tier": "standard|premium"
}
```

### GET /admin/customers/:customerId/subscription

구독 상태 조회.

Response:
```json
{
  "customer_id": "...",
  "subscription_id": "sub_...",
  "plan": "monthly|yearly",
  "status": "active|cancelled|expired",
  "started_at": "ISO8601",
  "next_billing_at": "ISO8601",
  "auto_renew": true
}
```

### GET /admin/orders/:orderId/status

주문 상태 조회.

### GET /admin/refunds/eligibility?customerId=&paymentId=

환불 가능 여부 확인 (read-only).

Response:
```json
{
  "customer_id": "...",
  "payment_id": "...",
  "eligible": null,
  "requires_manual_review": true,
  "policy_ref": "policy.refund.v1",
  "notes": ["..."]
}
```

### POST /admin/refunds/dry-run

환불 시뮬레이션 (실제 실행 없음).

Request:
```json
{
  "customer_id": "...",
  "payment_id": "...",
  "reason": "고객 요청"
}
```

## What NOT to pass

Slack 관련 필드는 이 API에 절대 전달하지 않는다:
- `channel_id`, `thread_ts`, `message_ts`, `action_id`, `user_id` (Slack user)
- `slack_*` prefix 필드

도메인 식별자만 전달한다: `customer_id`, `order_id`, `payment_id`, `case_id`

---

## Failure Mode

| 상황 | 처리 방식 |
|------|---------|
| 5xx 응답 | `admin-api-client.ts`에서 throw → actions.ts catch → `admin_lookup_failed` event |
| 네트워크 timeout | fetch timeout (기본 10초) → same path |
| 404 (customer not found) | `{ found: false }` 정상 응답 — throw 아님 |
| retryable | Yes — `case_lookup` 버튼 재클릭 |

실패 시 api는 tool_calls에 error 기록 후 Slack thread에 실패 메시지를 게시한다.
Admin API 실패가 case status를 변경하지 않는다.
