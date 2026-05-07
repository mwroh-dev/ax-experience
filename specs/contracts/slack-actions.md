# Slack Actions Contract

## Socket Mode

Slack Bolt + Socket Mode (xapp-...). public URL 불필요.
api 전용 Slack App — OpenClaw와 App Token 공유 금지.
(공유 시 block_actions 이벤트 라운드로빈으로 유실 발생)

---

## 1차 Intake 버튼

### Keep (case_keep)

| 항목 | 내용 |
|------|------|
| action_id | `case_keep` |
| value | case_id |
| status 전환 | `intake_review → kept` |
| 의미 | 지금 처리하지 않음. 보관 후보. |
| side effects | status=kept, archive_candidate event, card update, #voc-log |

### Accept (case_accept)

| 항목 | 내용 |
|------|------|
| action_id | `case_accept` |
| value | case_id |
| status 전환 | `intake_review → accepted` |
| CS bot 호출 | `on_accept()` async — evidence retrieval + draft generation |
| 의미 | CS bot에게 답변 초안 생성 요청. **즉시 발송이 아님.** |
| side effects | status=accepted, card update, on_accept async 호출, thread에 draft 게시, #voc-log |

### Escalate (case_escalate)

| 항목 | 내용 |
|------|------|
| action_id | `case_escalate` |
| value | case_id |
| status 전환 | `any → escalated` |
| 의미 | 인간 검토자가 직접 처리해야 하는 케이스. |
| side effects | status=escalated, escalated event, escalation_blocks 게시, #voc-log |

---

## 2차 Draft 버튼

| action_id | 구현 | 설명 |
|-----------|------|------|
| `case_lookup` | ✅ | Commerce API 조회 → thread 결과 게시 |
| `case_send` | ✅ | 최종 발송 → status=resolved, Notion Tickets Log 기록 |
| `case_retry` | ✅ | CS bot 재호출 |
| `case_deny` | ✅ | 거부 처리 → status=denied, Notion Tickets Log 기록 |
| `case_escalate` | ✅ | 에스컬레이션 → status=escalated |

### case_send 상세

| 항목 | 내용 |
|------|------|
| action_id | `case_send` |
| status 전환 | `accepted → resolved` |
| AutomationRun | `notion_write` (Notion Tickets Log) |
| side effects | draft_sent event, Notion write, card update → final_status_blocks, #voc-log |

### case_deny 상세

| 항목 | 내용 |
|------|------|
| action_id | `case_deny` |
| status 전환 | `accepted → denied` |
| AutomationRun | `notion_write` (Notion Tickets Log) |
| side effects | draft_denied event, Notion write, card update → final_status_blocks, #voc-log |

### case_escalate 상세

| 항목 | 내용 |
|------|------|
| action_id | `case_escalate` |
| status 전환 | `any → escalated` |
| AutomationRun | `escalation` |
| side effects | escalated event, write_agent_decision, card update → escalation_blocks, #voc-log |

---

## Side Effects 순서 (1차 버튼 공통)

```
1. ack()          ← 반드시 첫 번째 (3초 timeout 방지)
2. get_case()     ← null이면 즉시 return (invalid_action 로그)
3. try_update_case_status('intake_review' → new_status)
   → false이면: stale_action_rejected event, return
   → true이면: 계속
4. post_message(#voc-log)
5. get_review_message() → update_message(card → decision-complete)
6. [Accept] on_accept() async  ← ack 이후 비동기
```

---

## Stale / Concurrent Action Guard

`try_update_case_status(case_id, expected_status='intake_review', new_status, actor_id)`

- SQLite transaction 내에서 `UPDATE cases SET status=? WHERE id=? AND status=?` 실행
- `changes === 0` → false 반환 → `stale_action_rejected` event 기록
- 두 사용자가 동시 클릭해도 SQLite serialization으로 하나만 성공

---

## Review Card Update

버튼 클릭 후 card는 "결정 완료" 뷰로 교체된다 (버튼 제거, 결정 내용 표시).

`update_message(channel, ts, fallback_text, build_decision_blocks(c, status, actor_id))`

review_messages에서 channel_id와 ts를 조회한다.

---

## Test Helper (개발/검증용)

```
POST /api/test/action
{
  "action_id": "case_accept",
  "case_id": "case_...",
  "actor_id": "U_test"
}
```

Socket Mode payload를 시뮬레이션한다. 프로덕션에서는 제거 권장.

**Gate 4 PASS 조건은 이 endpoint로 대체할 수 없다.**
실제 Slack Block Kit 버튼 클릭 → Socket Mode payload 수신이 Gate 4 PASS 조건이다.

---

## 실패 처리

각 실패 케이스별 동작은 `docs/contracts/failure-modes.md` 참조.

주요 원칙:
- `ack()` 실패 방지를 위해 모든 비동기 작업은 ack 이후 시작
- CS bot / Commerce API 실패는 tool_calls error + case_events 기록 후 thread에 실패 메시지
- invalid case_id는 ack 후 조용히 종료 (Slack에 에러 메시지 없음)
