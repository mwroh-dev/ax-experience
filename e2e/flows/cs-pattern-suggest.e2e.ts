// e2e/flows/cs-pattern-suggest.e2e.ts
//
// Verifies the GET /api/ops/kb/suggestions endpoint returns KB candidates
// after enough pipeline_run_samples accumulate.
//
// Seeds samples via actual pipeline runs, then checks structural response.

import { test, expect } from '@playwright/test';
import { post_cs_pipeline, API_BASE } from '../fixtures/api-client';

// subscription_cancel is not in KB seeds → should appear as candidate after 5+ runs
const SUBSCRIPTION_CANCEL_MESSAGE = (i: number) =>
  `구독 서비스 해지 신청하고 싶습니다. 다음 달 결제 전에 취소 처리 부탁드립니다. (요청 ${i})`;

test.describe('Pattern Suggester E2E', () => {
  test('GET /api/ops/kb/suggestions returns candidates after sufficient samples', async () => {
    // 1. Run pipeline 5 times to seed samples
    const seeded = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        post_cs_pipeline({ message: SUBSCRIPTION_CANCEL_MESSAGE(i), slack_ts: `e2e-suggest-${i}-${Date.now()}` })
      )
    );
    const run_ids = seeded
      .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value?.ok)
      .map(r => r.value.value.run_id as string);

    expect(run_ids.length).toBeGreaterThanOrEqual(5);

    // 2. Query the suggestions endpoint
    const suggest_resp = await fetch(`${API_BASE}/api/ops/kb/suggestions?min_samples=5`);
    expect(suggest_resp.ok).toBe(true);

    const suggestions = await suggest_resp.json() as Array<{
      intent: string;
      order_state: string | null;
      risk_level: string;
      sample_count: number;
      approve_count: number;
      escalate_count: number;
    }>;

    expect(Array.isArray(suggestions)).toBe(true);

    // 3. Structural assertion: each candidate has required fields
    for (const s of suggestions) {
      expect(typeof s.intent).toBe('string');
      expect(typeof s.sample_count).toBe('number');
      expect(typeof s.approve_count).toBe('number');
      expect(typeof s.escalate_count).toBe('number');
      expect(s.sample_count).toBeGreaterThanOrEqual(5);
    }

    // 4. Existing KB intents must NOT be suggested
    const has_delivery_in_transit = suggestions.some(
      (s) => s.intent === 'delivery_inquiry' && s.order_state === 'in_transit'
    );
    expect(has_delivery_in_transit).toBe(false);
  });
});
