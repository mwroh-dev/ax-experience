# Case State Contract

## Overview

SQLite DB at `.data/cs-ops.db` — CS 운영 워크플로우 상태 저장.
고객 DB가 아니라 운영 workflow DB다.

---

## Idempotency

`external_request_id`는 UNIQUE 처리된다.

- schema: `CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_ext_req_id ON cases(external_request_id) WHERE external_request_id IS NOT NULL`
- `handle_cs_event()` 시작 시 기존 case 조회 먼저 수행
- 존재하면: `duplicate_received` event 기록 + 기존 case_id 반환
- 존재하지 않으면: 신규 case 생성

`case_id` 생성 규칙: `'case_' + uuidv4().replace(/-/g,'').slice(0,16)`

`review_messages`는 case당 최신 1개를 `get_review_message(case_id)`로 조회한다.

---

## Case Status Transition

```
[외부 API 수신]
    ↓
intake_review
    ├→ kept             (Keep 버튼)
    ├→ accepted         (Accept 버튼)
    └→ pending          (Pending 버튼)

accepted
    ↓ (CS bot 호출)
    ├→ [tool_calls: openclaw_answer_draft success]  → status 변경 없음, thread에 draft 게시
    └→ [tool_calls: openclaw_answer_draft error]    → case_events: cs_bot_failed, status 유지

pending
    ↓ (CS bot pending_investigation 호출)
    ├→ [tool_calls: openclaw_pending_investigation success] → status 유지, thread에 note 게시
    └→ [tool_calls: openclaw_pending_investigation error]   → case_events: cs_bot_failed, status 유지

kept
    └→ archived         (수동 또는 batch — 향후)

accepted / pending
    └→ denied           (Deny 버튼 — 향후)

accepted / pending
    └→ sent             (Send 버튼 — 향후)
```

**Stale Guard:**
`try_update_case_status(case_id, expected='intake_review', new_status)` 사용.
`status ≠ 'intake_review'`이면 UPDATE rows = 0 → `stale_action_rejected` event 기록, status 불변.

---

## Final States

| status | 의미 |
|--------|------|
| `kept` | 보관됨, CS bot 미처리 |
| `sent` | 고객에게 전달됨 |
| `denied` | 처리 거부 |
| `archived` | kept → 이후 일괄 정리 |
| `failed_closed` | 반복 실패로 수동 종료 (운영자 직접 설정) |

Final state 진입 후 intake button 클릭 → `stale_action_rejected`.

---

## Tables

### cases

| column | type | description |
|--------|------|-------------|
| id | TEXT PK | `case_` prefix + 16 hex chars |
| source_type | TEXT | `api`, `slack`, `webhook` |
| source_channel_id | TEXT? | Slack channel_id (nullable) |
| source_thread_ts | TEXT? | Slack thread_ts (nullable) |
| source_message_ts | TEXT? | Slack message_ts (nullable) |
| external_request_id | TEXT? UNIQUE | 외부 시스템 request_id (UNIQUE INDEX, nullable 허용) |
| requester_slack_user_id | TEXT? | Slack user_id (nullable) |
| raw_text | TEXT | 원본 문의 텍스트 |
| intent | TEXT | 감지된 의도 (default: `unknown`) |
| status | TEXT | 현재 상태 |
| created_at | TEXT | ISO 8601 |
| updated_at | TEXT | ISO 8601 |

### case_events

append-only 이벤트 로그. 삭제/수정 금지.

| column | type | description |
|--------|------|-------------|
| id | TEXT PK | `evt_` prefix |
| case_id | TEXT FK | cases.id |
| event_type | TEXT | e.g. `case_created`, `status_changed_to_accepted`, `stale_action_rejected` |
| actor_type | TEXT | `system`, `human`, `bot` |
| actor_id | TEXT? | Slack user_id 또는 system name |
| payload_json | TEXT | JSON 추가 데이터 |
| created_at | TEXT | ISO 8601 |

**표준 event_type:**
- `case_created` — case 최초 생성
- `duplicate_received` — 동일 external_request_id 재수신
- `slack_review_posted` — review card 게시됨
- `status_changed_to_*` — status 전환
- `stale_action_rejected` — stale/concurrent action 거부
- `archive_candidate` — Keep 버튼 후 자동 기록
- `cs_bot_draft_ready` — CS bot 초안 완료
- `cs_bot_failed` — CS bot 호출 실패
- `admin_lookup_done` — Admin API 조회 완료
- `notion_write_done` — Notion write 완료

### review_messages

Slack review card 위치 추적.

| column | type | description |
|--------|------|-------------|
| id | TEXT PK | `rev_` prefix |
| case_id | TEXT FK | cases.id |
| review_channel_id | TEXT | #voc-review channel_id |
| review_message_ts | TEXT | Slack message timestamp |
| blocks_json | TEXT | 게시된 Block Kit blocks |
| created_at | TEXT | ISO 8601 |

### tool_calls

CS bot 및 admin API 호출 기록.

| column | type | description |
|--------|------|-------------|
| id | TEXT PK | `tool_` prefix |
| case_id | TEXT FK | cases.id |
| tool_name | TEXT | e.g. `openclaw_answer_draft`, `openclaw_pending_investigation`, `admin_lookup` |
| input_json | TEXT | 호출 input (Slack field 미포함) |
| output_json | TEXT? | 응답 결과 |
| status | TEXT | `pending`, `success`, `error` |
| created_at | TEXT | ISO 8601 |
