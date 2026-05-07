# Notion Integration

## Role

Notion is the **knowledge source** for CS responses. CS agents maintain an FAQ database in Notion; when a CS message arrives, the pipeline searches this knowledge base for relevant content to include in the draft reply.

- **Sync:** `GET /admin/knowledge/sync` fetches Notion pages and stores them in the `knowledge_docs` SQLite table
- **Search:** Each pipeline run searches `knowledge_docs` for content matching the CS message
- **Backlog write:** Unknown topics are written back to a Notion backlog DB for human review
- **Trigger:** Manual only — the "Sync Now" button on the Dashboard Knowledge tab

## Prerequisites

| What | Env var | Why |
|------|---------|-----|
| Notion Integration Token | `NOTION_API_KEY` | Authenticates all Notion API calls |
| Knowledge DB ID | `NOTION_KNOWLEDGE_DB_ID` | Source for FAQ sync |
| Backlog DB ID | `NOTION_BACKLOG_DB_ID` | Destination for unknown-topic backlog writes |

### Notion DB Schema Required

The knowledge DB must have these exact column names:
- `Question` (title type)
- `Answer` (rich_text type)
- `Category` (select type)

Any name mismatch causes sync to return empty results silently.

## What Breaks Without It

| Missing | Effect |
|---------|--------|
| NOTION_API_KEY missing | Health check shows Notion: error; sync fails |
| Wrong DB ID | Sync returns 0 docs; all evidence retrievals return empty |
| Wrong column names | Sync runs but inserts empty content; drafts have no knowledge context |
| Bot not sharing DB | 401 or 404 from Notion API on every sync |

**Important:** cs-ops-api starts and processes messages even with Notion failures — evidence retrieval returns empty and the pipeline continues with reduced draft quality.

## Available CLI Actions (`scripts/notion/`)

```bash
node scripts/notion/notion.mjs <action>
```

| Action | What it does |
|--------|-------------|
| `sync` | Fetch Notion KB and store in knowledge_docs |
| `seed` | Insert test FAQ rows into Notion KB |
| `cleanup` | Remove test rows added by seed |
| `verify-backlog <case_id>` | Check that backlog entry was written to Notion |

## Token Rotation

If NOTION_API_KEY is compromised:

1. Go to https://www.notion.so/my-integrations
2. Find the integration → Show token → Regenerate
3. Update `cs-ops-api/.env`: `NOTION_API_KEY=secret_NEW_VALUE`
4. Restart cs-ops-api
5. Verify: `curl -s http://localhost:3100/api/health/deps | jq .notion`
6. Re-sync: `curl -s -X POST http://localhost:3100/admin/knowledge/sync`
