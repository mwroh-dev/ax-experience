// api/src/llm/claude-cli-adapter.ts
import { z } from 'zod';
import { config } from '../config';
import { run_claude_cli, extract_inner_json } from '@cs-ops-core/llm/claude-cli-runner';

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

function cli_opts(args: string[], input: string) {
  return { bin: config.claude_cli_bin, timeout_ms: config.claude_cli_timeout_ms, args, input };
}

export async function call_cs_bot(req: CsBotRequest): Promise<CsBotResponse> {
  const context_parts: string[] = [];
  if (req.known_context?.source) context_parts.push(`Source: ${req.known_context.source}`);
  if (req.evidence_snippets?.length) context_parts.push(`Relevant context:\n${req.evidence_snippets.join('\n---\n')}`);

  const user_content = context_parts.length > 0
    ? `${context_parts.join('\n')}\n\nCustomer inquiry:\n${req.user_message}`
    : `Customer inquiry:\n${req.user_message}`;

  if (req.mode === 'answer_draft') {
    const args = ['-p', '--no-session-persistence', '--output-format', 'json', '--json-schema', DRAFT_SCHEMA, '--system-prompt', SYSTEM_PROMPTS.answer_draft];
    const raw = await run_claude_cli(cli_opts(args, user_content));
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
  const summary = await run_claude_cli(cli_opts(args, user_content));
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
