// cs-ops-core/src/llm/claude-cli-draft-adapter.ts
import { z } from 'zod';
import { DraftLLM, SummaryLLM } from './ports';
import { run_claude_cli, extract_inner_json } from './claude-cli-runner';

const DRAFT_SYSTEM_PROMPT =
  'You are a Korean CS assistant. Answer ONLY in Korean. Rules: 1. Use ONLY the provided context to answer. Do NOT invent facts. 2. If context is provided, cite it in the draft. 3. If no context: set confidence to low, needs_more_info to true.';

const DRAFT_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    draft: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    needs_more_info: { type: 'boolean' },
  },
  required: ['draft', 'confidence', 'needs_more_info'],
});

const DraftOutputSchema = z.object({
  draft: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  needs_more_info: z.boolean(),
});

const SUMMARY_SYSTEM_PROMPT =
  'You are a CS assistant. Summarize the customer inquiry briefly for archival. Respond in plain text only.';

function cli_opts(args: string[], input: string) {
  return {
    bin: process.env.CLAUDE_CLI_BIN ?? 'claude',
    timeout_ms: parseInt(process.env.CLAUDE_CLI_TIMEOUT_MS ?? '30000', 10),
    args,
    input,
  };
}

export const claude_cli_draft_adapter: DraftLLM = {
  async generateDraft({ case_id: _case_id, user_message, evidence_snippets }) {
    const context_block = evidence_snippets.length > 0
      ? `Context:\n${evidence_snippets.join('\n---\n')}\n\n`
      : '';
    const input = `${context_block}Customer message:\n${user_message}`;

    const args = ['-p', '--no-session-persistence', '--output-format', 'json', '--json-schema', DRAFT_SCHEMA, '--system-prompt', DRAFT_SYSTEM_PROMPT];
    const raw = await run_claude_cli(cli_opts(args, input));
    const inner = extract_inner_json(raw);

    const result = DraftOutputSchema.safeParse(inner);
    if (!result.success) {
      throw new Error(`Draft output validation failed: ${result.error.message}`);
    }

    return {
      draft: result.data.draft || '(응답 생성 실패)',
      confidence: result.data.confidence,
      needs_more_info: result.data.needs_more_info,
      raw_output: raw,
    };
  },
};

export const claude_cli_summary_adapter: SummaryLLM = {
  async keepSummary({ case_id: _case_id, user_message }) {
    const args = ['-p', '--no-session-persistence', '--system-prompt', SUMMARY_SYSTEM_PROMPT];
    const summary = await run_claude_cli(cli_opts(args, `Customer message:\n${user_message}`));
    return { summary: summary || '(요약 생성 실패)' };
  },
};
