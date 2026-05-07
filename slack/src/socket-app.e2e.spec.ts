// E2E test: real Slack message → Socket Mode → process_cs_message
// Requires env: SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_CS_EVENTS_CHANNEL
// Skip automatically when env vars are not set.
// Run manually:
//   SLACK_BOT_TOKEN=xoxb-... SLACK_APP_TOKEN=xapp-... SLACK_CS_EVENTS_CHANNEL=C... \
//   cd api && npx jest socket-app.e2e --no-coverage --testTimeout=15000

const mock_pipeline = jest.fn().mockResolvedValue({ ok: true, value: {}, trace: [] });
jest.mock('@cs-ops-core/pipeline', () => ({ process_cs_message: (...args: any[]) => mock_pipeline(...args) }));

import { WebClient } from '@slack/web-api';
import { create_bolt_app } from './socket-app';

const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const APP_TOKEN = process.env.SLACK_APP_TOKEN;
const CS_CHANNEL = process.env.SLACK_CS_EVENTS_CHANNEL;

const SKIP = !BOT_TOKEN || !APP_TOKEN || !CS_CHANNEL;

describe('Socket Mode E2E — real Slack channel → CS pipeline', () => {
  if (SKIP) {
    it.skip('skipped: SLACK_BOT_TOKEN / SLACK_APP_TOKEN / SLACK_CS_EVENTS_CHANNEL not set', () => {});
    return;
  }

  let bolt_app: ReturnType<typeof create_bolt_app>;
  const web = new WebClient(BOT_TOKEN);

  beforeAll(async () => {
    // ignoreSelf: false — test posts with the bot token, so Bolt's ignoreSelf filter would
    // block the event. In production, CS customers post as humans (no bot_id), so this
    // flag is true by default; here we disable it to let the test message through.
    bolt_app = create_bolt_app({ ignoreSelf: false });
    await bolt_app.start();
    // Wait for WebSocket handshake to reach connected:ready before posting
    await new Promise(r => setTimeout(r, 2000));
  }, 15000);

  afterAll(async () => {
    await bolt_app.stop();
  }, 10000);

  beforeEach(() => mock_pipeline.mockClear());

  it('message posted to CS channel triggers process_cs_message', async () => {
    const unique_text = `[E2E] 배송 조회 transit_e2e_${Date.now()}`;

    await web.chat.postMessage({ channel: CS_CHANNEL!, text: unique_text });

    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (mock_pipeline.mock.calls.some(([text]) => text === unique_text)) break;
      await new Promise(r => setTimeout(r, 200));
    }

    expect(mock_pipeline).toHaveBeenCalledWith(unique_text, expect.any(String));
  }, 12000);

  it('message in a different channel does NOT trigger pipeline', async () => {
    const other = process.env.SLACK_VOC_REVIEW_CHANNEL;
    if (!other || other === CS_CHANNEL) {
      console.warn('[E2E] SLACK_VOC_REVIEW_CHANNEL not set or equals CS_CHANNEL — channel-isolation check skipped');
      return;
    }

    const unique_text = `[E2E-IGNORE] should not process ${Date.now()}`;
    await web.chat.postMessage({ channel: other, text: unique_text });

    await new Promise(r => setTimeout(r, 3000));
    const called_with_text = mock_pipeline.mock.calls.some(([text]) => text === unique_text);
    expect(called_with_text).toBe(false);
  }, 10000);
});
