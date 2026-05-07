# OpenClaw Gateway Integration

## Role

OpenClaw is the **LLM gateway** used for draft reply generation. When the pipeline reaches the draft step, api sends the CS message + evidence context to OpenClaw via an OpenAI-compatible HTTP API. OpenClaw routes this to the configured LLM and returns the generated draft.

- **Endpoint:** POST to `$OPENCLAW_BASE_URL/v1/chat/completions`
- **Auth:** Bearer token via `GATEWAY_TOKEN`
- **Used for:** draft_reply AutomationRun step only

## Prerequisites

| What | Env var | Why |
|------|---------|-----|
| OpenClaw gateway URL | `OPENCLAW_BASE_URL` | Where draft requests are sent |
| Gateway auth token | `GATEWAY_TOKEN` | Required in Authorization header |
| LLM model configured | (in gateway config) | Without a model, gateway returns 500 |

### Verifying the Gateway

```bash
curl -s $OPENCLAW_BASE_URL/healthz
# Expected: {"status":"ok"} or similar

curl -s -H "Authorization: Bearer $GATEWAY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model":"openclaw","messages":[{"role":"user","content":"test"}]}' \
  $OPENCLAW_BASE_URL/v1/chat/completions
# Expected: JSON with choices[0].message.content
```

## What Breaks Without It

| Missing | Effect |
|---------|--------|
| Gateway not running | draft_reply AutomationRun fails with ECONNREFUSED; case proceeds but draft = null |
| Wrong `GATEWAY_TOKEN` | 401 from gateway; draft step fails silently |
| No LLM model configured | Gateway returns 500; draft generation fails |

**api does not block on draft failure** — the Slack card is still posted but without a pre-generated draft.

## Available CLI Actions (`openclaw/scripts/`)

```bash
node openclaw/scripts/openclaw.mjs --action <action>
```

| Action | What it does |
|--------|-------------|
| `status` | Check gateway health and channel status |
| `chat` | Send a test message and print response |
| `screenshot` | Screenshot current OpenClaw UI state |
| `config` | Explore gateway config via UI |
| `phase-c` | Test Gateway HTTP POST endpoint |
| `warmup` | Warm up gateway cold-start cache |

**Requirement:** OpenClaw UI running at `http://localhost:18789` for CDP actions.
