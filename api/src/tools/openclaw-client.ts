/**
 * OpenClaw CS Bot Client
 *
 * Calls the LLM backend (Ollama via OpenAI-compatible API) with CS-specific context.
 * OpenClaw gateway's /v1/chat/completions has initialization issues in the current setup,
 * so we call Ollama directly — which is what OpenClaw uses internally.
 *
 * All inputs are case-centric (no Slack-specific fields).
 */

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
  answer_draft: `You are a Korean CS assistant. Answer ONLY in Korean.
Rules:
1. Use ONLY the provided context (FAQ/Policy/Admin data) to answer. Do NOT invent facts.
2. If context is provided, cite it: write "근거: [출처명]" at the end.
3. If admin data shows eligible=false, do NOT approve refund.
4. If no context and no admin data: set CONFIDENCE=low, NEEDS_MORE_INFO=true.
5. Customer-specific decisions (refund approval) require admin data. Without it: NEEDS_MORE_INFO=true.

Format (Korean only):
DRAFT: <응답 초안>
CONFIDENCE: high|medium|low
NEEDS_MORE_INFO: true|false
REASON: <이유 (낮은 확신이나 추가정보 필요 시)>`,

  keep_summary: `You are a CS assistant.
Summarize the following customer inquiry for archival purposes.
Format your response as:
SUMMARY: <brief summary of the inquiry>
CATEGORY: <category: refund|shipping|account|general|other>
URGENCY: low|medium|high`,

  pending_investigation: `You are a CS assistant.
The following customer inquiry requires additional investigation.
List what information is needed to properly resolve this case.
Format your response as:
MISSING_INFO: <comma-separated list of needed information>
NEXT_STEPS: <what actions need to be taken>
ESTIMATED_RESOLUTION: <timeframe estimate>`,
};

export async function call_cs_bot(req: CsBotRequest): Promise<CsBotResponse> {
  // Test failure injection — set MOCK_LLM_FAILURE=true to force an error without code changes
  if (process.env.MOCK_LLM_FAILURE === 'true') {
    throw new Error('MOCK_LLM_FAILURE: simulated LLM unreachable');
  }

  const ollama_url = config.ollama_url + '/v1/chat/completions';
  const model = 'llama3.2:1b';

  const context_parts: string[] = [];
  if (req.known_context?.source) {
    context_parts.push(`Source: ${req.known_context.source}`);
  }
  if (req.evidence_snippets && req.evidence_snippets.length > 0) {
    context_parts.push(`Relevant context:\n${req.evidence_snippets.join('\n---\n')}`);
  }

  const user_content = context_parts.length > 0
    ? `${context_parts.join('\n')}\n\nCustomer inquiry:\n${req.user_message}`
    : `Customer inquiry:\n${req.user_message}`;

  const payload = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS[req.mode] },
      { role: 'user', content: user_content },
    ],
    stream: false,
    temperature: 0.3,
    max_tokens: 400,
  };

  const response = await fetch(ollama_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.ollama_api_key}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error_text = await response.text();
    throw new Error(`CS bot call failed: HTTP ${response.status} — ${error_text}`);
  }

  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? '';

  return parse_cs_bot_response(req.case_id, req.mode, raw);
}

const CsBotResponseSchema = z.object({
  draft: z.string(),
  confidence: z.string(),
  needs_more_info: z.string(),
});

/** Extract DRAFT/CONFIDENCE/NEEDS_MORE_INFO fields from raw LLM text using line-based parsing (no regex). */
function extract_answer_draft_fields(raw: string): { draft: string; confidence: string; needs_more_info: string } {
  const draft_lines: string[] = [];
  let confidence = 'medium';
  let needs_more_info = 'false';
  let in_draft = false;

  for (const line of raw.split('\n')) {
    if (line.startsWith('DRAFT:')) {
      in_draft = true;
      const content = line.slice('DRAFT:'.length).trim();
      if (content) draft_lines.push(content);
    } else if (line.startsWith('CONFIDENCE:')) {
      in_draft = false;
      confidence = line.slice('CONFIDENCE:'.length).trim().toLowerCase();
    } else if (line.startsWith('NEEDS_MORE_INFO:')) {
      in_draft = false;
      needs_more_info = line.slice('NEEDS_MORE_INFO:'.length).trim().toLowerCase();
    } else if (line.startsWith('REASON:')) {
      in_draft = false;
    } else if (in_draft) {
      draft_lines.push(line);
    }
  }

  return {
    draft: draft_lines.join('\n').trim() || raw,
    confidence,
    needs_more_info,
  };
}

function parse_cs_bot_response(case_id: string, mode: CsBotMode, raw: string): CsBotResponse {
  const raw_fields =
    mode === 'answer_draft'
      ? extract_answer_draft_fields(raw)
      : { draft: raw, confidence: 'medium', needs_more_info: 'false' };

  const parsed = CsBotResponseSchema.safeParse(raw_fields);

  if (!parsed.success) {
    throw new Error(`CS bot response parse failed: ${parsed.error.message}`);
  }

  const confidence = (['high', 'medium', 'low'].includes(parsed.data.confidence)
    ? parsed.data.confidence
    : 'medium') as 'high' | 'medium' | 'low';

  return {
    case_id,
    mode,
    draft: parsed.data.draft.trim() || '(응답 생성 실패)',
    evidence_used: [],
    confidence,
    needs_more_info: parsed.data.needs_more_info === 'true',
    raw_llm_response: raw,
  };
}
