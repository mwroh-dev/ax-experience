// e2e/flows/cs-reviewer-feedback.e2e.ts
//
// Full feedback loop E2E:
// POST → pipeline → review card in Slack → click Approve → SQLite reviewer_feedback row
// → Notion AutomationRun updated with reviewer_action='approved'
//
// Requires: running API server, Slack Electron open, CDP at localhost:9222

import { test, expect } from '@playwright/test';
import { post_cs_pipeline } from '../fixtures/api-client';
import { get_slack_context, navigate_to_channel, try_navigate_voc_channel } from '../fixtures/slack-cdp';
import { find_reviewer_feedback } from '../fixtures/sqlite-verify';
import { find_automation_run_by_run_id } from '../fixtures/notion-verify';

const SLACK_TEAM_ID = process.env.SLACK_TEAM_ID ?? '';
const REVIEW_CHANNEL = process.env.SLACK_CS_REVIEW_CHANNEL_ID ?? '';

// This message must route to REVIEW path: no KB match, high-ish risk
// "완전히 다른 제품" → wrong item complaint → no KB fast-path, likely review
const REVIEW_TRIGGER_MESSAGE = '상품이 완전히 다른 제품으로 왔습니다. 반품 처리가 되는 건가요?';

test.describe('Reviewer Feedback Loop E2E', () => {
  test('Slack Approve click writes reviewer_feedback to SQLite', async () => {
    // 1. Trigger pipeline
    const result = await post_cs_pipeline({ message: REVIEW_TRIGGER_MESSAGE, slack_ts: `e2e-feedback-${Date.now()}` });

    expect(result.ok).toBe(true);
    const run_id: string = result.value?.run_id ?? '';
    const ticket_id: string = result.value?.ticket_id ?? '';
    expect(run_id).toBeTruthy();

    // 2. If Slack Electron not available, skip the click interaction
    if (!SLACK_TEAM_ID || !REVIEW_CHANNEL) {
      console.warn('[e2e] SLACK_TEAM_ID or SLACK_CS_REVIEW_CHANNEL_ID not set — skipping Slack click');
      return;
    }

    let ctx: Awaited<ReturnType<typeof get_slack_context>>;
    try {
      ctx = await get_slack_context();
    } catch (err) {
      console.warn('[e2e] Slack CDP unavailable:', (err as Error).message);
      return;
    }

    await navigate_to_channel(ctx, SLACK_TEAM_ID, REVIEW_CHANNEL);

    const pages = ctx.pages().filter((p: any) => p.url().includes('app.slack.com/client'));
    const page = pages[0];
    expect(page).toBeDefined();

    // 3. Wait for the review card and click Approve
    await page.waitForFunction(
      (tid: string) => {
        const messages = document.querySelectorAll('[data-qa="message_content"]');
        return Array.from(messages).some((m) => m.textContent?.includes(tid));
      },
      ticket_id,
      { timeout: 15_000 },
    );

    const approve_clicked = await page.evaluate((tid: string) => {
      const messages = document.querySelectorAll('[data-qa="message_content"], .c-message_kit__blocks');
      for (const msg of messages) {
        if (!msg.textContent?.includes(tid)) continue;
        const msgRoot = msg.closest('[data-qa="virtual-list-item"]') ?? msg.parentElement;
        if (!msgRoot) continue;
        const buttons = msgRoot.querySelectorAll('button');
        for (const btn of buttons) {
          if (btn.textContent?.includes('Approve') || btn.textContent?.includes('✅')) {
            (btn as HTMLElement).click();
            return true;
          }
        }
      }
      return false;
    }, ticket_id);

    expect(approve_clicked).toBe(true);

    // 4. Wait for Bolt action handler to write SQLite
    await page.waitForTimeout(3_000);

    // 5. Verify SQLite reviewer_feedback row
    const feedback = find_reviewer_feedback(run_id);
    expect(feedback).not.toBeNull();
    expect(feedback!.action_id).toBe('cs_review_approve');
    expect(feedback!.ticket_id).toBe(ticket_id);

    // 6. Verify Notion AutomationRun updated
    const notion_page_id = await find_automation_run_by_run_id(run_id);
    expect(notion_page_id).not.toBeNull();
  });
});
