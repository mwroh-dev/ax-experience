# Phase 6 — React Admin Dashboard PRD

## Summary

Single-page React dashboard served directly from `api` at port 3100. Provides real-time visibility into cases, automation runs, dependency health, and VOC classification tooling — replacing manual `curl` inspection for CS Ops workflows.

## Architecture

```
dashboard/               ← Vite 5 + React 18 + TypeScript source
  src/
    App.tsx              ← 4-tab nav (Cases | Automation Runs | Health | VOC Tool)
    App.css              ← shared styles, dark theme, badge variants
    index.css            ← CSS custom properties, base reset
    views/
      CasesView.tsx      ← GET /admin/cases?limit=50, status/risk badges
      AutomationRunsView.tsx ← GET /api/automation-runs, case_id filter
      HealthView.tsx     ← GET /api/health/deps, dependency status grid
      VocToolView.tsx    ← POST /api/voc/classify + generate, scenario picker

api/public/       ← Vite build output (committed)
  index.html
  assets/
    index-*.js
    index-*.css
```

## API Contracts Used

| Endpoint | Consumer | Notes |
|---|---|---|
| `GET /admin/cases?limit=N` | CasesView | Existing admin router |
| `GET /api/automation-runs[?case_id=&limit=]` | AutomationRunsView | Phase 5 |
| `GET /api/health/deps` | HealthView | New — Phase 6 |
| `GET /api/voc/scenarios` | VocToolView | Phase 2 |
| `POST /api/voc/classify` | VocToolView | Phase 2 |
| `POST /api/voc/generate` | VocToolView | Phase 2 |

## GET /api/health/deps Contract

```json
{
  "slack":        { "configured": true, "token_prefix": "xoxb-***", "status": "valid" },
  "notion":       { "configured": true, "status": "valid" },
  "openclaw":     { "live": true, "latency_ms": 45 },
  "commerce_api": { "live": false, "error": "ECONNREFUSED" },
  "sqlite":       { "ready": true, "path": "[LOCAL_PATH]" }
}
```

Security rules: token values never returned; local paths always masked as `[LOCAL_PATH]`.

## Build & Serve

```bash
cd dashboard && npm install && npm run build
# Outputs to api/public/
# api serves it via express.static + SPA fallback
```

Vite dev proxy routes `/api`, `/admin`, `/commerce` → `http://localhost:3100` for local development without CORS.

## UI Design

- Dark theme: `#0f1117` bg, `#1a1d27` surface, `#6366f1` accent
- Badge system: `badge-success` (green), `badge-error` (red), `badge-warn` (amber), `badge-neutral` (slate), `badge-accent` (indigo)
- Monospace font: JetBrains Mono for IDs and code values
- Responsive table layout with horizontal scroll on overflow
- Sticky header with tab navigation

## Acceptance Criteria

- [ ] `dashboard/` builds without TypeScript errors
- [ ] `api` TypeScript compiles cleanly (NestJS)
- [ ] `GET /api/health/deps` returns all 5 dependency entries
- [ ] Token prefix shown (not full token), local paths masked
- [ ] SPA fallback: any non-API route serves `index.html`
- [ ] CasesView and AutomationRunsView load data from existing endpoints
- [ ] VocToolView generate button populates textarea, classify returns result
