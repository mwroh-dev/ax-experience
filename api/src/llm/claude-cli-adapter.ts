// api/src/llm/claude-cli-adapter.ts
import { spawn } from 'child_process';
import { z } from 'zod';
import { config } from '../config';

export type CsBotMode = 'answer_draft' | 'keep_summary' | 'pending_investigation';

export interface CsBotRequest {
  case_id: string;
  mode: CsBotMode;
  user_message: string;
  known_context?: {
    source?: string;
    customer_identifier_present?: boolean;
    [key: string]: unknown;
  };
  evidence_snippets?: string[];
}

export interface CsBotResponse {
  case_id: string;
  mode: CsBotMode;
  draft: string;
  evidence_used: string[];
  confidence: 'high' | 'medium' | 'low';
  needs_more_info: boolean;
  raw_llm_response: string;
}

const SYSTEM_PROMPTS: Record<CsBotMode, string> = {
  answer_draft: `You are a Korean CS assistant. Answer ONLY in Korean. Rules: 1. Use ONLY the provided context to answer. Do NOT invent facts. 2. If context is provided, cite it. 3. If no context: set confidence to low, needs_more_info to true.`,
  keep_summary: `You are a CS assistant. Summarize the customer inquiry briefly for archival. Respond in plain text only.`,
  pending_investigation: `You are a CS assistant. List what information is needed. Respond in plain text only.`,
};

const DRAFT_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    draft: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    needs_more_info: { type: 'boolean' },
  },
  required: ['draft', 'confidence', 'needs_more_info'],
});

const DraftSchema = z.object({
  draft: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  needs_more_info: z.boolean(),
});

async function run_claude_cli(args: string[], input: string): Promise<string> {
  const bin = config.claude_cli_bin;
  const timeout = config.claude_cli_timeout_ms;
  // Strip Claude Code env vars so the subprocess uses OAuth, not API key
  const child_env = { ...process.env };
  delete child_env.CLAUDECODE;
  delete child_env.CLAUDE_CODE_ENTRYPOINT;
  delete child_env.CLAUDE_CODE_EXECPATH;
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { env: child_env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { proc.kill(); reject(new Error(`claude CLI timed out after ${timeout}ms`)); }, timeout);
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code: number | null) => {
      clearTimeout(timer);
      if ((code ?? 1) !== 0) {
        reject(new Error(`claude exited ${code}: ${stderr.slice(0, 200)}`));
      } else {
        resolve(stdout.trim());
      }
    });
    proc.on('error', (e: Error) => { clearTimeout(timer); reject(e); });
    proc.stdin.write(input, 'utf8');
    proc.stdin.end();
  });
}

function extract_inner_json(raw: string): unknown {
  try {
    const outer = JSON.parse(raw) as Record<string, unknown>;
    if (typeof outer !== 'object' || outer === null) return outer;
    if ('structured_output' in outer && outer.structured_output !== null) {
      return outer.structured_output;
    }
    if ('result' in outer && typeof outer.result === 'string' && outer.result) {
      return JSON.parse(outer.result);
    }
    return outer;
  } catch {
    throw new Error(`Failed to parse LLM output: ${raw.slice(0, 100)}`);
  }
}

export async function call_cs_bot(req: CsBotRequest): Promise<CsBotResponse> {
  if (process.env.MOCK_LLM_FAILURE === 'true') {
    throw new Error('MOCK_LLM_FAILURE: simulated LLM unreachable');
  }

  const context_parts: string[] = [];
  if (req.known_context?.source) context_parts.push(`Source: ${req.known_context.source}`);
  if (req.evidence_snippets?.length) context_parts.push(`Relevant context:\n${req.evidence_snippets.join('\n---\n')}`);

  const user_content = context_parts.length > 0
    ? `${context_parts.join('\n')}\n\nCustomer inquiry:\n${req.user_message}`
    : `Customer inquiry:\n${req.user_message}`;

  if (req.mode === 'answer_draft') {
    const args = ['-p', '--no-session-persistence', '--output-format', 'json', '--json-schema', DRAFT_SCHEMA, '--system-prompt', SYSTEM_PROMPTS.answer_draft];
    const raw = await run_claude_cli(args, user_content);
    const inner = extract_inner_json(raw);
    const result = DraftSchema.safeParse(inner);
    if (!result.success) throw new Error(`Draft output validation failed: ${result.error.message}`);
    return {
      case_id: req.case_id,
      mode: req.mode,
      draft: result.data.draft || '(응답 생성 실패)',
      evidence_used: [],
      confidence: result.data.confidence,
      needs_more_info: result.data.needs_more_info,
      raw_llm_response: raw,
    };
  }

  // keep_summary / pending_investigation — plain text output
  const args = ['-p', '--no-session-persistence', '--system-prompt', SYSTEM_PROMPTS[req.mode]];
  const summary = await run_claude_cli(args, user_content);
  return {
    case_id: req.case_id,
    mode: req.mode,
    draft: summary || '(요약 생성 실패)',
    evidence_used: [],
    confidence: 'medium',
    needs_more_info: false,
    raw_llm_response: summary,
  };
}
