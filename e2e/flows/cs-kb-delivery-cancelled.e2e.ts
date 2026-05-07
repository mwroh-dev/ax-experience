// e2e/flows/cs-kb-delivery-cancelled.e2e.ts
//
// Verifies Tier 1 KB fast-path: delivery_inquiry + cancelled order
// Routes to auto without hitting the normal pipeline gate.
import { test, expect } from '@playwright/test';
import { try_navigate_voc_channel } from '../fixtures/slack-cdp';
import { post_cs_pipeline } from '../fixtures/api-client';
import { find_automation_run_by_run_id } from '../fixtures/notion-verify';

test.describe('KB Fast-Path: delivery_inquiry + cancelled', () => {
  test('auto-routes and logs automation run for cancelled-order inquiry', async () => {
    // 1. Submit a delivery inquiry about a cancelled order
    // Note: extract_identifiers regex requires "주문번호" prefix to parse order ID.
    // Order 33333 → status: cancelled in mock admin.
    const result = await post_cs_pipeline({
      message: '안녕하세요, 주문번호 33333 배송이 취소됐다고 표시되는데 상태 확인해 주실 수 있을까요?',
      slack_ts: `e2e-kb-tier1-${Date.now()}`,
    });

    // 2. Assert KB fast-path was taken
    expect(result.ok).toBe(true);
    expect(result.value?.risk_decision.reason).toBe('knowledge DB fast-path');
    expect(result.value?.reviewer_action).toBe('auto_sent');
    expect(result.value?.steps).toContain('knowledge_db_fast_path');
    expect(result.value?.detected_intent).toBe('delivery_inquiry');

    const run_id = result.value!.run_id;
    expect(run_id).toBeTruthy();

    // 3. Verify the VOC log channel received the auto-sent draft (skipped if Slack CDP offline)
    await try_navigate_voc_channel();

    // 4. Verify the automation run was persisted to Notion
    const notion_page_id = await find_automation_run_by_run_id(run_id);
    expect(notion_page_id).not.toBeNull();
  });
});
