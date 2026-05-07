# AutomationRun Types Contract

> Source: `api/src/cases/automation-run-store.ts`  
> Last updated: 2026-05-01

---

## Overview

Every automated action in the system creates an `AutomationRun` record. These records provide auditability: you can trace which operations were performed for any case, in what order, with what results.

---

## AutomationRunType Enum

```typescript
type AutomationRunType =
  | 'classify'
  | 'retrieve_evidence'
  | 'commerce_lookup'
  | 'draft_reply'
  | 'pending_investigation'
  | 'retry_draft'
  | 'no_source_backlog'
  | 'escalation'
  | 'notion_write'
  | 'slack_post';
```

---

## Run Type Reference

### `classify`
**When:** On every incoming CS event  
**What:** Keyword classifier assigns `intent`, `risk_level`, `recommended_path` to the case  
**output_summary:** `intent=<X> path=<Y> risk=<Z>`  
**evidence_source_ids:** `[]`

---

### `retrieve_evidence`
**When:** After classification, during `run_draft_pipeline` (review_required path)  
**What:** Notion knowledge search — up to 3 relevant documents fetched  
**output_summary:** `N hits`  
**evidence_source_ids:** `[source_db:source_id_prefix, ...]`

---

### `commerce_lookup`
**When:** During `run_draft_pipeline` when `requires_commerce_api=true`  
**What:** Commerce evidence builder — order, shipment, refund eligibility, coupon, product lookups  
**output_summary:** `found=<bool> eligible=<bool/null>`  
**evidence_source_ids:** `[]`

---

### `draft_reply`
**When:** During `run_draft_pipeline`, after evidence retrieval  
**What:** CS bot (LLM) generates a reply draft using Notion + Commerce evidence  
**output_summary:** `confidence=<high|medium|low> auto_send=<bool>`  
**evidence_source_ids:** `[]`  
**Note:** `prompt_version_id` is linked here (currently always `pv_draft_v1`)

---

### `pending_investigation`
**When:** During case_pending action (Slack "Pending" button or `/api/test/action` with `case_pending`)  
**What:** CS bot determines what information is missing from the customer message  
**output_summary:** `required_fields=[...] missing=[...]`

---

### `retry_draft`
**When:** After "Edit & Retry" Slack action  
**What:** Re-runs draft generation with potentially updated evidence or context  
**output_summary:** same as `draft_reply`

---

### `no_source_backlog`
**When:** When `detect_no_source()` returns true (no Notion knowledge hit for this intent)  
**What:** Records the missing knowledge gap; writes to `improvement_backlog` table  
**output_summary:** `topic=<text_snippet>`

---

### `escalation`
**When:** When `recommended_path=escalation` or when "Escalate" Slack button is clicked  
**What:** Records escalation event; case status → `escalated`  
**output_summary:** `reason=<escalation_reason>`

---

### `notion_write`
**When:** After case resolution (Send/Deny/Escalate actions)  
**What:** Writes case summary to Notion (agent decisions log)  
**output_summary:** `written=<bool> page_id=<notion_page_id>`

---

### `slack_post`
**When:** After any action that posts to Slack (intake card, draft card, voc-log)  
**What:** Records the Slack message post  
**output_summary:** `channel=<channel_id> ts=<thread_ts>`

---

## Typical Run Sequence per Path

### review_required (Accept → Send)
```
classify → retrieve_evidence → commerce_lookup → draft_reply → slack_post(draft_card)
→ [human Accept] → slack_post(voc-log) → notion_write
→ [human Send]   → slack_post(voc-log) → notion_write
```

### pending_info_required (Pending)
```
classify → pending_investigation → slack_post(intake_card_with_pending_state)
```

### no_source_backlog
```
classify → no_source_backlog → slack_post(voc-log)
```

### escalation
```
classify → escalation → slack_post(escalation_card)
```

### auto_reply_candidate
```
classify → retrieve_evidence → draft_reply → slack_post(draft_card)
```

---

## AutomationRun Schema

```typescript
interface AutomationRun {
  id: string;               // ar_<16hex>
  ticket_id: string;        // FK → cases.id
  run_type: AutomationRunType;
  model?: string;           // LLM model used (if applicable)
  prompt_version_id?: string; // FK → prompt_versions.id
  input_hash: string;       // SHA1 of input object (first 16 chars)
  output_summary?: string;  // human-readable result
  evidence_source_ids: string[]; // source refs used
  status: 'success' | 'error' | 'skipped';
  latency_ms?: number;
  error?: string;
  created_at: string;       // ISO8601
}
```

---

## Verify in DB

```sql
-- All runs for a case, in order
SELECT run_type, status, output_summary, latency_ms
FROM automation_runs
WHERE ticket_id = '<case_id>'
ORDER BY created_at;

-- Count by run_type across all cases
SELECT run_type, status, COUNT(*) as n
FROM automation_runs
GROUP BY run_type, status
ORDER BY n DESC;
```
