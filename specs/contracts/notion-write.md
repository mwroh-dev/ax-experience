# Notion Write Contract

## Target DB

Tickets Log DB (id: `$NOTION_CASES_DB_ID`)

## API

### POST /api/cases/:case_id/notion-write

```json
POST /api/cases/case_675a6fb5fd804a21/notion-write
{
  "final_action": "고객에게 환불 정책 안내 완료",
  "resolved_at": "2026-04-30T05:00:00Z"
}
```

Response:
```json
{
  "ok": true,
  "case_id": "case_675a6fb5fd804a21",
  "notion_page_id": "<created-notion-page-id>"
}
```

## Notion Properties Mapping

| Notion Property | Source | Notes |
|----------------|--------|-------|
| Ticket ID | case_id | PK |
| Question | raw_text (redacted) | 민감정보 redaction 후 저장 |
| Status | case.status | map_status() 변환 |
| Category | case.intent | 환불/배송/계정/기타 |
| Agent Used | 'api' | 고정값 |
| Final Answer | final_action | optional |

## Status Mapping

| case status | Notion status |
|------------|--------------|
| intake_review | In Progress |
| kept | Done |
| accepted | In Progress |
| pending | Not started |
| resolved | Done |
| denied | Done |

## Idempotency

`case_id`로 기존 Notion page 존재 여부를 먼저 조회한다:

```
GET /v1/databases/:db_id/query
  filter: { Ticket ID = case_id }
```

- page 존재: 기존 `notion_page_id` 반환 (page 새로 생성 안 함)
- page 없음: 신규 page 생성

이 방식으로 동일 case에 대한 중복 write 요청이 Notion DB에 중복 row를 만들지 않는다.

## 실패 처리

| 상황 | 처리 |
|------|------|
| Notion API 5xx / rate limit | throw → `notion_write_failed` event → `{ ok: false, error }` 응답 |
| retryable | Yes — 동일 endpoint 재호출 (idempotent) |
| case 없음 | 404 응답 |

## 원칙

- raw Slack log 전체 저장 금지
- Slack-specific fields (channel_id, thread_ts) 저장 금지
- 저장 전 redact() 적용 (email, phone, token masking)
- case_id 기반 idempotent write (중복 호출 시 기존 page 반환)
