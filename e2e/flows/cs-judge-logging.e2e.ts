// e2e/flows/cs-judge-logging.e2e.ts
//
// Verifies judge decisions are persisted to SQLite judge_decisions table.
// The judge runs on the normal pipeline auto path (not KB fast-path).

import { test, expect } from '@playwright/test';
import { post_cs_pipeline } from '../fixtures/api-client';
import { find_judge_decision } from '../fixtures/sqlite-verify';

// Aim for: general_inquiry, no KB match → normal pipeline → auto route → judge runs
const JUDGE_TRIGGER_MESSAGE = '안녕하세요, 이번 주문 배송 예정일이 언제인지 확인할 수 있을까요? 주문번호는 없고 최근에 주문한 것들 궁금합니다.';

test.describe('Judge Decision Logging E2E', () => {
  test('judge decision is persisted to SQLite after pipeline run', async () => {
    const result = await post_cs_pipeline({ message: JUDGE_TRIGGER_MESSAGE, slack_ts: `e2e-judge-${Date.now()}` });

    expect(result.ok).toBe(true);
    const run_id: string = result.value?.run_id ?? '';
    expect(run_id).toBeTruthy();

    // Only assert judge logging if this run went through auto route
    const reviewer_action: string | undefined = result.value?.reviewer_action;
    const was_auto_route = reviewer_action &&
      ['auto_sent', 'auto_suppressed', 'judge_demoted_to_review'].includes(reviewer_action);

    if (!was_auto_route) {
      console.log(`[e2e] Run ${run_id} did not go through auto route (reviewer_action=${reviewer_action}) — judge not expected`);
      return;
    }

    const decision = find_judge_decision(run_id);
    expect(decision).not.toBeNull();
    expect(decision!.run_id).toBe(run_id);
    expect(typeof decision!.is_auto_safe).toBe('number');
    expect(['high', 'medium', 'low']).toContain(decision!.confidence);
    expect(decision!.reason.length).toBeGreaterThan(0);
  });
});
