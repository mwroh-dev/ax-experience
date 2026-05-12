// cs-ops-core/src/lib/llm-judge.spec.ts
import { passthrough_judge, claude_cli_judge, JudgeInput } from './llm-judge';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

jest.mock('child_process');
const mock_spawn = spawn as jest.MockedFunction<typeof spawn>;

function make_proc(stdout: string, stderr: string, code: number) {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: jest.fn((_d: any, _e: any, cb?: () => void) => { if (cb) cb(); }), end: jest.fn(), on: jest.fn() };
  proc.kill = jest.fn();
  setImmediate(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.emit('close', code);
  });
  return proc;
}

const delivery_input: JudgeInput = {
  ticket: {
    ticket_id: 'test-judge-001',
    customer_intent: 'delivery_inquiry',
    issue_reason: 'late_delivery',
    order_state: 'in_transit',
    risk_level: 'low',
    evidence_required: [],
    human_review_required: false,
    recommended_action: 'auto_respond',
  },
};

describe('passthrough_judge', () => {
  it('always returns is_auto_safe: true', async () => {
    const result = await passthrough_judge(delivery_input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.is_auto_safe).toBe(true);
    }
  });
});

describe('claude_cli_judge', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns is_auto_safe: true when claude outputs valid JSON', async () => {
    mock_spawn.mockReturnValue(
      make_mock_proc(JSON.stringify({ is_auto_safe: true, reason: '배송 조회', confidence: 'high' }), '', 0)
    );

    const result = await claude_cli_judge(delivery_input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.is_auto_safe).toBe(true);
      expect(result.value.confidence).toBe('high');
    }
  });

  it('returns ok: false when claude exits with non-zero', async () => {
    mock_spawn.mockReturnValue(make_mock_proc('', 'rate limited', 1));

    const result = await claude_cli_judge(delivery_input);
    expect(result.ok).toBe(false);
  });

  it('returns ok: false when claude stdout is not valid JSON', async () => {
    mock_spawn.mockReturnValue(make_mock_proc('not json', '', 0));

    const result = await claude_cli_judge(delivery_input);
    expect(result.ok).toBe(false);
  });
});

function make_mock_proc(stdout: string, stderr: string, code: number) {
  return make_proc(stdout, stderr, code);
}
