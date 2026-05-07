// cs-ops-core/src/logging/automation-run.spec.ts
import { log_automation_run } from './automation-run';
import { AutomationRunLog } from '../types';

// Mock the notion client to avoid real network calls
jest.mock('../lib/notion-client', () => ({
  write_automation_run: jest.fn().mockResolvedValue(undefined),
}));

import { write_automation_run } from '../lib/notion-client';
const mock_write = write_automation_run as jest.MockedFunction<typeof write_automation_run>;

function make_run(overrides: Partial<AutomationRunLog> = {}): AutomationRunLog {
  return {
    run_id: 'run-0001',
    ticket_id: 'ticket-0001',
    phase: 'complete',
    steps: [],
    risk_decision: { action: 'auto', reason: 'low risk, policy matched' },
    evidence_ids: [],
    ...overrides,
  };
}

describe('log_automation_run — PII masking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('masks test@example.com as te**@example.com in steps before writing to Notion', async () => {
    const run = make_run({
      steps: ['Customer email: test@example.com contacted support'],
    });

    await log_automation_run(run);

    expect(mock_write).toHaveBeenCalledTimes(1);
    const written = mock_write.mock.calls[0][0];
    expect(written.steps[0]).toBe('Customer email: te**@example.com contacted support');
    expect(written.steps[0]).not.toContain('test@example.com');
  });

  it('masks test@example.com as te**@example.com in final_answer before writing to Notion', async () => {
    const run = make_run({
      steps: [],
      final_answer: 'We received your request from test@example.com and will respond shortly.',
    });

    await log_automation_run(run);

    expect(mock_write).toHaveBeenCalledTimes(1);
    const written = mock_write.mock.calls[0][0];
    expect(written.final_answer).toBe(
      'We received your request from te**@example.com and will respond shortly.'
    );
    expect(written.final_answer).not.toContain('test@example.com');
  });

  it('masks phone numbers in steps', async () => {
    const run = make_run({
      steps: ['Customer called from 010-1234-5678'],
    });

    await log_automation_run(run);

    const written = mock_write.mock.calls[0][0];
    expect(written.steps[0]).not.toContain('010-1234-5678');
    expect(written.steps[0]).toContain('***-****');
  });

  it('preserves non-PII fields unchanged', async () => {
    const run = make_run({
      steps: ['Classification complete'],
      risk_decision: { action: 'review', reason: 'high risk' },
    });

    await log_automation_run(run);

    const written = mock_write.mock.calls[0][0];
    expect(written.run_id).toBe('run-0001');
    expect(written.ticket_id).toBe('ticket-0001');
    expect(written.phase).toBe('complete');
    expect(written.risk_decision.action).toBe('review');
    expect(written.risk_decision.reason).toBe('high risk');
  });

  it('handles multiple emails in a single step', async () => {
    const run = make_run({
      steps: ['Emails: test@example.com and another@domain.org were found'],
    });

    await log_automation_run(run);

    const written = mock_write.mock.calls[0][0];
    expect(written.steps[0]).toContain('te**@example.com');
    expect(written.steps[0]).toContain('an**@domain.org');
    expect(written.steps[0]).not.toContain('test@example.com');
    expect(written.steps[0]).not.toContain('another@domain.org');
  });
});
