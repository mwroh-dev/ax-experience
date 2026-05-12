// cs-ops-core/src/lib/llm-judge.ts
import { z } from 'zod';
import { FlowResult } from '@api/pipeline/index';
import { Ticket } from '../types';
import { run_claude_cli, extract_inner_json } from '../llm/claude-cli-runner';

export interface JudgeInput {
  ticket: Ticket;
}

export interface JudgeOutput {
  is_auto_safe: boolean;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

const JudgeOutputSchema = z.object({
  is_auto_safe: z.boolean(),
  reason: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type LLMJudge = (input: JudgeInput) => Promise<FlowResult<JudgeOutput>>;

const JUDGE_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    is_auto_safe: { type: 'boolean' },
    reason: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
  },
  required: ['is_auto_safe', 'reason', 'confidence'],
});

const SYSTEM_PROMPT =
  'CS 티켓 자동 처리 판단기. 소비자가 직접 해결 가능한 정보성 문의(배송 조회, 결제 확인, 주문 상태 등)는 is_auto_safe:true로 판단하라. 환불/교환/개인정보/분쟁/고위험(high/critical)은 반드시 is_auto_safe:false로 판단하라. JSON만 반환하라.';

const CLAUDE_ARGS = ['-p', '--no-session-persistence', '--output-format', 'json', '--json-schema', JUDGE_SCHEMA, '--system-prompt', SYSTEM_PROMPT];

export const claude_cli_judge: LLMJudge = async ({ ticket }) => {
  const started_at = Date.now();
  try {
    const input_payload = JSON.stringify({
      intent: ticket.customer_intent,
      order_state: ticket.order_state,
      risk_level: ticket.risk_level,
      issue_reason: ticket.issue_reason,
    });

    const raw = await run_claude_cli({
      bin: process.env.CLAUDE_CLI_BIN ?? 'claude',
      timeout_ms: parseInt(process.env.CLAUDE_CLI_TIMEOUT_MS ?? '30000', 10),
      args: CLAUDE_ARGS,
      input: input_payload,
    });

    const outer = extract_inner_json(raw);
    const result = JudgeOutputSchema.safeParse(outer);
    if (!result.success) {
      throw new Error(`Judge output validation failed: ${result.error.message}`);
    }

    return {
      ok: true,
      value: result.data,
      trace: [{ step: 'llm_judge', started_at, duration_ms: Date.now() - started_at, ok: true }],
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      step: 'llm_judge',
      trace: [{ step: 'llm_judge', started_at, duration_ms: Date.now() - started_at, ok: false }],
    };
  }
};

// No-op judge for environments where Claude CLI is unavailable (tests)
export const passthrough_judge: LLMJudge = async ({ ticket: _ }) =>
  Promise.resolve({
    ok: true,
    value: { is_auto_safe: true, reason: 'passthrough (test)', confidence: 'high' as const },
    trace: [],
  });
