// cs-ops-core/src/llm/claude-cli-classify-adapter.ts
import { ClassifyLLM } from './ports';
import { run_claude_cli, extract_inner_json } from './claude-cli-runner';

const SYSTEM_PROMPT =
  'You are a CS ticket classifier. Given a customer message, extract structured data. Respond ONLY with a valid JSON object matching the schema provided. Do not include any text before or after the JSON.';

const CLASSIFY_SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    customer_intent: {
      type: 'string',
      enum: ['refund_request', 'exchange_request', 'delivery_inquiry', 'subscription_cancel', 'privacy_request', 'product_defect_report', 'general_inquiry', 'complaint'],
    },
    issue_reason: {
      type: 'string',
      enum: ['changed_mind', 'defective_product', 'not_as_described', 'late_delivery', 'wrong_item', 'payment_dispute', 'subscription_billing', 'data_breach_concern', 'other'],
    },
    order_state: {
      type: 'string',
      enum: ['not_shipped', 'in_transit', 'delivered', 'returned', 'cancelled', 'unknown', 'no_order'],
    },
    risk_level: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    evidence_required: {
      type: 'array',
      items: { type: 'string', enum: ['order_status', 'delivery_proof', 'customer_history', 'refund_eligibility', 'faq_entry', 'policy_rule', 'legal_reference'] },
    },
    human_review_required: { type: 'boolean' },
    recommended_action: {
      type: 'string',
      enum: ['auto_respond', 'human_review', 'escalate', 'request_more_info'],
    },
  },
  required: ['customer_intent', 'issue_reason', 'order_state', 'risk_level', 'evidence_required', 'human_review_required', 'recommended_action'],
});

const CLAUDE_ARGS = [
  '-p', '--no-session-persistence',
  '--output-format', 'json',
  '--json-schema', CLASSIFY_SCHEMA,
  '--system-prompt', SYSTEM_PROMPT,
];

export const claude_cli_classify_adapter: ClassifyLLM = {
  async classifyTicket(raw_message: string) {
    const raw = await run_claude_cli({
      bin: process.env.CLAUDE_CLI_BIN ?? 'claude',
      timeout_ms: parseInt(process.env.CLAUDE_CLI_TIMEOUT_MS ?? '30000', 10),
      args: CLAUDE_ARGS,
      input: `Customer message:\n${raw_message}`,
    });
    return { raw_llm_response: JSON.stringify(extract_inner_json(raw)) };
  },
};
