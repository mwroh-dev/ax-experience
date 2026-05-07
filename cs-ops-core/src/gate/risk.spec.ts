// cs-ops-core/src/gate/risk.spec.ts

import { apply_risk_gate } from './risk';
import { Ticket, PolicyMatch } from '../types';

const base_ticket: Ticket = {
  ticket_id: 'test-uuid-0001',
  customer_intent: 'general_inquiry',
  issue_reason: 'other',
  order_state: 'unknown',
  risk_level: 'low',
  evidence_required: [],
  human_review_required: false,
  recommended_action: 'auto_respond',
};

const auto_respond_match: PolicyMatch = {
  rule_id: 'POLICY-GEN-001',
  rule_label: 'General inquiry — auto respond',
  action: 'auto_respond',
  confidence: 0.9,
  evidence_used: ['faq_entry'],
};

const human_review_match: PolicyMatch = {
  rule_id: 'POLICY-REFUND-001',
  rule_label: 'Refund review required',
  action: 'human_review',
  confidence: 0.7,
  evidence_used: ['policy_rule'],
};

describe('apply_risk_gate', () => {
  describe('HARD RULE: privacy_request → escalate', () => {
    it('escalates when customer_intent is privacy_request (regardless of risk level)', () => {
      const ticket: Ticket = {
        ...base_ticket,
        customer_intent: 'privacy_request',
        risk_level: 'low',
      };
      const result = apply_risk_gate(ticket, [auto_respond_match]);
      expect(result.action).toBe('escalate');
    });

    it('escalates privacy_request even with no policy matches', () => {
      const ticket: Ticket = {
        ...base_ticket,
        customer_intent: 'privacy_request',
      };
      const result = apply_risk_gate(ticket, []);
      expect(result.action).toBe('escalate');
    });

    it('includes a reason string', () => {
      const ticket: Ticket = {
        ...base_ticket,
        customer_intent: 'privacy_request',
      };
      const result = apply_risk_gate(ticket, []);
      expect(result.reason).toBeTruthy();
      expect(typeof result.reason).toBe('string');
    });
  });

  describe('HARD RULE: critical risk_level → escalate', () => {
    it('escalates when risk_level is critical', () => {
      const ticket: Ticket = {
        ...base_ticket,
        risk_level: 'critical',
      };
      const result = apply_risk_gate(ticket, [auto_respond_match]);
      expect(result.action).toBe('escalate');
    });
  });

  describe('HARD RULE: high risk_level → review', () => {
    it('returns review when risk_level is high (with valid policy match)', () => {
      const ticket: Ticket = {
        ...base_ticket,
        risk_level: 'high',
      };
      const result = apply_risk_gate(ticket, [auto_respond_match]);
      expect(result.action).toBe('review');
    });

    it('includes a reason string for high risk review', () => {
      const ticket: Ticket = {
        ...base_ticket,
        risk_level: 'high',
      };
      const result = apply_risk_gate(ticket, [auto_respond_match]);
      expect(result.reason).toBeTruthy();
    });
  });

  describe('HARD RULE: no policy match → review', () => {
    it('returns review when matches array is empty', () => {
      const result = apply_risk_gate(base_ticket, []);
      expect(result.action).toBe('review');
    });

    it('returns review when all matches are NO_MATCH', () => {
      const no_match: PolicyMatch = {
        rule_id: 'NO_MATCH',
        action: 'human_review',
        confidence: 0,
        evidence_used: [],
      };
      const result = apply_risk_gate(base_ticket, [no_match]);
      expect(result.action).toBe('review');
    });
  });

  describe('policy-driven auto response', () => {
    it('returns auto when risk is low and policy has auto_respond match', () => {
      const result = apply_risk_gate(base_ticket, [auto_respond_match]);
      expect(result.action).toBe('auto');
    });

    it('returns auto for medium risk with auto_respond match', () => {
      const ticket: Ticket = {
        ...base_ticket,
        risk_level: 'medium',
      };
      const result = apply_risk_gate(ticket, [auto_respond_match]);
      expect(result.action).toBe('auto');
    });
  });

  describe('refund denial guard', () => {
    it('returns review for refund_request with human_review policy match', () => {
      const ticket: Ticket = {
        ...base_ticket,
        customer_intent: 'refund_request',
        risk_level: 'low',
      };
      const result = apply_risk_gate(ticket, [human_review_match]);
      expect(result.action).toBe('review');
    });
  });

  describe('return shape validation', () => {
    it('always returns an object with action and reason fields', () => {
      const result = apply_risk_gate(base_ticket, [auto_respond_match]);
      expect(result).toHaveProperty('action');
      expect(result).toHaveProperty('reason');
    });

    it('action is always one of auto|review|escalate', () => {
      const valid_actions = ['auto', 'review', 'escalate'];
      const result = apply_risk_gate(base_ticket, [auto_respond_match]);
      expect(valid_actions).toContain(result.action);
    });
  });
});
