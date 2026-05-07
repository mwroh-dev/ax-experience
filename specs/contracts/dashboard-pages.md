# Dashboard Pages Contract — D2C CS/VOC AX Ops Hub

> Version: 1.0  
> Purpose: Define each Dashboard tab's data source, display fields, and Playwright verification requirements.

---

## Global Rules

- All tabs: Playwright/CDP required for PASS (not curl alone)
- All tabs: API count = UI row count must be verified
- All tabs: browser console errors must be 0
- All tabs: loading and error states must be handled

---

## Tab 1: Cases

**API Source:** `GET /admin/cases?limit=50`  
**Key Fields:** case_id (truncated), intent, risk_level (badge), status (badge), created_at  
**Empty State:** "No cases yet" message  
**Error State:** "Failed to load cases" with retry button  
**Playwright Requirements:**
- Tab clickable
- Table heading "Cases" visible
- At least 1 row present (or empty state visible)
- API count = DOM row count

---

## Tab 2: Automation Runs

**API Source:** `GET /api/admin/automation-runs` or similar  
**Key Fields:** run_type (mono), status (badge), latency_ms, case_id, created_at  
**Empty State:** "No automation runs yet"  
**Error State:** Error message with retry  
**Playwright Requirements:**
- Tab clickable
- run_type visible in rows
- status badge visible
- latency column visible
- API count = DOM row count

---

## Tab 3: Knowledge

**API Source:** `GET /admin/knowledge-sources` or similar  
**Key Fields:** source name, document_count, last_synced_at, status  
**Actions:** Sync Now button, Reindex button  
**Empty State:** "No knowledge sources configured"  
**Playwright Requirements:**
- Tab clickable
- Document count visible (number > 0 after sync)
- Sync Now button present and clickable
- After Sync: document count changes (API before/after comparison)

---

## Tab 4: VOC Report

**API Source:** `GET /api/voc/report?days=30`  
**Key Sections:**
- Metric cards: Total Cases, Resolution Rate, No-Source Rate, Automation Runs, Run Success Rate, Backlog Open
- Cases by Status (bar chart)
- Top Intents (bar chart)
- Automation Runs by Type
- Cases by Risk Level
- **Top Recurring Issues** (table: intent, count, risk_level, example_topics)
- **Improvement Suggestions** (list: priority badge, trigger, suggestion)
- Open Improvement Backlog (table with Resolve button)  
**Playwright Requirements (already PASS):**
- VOC Report tab clickable ✅
- Top Recurring Issues heading visible ✅
- Recurring issue rows ≥ 3 ✅
- Improvement Suggestions heading visible ✅
- Suggestion rows ≥ 1 ✅
- Console errors = 0 ✅
- npm run qa:dashboard:voc-report → PASS ✅

---

## Tab 5: Health

**API Source:** `GET /api/health/deps`  
**Key Fields:** service name (Slack, Notion, Commerce), configured (bool), status, masked token prefix  
**Empty State:** N/A (always shows services)  
**Error State:** Shows "error" status badge  
**Playwright Requirements:**
- Tab clickable
- At least 3 service cards visible (Slack, Notion, Commerce)
- status text visible per service
- No raw tokens visible in DOM

---

## Tab 6: VOC Tool

**API Source:** `GET /api/voc/generate`, `POST /api/voc/classify`  
**Purpose:** Interactive VOC testing tool  
**Playwright Requirements:**
- Tab clickable
- Input field visible
- Submit/classify action available

---

## Playwright Script Locations

All dashboard tabs are covered by `scripts/dashboard.mjs` (consolidated from individual tab scripts).

| Tab | Action | npm Command |
|-----|--------|-------------|
| Cases | `node scripts/dashboard.mjs cases` | qa:dashboard:cases |
| Automation Runs | `node scripts/dashboard.mjs automation-runs` | qa:dashboard:automation-runs |
| Knowledge | `node scripts/dashboard.mjs knowledge` | qa:dashboard:knowledge |
| VOC Report | `node scripts/dashboard.mjs voc-report` | qa:dashboard:voc-report |
| Health | `node scripts/dashboard.mjs health` | qa:dashboard:health |
| All tabs | `node scripts/dashboard.mjs all` | qa:dashboard:all |
