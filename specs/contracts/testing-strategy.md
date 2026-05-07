# Testing Strategy Contract — AX Ops Hub

> Defines what each test tier can and cannot verify.
> Slack E2E PASS requires Real CDP E2E. No exceptions.

---

## Test Tiers

### Tier 1: API Smoke Test
**Command pattern:** `curl -s http://localhost:3100/api/...`
**What it verifies:**
- Endpoint exists and returns HTTP 200
- Response JSON has expected top-level keys
- No server crash

**What it does NOT verify:**
- UI rendering
- Slack message delivery
- AutomationRun creation
- Status transitions via real Slack handler
- `run_draft_pipeline()` execution

**Acceptable PASS claims:**
- "API returns valid JSON"
- "Endpoint responds HTTP 200"

**NOT acceptable PASS claims:**
- "Slack action works" (requires Tier 3)
- "Dashboard shows data" (requires Tier 2)

---

### Tier 2: Dashboard CDP Test (Playwright)
**Command pattern:** `npm run qa:dashboard:<tab>`
**What it verifies:**
- React tab renders without crash
- DOM contains expected headings and row count
- API count matches DOM row count
- No browser console errors
- Screenshot saved

**What it does NOT verify:**
- Slack UI
- Slack button click → server handler execution
- Real-time updates (static snapshot only)

**Acceptable PASS claims:**
- "Dashboard Cases tab shows 50 rows (API=DOM)"
- "VOC Report tab shows top_recurring_issues"

---

### Tier 3: Real Slack CDP E2E Test
**Command pattern:** `node scripts/slack.mjs accept` (or `e2e-accept`, `e2e-nosource`)
**Requirements:**
- Slack desktop app running
- Remote debugging port active: `open -a Slack --args --remote-debugging-port=9222`
- `chromium.connectOverCDP('http://localhost:9222')` connects to Slack page
- api Socket Mode connected and receiving block_actions

**What it verifies:**
- Actual Slack button click in real Slack DOM
- Real `block_actions` payload received by api
- Real `run_draft_pipeline()` execution via `slack/actions.ts`
- Real `draft_reply` + `retrieve_evidence` + `commerce_lookup` AutomationRun creation
- Real Slack thread card rendered
- Real `#voc-log` post
- SQLite case status updated

**Acceptable PASS claims:**
- "Slack Accept flow PASS: draft_reply AutomationRun created, thread card rendered"

**BLOCKED condition:**
- Slack app not running → BLOCKED (not FAIL, not FALLBACK)
- Port 9222 not open → BLOCKED
- Socket Mode disconnected → BLOCKED

---

### Tier 4: Fallback Integration Test (`/api/test/action`)
**Command pattern:** `curl -s -X POST http://localhost:3100/api/test/action ...`
**Classification: FALLBACK_ONLY**

**What it verifies:**
- Status transitions (intake_review → accepted → resolved)
- classify + slack_post AutomationRuns present (created at intake via /api/cs-events, not by this endpoint)
- Case row in SQLite updated
- `#voc-log` post attempted (best-effort, not guaranteed)

**What it does NOT verify (confirmed gap):**
- `run_draft_pipeline()` is NOT called by test endpoint
- `draft_reply`, `retrieve_evidence`, `commerce_lookup` AutomationRuns are NOT created
- Real Slack block_actions payload NOT sent
- Slack 3-second ack constraint NOT tested
- Real Slack thread UI NOT rendered

**Acceptable PASS claims:**
- "Status transition: intake_review → resolved via test endpoint"
- "classify + slack_post AutomationRuns present"

**NOT acceptable PASS claims:**
- "Slack action flow verified" → must use Tier 3
- "Human review pipeline complete" → must use Tier 3

---

## PASS Claim Rules

| Feature | Minimum Test Tier | Notes |
|---------|------------------|-------|
| API endpoint exists | Tier 1 | curl sufficient |
| Dashboard tab renders | Tier 2 | Playwright required |
| API ↔ UI count match | Tier 2 | Playwright required |
| Slack button click → handler | Tier 3 | Real CDP required |
| run_draft_pipeline executes | Tier 3 | Real CDP required |
| AutomationRun full set | Tier 3 | Tier 4 misses draft_reply, retrieve_evidence, commerce_lookup (run_draft_pipeline not called) |
| Status transition (basic) | Tier 4 | Tier 4 acceptable for status-only |

---

## FAIL Conditions

- Calling Tier 4 result a "Slack E2E PASS" → FAIL
- Calling `curl` result a "Dashboard PASS" → FAIL
- Calling `tsc` pass a "feature complete" → FAIL
- Marking Tier 3 as PASS when Slack app not running → FAIL (must be BLOCKED)
