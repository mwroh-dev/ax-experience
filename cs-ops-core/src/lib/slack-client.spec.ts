// cs-ops-core/src/lib/slack-client.spec.ts
// Tests for the atomic Slack client functions

// ── Mock @slack/web-api ───────────────────────────────────────────────────────
const mockPostMessage = jest.fn();
const mockChatUpdate = jest.fn();
const mockUsersInfo = jest.fn();

jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: {
      postMessage: mockPostMessage,
      update: mockChatUpdate,
    },
    users: {
      info: mockUsersInfo,
    },
  })),
}));

import {
  post_message,
  post_review_block,
  update_message,
  get_user_info,
} from './slack-client';
import type { KnownBlock } from '@slack/types';

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
});

afterEach(() => {
  delete process.env.SLACK_BOT_TOKEN;
});

// ── post_message ──────────────────────────────────────────────────────────────

describe('post_message', () => {
  it('returns ok:true with ts when Slack call succeeds', async () => {
    mockPostMessage.mockResolvedValueOnce({ ok: true, ts: '1700000000.000001' });

    const result = await post_message('C_REVIEW', 'Hello CS');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ts).toBe('1700000000.000001');
    }
    expect(mockPostMessage).toHaveBeenCalledWith({
      channel: 'C_REVIEW',
      text: 'Hello CS',
    });
  });

  it('returns ok:false with descriptive error when SLACK_BOT_TOKEN is not set', async () => {
    delete process.env.SLACK_BOT_TOKEN;

    const result = await post_message('C_REVIEW', 'Hello CS');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/SLACK_BOT_TOKEN/);
      expect(result.step).toBe('post_message');
    }
    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('returns ok:false when Slack API throws', async () => {
    mockPostMessage.mockRejectedValueOnce(new Error('channel_not_found'));

    const result = await post_message('INVALID', 'test');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('channel_not_found');
    }
  });

  it('includes a trace entry', async () => {
    mockPostMessage.mockResolvedValueOnce({ ok: true, ts: '1700000000.000002' });

    const result = await post_message('C_REVIEW', 'trace test');

    expect(result.trace).toHaveLength(1);
    expect(result.trace[0].step).toBe('post_message');
  });
});

// ── post_review_block ─────────────────────────────────────────────────────────

describe('post_review_block', () => {
  const sample_blocks: KnownBlock[] = [
    { type: 'section', text: { type: 'mrkdwn', text: '*Review Required*' } },
  ];

  it('returns ok:true with ts when Slack call succeeds', async () => {
    mockPostMessage.mockResolvedValueOnce({ ok: true, ts: '1700000000.000010' });

    const result = await post_review_block('C_REVIEW', sample_blocks, 'Review Required');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ts).toBe('1700000000.000010');
    }
    expect(mockPostMessage).toHaveBeenCalledWith({
      channel: 'C_REVIEW',
      text: 'Review Required',
      blocks: sample_blocks,
    });
  });

  it('returns ok:false when SLACK_BOT_TOKEN is not set', async () => {
    delete process.env.SLACK_BOT_TOKEN;

    const result = await post_review_block('C_REVIEW', sample_blocks, 'fallback');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/SLACK_BOT_TOKEN/);
      expect(result.step).toBe('post_review_block');
    }
  });
});

// ── update_message ────────────────────────────────────────────────────────────

describe('update_message', () => {
  it('returns ok:true (void) when update succeeds', async () => {
    mockChatUpdate.mockResolvedValueOnce({ ok: true });

    const result = await update_message({ channel: 'C_REVIEW', ts: '1700000000.000001', text: 'Updated text' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
    expect(mockChatUpdate).toHaveBeenCalledWith({
      channel: 'C_REVIEW',
      ts: '1700000000.000001',
      text: 'Updated text',
    });
  });

  it('returns ok:false when SLACK_BOT_TOKEN is not set', async () => {
    delete process.env.SLACK_BOT_TOKEN;

    const result = await update_message({ channel: 'C_REVIEW', ts: '1700000000.000001', text: 'text' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/SLACK_BOT_TOKEN/);
    }
  });

  it('returns ok:false when chat.update throws', async () => {
    mockChatUpdate.mockRejectedValueOnce(new Error('message_not_found'));

    const result = await update_message({ channel: 'C_REVIEW', ts: 'bad-ts', text: 'text' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('message_not_found');
    }
  });
});

// ── get_user_info ─────────────────────────────────────────────────────────────

describe('get_user_info', () => {
  it('returns ok:true with name and real_name on success', async () => {
    mockUsersInfo.mockResolvedValueOnce({
      ok: true,
      user: { name: 'jdoe', real_name: 'John Doe' },
    });

    const result = await get_user_info('U_JDOE');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('jdoe');
      expect(result.value.real_name).toBe('John Doe');
    }
    expect(mockUsersInfo).toHaveBeenCalledWith({ user: 'U_JDOE' });
  });

  it('returns ok:false when SLACK_BOT_TOKEN is not set', async () => {
    delete process.env.SLACK_BOT_TOKEN;

    const result = await get_user_info('U_JDOE');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/SLACK_BOT_TOKEN/);
      expect(result.step).toBe('get_user_info');
    }
  });

  it('returns ok:false when users.info throws', async () => {
    mockUsersInfo.mockRejectedValueOnce(new Error('user_not_found'));

    const result = await get_user_info('U_MISSING');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('user_not_found');
    }
  });

  it('returns empty strings when user fields are absent', async () => {
    mockUsersInfo.mockResolvedValueOnce({ ok: true, user: {} });

    const result = await get_user_info('U_EMPTY');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe('');
      expect(result.value.real_name).toBe('');
    }
  });
});
