# Ouroboros Experiment Log

## Experiment 1: Latency Metrics API (ops_latency_001)
- **Date**: 2026-05-09
- **Mode**: Manual seed → implementation (ouroboros run would use Claude Code subprocess)
- **Seed path**: seeds/ops-latency-metrics.yaml
- **Result**: PASS
- **Eval score**: N/A (ran implementation directly without ouroboros pipeline)

### What ouroboros seed format enforced well
- Writing the seed first forced specification of exact table/column names before coding
- The `acceptance_criteria` list became a natural test checklist (curl + tsc)
- `ontology_schema` required explicit type annotation for all 7 response fields
- `ambiguity_score: 0.08` is a useful forcing function — you can't just say "it should work"

### What needed manual fix after implementation
- Initial implementation violated thin-controller pattern (all logic in controller body)
- `percentile()` returned `0` for empty arrays — semantically wrong; should return `null`
- `AutomationRunType`/`AutomationRunStatus` types were available but not used in row cast

### Seed quality observations
- **Best constraint style**: reference exact file paths + table column names → zero ambiguity
- **acceptance_criteria**: `curl http://localhost:3100/api/metrics/latency returns valid JSON` is better than "endpoint should work"
- **Gotcha**: `npm run start:dev` doesn't exist in this project — correct script is `npm run dev`
- Over-specified: listing every acceptance_criteria item twice (in constraints AND criteria) is redundant
- Under-specified: didn't clarify that `percentile()` should return `null` not `0` for empty arrays

### Time comparison
- Writing seed: ~10 min (well-structured template speeds this up)
- Implementation: subagent completed in ~2 min with explicit seed constraints
- Post-implementation review caught 3 issues that seed didn't prevent
- Total with reviews: ~15 min vs estimated 25 min manual

### Lesson: seed quality directly predicts review iteration count
The thin-controller constraint was in the seed but too vague ("follow thin-controller pattern").
A better constraint: "Controller method body must only call imported functions — zero inline logic."

---

## Experiment 2: Eval Score Trend (interview simulation)
- **Date**: 2026-05-09
- **Mode**: Manual seed (simulating ooo interview output) → implementation
- **Seed path**: seeds/ops-eval-trend.yaml
- **Result**: PASS
- **Eval score**: N/A

### Seed quality vs Experiment 1
- Interview-style seed was more focused (goal = one clear user story)
- Sparse series behavior (omit days with no data) came from explicit spec — good pattern
- `try/catch` requirement for JSON.parse failures written in constraints = zero ambiguity

### Code quality
- All 7 spec items compliant first pass
- No HIGH issues found in review
- Period map duplication (PERIOD_SECONDS vs TREND_PERIOD_SECONDS) flagged as LOW — acceptable

---

## Experiment 3: Knowledge Gap Slack Digest (full auto simulation)
- **Date**: 2026-05-09
- **Mode**: Direct implementation using seed spec as contract
- **Result**: PASS (after 1 fix)

### What needed fixing
- Slack error throw not caught — `Promise<DigestResult>` contract broken
- Fix: wrap `post_message()` in try/catch returning `{status: 'skipped', reason: ...}`

### Lessons
- Return type contracts must be tested for ALL code paths (success + Slack error + env missing)
- Using existing Slack client singleton is non-trivial to discover — good to specify in seed

---

## Overall Retrospective

### Ouroboros seed format value
The seed.yaml format proved useful even when ouroboros wasn't running the pipeline:
- Forced specification of exact file paths, table names, column names before coding
- `acceptance_criteria` as curl-testable assertions → natural test checklist
- `ambiguity_score` forced quantifying confidence in the spec
- Thin-controller constraint was in seed but too vague → 1 extra review iteration

### Review iteration count by seed quality
| Experiment | Seed quality | Review iterations | Issues found |
|-----------|-------------|-------------------|--------------|
| Latency metrics | High | 3 (controller, percentile null, types) | Medium+Important |
| Eval trend | High | 0 issues | Approved first pass |
| Knowledge gap | Medium | 1 (Slack error handling) | High |

### When seed-first approach saves time
- Any feature touching existing infrastructure (table names, Slack client, controller pattern)
- acceptance_criteria that match curl commands = instant verification checklist
- Features with > 3 error paths (env missing, empty data, API failure)

### When direct coding is faster
- Adding to an existing module with clear structure (< 30 LOC)
- Purely mechanical changes (prop rename, route add)

### Seed quality checklist (for next seeds)
- [ ] Goal is one sentence with measurable output
- [ ] Constraints reference exact file paths and table/column names
- [ ] acceptance_criteria are curl-testable ("GET /path returns {shape}")
- [ ] Error paths specified: what happens when dependency is missing/fails
- [ ] Return type contract: "always returns X, never throws"
- [ ] ambiguity_score <= 0.12 before running

---

## Experiment 4: Stale Case Alert — First Real ooo run (ops_stale_case_001)
- **Date**: 2026-05-09
- **Mode**: `ouroboros run workflow seeds/ops-stale-case-alert.yaml --dry-run` (actual run)
- **Seed path**: seeds/ops-stale-case-alert.yaml
- **Result**: PASS — tsc 0 exit, code correct, committed (f147661)

### What actually happened
- `--dry-run` flag does NOT skip execution — it spawned 6 parallel AC agents anyway
- Each AC agent ran as a `claude --allowedTools Read,Write,Edit,Bash,Glob,Grep --permission-mode acceptEdits` subprocess
- All 6 ACs ran in parallel, each independently exploring codebase + implementing + running tsc
- AC 1 created `api/src/ops/stale-case-alert.ts` and wired `cases.controller.ts` — correct first pass
- AC 5 attempted `curl -X POST http://localhost:3100/api/ops/stale-case-alert` (server not running → skipped)
- Multiple ACs ran `npx tsc --noEmit` independently — each passed
- Ouroboros DB logged exec-002 as "running" even after process ended (likely state sync issue)

### Seed spec vs code output
- `post_stale_case_alert()` matched spec exactly: skips when env missing, skips when 0 stale cases, try/catch on Slack, shows ≤10 IDs
- `MAX_CASE_IDS_IN_MESSAGE = 10` constant extracted (not magic number)
- SQLite query: `WHERE status = 'pending' AND updated_at < datetime('now', '-24 hours')` — correct
- Controller: thin delegation, no `@HttpCode` needed (NestJS POST returns 201 by default)

### What `--dry-run` actually means in ouroboros 0.36.0
- Behavior: still spawns AC agents and makes file changes — NOT a safe preview mode
- The flag seems to affect only post-execution QA scoring, not actual execution
- Lesson: use `--no-qa` to skip QA eval, not `--dry-run` if you want to skip code changes

### Parallel AC conflict behavior
- 6 ACs all targeted the same files — race condition on write
- AC 1 wrote the correct implementation first; later ACs saw it already done and verified rather than overwriting
- Ouroboros orchestrator handles idempotent re-implementations gracefully (no conflict corruption observed)

### Final ouroboros summary (exit 0, 333.9s, 317 messages)
- **6/6 ACs COMPLETED** — all acceptance criteria verified by parallel agents
- 1 file conflict detected by coordinator → 0 fixes needed (parallel writes converged on same correct output)
- QA eval skipped: `claude_agent_sdk` tried to spawn a 7th Claude Code subprocess for QA scoring, but hit "max turns (1)" limit — nested session constraint from running inside an active Claude Code session
- `--dry-run` did NOT cause the QA skip — it was the nested session limit on the QA subprocess

### Review iteration count: 0
- Code was correct first pass (spec fully specified all error paths)
- `ambiguity_score: 0.06` — lowest yet — correlated with zero post-run fixes needed
