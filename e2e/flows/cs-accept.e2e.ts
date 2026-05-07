// e2e/flows/cs-accept.e2e.ts
import { test, expect } from '@playwright/test';
import { get_slack_context, navigate_to_channel, wait_for_message, click_action_button, open_thread_for_case } from '../fixtures/slack-cdp';
import { post_cs_event, get_case } from '../fixtures/api-client';

const WORKSPACE_ID = process.env.SLACK_WORKSPACE_ID ?? '';
const CS_REVIEW_CHANNEL = process.env.SLACK_CS_REVIEW_CHANNEL_ID ?? '';

// Shared Slack Electron CDP context has a single visible page; run tests serially
// to avoid navigate_to_channel races between parallel workers.
test.describe.configure({ mode: 'serial' });

test.describe('CS Accept Flow', () => {
  test('Accept button click triggers CS bot draft reply in thread', async () => {
    const ctx = await get_slack_context();

    const { case_id } = await post_cs_event({
      source: 'e2e_test',
      message: `E2E 환불 요청 accept 테스트 ${Date.now()}`,
      metadata: { request_id: `e2e-accept-${Date.now()}` },
    });

    // Navigate to voc-review before waiting — CDP only shows one page
    await navigate_to_channel(ctx, WORKSPACE_ID, CS_REVIEW_CHANNEL);
    await wait_for_message(ctx, case_id, 15_000);

    await click_action_button(ctx, 'Accept', 10_000);

    // The CS Bot Draft is posted as a thread reply on the accepted-status message.
    // Open the correct thread (the one for this case_id) so wait_for_message
    // can find [CS Bot Draft] in the page DOM.
    await open_thread_for_case(ctx, case_id);

    await wait_for_message(ctx, '[CS Bot Draft]', 30_000);
    await wait_for_message(ctx, case_id, 5_000);

    const c = await get_case(case_id);
    expect(c.status).toBe('accepted');

    // Spec step 5: if needs_more_info=true, assert improvement_backlog entry exists.
    // The E2E layer cannot seed openclaw responses, so needs_more_info value is unknown.
    // This assertion is deferred to integration tests where openclaw can be mocked.
    // Available fixture: e2e/fixtures/notion-verify.ts → find_improvement_backlog_entry(case_id)
  });
});
