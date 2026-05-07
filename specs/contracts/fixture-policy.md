# QA Fixture Isolation Policy

## 목적

테스트/E2E 데이터가 운영 Notion DB, SQLite, Slack을 오염시키지 않도록 namespace를 강제한다.

## Namespace 규칙

모든 QA/E2E fixture 데이터의 title/key 필드는 반드시 아래 prefix 중 하나로 시작해야 한다:

| Prefix | 용도 |
|--------|------|
| `QA_` | 수동/자동 QA 테스트용 fixture |
| `E2E_` | CI/CD E2E 테스트용 fixture |
| `TEST_` | 일회성 개발 테스트 (즉시 cleanup 필요) |

## 적용 DB

| DB | 식별 필드 | 예시 |
|----|-----------|------|
| Notion FAQ DB | `Question` (title) | `QA_FAQ_SUBSCRIPTION_CANCEL_001` |
| Notion Policies DB | `Title` (title) | `QA_POLICY_REFUND_7DAYS_001` |
| Notion Improvement Backlog DB | `Issue` (title) | `QA_BACKLOG_MISSING_GDPR_001` |
| Notion Tickets Log DB | `Ticket ID` (title) | `QA_TICKET_TEST_001` |
| Notion Agent Decisions Log DB | `Case ID` (title) | `QA_DECISION_TEST_001` |
| SQLite cases.external_request_id | — | `QA-REQ-001` |
| Slack | message text | 메시지에 `[QA]` 태그 포함 |

## Cleanup 의무

- E2E 테스트 완료 후 `scripts/cleanup-qa-fixtures.mjs`를 실행하여 QA_ prefix 데이터를 archive 처리한다.
- 운영 배포 전에 QA fixture가 남아있지 않은지 확인한다.
- `cleanup-qa-fixtures.mjs`는 `QA_`, `E2E_`, `TEST_` prefix를 가진 row를 모두 archive한다.

## 금지 사항

- 실제 고객 이메일/전화번호/주문번호를 fixture key로 사용 금지
- prefix 없는 row를 테스트 목적으로 생성 금지
- 운영 row의 status를 테스트 목적으로 변경 금지

## 스크립트

```bash
# QA fixture 생성
node scripts/seed-qa-fixtures.mjs

# QA fixture 정리 (archive)
node scripts/cleanup-qa-fixtures.mjs
```
