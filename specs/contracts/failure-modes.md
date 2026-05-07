# Failure Modes Contract

api가 처리해야 하는 실패 케이스와 각 케이스별 동작을 정의한다.

---

## 공통 원칙

- 모든 실패는 `case_events`에 기록한다.
- retryable 실패는 case status를 `*_failed` 상태로 남긴다 (case를 삭제하지 않는다).
- non-retryable 실패는 최대한 빨리 ack 후 사용자에게 알린다.
- secret/Slack field는 failure payload에 포함하지 않는다.

---

## 1. 동일 external_request_id 중복 수신

**시나리오:** `POST /api/cs-events`가 동일 `request_id`로 2회 이상 호출됨

| 항목 | 내용 |
|------|------|
| detection | `cases WHERE external_request_id = ?` 조회 후 기존 row 존재 확인 |
| expected_status | 기존 case status 유지 (신규 case 생성 안 함) |
| retryable | N/A — 중복 자체가 정상 처리됨 |
| case_events | 기존 case_id에 `duplicate_received` event 추가 |
| #voc-log | 기록 안 함 (과도한 알림 방지) |
| response | 기존 `case_id` 반환 (HTTP 200, `duplicate: true`) |
| 담당 모듈 | `case-service.ts` — `handle_cs_event()` 시작부 |

---

## 2. Slack Button 중복 클릭 (stale action)

**시나리오:** 이미 결정된 case(status ≠ `intake_review`)에 버튼 클릭

| 항목 | 내용 |
|------|------|
| detection | `try_update_case_status(case_id, 'intake_review', new_status)` → changes === 0 |
| expected_status | 기존 status 유지 (변경 없음) |
| retryable | N/A |
| case_events | `stale_action_rejected` event, payload: `{ attempted: new_status, current: existing_status }` |
| #voc-log | 기록 안 함 |
| Slack | ack만 성공 — 카드 업데이트 없음 |
| 담당 모듈 | `actions.ts` — Keep/Accept/Pending 핸들러 |

---

## 3. 두 사용자 동시 버튼 클릭 (concurrent action)

**시나리오:** 두 명이 같은 review card에서 거의 동시에 다른 버튼 클릭

| 항목 | 내용 |
|------|------|
| detection | SQLite transaction 내에서 조건부 UPDATE (`WHERE status = 'intake_review'`) — 하나만 성공 |
| expected_status | 먼저 성공한 action의 status |
| retryable | N/A |
| case_events | 실패한 쪽에 `stale_action_rejected` event (`concurrent: true` payload 포함) |
| #voc-log | 실패한 actor에게 알림 (optional, 현재 미구현) |
| 담당 모듈 | `case-store.ts` — `try_update_case_status()` |

**구현 근거:** SQLite는 serializable transaction을 지원하므로 WAL 모드에서도 동일 row 동시 UPDATE는 last-writer-wins가 아니라 transaction serialization으로 처리됨. `changes === 0`으로 패배 감지.

---

## 4. Slack Action Ack Timeout

**시나리오:** api가 3초 내에 ack를 보내지 못함

| 항목 | 내용 |
|------|------|
| detection | Slack Bolt에서 자동 감지 (Bolt가 재전송함) |
| expected_status | 재전송 payload 수신 시 idempotency guard가 중복 처리 방지 |
| retryable | Bolt 자동 재시도 — 최대 3회 |
| case_events | 재시도 성공 시 정상 event. 모두 실패 시 로그만 |
| #voc-log | 기록 안 함 |
| 담당 모듈 | Slack Bolt runtime 자동 처리 + `try_update_case_status()` idempotency |

**설계 원칙:** `ack()`는 항상 첫 번째 작업. DB/Slack 호출보다 먼저 실행.

---

## 5. OpenClaw 호출 실패

**시나리오:** `call_cs_bot()` 또는 Ollama 직접 호출이 실패 또는 timeout

| 항목 | 내용 |
|------|------|
| detection | `call_cs_bot()` Promise rejection |
| expected_status | case status 변경 안 함 (accepted/pending 유지) |
| retryable | Yes — Lookup/Retry 버튼으로 재시도 가능 |
| case_events | `cs_bot_failed` event, payload: `{ error: err.message, mode }` |
| tool_calls | `status = 'error'`, `output_json = { error: err.message }` |
| #voc-log | `[voc-log] cs_bot_failed | case_id | mode | error` |
| Slack thread | thread에 실패 메시지 게시 (channel_id + thread_ts 있을 때) |
| 담당 모듈 | `actions.ts` — CS bot 호출 `.catch()` 블록 |

---

## 6. Admin API Timeout

**시나리오:** `/admin/customers/lookup` 또는 refund eligibility 호출 실패

| 항목 | 내용 |
|------|------|
| detection | `admin-api-client.ts` fetch 실패 또는 HTTP 5xx |
| expected_status | case status 변경 없음 |
| retryable | Yes — Lookup 버튼 재클릭으로 재시도 |
| case_events | `admin_lookup_failed` event |
| tool_calls | `status = 'error'` |
| Slack thread | "[Admin Lookup 실패] 잠시 후 다시 시도하세요" |
| 담당 모듈 | `actions.ts` — `case_lookup` 핸들러 `.catch()` |

---

## 7. Notion Write 실패

**시나리오:** Notion API 호출 실패 (rate limit, 인증 오류, 네트워크)

| 항목 | 내용 |
|------|------|
| detection | `write_case_summary()` throw |
| expected_status | case status 변경 없음 |
| retryable | Yes — `POST /api/cases/:id/notion-write` 재호출 |
| case_events | `notion_write_failed` event |
| response | `{ ok: false, error: '...' }` |
| 담당 모듈 | `api/src/` — `/api/cases/:id/notion-write` NestJS 컨트롤러 |

**중복 방지:** Notion DB에서 `case_id`로 기존 page 조회 후 이미 존재하면 생성 스킵, `notion_page_id` 반환.

---

## 8. SQLite Write 실패

**시나리오:** DB write 중 에러 (disk full, lock timeout 등)

| 항목 | 내용 |
|------|------|
| detection | better-sqlite3 throw |
| expected_status | rollback (트랜잭션 내 write) |
| retryable | 외부 요인 해소 후 재시도 |
| response | HTTP 500, `{ error: 'internal error' }` |
| 로그 | `console.error` — stack trace |
| 담당 모듈 | NestJS exception filter |

---

## 9. Slack postMessage 실패

**시나리오:** case 생성 후 #voc-review postMessage API 실패

| 항목 | 내용 |
|------|------|
| detection | `post_message()` throw |
| expected_status | case는 SQLite에 저장됨. review_messages row 없음 |
| retryable | Yes — case_id를 이용해 카드 재게시 가능 |
| case_events | `slack_post_failed` event |
| response | HTTP 500, `{ error: 'slack post failed', case_id }` — case_id는 반환 |
| 담당 모듈 | `case-service.ts` — `handle_cs_event()` |

---

## 10. Invalid case_id Button Payload

**시나리오:** Slack button의 value가 존재하지 않는 case_id

| 항목 | 내용 |
|------|------|
| detection | `get_case(case_id)` → null |
| retryable | No |
| case_events | 기록 불가 (case 없음) — server log만 |
| Slack | ack 성공 (Slack timeout 방지), 사용자에게 메시지 없음 |
| 로그 | `console.warn('[action] invalid case_id: ...')` |
| 담당 모듈 | `actions.ts` — 모든 핸들러의 null guard |

---

## 11. Unauthorized Reviewer

**시나리오:** Slack workspace에 속하지 않은 사용자가 버튼 클릭

| 항목 | 내용 |
|------|------|
| 현재 구현 | **미구현** — Slack workspace member = authorized로 간주 |
| 설계 방향 | Bolt의 `body.user.id`를 allowlist와 대조 (향후 Gate) |
| 현재 동작 | 모든 workspace member 허용 |

---

## Retryable 상태 요약

| status | retryable | 재시도 방법 |
|--------|-----------|-----------|
| `openclaw_failed` | Yes | Accept 또는 Retry 버튼 (case가 accepted/pending 유지) |
| `admin_api_failed` | Yes | Lookup 버튼 재클릭 |
| `notion_write_failed` | Yes | `POST /api/cases/:id/notion-write` |
| `slack_post_failed` | Yes | 별도 API endpoint (미구현) |
| `stale_action_rejected` | N/A | 기존 결정 유지됨 |
| `duplicate_received` | N/A | 기존 case 반환됨 |
