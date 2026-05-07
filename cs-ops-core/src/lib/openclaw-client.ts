// cs-ops-core/src/lib/openclaw-client.ts
// Self-contained openclaw client — no cross-package imports
import { z } from 'zod';

export type CsBotMode =
  | 'answer_draft'
  | 'keep_summary'
  | 'pending_investigation'
  | 'classify_ticket';

export interface CsBotRequest {
  case_id: string;
  mode: CsBotMode;
  user_message: string;
  schema?: Record<string, unknown>;
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
  classify_ticket: `You are a CS ticket classifier. Given a customer message, extract structured data.
Respond ONLY with a valid JSON object matching the schema provided.
Do not include any text before or after the JSON.
JSON fields to extract:
- customer_intent: one of refund_request|exchange_request|delivery_inquiry|subscription_cancel|privacy_request|product_defect_report|general_inquiry|complaint
- issue_reason: one of changed_mind|defective_product|not_as_described|late_delivery|wrong_item|payment_dispute|subscription_billing|data_breach_concern|other
- order_state: one of not_shipped|in_transit|delivered|returned|cancelled|unknown|no_order
- risk_level: one of low|medium|high|critical
- evidence_required: array of order_status|delivery_proof|customer_history|refund_eligibility|faq_entry|policy_rule|legal_reference
- human_review_required: boolean
- recommended_action: one of auto_respond|human_review|escalate|request_more_info`,

  answer_draft: `You are a Korean CS assistant. Answer ONLY in Korean.
Rules:
1. Use ONLY the provided context to answer. Do NOT invent facts.
2. If context is provided, cite it: write "근거: [출처명]" at the end.
3. If no context: set CONFIDENCE=low, NEEDS_MORE_INFO=true.

Format (Korean only):
DRAFT: <응답 초안>
CONFIDENCE: high|medium|low
NEEDS_MORE_INFO: true|false
REASON: <이유>`,

  keep_summary: `You are a CS assistant. Summarize the customer inquiry.
Format:
SUMMARY: <brief summary>
CATEGORY: <category>
URGENCY: low|medium|high`,

  pending_investigation: `You are a CS assistant. List what information is needed.
Format:
MISSING_INFO: <comma-separated list>
NEXT_STEPS: <actions needed>
ESTIMATED_RESOLUTION: <timeframe>`,
};

/**
 * Parses the LLM's line-tagged text format:
 *   DRAFT: <text>
 *   CONFIDENCE: high|medium|low
 *   NEEDS_MORE_INFO: true|false
 *
 * Extraction is performed inside the Zod transform so safeParse is the
 * single parse boundary — no standalone regex outside this schema.
 */
const CsBotResponseSchema = z.string().transform((raw) => {
  const draft_match = raw.match(/DRAFT:\s*(.+?)(?=\nCONFIDENCE:|$)/s);
  const conf_match  = raw.match(/CONFIDENCE:\s*(high|medium|low)/i);
  const needs_match = raw.match(/NEEDS_MORE_INFO:\s*(true|false)/i);

  const confidence_raw = conf_match?.[1]?.toLowerCase() ?? 'medium';
  const confidence = (['high', 'medium', 'low'].includes(confidence_raw)
    ? confidence_raw
    : 'medium') as 'high' | 'medium' | 'low';

  return {
    draft: draft_match?.[1]?.trim() ?? raw,
    confidence,
    needs_more_info: needs_match?.[1]?.toLowerCase() === 'true',
  };
});

function parse_cs_bot_response(
  case_id: string,
  mode: CsBotMode,
  raw: string,
): CsBotResponse {
  if (mode !== 'answer_draft') {
    return {
      case_id,
      mode,
      draft: raw,
      evidence_used: [],
      confidence: 'medium',
      needs_more_info: false,
      raw_llm_response: raw,
    };
  }

  const parsed = CsBotResponseSchema.safeParse(raw);

  if (!parsed.success) {
    throw new Error(`CS bot response parse failed: ${parsed.error.message}`);
  }

  return {
    case_id,
    mode,
    draft: parsed.data.draft || '(응답 생성 실패)',
    evidence_used: [],
    confidence: parsed.data.confidence,
    needs_more_info: parsed.data.needs_more_info,
    raw_llm_response: raw,
  };
}

export async function call_cs_bot(req: CsBotRequest): Promise<CsBotResponse> {
  if (process.env.MOCK_LLM_FAILURE === 'true') {
    throw new Error('MOCK_LLM_FAILURE: simulated LLM unreachable');
  }

  const ollama_url = process.env.OLLAMA_URL ?? 'http://localhost:11434/v1/chat/completions';
  const model = process.env.OLLAMA_MODEL ?? 'llama3.2:1b';

  const context_parts: string[] = [];
  if (req.schema) {
    context_parts.push(`Schema: ${JSON.stringify(req.schema, null, 2)}`);
  }
  if (req.known_context?.source) {
    context_parts.push(`Source: ${req.known_context.source}`);
  }
  if (req.evidence_snippets && req.evidence_snippets.length > 0) {
    context_parts.push(`Context:\n${req.evidence_snippets.join('\n---\n')}`);
  }

  const user_content =
    context_parts.length > 0
      ? `${context_parts.join('\n')}\n\nCustomer message:\n${req.user_message}`
      : `Customer message:\n${req.user_message}`;

  const payload = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPTS[req.mode] },
      { role: 'user', content: user_content },
    ],
    stream: false,
    temperature: 0.2,
    max_tokens: 500,
  };

  const response = await fetch(ollama_url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OLLAMA_API_KEY ?? 'ollama'}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const error_text = await response.text();
    throw new Error(`CS bot call failed: HTTP ${response.status} — ${error_text}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? '';

  return parse_cs_bot_response(req.case_id, req.mode, raw);
}
