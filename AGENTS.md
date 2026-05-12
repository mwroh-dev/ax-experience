# AGENTS.md — D2C CS/VOC AX Ops Hub

Read before implementing anything in this project.

## Project Setup

- api: port 3100 (NestJS + TypeScript + SQLite at `api/.data/cs-ops.db`)
- Mock Commerce API: port 3101 (auto-started by api)
- Dashboard: React 18 + Vite; dev at port 5173, prod served at `api/admin`
- Consolidated CLI scripts: `{slack,notion,dashboard}/scripts/*.mjs` (action-based — do not re-fragment)
- QA scripts live in `scripts/qa/` or `tests/e2e/` and require live api + Chromium with `--remote-debugging-port=9222`. Never put QA artifacts in `/tmp`.

## Key Rules

### API contracts
- No single-case endpoint. Fetch `/admin/cases?limit=N` and filter client-side. Never assume `/admin/cases/:id` exists — that path is the React SPA.
- `/api/knowledge/search` returns `results` (not `hits`). FTS tokenizes per word; use unique single-token tags in test fixtures, not compound words.
- Confirm new routes are registered as NestJS controllers/modules in `api/src/` before calling them from the dashboard or QA scripts.

### Test endpoints vs real Slack
- `/api/test/action` does NOT call `run_draft_pipeline()` and historically used unconditional `update_case_status`. It only validates status transitions, not draft generation, automation runs, or Slack-handler guards.
- Any new test endpoint MUST share the same business-logic path (e.g. `try_update_case_status`) as the real Bolt handler in `actions.ts`. Unconditional overrides are mock-data-only, never QA-validation.
- Test endpoints MUST NOT write to real Notion. Emit the SQLite event (`improvement_backlog_noted` etc.) only; Notion writes belong to the production Slack handler.
- For end-to-end pipeline proof, use real Slack events; test endpoint PASS does not equal feature PASS.

### Slack integration
- The api Slack app must use a dedicated token. A shared `SLACK_APP_TOKEN` across multiple apps causes `num_connections=2` and Slack round-robins `block_actions` — events get silently dropped.
- The bot must be a channel member for `app_mention` to fire — OAuth scope alone is not enough. Verify with `conversations.members` before debugging downstream.
- Mask Slack IDs (`C…/U…/T…/B…` prefixes) and absolute paths in QA reports and logs. Add `ntn_*` (Notion) and `xapp-*` (Slack app token) patterns to redaction utilities; run masking regression tests after touching `redaction.ts` or `log.ts`.

### Slack CDP scripts (`slack/scripts/slack.mjs`, `scripts/qa/`)
- Mentions: type `@botname` → wait for autocomplete → click first option → type the rest → Enter. Plain-text typing of `@csopsagent` will not fire `app_mention`. Do NOT relax `dangerouslyAllowNameMatching` to bypass this.
- Button clicks: target by `data-item-key="<slack_ts>"` or button `id="<ts>-<action_id>-<suffix>"`. Climbing the DOM from a button can land on the previous card's group container.
- Dismiss `[data-qa="message_banner_content"]` (the "N new messages" overlay) before clicking — it intercepts clicks at y≈80–140.
- Use `ElementHandle.click()` (isTrusted=true), not JS `element.click()` or `page.mouse.click()` with cached coords.
- Slack Electron CDP does not support `Target.createTarget` → no `ctx.newPage()`. For non-Slack URLs, launch a separate `chromium.launch({ headless: true })`.
- Read UI state via `page.evaluate()` DOM dumps. Screenshots are final-evidence only, not debugging signal.

### Notion integration
- Before any Notion DB write, `GET /v1/databases/{db_id}` and read the actual Status/Select option names. Never hardcode `Done` etc. — real options may be `Resolved`/`In progress`/`New`.
- `/v1/search` does partial-word matching across titles and content; common Korean endings (알려주세요, 어떻게 되나요) match unrelated FAQ rows. For "knowledge miss" test queries, curl Notion directly and confirm 0 hits before using.
- Notion Desktop has no CDP port. Verify via `open notion://...` + `screencapture`, then re-confirm rows via Notion API. Do not attempt `connectOverCDP` or `launchPersistentContext` against Notion.

### VOC + routing
- `ROUTING_RULES` matches first-hit in array order. When adding a rule, check whether its keywords also appear in lower-priority intents (e.g. `ord-` shows up in shipping AND payment) and place more-specific rules earlier.
- After editing VOC templates or routing rules, run the `/api/voc/generate` + `/api/voc/classify` batch. Prefer fixing the message wording to changing the routing rule (rule edits ripple to existing cases).

### Backend ↔ dashboard parity
- Adding a field to a JSON response (e.g. `voc-report.ts` `top_recurring_issues`) requires updating the matching React component in the same change. API-only PASS leaves the user with no visible feature.

### SQLite
- Don't embed `datetime('now', '-30 days')` inside JS-quoted SQL — single-quote nesting breaks `prepare()`. Compute the ISO timestamp in JS and pass it as a bound parameter.

### Completion bar
- `tsc pass` + `vite build` = PARTIAL, never PASS. A Phase is PASS only with: command run + actual output + DB row + UI proof (CDP/Playwright on the real tab) + commit hash. Distinguish Demo PASS (golden-set accuracy) / QA PASS (live pipeline, real Slack/Notion/CDP) / Production PASS.
- `improvement_backlog` empty ≠ broken — it only fires on LLM-success AND `notion_hits.length === 0`. Test it with queries that miss the Notion knowledge base.
- Acceptance-criteria changes (e.g. `< 0.80` → `≤ 0.80`) need a separate proposal, separate approval, and a separate commit. Never relax thresholds in the same response as the failing run.

### OpenClaw gateway config (archived — removed from active pipeline)
- OpenClaw dependency removed as of 2026-05-12. LLM calls now route through Claude CLI adapters in `cs-ops-core/src/llm/` and `api/src/llm/`.

## Specs Reference

- Architecture: `specs/architecture.md`
- Domain entities: `specs/domain/domain-entities.md`
- API contracts: `specs/api/` (`admin-api.md`, `commerce-api.md`)
- Feature PRDs: `specs/features/phase-0-prd.md` … `phase-8-prd.md`
- Index: `specs/README.md`
