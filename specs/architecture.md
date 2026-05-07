# Architecture — D2C CS/VOC AX Ops Hub

## System Purpose

This system automates the triage, evidence retrieval, draft generation, and human-in-the-loop review of D2C customer service messages. When a CS message arrives (via Slack or a direct API call), the system classifies intent, looks up relevant commerce data from a mock API, generates a draft reply using an LLM, and posts an interactive card to a Slack review channel. A CS agent reviews the card and can Accept, Send, Deny, Escalate, or Pending the case. Every step is recorded as an `AutomationRun` row for observability. Recurring unresolved topics are surfaced in a VOC report dashboard for continuous improvement.

---

## Component Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Inbound Layer                              │
│                                                                     │
│   Slack DM / channel message  ──►  Slack Bolt Socket App           │
│   POST /api/cs/event          ──►  (test/integration entry point)  │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CS-Ops API  (port 3100, NestJS + TypeScript)     │
│                                                                     │
│   workflows/                                                        │
│     on_cs_event.ts  — classify intent + create case + Slack post   │
│     on_accept.ts    — evidence retrieval + commerce + draft gen     │
│   tools/            — single-responsibility adapters (atoms)        │
│     notion-client.ts        — knowledge search + Notion write       │
│     openclaw-client.ts      — LLM draft generation (OpenClaw)      │
│     commerce-api-client.ts  — Commerce API calls                   │
│     commerce-evidence-builder.ts — build commerce evidence packet  │
│     admin-api-client.ts     — Admin API (read-only)                │
│   cases/                                                            │
│     case-store.ts           — CRUD on cases + events               │
│     automation-run-store.ts — start/complete AutomationRun rows    │
│     draft-version-store.ts  — draft version history                │
│   router/routing-rules.ts   — 20+ rules: intent, risk, path        │
│   slack/                                                            │
│     blocks.ts           — Block Kit card builders                  │
│     actions.ts          — interactive button handler               │
│     socket-app.ts       — Bolt app wiring                          │
└────────┬─────────────────────────┬────────────────────────────────-─┘
         │                         │
         ▼                         ▼
┌────────────────┐    ┌────────────────────────────────────────────────┐
│  SQLite DB     │    │  Mock Commerce API  (port 3101, NestJS)        │
│  (WAL mode)    │    │                                                │
│                │    │  GET /commerce/customers/lookup                │
│  cases         │    │  GET /commerce/orders/:id                      │
│  automation_   │    │  GET /commerce/orders/:id/shipment             │
│  runs          │    │  GET /commerce/orders/:id/payment              │
│  prompt_       │    │  GET /commerce/refunds/eligibility             │
│  versions      │    │  POST /commerce/refunds/dry-run                │
│  knowledge_    │    │  GET /commerce/coupons/:code/validation        │
│  docs          │    │  GET /commerce/products/:id                    │
│                │    │  GET /commerce/review-events/:id/reward-status │
│                │    │  (fixture-based, deterministic responses)      │
└────────────────┘    └────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│   External Integrations                                             │
│                                                                     │
│   Slack Bolt  — inbound message events + interactive component ack  │
│   Notion API  — knowledge source sync (manual trigger)             │
│   OpenClaw    — LLM gateway used for draft generation              │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│   React Admin Dashboard  (React 18 + Vite, served from /admin)     │
│                                                                     │
│   Cases tab         — list of all cases with status, intent        │
│   Automation Runs   — recent runs, run_type, latency, status       │
│   Health tab        — live service checks (Slack, Notion, DB, etc) │
│   Knowledge tab     — knowledge_docs list + Sync Now button        │
│   VOC Report tab    — recurring issues + improvement suggestions    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Runtime Component Roles

### api (port 3100)

**Role:** Orchestrator of the CS operations workflow.

- Receives external API calls (`POST /api/cs-events`)
- Creates and manages case state (SQLite is source of truth)
- Builds and updates Slack review cards
- Handles Slack button actions (Socket Mode)
- Calls OpenClaw CS bot and posts results to Slack thread
- Calls Admin API (domain identifiers only — no Slack fields passed)
- Calls Notion write adapter

**What api does NOT do:**
- Run LLM directly (delegates to OpenClaw/Ollama)
- Manage customer DB (delegates to Admin API)
- Store raw Slack logs (handled separately by archive bot)

---

### OpenClaw (port 18789)

**Role:** LLM execution layer and CS bot.

- Receives `call_cs_bot()` calls and generates draft replies via Ollama llama model
- Modes: `answer_draft` / `pending_investigation` / `keep_summary`
- Does not receive Slack-specific fields (channel_id, thread_ts, etc.)
- Does not become source of truth for case state

**Current implementation note:** OpenClaw gateway `/v1/chat/completions` initialization issues may cause fallback to direct Ollama calls (`http://localhost:11434/v1/chat/completions`).

---

### SQLite (`api/.data/cs-ops.db`)

**Role:** CS operations workflow state store.

- Not a customer DB — domain customer data is queried from Admin API
- Records full case lifecycle (`case_events` append-only)
- Tracks review card location (`review_messages`)
- Records tool calls (`tool_calls`)
- WAL mode: allows concurrent reads, serializes writes

---

### Admin API (stub inside api, port 3100/admin)

**Role:** Domain customer data query interface.

- Read-only endpoints (GET only)
- Accepts no Slack fields — channel_id, thread_ts, action_id are prohibited
- Accepts domain identifiers only: customer_id, order_id, payment_id, case_id
- Currently a stub; replace with `ADMIN_API_BASE_URL` env var for real service

**Why Slack fields must not be passed to Admin API:** Admin API is the business domain layer; Slack is the channel layer. Mixing identifiers across layers binds Admin API's contract to Slack, requiring Admin API changes if the channel switches. It also widens the blast radius of Slack channel_id in logs (sensitive data propagation).

---

### Notion (external API)

**Role:** Permanent storage for case summaries.

- Stores normalized, case_id-centered summaries only — not raw Slack logs
- Slack-specific fields (channel_id, thread_ts) must not be stored
- `redact()` applied before write (email, phone, token masking)
- Idempotent writes guaranteed via case_id-based deduplication check

---

### Slack Archive Bot (inside api)

**Role:** Collects Slack messages from allowlisted channels as a knowledge source.

- Allowlist-gated (`ARCHIVE_ALLOWLIST` env)
- Pipeline: raw → curated (redaction applied) → FTS5 index
- Supplies `slack_archive` source_type data for knowledge search
- Only curated text is exposed to knowledge index (raw text is never passed directly)

---

## Responsibility Boundary Summary

```
External API call
  └→ api (POST /api/cs-events)
       ├→ SQLite (case creation, idempotency check)
       └→ Slack (review card post, #voc-log)

Slack button click (Socket Mode)
  └→ api (actions.ts)
       ├→ SQLite (status change, stale guard)
       ├→ Slack (#voc-log, card update)
       └→ [Accept/Pending] OpenClaw (CS bot)
            └→ Slack (post draft to thread)

case_lookup button
  └→ api (actions.ts)
       └→ Admin API (domain identifiers only)
            └→ Slack (post result to thread)

Notion write (manual or Send button)
  └→ api (notion-client.ts)
       └→ Notion API (redacted summary)

Knowledge search
  └→ api (search-knowledge.ts)
       ├→ docs/contracts/*.md (api_doc)
       ├→ slack_archive_curated (slack_archive)
       └→ [not yet implemented] Notion export (notion_policy)
```

---

## Data Flow

```
CS Message (text)
    │
    ▼
1. CLASSIFY  [on_cs_event.ts]
   ROUTING_RULES: keyword scan → RoutingDecision { intent, risk_level, recommended_path }
   → AutomationRun[classify] created

    │
    ▼
2. CASE CREATION + SLACK CARD
   create_case() → SQLite
   build_intake_review_blocks() → post to #voc-review
   → AutomationRun[slack_post]

    │
    ▼
3. HUMAN: Accept (case_accept)  [on_accept.ts — async]

    │
    ├─► EVIDENCE RETRIEVAL
    │   search_notion_knowledge() → KnowledgeHit[]
    │   → AutomationRun[retrieve_evidence]
    │
    ├─► COMMERCE LOOKUP
    │   build_commerce_evidence() → CommerceResult
    │   → AutomationRun[commerce_lookup]
    │
    └─► DRAFT GENERATION
        conflict detection (inline)
        call_cs_bot(mode='answer_draft', evidence_snippets)
        → draft text + confidence stored
        → AutomationRun[draft_reply]
        → post_thread_reply (CS Bot Draft card)

    │
    ▼
4. HUMAN: Send / Deny / Escalate / Retry
   Send    → status=resolved, Notion Tickets Log, #voc-log
   Deny    → status=denied,   Notion Tickets Log, #voc-log
   Escalate → status=escalated, write_agent_decision, #voc-log
   Retry   → re-call CS bot, draft v2 posted to thread

    │
    ▼
5. RECORDING
   Every step creates AutomationRun row + case_event for observability
```

---

## Runtime Flow — Normal Path

```
1. POST /api/cs-events { source, event_type, message }
2. on_cs_event(): classify intent via ROUTING_RULES
3. create_case() → SQLite
4. post_message (#voc-review) → build_intake_review_blocks
5. save_review_message() → SQLite
6. post_message (#voc-log)

7. [User clicks Keep]
   ack → try_update_case_status('intake_review' → 'kept')
   → add_event('archive_candidate')
   → update_message (card → decision-complete view)
   → post_message (#voc-log)

7'. [User clicks Accept]
   ack → try_update_case_status('intake_review' → 'accepted')
   → update_message (card → decision-complete view)
   → on_accept(c, channel_id, thread_ts) [async]
     a. search_notion_knowledge() → AutomationRun[retrieve_evidence]
     b. build_commerce_evidence() → AutomationRun[commerce_lookup]
     c. conflict detection (inline)
     d. call_cs_bot(mode='answer_draft') → AutomationRun[draft_reply]
     e. save_draft_version()
     f. post_thread_reply (CS Bot Draft card)
```

---

## Failure / Retry Flow

```
OpenClaw failure
  → tool_calls.status = 'error'
  → case_events: cs_bot_failed
  → thread: failure message posted
  → case status: remains accepted/pending (retryable)

Duplicate external request_id
  → case not created
  → case_events: duplicate_received (on existing case)
  → existing case_id returned

Stale button click
  → try_update_case_status → changes === 0
  → case_events: stale_action_rejected
  → case status unchanged
```

For detailed failure cases see `specs/contracts/failure-modes.md`.

---

## Key Database Tables

| Table | Purpose | Notable columns |
|-------|---------|-----------------|
| `cases` | One row per inbound CS message | `intent`, `risk_level`, `recommended_path`, `status` |
| `automation_runs` | One row per pipeline step | `run_type`, `status`, `latency_ms`, `output_summary`, `prompt_version_id` |
| `prompt_versions` | Versioned LLM prompt templates | `name`, `version`, `template` |
| `knowledge_docs` | Synced from Notion; searched per message | `source_id`, `source_type`, `title`, `indexed_at` |
| `improvement_backlog` | Unknown-topic messages pending doc creation | `missing_topic`, `suggested_doc_type`, `status` |

---

## External Integrations

### Slack (Bolt SDK, Socket Mode)
- **Inbound:** Bolt app receives `message` events; calls `handle_cs_event()`
- **Outbound:** `post_message()` posts Block Kit cards to `#voc-review`
- **Interactive:** Bolt handles `block_actions` for Accept/Send/Deny/Escalate/Pending
- **Logging:** plain-text messages to `#voc-log` for audit trail

### Notion (REST API)
- **Knowledge sync:** `notion-knowledge-sync.ts` fetches pages from a configured database, stores in `knowledge_docs`
- **Trigger:** manual ("Sync Now" button on dashboard) — no webhook
- **Best-effort write:** case summaries and backlog items written to Notion asynchronously; failures are logged but do not block the pipeline

### Mock Commerce API (port 3101)
- Fixture-based responses. All order IDs and coupon codes return deterministic data.
- No real payment processor connected.
- Used exclusively for local dev and demo; not safe for production traffic.

---

## Sensitive Data Boundaries

| Data | Allowed in | Prohibited in |
|------|-----------|---------------|
| Slack channel_id | api internal (review_messages) | Admin API, Notion, OpenClaw requests |
| Slack thread_ts | api internal | Admin API, Notion, OpenClaw requests |
| Slack user_id | case_events.actor_id | Admin API |
| Customer email | Admin API stub (masked) | SQLite raw_text and beyond |
| Case raw_text | SQLite (original) | Notion (redact first) |
| Bot token / App token | .env only | git, log output |
| Notion token | .env only | git, log output |
| Local absolute paths | nowhere | all output, logs, git |

---

## QA Approach

- **Playwright + Chrome CDP:** QA scripts in `scripts/` use CDP to connect to a running Chromium instance with the dashboard open. Each script asserts DOM state (row counts, tab visibility, data integrity).
- **API↔DOM count verification:** VOC report scripts compare API response counts against rendered DOM elements to catch mismatches.
- **Holdout eval:** `GET /api/voc/eval/holdout` runs 20 hand-labeled messages through the classifier and reports per-category accuracy.
- **No mock frameworks:** QA scripts run against a live local server to ensure real integration.

---

## Deployment Context

This is a **local development / portfolio demo** system. There is no cloud deployment, container registry, or CI/CD pipeline. All services run as local Node.js processes.

| Service | Start command | Port |
|---------|--------------|------|
| CS-Ops API | `cd api && npm run dev` | 3100 |
| Mock Commerce API | started by api on app init | 3101 |
| Dashboard (dev) | `cd dashboard && npm run dev` | 5173 |
| Dashboard (prod build) | served at `/admin` by api | 3100/admin |
