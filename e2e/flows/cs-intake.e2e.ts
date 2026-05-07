// e2e/flows/cs-intake.e2e.ts
import { test, expect } from '@playwright/test';
import { get_slack_context, navigate_to_channel, wait_for_message } from '../fixtures/slack-cdp';
import { post_cs_event } from '../fixtures/api-client';

const WORKSPACE_ID = process.env.SLACK_WORKSPACE_ID ?? '';
const CS_REVIEW_CHANNEL = process.env.SLACK_CS_REVIEW_CHANNEL_ID ?? '';

test.describe('CS Intake Flow', () => {
  test('POST /api/cs-events creates case and Slack intake review message appears', async () => {
    const unique_msg = `E2E 환불 요청 테스트 ${Date.now()}`;
    const ctx = await get_slack_context();

    const result = await post_cs_event({
      source: 'e2e_test',
      message: unique_msg,
      metadata: { request_id: `e2e-intake-${Date.now()}` },
    });

    expect(result.case_id).toBeTruthy();
    expect(result.slack_ts).toBeTruthy();

    await navigate_to_channel(ctx, WORKSPACE_ID, CS_REVIEW_CHANNEL);
    await wait_for_message(ctx, '[CS Intake Review]', 15_000);
    await wait_for_message(ctx, result.case_id, 15_000);
  });

  test('duplicate request_id returns existing case without new Slack post', async () => {
    const request_id = `e2e-dedup-${Date.now()}`;

    const first = await post_cs_event({
      source: 'e2e_test',
      message: '중복 테스트 메시지',
      metadata: { request_id },
    });

    const second = await post_cs_event({
      source: 'e2e_test',
      message: '중복 테스트 메시지',
      metadata: { request_id },
    });

    expect(second.case_id).toBe(first.case_id);
    expect(second.duplicate).toBe(true);
  });
});
