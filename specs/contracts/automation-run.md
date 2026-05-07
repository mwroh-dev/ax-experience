# AutomationRun & PromptVersion Contract — D2C CS/VOC AX Ops Hub

> Version: 1.0  
> Purpose: Every AI automation step is recorded. Enables audit trail, latency tracking, and prompt versioning.

---

## AutomationRun Schema

```typescript
interface AutomationRun {
  id: string;                    // UUID
  case_id: string;               // Links to CsTicket
  run_type: AutomationRunType;
  status: 'success' | 'error' | 'skipped';
  latency_ms?: number;           // Wall-clock milliseconds
  input_hash?: string;           // SHA256(JSON.stringify(input))
  output_summary?: string;       // First 200 chars of output text
  error_message?: string;        // Present when status = 'error'
  prompt_version_id?: string;    // FK to PromptVersion (nullable until Phase 6)
  created_at: string;            // ISO 8601
}
```

---

## Run Types

| run_type | Trigger | Input | Output | Error Cases |
|----------|---------|-------|--------|-------------|
| `classify` | Incoming VOC | raw_text | intent + recommended_path | No match → unknown |
| `retrieve_evidence` | Accept action | case_id + intent | EvidencePacket sources | Notion timeout |
| `commerce_lookup` | Accept action | order_id / email | Order/Shipment/Payment data | Order not found |
| `draft_reply` | Evidence ready | EvidencePacket + intent | Draft text | LLM error |
| `pending_investigation` | Need Info action | case_id + required_fields | Pending message sent | — |
| `retry_draft` | Edit & Retry action | case_id + edit_notes | New draft text | LLM error |
| `no_source_backlog` | no_source path | case_id + raw_text | backlog entry created | DB error |
| `escalation` | Escalate action | case_id + reason | Escalation notified | Slack error |
| `notion_write` | Case resolved | case_id + outcome | Notion ticket logged | API error |
| `slack_post` | Send action | case_id + draft_text | Slack message ts | Slack error |
| `voc_report` | Report generation | period_days | VocReport object | — |

---

## PromptVersion Schema

```typescript
interface PromptVersion {
  id: string;
  run_type: AutomationRunType;
  version: string;           // semver: "1.0.0"
  template_hash: string;     // SHA256 of prompt template string
  notes?: string;
  created_at: string;
}
```

**Linking:** Each AutomationRun.prompt_version_id references the active PromptVersion for that run_type at execution time.

---

## Dashboard Display Requirements

Automation Runs tab must show:
- run_type (monospace badge)
- status (success = green, error = red, skipped = grey)
- latency_ms (formatted as Xms)
- case_id (truncated, links to case detail)
- created_at (relative time)

Timeline sort: most recent first.

---

## Invariants

- Every Accept → Send flow MUST produce: classify + retrieve_evidence + commerce_lookup + draft_reply + slack_post runs
- Error runs MUST be recorded (not silently swallowed) — error_message required when status = 'error'
- latency_ms MUST be measured wall-clock from run start to completion
- input_hash prevents duplicate run detection
