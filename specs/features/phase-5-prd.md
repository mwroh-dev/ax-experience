# Phase 5 PRD — AutomationRun Tracking

**Product**: D2C Commerce CS/VOC AX Ops Hub  
**Phase**: 5 of 8  
**Type**: Backend — Audit log for AI pipeline executions  
**Depends on**: Phase 0 (contract), Phase 2 (classifier), Phase 3 (evidence pipeline)

---

## 1. 목적

AI 파이프라인의 모든 주요 실행 단계를 `automation_runs` 테이블에 기록한다.
각 `AutomationRun`은 케이스별 재현 가능한 감사 로그를 제공한다.

---

## 2. AutomationRun 스키마

```sql
CREATE TABLE automation_runs (
  id TEXT PRIMARY KEY,           -- ar_{16hex}
  ticket_id TEXT NOT NULL,       -- cases.id 참조
  run_type TEXT NOT NULL,        -- classify | retrieve_evidence | ...
  model TEXT,                    -- LLM 모델 (예: claude-3-5-sonnet)
  prompt_version_id TEXT,        -- prompt_versions.id
  input_hash TEXT NOT NULL,      -- SHA1(input JSON) 앞 16자
  output_summary TEXT,           -- 출력 요약 (최대 200자)
  evidence_source_ids TEXT,      -- JSON array
  status TEXT NOT NULL,          -- success | error | skipped
  latency_ms INTEGER,
  error TEXT,
  created_at TEXT NOT NULL
);
```

---

## 3. run_type 값

| run_type | 트리거 지점 |
|---|---|
| `classify` | `handle_cs_event` — VOC 분류 시 |
| `retrieve_evidence` | `run_draft_pipeline` — Notion 검색 시 |
| `commerce_lookup` | `run_draft_pipeline` — Commerce API 조회 시 |
| `draft_reply` | `run_draft_pipeline` — CS Bot 답변 초안 생성 시 |
| `pending_investigation` | pending-service (예정) |
| `retry_draft` | 재시도 경로 (예정) |
| `no_source_backlog` | 백로그 로그 (예정) |
| `escalation` | 에스컬레이션 경로 (예정) |
| `notion_write` | Notion 쓰기 (예정) |
| `slack_post` | Slack 포스팅 (예정) |

---

## 4. API

### GET /api/automation-runs?case_id={case_id}
특정 케이스의 AutomationRun 목록 (시간순 오름차순)

### GET /api/automation-runs?limit={n}
최근 n개 AutomationRun (기본 50개)

**Response:**
```json
{
  "runs": [
    {
      "id": "ar_abc123def456",
      "ticket_id": "case_...",
      "run_type": "classify",
      "input_hash": "a1b2c3d4e5f6",
      "output_summary": "intent=refund.customer_specific path=review_required risk=medium",
      "evidence_source_ids": [],
      "status": "success",
      "latency_ms": 3,
      "created_at": "2026-04-30T..."
    }
  ]
}
```

---

## 5. 파일 목록

| 파일 | 역할 |
|---|---|
| `api/src/db/sqlite.ts` | `automation_runs` + `prompt_versions` 테이블 생성 |
| `api/src/cases/automation-run-store.ts` | CRUD: start, complete, get |
| `api/src/cases/case-service.ts` | `classify` run 기록 |
| `api/src/draft/draft-service.ts` | `retrieve_evidence`, `commerce_lookup`, `draft_reply` run 기록 |
| `api/src/app.ts` | `GET /api/automation-runs` 엔드포인트 |

---

## 6. Acceptance Criteria

```bash
# cs-events 경유로 케이스 생성 (분류 + 지식 검색 포함)
CASE=$(curl -s -X POST http://localhost:3100/api/cs-events \
  -H "Content-Type: application/json" \
  -d '{"source":"test","message":"환불 정책이 어떻게 되나요?"}' | jq -r .case_id)

curl -s "http://localhost:3100/api/automation-runs?case_id=$CASE" | jq '.runs | length'
# → 1 이상 (classify run 포함)

curl -s "http://localhost:3100/api/automation-runs?case_id=$CASE" | jq '.runs[0].run_type'
# → "classify"

curl -s "http://localhost:3100/api/automation-runs?case_id=$CASE" | jq '.runs[0].status'
# → "success"
```
