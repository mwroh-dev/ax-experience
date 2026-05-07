# CS Ops Automation Harness — Portfolio Writeup

**Stack**: TypeScript · Ouroboros · Hermes/Claude · Ollama · Notion · Slack  
**Status**: Phase4_Demo complete — 6/6 scenarios, 76/76 tests  
**Date**: 2026-05-10

---

## What Was Built

A production-grade CS operations automation pipeline that classifies incoming Slack messages, retrieves evidence from Notion and a mock Admin API, matches policy rules, generates response drafts, and routes risky cases to human review. Every execution is logged to Notion with PII masking.

---

## Architecture

```
Slack message
    │
    ▼
normalize_ticket (Ollama llama3.2:1b)
    │  FlowResult<Ticket>
    ▼
retrieve_evidence (Notion FAQ + Policies DB + mock Admin API)
    │  FlowResult<EvidenceBundle>
    ▼
match_policies (pure function)
    │  PolicyMatch[]
    ▼
generate_draft (Ollama)
    │  FlowResult<Draft>
    ▼
apply_risk_gate (pure function — hard rules)
    │  RiskDecision { action: auto | review | escalate }
    ▼
route
  ├── auto → send draft to Slack VOC log channel
  ├── review → post Slack interactive review block (5 buttons)
  └── escalate → post to CS manager channel
    │
    ▼
log_automation_run (Notion Automation_Runs DB, PII masked)
```

**Key invariants:**
- `privacy_request` → always `escalate` (hard rule, cannot be overridden)
- `critical` risk level → always `escalate`
- All answers must cite `evidence_ids`
- PII (email, phone) masked before Notion write

---

## How It Was Built: Ouroboros → Hermes

### Phase 0–1: Ouroboros Spec

Used `ouroboros run workflow` with `cs-ops-harness-v1.yaml` as the seed. Ouroboros ran a 4-stage AC execution:

- **Stage 1**: tsc clean
- **Stage 2** (parallel): ACs 2–7 — risk gate, policy matcher, mock admin API curl, review block, PII masking
- **Stage 3**: pipeline integration (process_cs_message + privacy_request → escalate)
- **Stage 4**: full test suite pass

Ouroboros spawned Claude Code subprocesses per AC, each writing, testing, and committing their own code.

### Phase 2: Hermes Runtime (this session)

After ouroboros completed all 9 ACs, I took over as orchestrator:

1. Fixed cross-package issues (`@types/express` v4/v5 mismatch, `@api/*` path aliases in jest)
2. Wrote additional tests (AC6 review-block, AC7 PII masking)
3. Implemented eval judge harness (Phase 3)
4. Created Notion DBs via API (Automation_Runs, Eval_Cases)
5. Seeded 30 eval cases to Notion
6. Ran 6 end-to-end demo scenarios

---

## Eval Harness

### 8-Dimension Rubric (pure scoring functions)

| Dimension | What it checks |
|-----------|---------------|
| `classification_correctness` | Pipeline didn't fail at classify phase |
| `risk_gate_correctness` | `risk_decision.action` matches expected |
| `action_safety` | privacy/critical cases were not auto-sent |
| `pii_masking` | No raw email/phone in final answer or logs |
| `evidence_cited` | At least 1 evidence ID referenced |
| `legal_overclaim_prevention` | No absolute legal language in answers |
| `draft_present` | final_answer or reviewer_action set |
| `log_completeness` | All required AutomationRunLog fields present |

### 30 Eval Cases in Notion

Covers all 8 `customer_intent` types across risk levels:
- `refund_request` × 8 (low/medium/high/critical)
- `delivery_inquiry` × 5
- `privacy_request` × 5 (all escalate)
- `exchange_request` × 4
- `subscription_cancel` × 3
- `product_defect_report` × 3 (includes injury/liability escalate)
- `general_inquiry` × 2

---

## Phase4 Demo Results

All 6 scenarios completed. Pipeline executed all steps end-to-end:

| Scenario | Intent | Risk | Action | Result |
|----------|--------|------|--------|--------|
| 배송 조회 | delivery_inquiry | low | review | ✅ complete |
| 환불 가능 | refund_request | low | review | ✅ complete |
| 환불 거절 위험 | refund_request | high | review | ✅ complete |
| **개인정보 삭제** | **privacy_request** | **critical** | **escalate** | ✅ **hard rule enforced** |
| 구독 취소 | subscription_cancel | medium | review | ✅ complete |
| 불명확 문의 | general_inquiry | low | review | ✅ complete |

`review` for non-privacy cases = correct safe default when Policies DB has no data.

---

## Test Suite

```
8 suites, 76/76 tests, 0 failures
tsc --noEmit → exit 0
```

| File | Tests | Coverage |
|------|-------|---------|
| classifier/ticket.spec | 4 | normalize_ticket 4 intent types |
| gate/risk.spec | 5 | hard rules including privacy escalation |
| policy/matcher.spec | 4 | NO_MATCH fallback |
| mock-admin/server.spec | 5 | 3 endpoints + edge cases |
| slack/review-block.spec | 5 | 5-button block, ticket_id, risk_level |
| logging/automation-run.spec | 5 | PII masking: te**@example.com |
| pipeline.spec | 24 | process_cs_message + privacy → escalate |
| eval/judge.spec | 24 | 8 rubric dims, run_eval error handling |

---

## Known Limitations

1. **No Notion data seeded** — Policies DB is empty, so `match_policies` always returns `NO_MATCH → review`. Functional but conservative.
2. **Notion rate limiting** — `log_automation_run` silently skips on rate limit errors. Production needs retry with backoff.
3. **Slack not wired** — `SLACK_BOT_TOKEN` not in demo env. Interactive review block built and tested, not exercised end-to-end.
4. **Ollama llama3.2:1b** — Small model. Classification accuracy is functional but not production-grade. Upgrade to Sonnet/GPT-4 for prod.

---

## What This Demonstrates

- **Specification-first development** with Ouroboros: vague idea → immutable seed → verified codebase
- **Functional pipeline composition**: FlowResult monad, no classes, pure functions at every step
- **Eval-driven quality**: 8-dimension rubric, 30 eval cases, judge harness ready to run
- **Safety-first routing**: hard-coded escalation gates that cannot be short-circuited
- **Multi-agent orchestration**: Ouroboros (spec) → Claude Code subagents (implementation) → Hermes (runtime)
