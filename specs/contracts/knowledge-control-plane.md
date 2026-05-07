# Knowledge Control Plane Contract — D2C CS/VOC AX Ops Hub

> Version: 1.0  
> Purpose: Notion as knowledge source of truth. Dashboard as control plane.

---

## KnowledgeSource Schema

```typescript
interface KnowledgeSource {
  id: string;
  name: string;                    // e.g., "FAQ", "Policy", "Playbooks"
  notion_db_id: string;            // Notion database ID
  status: 'active' | 'syncing' | 'error' | 'inactive';
  last_synced_at?: string;         // ISO 8601
  document_count: number;
  index_version: number;
}
```

---

## KnowledgeVersion

```typescript
interface KnowledgeVersion {
  id: string;
  source_id: string;
  version: number;                 // Auto-increment per sync
  document_ids: string[];
  indexed_at: string;
}
```

---

## API Contracts

### Sync Now
```
POST /admin/knowledge/:source_id/sync
→ { triggered: true, source_id, queued_at: string }
```
Side effects: Notion DB pages fetched → SQLite index updated → document_count incremented.

### Reindex
```
POST /admin/knowledge/reindex
→ { reindexed: number, sources: string[] }
```
Side effects: Rebuilds full-text search index from current SQLite knowledge store.

### Search
```
GET /admin/knowledge/search?q=<query>&limit=5
→ { results: { id, title, source, excerpt, score }[] }
```

### Delete Document
```
DELETE /admin/knowledge/:doc_id
→ { deleted: true, doc_id }
```

---

## QA Fixture Policy

- QA knowledge documents MUST have title prefix `QA_` OR be tagged with `environment: QA` in Notion properties
- QA fixtures must be deletable without affecting production knowledge
- Cleanup procedure: Delete QA_ docs from Notion → POST /admin/knowledge/:id/sync → verify document_count decreases

---

## Notion CDP Limitation

Direct Playwright control of Notion UI is not supported (Notion is a third-party web app).

Fallback evidence for Notion knowledge operations:
1. API: document_count before sync
2. POST /admin/knowledge/:id/sync
3. API: document_count after sync (must increase)
4. GET /admin/knowledge/search?q=<qa_title> → returns result

This fallback counts as PASS evidence for Knowledge tab operations.

---

## Dashboard Control Plane Requirements

Knowledge tab must show:
- Source name and status
- Current document_count
- last_synced_at (relative time)
- Sync Now button
- Reindex button
- Search interface
