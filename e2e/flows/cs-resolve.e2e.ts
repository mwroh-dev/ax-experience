// e2e/flows/cs-resolve.e2e.ts
import { test, expect } from '@playwright/test';
import { get_slack_context, navigate_to_channel, wait_for_message, click_action_button, open_thread_for_case } from '../fixtures/slack-cdp';
import { post_cs_event } from '../fixtures/api-client';
import { find_notion_page_by_case_id, get_notion_page_status } from '../fixtures/notion-verify';

const TICKETS_LOG_DB_ID = process.env.NOTION_CASES_DB_ID ?? '';
const WORKSPACE_ID = process.env.SLACK_WORKSPACE_ID ?? '';
const CS_REVIEW_CHANNEL = process.env.SLACK_CS_REVIEW_CHANNEL_ID ?? '';
const VOC_CHANNEL = process.env.SLACK_VOC_LOG_CHANNEL_ID ?? '';

// Shared Slack Electron CDP context has a single visible page; run tests serially
// to avoid navigate_to_channel races between parallel workers.
test.describe.configure({ mode: 'serial' });

test.describe('CS Resolve Flow', () => {
  test('Send button click creates Notion Tickets Log entry and voc_log message', async () => {
    const ctx = await get_slack_context();

    const { case_id } = await post_cs_event({
      source: 'e2e_test',
      message: `E2E 환불 요청 resolve 테스트 ${Date.now()}`,
      metadata: { request_id: `e2e-resolve-${Date.now()}` },
    });

    // Navigate to voc-review first to see intake review and action buttons
    await navigate_to_channel(ctx, WORKSPACE_ID, CS_REVIEW_CHANNEL);
    await wait_for_message(ctx, case_id, 15_000);

    // Accept → wait for bot draft (posted as a thread reply)
    await click_action_button(ctx, 'Accept', 10_000);

    // Open the correct thread (for this case_id) so wait_for_message can find [CS Bot Draft]
    await open_thread_for_case(ctx, case_id);

    await wait_for_message(ctx, '[CS Bot Draft]', 30_000);

    // Send → triggers on_resolve flow.
    // The CS Bot Draft contains the case_id in its body. Use page.evaluate() to
    // find and click the Send button only within the message that contains this case_id,
    // to avoid accidentally clicking Send on an old draft from a previous test run.
    const pages_send = ctx.pages();
    let send_clicked = false;
    for (const page of pages_send) {
      send_clicked = await page.evaluate((cid: string) => {
        // Find a message container that contains both the case_id and a Send button
        const containers = document.querySelectorAll('[data-qa="message_content"], li, [role="listitem"]');
        for (const el of containers) {
          if (el.textContent?.includes(cid) && el.textContent?.includes('[CS Bot Draft]')) {
            const btn = Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Send');
            if (btn) { (btn as HTMLElement).click(); return true; }
          }
        }
        return false;
      }, case_id).catch(() => false);
      if (send_clicked) break;
    }
    expect(send_clicked, `Send button not found for case_id ${case_id} in any open page`).toBe(true);

    // Navigate to voc-log to verify the [voc-log] case_sent message
    await navigate_to_channel(ctx, WORKSPACE_ID, VOC_CHANNEL);
    await wait_for_message(ctx, `[voc-log] case_sent`, 15_000);
    await wait_for_message(ctx, case_id, 5_000);

    // Verify Notion Tickets Log entry created (poll up to 15s)
    const page_id = await find_notion_page_by_case_id(TICKETS_LOG_DB_ID, case_id, 15_000);
    expect(page_id).toBeTruthy();
    const notion_status = await get_notion_page_status(page_id!);
    expect(notion_status).toBe('Resolved');
  });
});
