# Dashboard

## Role

The React admin dashboard provides visibility into the CS pipeline. It reads from the same SQLite database via read-only admin endpoints.

- **Dev server:** port 5173 (`cd dashboard && npm run dev`)
- **Production:** served at `http://localhost:3100/admin` by cs-ops-api
- **Data source:** `/admin/*` read-only API endpoints

## Tabs

| Tab | What it shows | Key metric |
|-----|--------------|-----------|
| Cases | All inbound CS messages with status and intent | ≥50 rows expected in demo state |
| Automation Runs | Per-pipeline-step records with run_type and latency | ≥100 rows expected |
| Health | Live status of all service dependencies | All 5 services: ok |
| Knowledge | Notion-synced knowledge docs + Sync Now button | ≥23 docs after sync |
| VOC Report | Recurring issues + improvement suggestions | 10 issues, 4 suggestions |

## QA Scripts

```bash
node dashboard/scripts/dashboard.mjs <action>
```

| Action | What it checks |
|--------|---------------|
| `cases` | Cases tab loads with ≥50 rows |
| `automation-runs` | AutoRuns tab loads with ≥100 rows |
| `health` | All 5 service health checks pass |
| `knowledge` | Knowledge tab shows ≥23 docs |
| `voc-report` | VOC report: API count matches DOM count |
| `all` | All 5 tabs in sequence |
| `e2e` | Full pipeline: CS event → accept → send → resolved |

**Requirements:** cs-ops-api running on port 3100, Chromium with `--remote-debugging-port=9222`

```bash
# Start Chromium with CDP
open -a "Google Chrome" --args --remote-debugging-port=9222 http://localhost:3100/admin
```
