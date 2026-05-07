// cs-ops-core/src/lib/notion-client.e2e.spec.ts
// E2E integration tests for the Notion client against the live Notion API.
//
// HOW TO RUN:
//   cd cs-ops-core && E2E=true npx jest notion-client.e2e --no-coverage
//
// SAFE IN CI: All tests are skipped unless E2E=true and NOTION_API_KEY are set.
// The existing passing test suite is unaffected when E2E is absent.

// Load .env from cs-ops-core root so live credentials are available without dotenv package
import * as fs from 'fs';
import * as path from 'path';
const _env_file = path.resolve(__dirname, '../../.env');
if (fs.existsSync(_env_file)) {
  for (const line of fs.readFileSync(_env_file, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (k && !(k in process.env)) process.env[k] = v;
  }
}

import { search_faq, search_policies, read_page, write_automation_run } from './notion-client';

// ── E2E guard ─────────────────────────────────────────────────────────────────
// Skip all read-only tests unless both E2E and NOTION_API_KEY are present.
const skip_read = !process.env.E2E || !process.env.NOTION_API_KEY;

(skip_read ? describe.skip : describe)('Notion Client E2E — read-only', () => {
  it(
    'search_faq("환불") returns an array; each item has source_id, title, content',
    async () => {
      const results = await search_faq('환불');

      expect(Array.isArray(results)).toBe(true);

      for (const item of results) {
        expect(typeof item.source_id).toBe('string');
        expect(item.source_id.length).toBeGreaterThan(0);
        expect(typeof item.title).toBe('string');
        expect(typeof item.content).toBe('string');
        // source_db discriminant is always 'faq' for FAQ searches
        expect(item.source_db).toBe('faq');
      }
    },
    30_000,
  );

  it(
    'search_policies("refund") returns an array without throwing (may be empty)',
    async () => {
      const results = await search_policies('refund');

      expect(Array.isArray(results)).toBe(true);

      for (const item of results) {
        expect(typeof item.source_id).toBe('string');
        expect(typeof item.title).toBe('string');
        expect(typeof item.content).toBe('string');
        expect(item.source_db).toBe('policy');
      }
    },
    30_000,
  );

  it(
    'read_page with first FAQ result returns ok:true and a string title',
    async () => {
      const faq_results = await search_faq('환불');

      if (faq_results.length === 0) {
        // No FAQ results available — skip page read gracefully to avoid false failure.
        // This can happen when the FAQ DB is empty or the query returns no matches.
        console.warn(
          '[notion e2e] search_faq("환불") returned 0 results — skipping read_page assertion',
        );
        return;
      }

      const page_id = faq_results[0].source_id;
      const result = await read_page(page_id);

      expect(result.ok).toBe(true);
      if (!result.ok) return; // TypeScript type narrowing

      expect(typeof result.value.title).toBe('string');
      expect(result.trace.length).toBeGreaterThanOrEqual(1);
      expect(result.trace[0].step).toBe('read_page');
    },
    30_000,
  );
});

// ── Write E2E ─────────────────────────────────────────────────────────────────
// Requires E2E=true AND NOTION_AUTOMATION_RUNS_DB_ID to be set.
// Uses a timestamped run_id to avoid collision with production data.
const skip_write =
  process.env.E2E !== 'true' || !process.env.NOTION_AUTOMATION_RUNS_DB_ID;

(skip_write ? describe.skip : describe)('Notion Client E2E — write', () => {
  it(
    'write_automation_run with test fixture data resolves without throwing',
    async () => {
      const run_id = `e2e_test_${Date.now()}`;

      await expect(
        write_automation_run({
          run_id,
          ticket_id: 'e2e-ticket-001',
          phase: 'complete',
          steps: ['normalize_ticket', 'retrieve_evidence', 'generate_draft'],
          risk_decision: {
            action: 'review',
            reason: '[E2E TEST] Fixture entry — safe to delete',
          },
          reviewer_action: 'pending_review',
          evidence_ids: ['e2e-evidence-001'],
          final_answer: '[E2E TEST] Fixture automation run created by integration test.',
          eval_score: 1.0,
          detected_intent: 'general_inquiry',
        }),
      ).resolves.toBeUndefined();
    },
    30_000,
  );
});
