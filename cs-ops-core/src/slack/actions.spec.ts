// cs-ops-core/src/slack/actions.spec.ts
import { handle_review_action, ReviewActionPayload } from './actions';

// Mock @slack/web-api
const mockPostMessage = jest.fn().mockResolvedValue({ ok: true });
jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: { postMessage: mockPostMessage },
  })),
}));

// Mock notion-client
const mockWriteAutomationRun = jest.fn().mockResolvedValue(undefined);
const mockUpdateAutomationRunReviewer = jest.fn().mockResolvedValue(undefined);
jest.mock('../lib/notion-client', () => ({
  write_automation_run: (...args: unknown[]) => mockWriteAutomationRun(...args),
  update_automation_run_reviewer: (...args: unknown[]) =>
    mockUpdateAutomationRunReviewer(...args),
}));

const BASE_PAYLOAD: ReviewActionPayload = {
  run_id: 'run-abc-123',
  ticket_id: 'ticket-xyz-456',
  draft_text: 'Here is your refund status.',
  channel_id: 'C001',
  thread_ts: '1700000000.000100',
  reviewer_id: 'U_AGENT_01',
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
  process.env.SLACK_VOC_LOG_CHANNEL_ID = 'C_VOC';
  process.env.SLACK_CS_MANAGER_CHANNEL_ID = 'C_MGR';
});

describe('handle_review_action', () => {
  it('calls update_automation_run_reviewer with ticket_id, action_id, and reviewer_id', async () => {
    await handle_review_action('cs_review_approve', BASE_PAYLOAD);

    expect(mockUpdateAutomationRunReviewer).toHaveBeenCalledTimes(1);
    expect(mockUpdateAutomationRunReviewer).toHaveBeenCalledWith(
      'ticket-xyz-456',
      'cs_review_approve',
      'U_AGENT_01',
    );
  });

  it('defaults reviewer_id to "unknown" when not provided in payload', async () => {
    const payload: ReviewActionPayload = { ...BASE_PAYLOAD, reviewer_id: undefined };

    await handle_review_action('cs_review_hold', payload);

    expect(mockUpdateAutomationRunReviewer).toHaveBeenCalledWith(
      'ticket-xyz-456',
      'cs_review_hold',
      'unknown',
    );
  });

  it('calls update_automation_run_reviewer for cs_review_escalate', async () => {
    await handle_review_action('cs_review_escalate', BASE_PAYLOAD);

    expect(mockUpdateAutomationRunReviewer).toHaveBeenCalledWith(
      'ticket-xyz-456',
      'cs_review_escalate',
      'U_AGENT_01',
    );
  });

  it('calls update_automation_run_reviewer even for unknown action_id', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await handle_review_action('cs_review_unknown_action', BASE_PAYLOAD);

    expect(mockUpdateAutomationRunReviewer).toHaveBeenCalledWith(
      'ticket-xyz-456',
      'cs_review_unknown_action',
      'U_AGENT_01',
    );

    warnSpy.mockRestore();
  });

  it('passes action_id correctly for cs_review_revise', async () => {
    await handle_review_action('cs_review_revise', BASE_PAYLOAD);

    expect(mockUpdateAutomationRunReviewer).toHaveBeenCalledWith(
      'ticket-xyz-456',
      'cs_review_revise',
      'U_AGENT_01',
    );
  });
});
