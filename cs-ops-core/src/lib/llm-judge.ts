// cs-ops-core/src/lib/llm-judge.ts
import { z } from 'zod';
import { spawn } from 'child_process';
import { FlowResult } from '@api/pipeline/index';
import { Ticket } from '../types';

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

const CLAUDE_ARGS = ['-p', '--bare', '--output-format', 'json', '--json-schema', JUDGE_SCHEMA, '--system-prompt', SYSTEM_PROMPT];

export const claude_cli_judge: LLMJudge = async ({ ticket }) => {
  const started_at = Date.now();
  try {
    const input_payload = JSON.stringify({
      intent: ticket.customer_intent,
      order_state: ticket.order_state,
      risk_level: ticket.risk_level,
      issue_reason: ticket.issue_reason,
    });

    const { stdout, stderr, status } = await new Promise<{ stdout: string; stderr: string; status: number }>(
      (resolve, reject) => {
        const proc = spawn('claude', CLAUDE_ARGS);
        let out = '';
        let err = '';
        const timer = setTimeout(() => { proc.kill(); reject(new Error('claude CLI timed out after 30s')); }, 30_000);
        proc.stdout.on('data', (d: Buffer) => { out += d.toString(); });
        proc.stderr.on('data', (d: Buffer) => { err += d.toString(); });
        proc.on('close', (code: number | null) => { clearTimeout(timer); resolve({ stdout: out, stderr: err, status: code ?? 1 }); });
        proc.on('error', (e: Error) => { clearTimeout(timer); reject(e); });
        proc.stdin.write(input_payload, 'utf8');
        proc.stdin.end();
      }
    );

    if (status !== 0) throw new Error(`claude exited ${status}: ${stderr}`);

    const raw = stdout.trim();
    // --output-format json wraps result: { type: 'result', result: '...' } or plain JSON
    let outer: unknown;
    try {
      outer = JSON.parse(raw);
    } catch {
      throw new Error(`Failed to parse judge output: ${raw}`);
    }

    let parsed: JudgeOutput;
    if (
      typeof outer === 'object' && outer !== null &&
      'result' in outer && typeof (outer as Record<string, unknown>).result === 'string'
    ) {
      let inner: unknown;
      try {
        inner = JSON.parse((outer as { result: string }).result);
      } catch {
        throw new Error(`Failed to parse judge inner output: ${raw}`);
      }
      const inner_result = JudgeOutputSchema.safeParse(inner);
      if (!inner_result.success) {
        throw new Error(`Judge output validation failed: ${inner_result.error.message}`);
      }
      parsed = inner_result.data;
    } else {
      const outer_result = JudgeOutputSchema.safeParse(outer);
      if (!outer_result.success) {
        throw new Error(`Judge output validation failed: ${outer_result.error.message}`);
      }
      parsed = outer_result.data;
    }

    return {
      ok: true,
      value: parsed,
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
