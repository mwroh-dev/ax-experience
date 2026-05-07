# Phase 4 PRD — Human Review Action Tree v2

**Product**: D2C Commerce CS/VOC AX Ops Hub  
**Phase**: 4 of 8  
**Type**: Backend — Slack action handler completeness + AutomationRun wiring  
**Depends on**: Phase 3 (Commerce evidence), Phase 5 (AutomationRun)

---

## 1. 목적

인간 검토자가 Slack에서 수행하는 모든 결정 액션을 완성하고,
각 액션에 AutomationRun 감사 로그를 추가한다.

---

## 2. 완성된 액션 트리

```
[intake_review]
  ├── case_keep       → kept          (archive candidate)
  ├── case_accept     → accepted      (draft pipeline 트리거)
  ├── case_pending    → pending       (pending investigation)
  └── case_escalate   → escalated     (immediate escalation)
         ↓
[accepted]
  ├── case_lookup     (Commerce API 조회 — status 변경 없음)
  ├── case_retry      → accepted      (draft 재시도)
  ├── case_send       → resolved      (Notion Tickets Log 기록)
  ├── case_deny       → denied        (Notion Tickets Log 기록)
  ├── case_auto_send  → resolved      (auto-reply 즉시 발송)
  └── case_pending    → pending       (대기 전환)
```

---

## 3. Phase 4 추가 내용

### AutomationRun 감사 로그 (Phase 5 연동)

| 액션 | run_type | 기록 내용 |
|---|---|---|
| `case_send` | `notion_write` | Notion Tickets Log 쓰기 성공/실패 |
| `case_deny` | `notion_write` | Notion Tickets Log 쓰기 성공/실패 |
| `case_escalate` | `escalation` | 에스컬레이션 결정 감사 |

### 업데이트된 문서

- `docs/contracts/slack-actions.md` — 2차 Draft 버튼 구현 상태 업데이트, Commerce API로 갱신

---

## 4. 상태 전환 보안

### Reviewer Allowlist Guard

`ALLOWED_REVIEWER_IDS` 환경변수로 허용된 검토자만 액션 처리:
```
ALLOWED_REVIEWER_IDS=U0000000001,U0000000002
```
빈 값이면 모든 사용자 허용 (개발/테스트용).

### Stale Action Guard

```typescript
try_update_case_status(case_id, expected_status, new_status, actor_id)
// SQLite: UPDATE cases SET status=? WHERE id=? AND status=?
// changes === 0 → stale_action_rejected event, return
```

동시 클릭 시 SQLite 직렬화로 첫 번째 요청만 성공.

---

## 5. AutomationRun per 케이스 집계 예시

케이스 하나의 전체 파이프라인:
```
run_type            status   latency  output_summary
─────────────────────────────────────────────────────
classify            success  2ms      intent=refund.customer_specific...
retrieve_evidence   success  45ms     2 hits
commerce_lookup     success  12ms     found=true eligible=true
draft_reply         success  890ms    confidence=high auto_send=false
notion_write        success  230ms    notion tickets log written
```

---

## 6. Acceptance Criteria

Phase 4는 실제 Slack Socket Mode 환경에서 검증:
```bash
# case_accept → draft 생성 → case_send (Slack 버튼)
# → automation_runs에서 notion_write run 확인
curl http://localhost:3100/api/automation-runs?case_id=<case_id> | jq '.runs[] | select(.run_type=="notion_write")'
# → { run_type: "notion_write", status: "success" }

# case_escalate → automation_runs에서 escalation run 확인
curl http://localhost:3100/api/automation-runs?case_id=<case_id> | jq '.runs[] | select(.run_type=="escalation")'
# → { run_type: "escalation", status: "success" }
```
