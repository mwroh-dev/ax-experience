// slack/src/actions.spec.ts
import { register_actions } from './actions';

function make_mock_app() {
  const handlers: Record<string, Function> = {};
  return {
    action: jest.fn((id: string, fn: Function) => { handlers[id] = fn; }),
    _handlers: handlers,
  };
}

jest.mock('@cs-ops-core/knowledge/db', () => ({
  get_kb: jest.fn(() => ({})),
  log_reviewer_feedback: jest.fn(),
}));

jest.mock('@cs-ops-core/slack/actions', () => ({
  handle_review_action: jest.fn().mockResolvedValue(undefined),
}));

import * as db_module from '@cs-ops-core/knowledge/db';
import * as review_actions from '@cs-ops-core/slack/actions';

// Also mock other imports that actions.ts has (to prevent real API calls)
jest.mock('@api/cases/case-store', () => ({
  get_case: jest.fn(),
  try_update_case_status: jest.fn(),
  add_event: jest.fn(),
  save_tool_call: jest.fn(),
  update_tool_call: jest.fn(),
  get_review_message: jest.fn(),
}));
jest.mock('@api/config', () => ({ config: { slack: {} } }));
jest.mock('@api/tools/commerce-api-client', () => ({ dry_run_commerce_refund: jest.fn() }));
jest.mock('@api/tools/commerce-evidence-builder', () => ({ build_commerce_evidence: jest.fn() }));
jest.mock('./blocks', () => ({ build_decision_blocks: jest.fn() }));
jest.mock('@api/workflows/on_accept', () => ({ on_accept: jest.fn() }));
jest.mock('@api/llm/claude-cli-adapter', () => ({ call_cs_bot: jest.fn() }));
jest.mock('@api/cases/draft-version-store', () => ({ save_draft_version: jest.fn() }));
jest.mock('@api/pipeline/index', () => ({ run_flow: jest.fn() }));
jest.mock('@api/workflows/on_resolve', () => ({ on_resolve_steps: [] }));
jest.mock('@api/workflows/on_deny', () => ({ on_deny_steps: [] }));
jest.mock('@api/workflows/on_escalate', () => ({ on_escalate_steps: [] }));
jest.mock('./slack-client', () => ({ post_message: jest.fn(), post_thread_reply: jest.fn(), update_message: jest.fn() }));

describe('register_actions — cs_review_* handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers handlers for all 5 cs_review_* action_ids', () => {
    const app = make_mock_app();
    register_actions(app as any);
    const ids = ['cs_review_approve', 'cs_review_revise', 'cs_review_hold', 'cs_review_escalate', 'cs_review_evidence'];
    for (const id of ids) {
      expect(app.action).toHaveBeenCalledWith(id, expect.any(Function));
    }
  });

  it('cs_review_approve handler calls log_reviewer_feedback with parsed run_id and ticket_id', async () => {
    const app = make_mock_app();
    register_actions(app as any);
    const handler = app._handlers['cs_review_approve'];
    const body = { user: { id: 'U999' } };
    const action = { value: JSON.stringify({ run_id: 'run-x', ticket_id: 'tkt-x' }) };
    await handler({ ack: jest.fn(), body, action });
    expect(db_module.log_reviewer_feedback).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ run_id: 'run-x', ticket_id: 'tkt-x', action_id: 'cs_review_approve', reviewer_slack_id: 'U999' })
    );
  });

  it('cs_review_approve handler calls handle_review_action', async () => {
    const app = make_mock_app();
    register_actions(app as any);
    const handler = app._handlers['cs_review_approve'];
    const action = { value: JSON.stringify({ run_id: 'run-y', ticket_id: 'tkt-y' }) };
    await handler({ ack: jest.fn(), body: { user: { id: 'U111' } }, action });
    expect(review_actions.handle_review_action).toHaveBeenCalledWith(
      'cs_review_approve',
      expect.objectContaining({ run_id: 'run-y', ticket_id: 'tkt-y', reviewer_id: 'U111' })
    );
  });

  it('falls back gracefully when button value is plain string (old format)', async () => {
    const app = make_mock_app();
    register_actions(app as any);
    const handler = app._handlers['cs_review_approve'];
    const action = { value: 'TICKET-123' };
    await handler({ ack: jest.fn(), body: { user: { id: 'U000' } }, action });
    expect(db_module.log_reviewer_feedback).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ run_id: '', ticket_id: 'TICKET-123' })
    );
  });
});
