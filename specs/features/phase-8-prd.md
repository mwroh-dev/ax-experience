# Phase 8 — VOC Report & Improvement Loop PRD

## Summary

Closes the feedback loop by adding a local improvement backlog (SQLite-backed), a VOC metrics report endpoint, and a dashboard VOC Report tab. Operators can see resolution rates, intent distributions, automation health, and act on open knowledge gaps without leaving the dashboard.

## Architecture

```
voc/
  voc-report.ts            ← NEW: generate_voc_report(period_days) — SQLite aggregation

backlog/
  improvement-backlog-store.ts  ← NEW: add_backlog_item, list_backlog_items, resolve_backlog_item
  improvement-backlog-service.ts ← UPDATED: writes to SQLite + Notion (Notion is now best-effort)

db/
  sqlite.ts                ← UPDATED: improvement_backlog table migration in Phase 8 block

dashboard/src/views/
  VocReportView.tsx        ← NEW: metrics, intent/status charts, open backlog with resolve action
```

## VOC Report (GET /api/voc/report)

Aggregates the last N days (default 30, max 365):

```json
{
  "generated_at": "...",
  "period_days": 30,
  "cases": {
    "total": 42,
    "by_status": { "resolved": 18, "escalated": 3, ... },
    "by_intent": [{ "intent": "refund.request", "count": 12 }, ...],
    "by_risk": { "high": 5, "medium": 22, "low": 15 },
    "no_source_count": 8,
    "resolution_rate": 0.76
  },
  "automation_runs": {
    "total": 156,
    "by_type": [{ "run_type": "classify", "count": 42, "success_count": 42, "avg_latency_ms": 12 }, ...],
    "overall_success_rate": 0.95
  },
  "improvement_backlog": {
    "open": 8,
    "resolved": 14,
    "top_topics": [{ "topic": "환불 정책 설명", "count": 3 }, ...]
  }
}
```

## Improvement Backlog Table

```sql
CREATE TABLE improvement_backlog (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  missing_topic TEXT NOT NULL,
  raw_query TEXT NOT NULL DEFAULT '',
  suggested_doc_type TEXT NOT NULL DEFAULT 'policy_or_faq',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  resolved_at TEXT
);
```

Populated automatically when `log_improvement_backlog()` is called (no-source cases).
Previously Notion-only; now writes to SQLite first, Notion as best-effort.

## Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/voc/report?days=N` | Aggregate metrics for period |
| `GET` | `/admin/improvement-backlog?status=open&limit=N` | List backlog items |
| `POST` | `/admin/improvement-backlog/:id/resolve` | Mark item resolved |

## Dashboard VOC Report Tab

`dashboard/src/views/VocReportView.tsx`:
- Period selector: 7d / 14d / 30d / 90d (auto-reloads)
- 6 metric cards: total cases, resolution rate, no-source count, run total, run success rate, backlog open
- Bar charts: cases by status, top 8 intents, automation runs by type (success/count + avg latency), risk distribution
- Open improvement backlog table with inline Resolve button
- All data loads in parallel via `Promise.all([/api/voc/report, /admin/improvement-backlog])`

## Acceptance Criteria

- [ ] `GET /api/voc/report` returns valid JSON with all 3 top-level sections
- [ ] `improvement_backlog` table created on first DB init (no migration needed)
- [ ] `log_improvement_backlog()` writes to SQLite synchronously; Notion failure does not throw
- [ ] `POST /admin/improvement-backlog/:id/resolve` returns 404 for unknown id
- [ ] Dashboard VOC Report tab renders without error on empty DB
- [ ] Period selector changes the `?days=` param and reloads data
- [ ] TypeScript compiles cleanly across api and dashboard
