// cs-ops-core/src/pipeline.e2e.spec.ts
// Pipeline end-to-end smoke test — calls the full process_cs_message pipeline.
// Requires a running Ollama instance + valid env vars.
// Tests are skipped automatically unless E2E=true is set.

// Load .env from cs-ops-core root so live credentials are available without dotenv package
import * as fs from 'fs';
import * as path from 'path';
const _env_file = path.resolve(__dirname, '../.env');
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

import { process_cs_message, KB_FAST_PATH_REASON } from './pipeline';

// ── E2E guard ───────────────────────────────────────────────────────────────
// All tests in this file are skipped unless E2E=true is explicitly set.
const E2E_ACTIVE = process.env.E2E === 'true';

(E2E_ACTIVE ? describe : describe.skip)('Pipeline E2E — process_cs_message smoke test', () => {
  // Increase timeout to 30 s — LLM calls (Ollama) can take several seconds.
  jest.setTimeout(30000);

  // ── Test 1: Full pipeline with a realistic Korean CS message ──────────────
  // We accept ok:true (pipeline succeeded end-to-end) or ok:false with a
  // known structural error (e.g. LLM/Ollama unreachable, Notion token missing).
  // The test does NOT inspect draft content — only the structural shape of the
  // FlowResult and the presence of the trace array.
  it('returns a structured FlowResult for a Korean CS inquiry', async () => {
    const result = await process_cs_message(
      '영업 시간이 어떻게 되나요?',
      'e2e_test_ts_pipeline_1',
    );

    // ok must be a boolean — not undefined, not null, not thrown
    expect(typeof result.ok).toBe('boolean');

    // trace must be an array regardless of success/failure
    expect(Array.isArray(result.trace)).toBe(true);

    if (result.ok) {
      // Structural shape of AutomationRunLog
      expect(result.value).toBeDefined();
      expect(typeof result.value.run_id).toBe('string');
      expect(result.value.run_id.length).toBeGreaterThan(0);
      expect(typeof result.value.ticket_id).toBe('string');
      expect(typeof result.value.phase).toBe('string');
      expect(Array.isArray(result.value.steps)).toBe(true);
      expect(result.value.steps.length).toBeGreaterThan(0);
      expect(result.value.risk_decision).toBeDefined();
      expect(['auto', 'review', 'escalate']).toContain(result.value.risk_decision.action);
    } else {
      // ok:false is acceptable for known infrastructure errors (Ollama not running,
      // missing Notion token, etc.)  — just verify error is a non-empty string.
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
      expect(typeof result.step).toBe('string');
    }
  });

  // ── Test 2: Empty message must be rejected immediately ───────────────────
  // The pipeline guards against empty messages before making any LLM/API calls,
  // so this must reliably return ok:false without network I/O.
  it('returns ok:false for an empty message', async () => {
    const result = await process_cs_message('', 'e2e_test_ts_pipeline_2');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected ok:false for empty message');
    expect(typeof result.error).toBe('string');
    expect(result.error.length).toBeGreaterThan(0);

    // trace must still be present even for the early-exit path
    expect(Array.isArray(result.trace)).toBe(true);
    expect(result.trace.length).toBeGreaterThan(0);
  });

  // ── Test 3: Whitespace-only message is also rejected ─────────────────────
  // A message consisting only of spaces/newlines is semantically empty and
  // must be rejected before any LLM call.
  it('returns ok:false for a whitespace-only message', async () => {
    const result = await process_cs_message('   \n  ', 'e2e_test_ts_pipeline_3');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected ok:false for whitespace-only message');
    expect(typeof result.error).toBe('string');
    expect(Array.isArray(result.trace)).toBe(true);
  });
});

// ── Phase 3 E2E: KB auto-routing ─────────────────────────────────────────
(E2E_ACTIVE ? describe : describe.skip)('Phase 3 E2E: KB auto-routing', () => {
  jest.setTimeout(30000);

  it('delivery_inquiry in_transit → KB fast-path → auto route', async () => {
    const result = await process_cs_message(
      '제 주문 배송이 지금 어디에 있는지 확인하고 싶어요.',
      `e2e-phase3-${Date.now()}`
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.risk_decision.reason).toBe(KB_FAST_PATH_REASON);
      expect(['auto_sent', 'auto_suppressed']).toContain(result.value.reviewer_action);
      expect(result.value.detected_intent).toBe('delivery_inquiry');
    }
  });

  it('privacy_request → NOT KB fast-path → escalate', async () => {
    const result = await process_cs_message(
      '제 개인정보를 모두 삭제해주세요. GDPR 요청입니다.',
      `e2e-phase3-${Date.now()}`
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.reviewer_action).toBe('escalated');
    }
  });
});
