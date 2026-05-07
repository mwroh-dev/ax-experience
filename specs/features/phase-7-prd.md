# Phase 7 — Knowledge Control Plane PRD

## Summary

Adds a management layer over the local knowledge index — enabling operators to view, search, delete, and resync knowledge documents from both Notion DBs and the contract docs directory. Exposes all operations through admin API endpoints and the dashboard Knowledge tab.

## Architecture

```
knowledge/
  knowledge-index.ts          ← existing: init tables, index_doc, index_docs_from_dir
  search-knowledge.ts         ← existing: FTS + LIKE search
  notion-knowledge-sync.ts    ← NEW: pull FAQ+Policies DBs from Notion → index_doc
  no-source-detector.ts       ← existing: detect zero-hit cases
```

## Admin API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/admin/cases?limit=N` | List recent cases (dashboard CasesView) |
| `GET` | `/admin/knowledge?limit=N` | List indexed knowledge docs (metadata only) |
| `POST` | `/admin/knowledge` | Upsert a single doc (`source_id, source_type, title, content`) |
| `DELETE` | `/admin/knowledge/:source_id` | Remove doc by source_id |
| `POST` | `/admin/knowledge/sync-notion` | Pull FAQ + Policies DBs from Notion and index |
| `POST` | `/admin/knowledge/reindex-docs` | Re-scan `docs/contracts/` and upsert all `.md` files |
| `GET` | `/api/knowledge/search?q=&limit=` | Existing FTS search (used by dashboard search) |

## Notion Sync

`sync_notion_knowledge()` in `notion-knowledge-sync.ts`:
1. Calls Notion `/search` (paginated, up to 500 pages)
2. Detects FAQ DB (`f4ade433…`) → indexes as `notion_faq:${page_id}`
3. Detects Policies DB (`b8b9fa51…`) → indexes as `notion_policy:${page_id}`
4. Returns `{ synced, skipped, errors, sources }` summary

Requires `NOTION_TOKEN` or `NOTION_API_KEY` in environment.

## Dashboard Knowledge Tab

`dashboard/src/views/KnowledgeView.tsx`:
- Stats row: doc count per `source_type` (notion_faq, notion_policy, api_doc, slack_archive)
- Search bar → calls `GET /api/knowledge/search` → shows matched snippets with confidence %
- Actions: **Sync Notion**, **Re-index Docs**, **Refresh**
- Table: source_id (truncated), type badge, title, indexed_at, Delete button

## Source Types

| source_type | Origin | Source ID format |
|---|---|---|
| `api_doc` | `docs/contracts/*.md` on startup + reindex | `api_doc:<filename>` |
| `notion_faq` | Notion FAQ DB | `notion_faq:<page_id>` |
| `notion_policy` | Notion Policies DB | `notion_policy:<page_id>` |
| `slack_archive` | Slack archive curation | (managed by archive-store) |

## Acceptance Criteria

- [ ] `GET /admin/cases` returns `{ cases: [...] }` from SQLite
- [ ] `GET /admin/knowledge` returns metadata list (no full content)
- [ ] `POST /admin/knowledge/sync-notion` returns `{ synced, skipped, sources }` (or error if no token)
- [ ] `POST /admin/knowledge/reindex-docs` returns `{ indexed, source }` count
- [ ] `DELETE /admin/knowledge/:source_id` returns 404 for unknown source_id
- [ ] Dashboard Knowledge tab renders all 5 UI sections without error
- [ ] TypeScript compiles cleanly across api and dashboard
