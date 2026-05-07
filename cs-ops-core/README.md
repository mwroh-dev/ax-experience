# cs-ops-api — CS Ops Automation Harness

Slack-native CS automation harness: classifies incoming customer support tickets, retrieves FAQ/policy evidence from Notion, generates a draft reply via LLM (Ollama), applies a risk gate, and posts a structured review block in a Slack channel for human approval.

## Architecture

```
Slack event → classify_ticket → retrieve_evidence → match_policies
            → generate_draft → apply_risk_gate → post_review_block
            → log_automation_run (Notion)
```

All steps are composed via a `FlowResult<T>` functional pipeline — no exceptions cross step boundaries.

## Requirements

- Node.js 18+
- Ollama running locally (`ollama serve`) with a model pulled (e.g. `ollama pull llama3`)
- A Slack app with Bot Token and the following scopes: `chat:write`, `channels:history`, `channels:read`
- A Notion integration with access to FAQ, Policies, and Automation Runs databases

## Setup

```bash
cp .env.example .env
# fill in SLACK_BOT_TOKEN, NOTION_TOKEN, and DB IDs
npm install
```

## Run

```bash
npm run dev          # start the Bolt listener
npm run mock-admin   # start the mock commerce API (for local testing)
```

## Test

```bash
npm test             # 127 unit tests
npm test -- --testPathPattern=pipeline.e2e  # E2E pipeline spec
```

## Key modules

| Path | Responsibility |
|------|---------------|
| `src/pipeline.ts` | Top-level flow composition |
| `src/classifier/` | Ticket normalization and intent classification |
| `src/evidence/` | Notion FAQ/policy retrieval |
| `src/draft/` | LLM draft generation (Ollama) |
| `src/gate/` | Risk scoring and auto-send guard |
| `src/slack/` | Review block builder and Slack client |
| `src/logging/` | Automation run logging to Notion |
| `src/lib/` | Shared utilities (PII masking, Slack client, Notion client) |
