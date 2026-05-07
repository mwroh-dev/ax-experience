# PromptVersion Contract

> Source: `api/src/db/sqlite.ts` (schema + seed), `api/src/cases/automation-run-store.ts`  
> Last updated: 2026-05-01

---

## Overview

`PromptVersion` records track which prompt template was used for each LLM call. This provides auditability: if a prompt template changes, older `AutomationRun` records still reference the exact version that generated their output.

---

## Schema

```sql
CREATE TABLE IF NOT EXISTS prompt_versions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,       -- short identifier (e.g. 'draft_reply')
  version TEXT NOT NULL,    -- semver (e.g. '1.0.0')
  template TEXT NOT NULL,   -- prompt template text
  schema_json TEXT,         -- expected output JSON schema (optional)
  created_at TEXT NOT NULL  -- ISO8601
);
```

---

## TypeScript Interface

```typescript
interface PromptVersion {
  id: string;           // pv_<name>_v<version_int>  (e.g. 'pv_draft_v1')
  name: string;         // run_type the prompt is used for
  version: string;      // semver
  template: string;     // full prompt template text
  schema_json?: string; // JSON schema for expected output
  created_at: string;   // ISO8601
}
```

---

## Seeded Versions

The following versions are seeded on DB initialization (idempotent):

| id | name | version | template (summary) |
|----|------|---------|-------------------|
| `pv_classifier_v1` | classifier | 1.0.0 | Classify CS inquiry intent and risk. Output: {intent, risk_level, recommended_path, reason} |
| `pv_draft_v1` | draft_reply | 1.0.0 | Generate a CS reply draft based on evidence. Output: {draft, confidence, needs_more_info} |
| `pv_pending_v1` | pending_investigation | 1.0.0 | Determine missing information needed to resolve inquiry. Output: {required_fields, missing_fields} |

---

## Link to AutomationRun

`AutomationRun.prompt_version_id` is a FK → `prompt_versions.id`.

**Current state:** `prompt_version_id` is seeded in the schema but **not yet linked** during run creation. The field is always `null` in current automation runs. This is a known gap — linking requires passing `prompt_version_id` through the `start_automation_run()` call chain.

```sql
-- Verify current state
SELECT run_type, prompt_version_id, COUNT(*)
FROM automation_runs
GROUP BY run_type, prompt_version_id;
-- expected: all prompt_version_id = null (current gap)
```

---

## Versioning Convention

When a prompt template changes:

1. Insert a new row into `prompt_versions` with incremented `version`
2. New runs reference the new `id`
3. Old runs retain the old `id` — history is preserved
4. Never update an existing `prompt_versions` row in place

```sql
-- Example: promote draft_reply to v2
INSERT INTO prompt_versions (id, name, version, template, created_at)
VALUES ('pv_draft_v2', 'draft_reply', '2.0.0', '<new template text>', datetime('now'));
```

---

## Known Gap

`AutomationRun.prompt_version_id` is always `null` because `start_automation_run()` accepts `prompt_version_id` as an optional param but callers in `draft-service.ts` do not pass it. Linking is a P3 improvement (see `docs/portfolio/gap-map.md`).
