// e2e/flows/cs-kb-refund-eligible.e2e.ts
//
// Verifies Tier 2 KB fast-path: refund_request + eligible order
// Also verifies the eligibility gate falls through for ineligible orders.
import { test, expect } from '@playwright/test';
import { try_navigate_voc_channel } from '../fixtures/slack-cdp';
import { post_cs_pipeline } from '../fixtures/api-client';
import { find_automation_run_by_run_id } from '../fixtures/notion-verify';

test.describe('KB Fast-Path: refund_request + eligibility gate', () => {
  test('auto-routes refund request when order 12345 is eligible', async () => {
    // 1. Submit a refund request for an eligible order (mock admin: 12345 → eligible: true)
    // Note: extract_identifiers regex requires "주문번호" prefix to parse order ID
    const result = await post_cs_pipeline({
      message: '주문번호 12345 환불 신청하고 싶습니다. 30일 이내에 구매했고 아직 반품 신청 전입니다.',
      slack_ts: `e2e-kb-tier2-${Date.now()}`,
    });

    // 2. Assert KB fast-path was taken with eligibility confirmed
    expect(result.ok).toBe(true);
    expect(result.value?.risk_decision.reason).toBe('knowledge DB fast-path');
    expect(result.value?.reviewer_action).toBe('auto_sent');
    expect(result.value?.steps).toContain('knowledge_db_fast_path');
    expect(result.value?.detected_intent).toBe('refund_request');

    const run_id = result.value!.run_id;
    expect(run_id).toBeTruthy();

    // 3. Verify the VOC log channel received the auto-sent draft (skipped if Slack CDP offline)
    await try_navigate_voc_channel();

    // 4. Verify the automation run was persisted to Notion
    const notion_page_id = await find_automation_run_by_run_id(run_id);
    expect(notion_page_id).not.toBeNull();
  });

  test('falls through to normal pipeline when order 67890 refund is ineligible', async () => {
    // mock admin: order 67890 → eligible: false → eligibility gate blocks KB fast-path
    // Note: extract_identifiers regex requires "주문번호" prefix to parse order ID
    const result = await post_cs_pipeline({
      message: '주문번호 67890 환불 요청드립니다. 상품을 받았는데 반품하고 싶습니다.',
      slack_ts: `e2e-kb-tier2-ineligible-${Date.now()}`,
    });

    // Pipeline must succeed, but the risk_decision must NOT be the KB fast-path
    expect(result.ok).toBe(true);
    expect(result.value?.risk_decision.reason).not.toBe('knowledge DB fast-path');
    // Normal pipeline stages appear in steps (KB sub-steps rolled back, then re-run)
    expect(result.value?.steps).toContain('match_policies');
    expect(result.value?.steps).toContain('apply_risk_gate');
  });
});
