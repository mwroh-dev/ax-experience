# Improvement Loop Contract

> Source: `api/src/backlog/`, `api/src/voc/voc-report.ts`  
> Last updated: 2026-05-01

---

## Overview

The improvement loop converts recurring knowledge gaps into actionable backlog items, surfaced in the VOC Report dashboard. When a CS message cannot be answered from existing Notion knowledge, the system records it as a missing topic for human review.

---

## Loop Flow

```
CS message (no Notion source)
  → detect_no_source()  → true
  → log_improvement_backlog()
      → add_backlog_item()           → improvement_backlog (SQLite)
      → write_improvement_backlog()  → Notion (best-effort, may fail)
  → AutomationRun: no_source_backlog
  → VOC Report: improvement_suggestions derived from backlog

Human reviews VOC Report dashboard
  → resolves backlog item (manual)
  → adds content to Notion knowledge base
  → future similar messages → Notion hit → no longer no_source
```

---

## improvement_backlog Table

```sql
CREATE TABLE IF NOT EXISTS improvement_backlog (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  missing_topic TEXT NOT NULL,    -- first 100 chars of raw_text
  raw_query TEXT NOT NULL DEFAULT '',
  suggested_doc_type TEXT NOT NULL DEFAULT 'policy_or_faq',
  status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'resolved'
  created_at TEXT NOT NULL,
  resolved_at TEXT                -- NULL until resolved
);
```

---

## ImprovementBacklogItem Interface

```typescript
interface ImprovementBacklogItem {
  id: string;              // bl_<hex>
  case_id: string;         // FK → cases.id
  missing_topic: string;   // truncated raw_text (first 100 chars)
  raw_query: string;       // full raw_text
  suggested_doc_type: string; // 'policy_or_faq' (default)
  status: 'open' | 'resolved';
  created_at: string;      // ISO8601
  resolved_at?: string;    // ISO8601, set on resolution
}
```

---

## ImprovementSuggestion (VOC Report)

The VOC report derives suggestions from backlog + metrics — no separate table.

```typescript
interface ImprovementSuggestion {
  trigger: string;    // what caused this suggestion
  suggestion: string; // human-readable action item (Korean)
  priority: 'high' | 'medium' | 'low';
}
```

### Suggestion generation rules

| Condition | suggestion | priority |
|-----------|-----------|---------|
| `no_source_count / total_cases > 0.10` | 지식 베이스 확충 필요 — 10%+ 케이스에서 knowledge hit 없음 | high |
| Any intent with `count > 5` and `risk_level = 'high'` | 고위험 인텐트 [X]에 대한 자동 에스컬레이션 정책 검토 | high |
| `backlog_open > 3` | 미해결 improvement backlog 항목 [N]건 검토 필요 | medium |
| `overall_success_rate < 0.95` | automation run 실패율 확인 필요 | medium |

These rules run on every `GET /api/voc/report` call — not stored in DB.

---

## API Endpoints

### `GET /api/voc/report`
Returns the full VOC report including `improvement_suggestions` and `backlog_open` count.

```bash
curl -s http://localhost:3100/api/voc/report | jq '{
  backlog_open: .backlog_open,
  improvement_suggestions: .improvement_suggestions
}'
```

### Dashboard
VOC Report tab → "Improvement Suggestions" card shows suggestion list with priority badges.

---

## Closed-Loop Verification

```sql
-- Count open backlog items
SELECT COUNT(*) FROM improvement_backlog WHERE status = 'open';

-- Resolve an item (manual — no API endpoint yet)
UPDATE improvement_backlog SET status = 'resolved', resolved_at = datetime('now')
WHERE id = '<id>';
```

---

## Known Limitations

- **No resolution API**: closing a backlog item requires direct SQL or Notion UI. No `/api/backlog/:id/resolve` endpoint exists.
- **No deduplication**: multiple `no_source_backlog` runs for the same topic create separate rows.
- **Notion write is best-effort**: if Notion API fails, the SQLite row still exists but Notion is not updated.
- **Automated resolution**: no automation closes backlog items when new Notion content is added. The loop is semi-manual.
