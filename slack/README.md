# Slack Integration

## Role

The Slack integration is the primary inbound channel for CS messages and the human review interface.

- **Inbound:** Slack Bolt Socket Mode app receives `message` events and calls the CS pipeline
- **Review cards:** Block Kit cards posted to #voc-review with Accept / Send / Deny / Escalate / Pending buttons
- **Logging:** Plain-text summaries posted to #voc-log for audit trail
- **Interactive buttons:** Bolt handles `block_actions` events from reviewers clicking card buttons

## Prerequisites

| What | Env var | Why |
|------|---------|-----|
| Slack Bot Token (`xoxb-...`) | `CS_OPS_SLACK_BOT_TOKEN` | Sends messages, posts cards |
| Slack App Token (`xapp-...`) | `CS_OPS_SLACK_APP_TOKEN` | Socket Mode connection |
| #voc-review channel ID | `SLACK_VOC_REVIEW_CHANNEL_ID` | Where review cards are posted |
| #voc-log channel ID | `SLACK_VOC_LOG_CHANNEL_ID` | Where audit log entries go |
| Bot invited to both channels | (manual `/invite`) | Without membership, `app_mention` events are not received even with correct scopes |

### Required OAuth Scopes

`app_mentions:read`, `chat:write`, `channels:read`, `channels:history`

Verify bot membership:
```bash
curl -s -H "Authorization: Bearer $CS_OPS_SLACK_BOT_TOKEN" \
  "https://slack.com/api/conversations.members?channel=$SLACK_VOC_REVIEW_CHANNEL_ID" \
  | jq '.members | index("<BOT_USER_ID>")'
# Expected: a number (not null)
```

## What Breaks Without It

| Missing | Effect |
|---------|--------|
| `CS_OPS_SLACK_BOT_TOKEN` missing | cs-ops-api fails to start (Bolt init error) |
| `CS_OPS_SLACK_APP_TOKEN` missing | Socket Mode not connected — no inbound CS messages |
| Bot not invited to channel | Messages arrive but no events fired — pipeline never runs |
| #voc-review channel missing/wrong | Slack card post fails; case stays in `intake_review` state indefinitely |

## Available CLI Actions (`scripts/slack/`)

```bash
node scripts/slack/slack.mjs <action>
```

| Action | What it does |
|--------|-------------|
| `send` | Send a test CS message to the bot via Slack (CDP) |
| `accept <case_id>` | Click Accept on a review card (CDP) |
| `pending <case_id>` | Click Pending on a review card (CDP) |
| `send-reply <case_id>` | Click Send on a draft reply card (CDP) |
| `verify-thread <case_id>` | Verify Slack thread contains expected content |
| `e2e-accept` | Full E2E: send message → accept → verify resolved |
| `e2e-nosource` | Full E2E: unknown topic → backlog path |

**CDP requirement:** Slack Electron must be running with `--remote-debugging-port=9222`
```bash
pkill -f Slack && open -a Slack --args --remote-debugging-port=9222
```

**Button targeting:** Use `data-item-key="<slack_ts>"` to anchor to specific cards. Dismiss `[data-qa="message_banner_content"]` before clicking — it intercepts clicks at y≈80–140.

## Token Rotation

If either token is compromised:

1. Go to https://api.slack.com/apps → select the cs-ops app
2. **Bot Token:** OAuth & Permissions → Regenerate Token
3. **App Token:** Basic Information → App-Level Tokens → rotate
4. Update `cs-ops-api/.env` with new values
5. Restart: `cd cs-ops-api && npm run dev`
6. Verify: `curl -s http://localhost:3100/api/health/deps | jq .slack`
   - Expected: `{"status": "ok"}`
