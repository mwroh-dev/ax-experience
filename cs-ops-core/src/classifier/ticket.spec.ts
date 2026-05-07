// cs-ops-core/src/classifier/ticket.spec.ts
import { normalize_ticket } from './ticket';

// Mock the openclaw client to avoid network calls in tests
jest.mock('../lib/openclaw-client', () => ({
  call_cs_bot: jest.fn(),
}));

import { call_cs_bot } from '../lib/openclaw-client';
const mock_call_cs_bot = call_cs_bot as jest.MockedFunction<typeof call_cs_bot>;

function make_llm_response(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    customer_intent: 'general_inquiry',
    issue_reason: 'other',
    order_state: 'unknown',
    risk_level: 'low',
    evidence_required: [],
    human_review_required: false,
    recommended_action: 'auto_respond',
    ...overrides,
  });
}

function make_bot_response(raw: string) {
  return {
    case_id: 'test',
    mode: 'classify_ticket' as const,
    draft: raw,
    evidence_used: [],
    confidence: 'medium' as const,
    needs_more_info: false,
    raw_llm_response: raw,
  };
}

describe('normalize_ticket', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('refund request', () => {
    it('classifies a refund message as refund_request', async () => {
      const raw = make_llm_response({
        customer_intent: 'refund_request',
        issue_reason: 'changed_mind',
        order_state: 'delivered',
        risk_level: 'medium',
        evidence_required: ['refund_eligibility', 'order_status'],
        human_review_required: true,
        recommended_action: 'human_review',
      });
      mock_call_cs_bot.mockResolvedValueOnce(make_bot_response(raw));

      const result = await normalize_ticket('I want to return my order and get a refund');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.customer_intent).toBe('refund_request');
        expect(result.value.ticket_id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
        );
      }
    });
  });

  describe('delivery inquiry', () => {
    it('classifies a delivery status message as delivery_inquiry', async () => {
      const raw = make_llm_response({
        customer_intent: 'delivery_inquiry',
        issue_reason: 'late_delivery',
        order_state: 'in_transit',
        risk_level: 'low',
        evidence_required: ['order_status', 'delivery_proof'],
        human_review_required: false,
        recommended_action: 'auto_respond',
      });
      mock_call_cs_bot.mockResolvedValueOnce(make_bot_response(raw));

      const result = await normalize_ticket('Where is my package? It was supposed to arrive yesterday');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.customer_intent).toBe('delivery_inquiry');
        expect(result.value.order_state).toBe('in_transit');
      }
    });
  });

  describe('privacy request', () => {
    it('classifies a data deletion request as privacy_request with high risk', async () => {
      const raw = make_llm_response({
        customer_intent: 'privacy_request',
        issue_reason: 'data_breach_concern',
        order_state: 'no_order',
        risk_level: 'critical',
        evidence_required: ['legal_reference'],
        human_review_required: true,
        recommended_action: 'escalate',
      });
      mock_call_cs_bot.mockResolvedValueOnce(make_bot_response(raw));

      const result = await normalize_ticket(
        'Please delete all my personal data from your systems immediately'
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.customer_intent).toBe('privacy_request');
        expect(result.value.human_review_required).toBe(true);
        expect(result.value.recommended_action).toBe('escalate');
      }
    });
  });

  describe('general inquiry', () => {
    it('classifies a store hours question as general_inquiry with low risk', async () => {
      const raw = make_llm_response({
        customer_intent: 'general_inquiry',
        issue_reason: 'other',
        order_state: 'no_order',
        risk_level: 'low',
        evidence_required: ['faq_entry'],
        human_review_required: false,
        recommended_action: 'auto_respond',
      });
      mock_call_cs_bot.mockResolvedValueOnce(make_bot_response(raw));

      const result = await normalize_ticket('What are your store hours?');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.customer_intent).toBe('general_inquiry');
        expect(result.value.risk_level).toBe('low');
        expect(result.value.human_review_required).toBe(false);
      }
    });
  });

  describe('error handling', () => {
    it('returns FlowResult with ok=false when LLM call fails', async () => {
      mock_call_cs_bot.mockRejectedValueOnce(new Error('LLM unreachable'));
      const result = await normalize_ticket('test message');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.step).toBe('normalize_ticket');
        expect(result.error).toContain('LLM unreachable');
      }
    });
  });
});
