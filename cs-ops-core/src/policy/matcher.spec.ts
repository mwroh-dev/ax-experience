// cs-ops-core/src/policy/matcher.spec.ts

import { match_policies } from './matcher';
import { EvidenceBundle, Ticket } from '../types';

const base_ticket: Ticket = {
  ticket_id: 'test-uuid-001',
  customer_intent: 'general_inquiry',
  issue_reason: 'other',
  order_state: 'unknown',
  risk_level: 'low',
  evidence_required: [],
  human_review_required: false,
  recommended_action: 'auto_respond',
};

function make_bundle(overrides: Partial<EvidenceBundle> = {}): EvidenceBundle {
  return {
    ticket: base_ticket,
    faq_matches: [],
    policy_matches: [],
    legal_references: [],
    ...overrides,
  };
}

describe('match_policies', () => {
  describe('empty policy list', () => {
    it('returns [{rule_id: "NO_MATCH", action: "human_review"}] when policy_matches is empty', () => {
      const bundle = make_bundle({ policy_matches: [] });
      const result = match_policies(bundle);

      expect(result).toHaveLength(1);
      expect(result[0].rule_id).toBe('NO_MATCH');
      expect(result[0].action).toBe('human_review');
    });

    it('returns confidence 0 for NO_MATCH', () => {
      const bundle = make_bundle({ policy_matches: [] });
      const result = match_policies(bundle);

      expect(result[0].confidence).toBe(0);
    });

    it('returns empty evidence_used for NO_MATCH', () => {
      const bundle = make_bundle({ policy_matches: [] });
      const result = match_policies(bundle);

      expect(result[0].evidence_used).toEqual([]);
    });
  });

  describe('known refund case', () => {
    it('matches a refund policy rule for refund_request intent', () => {
      const bundle = make_bundle({
        ticket: {
          ...base_ticket,
          customer_intent: 'refund_request',
          risk_level: 'medium',
        },
        policy_matches: [
          {
            id: 'policy-refund-001',
            title: 'Refund Policy',
            content: 'Customers may request a refund within 30 days of purchase.',
            relevance_score: 0.9,
          },
        ],
      });

      const result = match_policies(bundle);

      expect(result).not.toHaveLength(0);
      expect(result[0].rule_id).toBe('policy-refund-001');
      expect(result[0].action).toMatch(/auto_respond|human_review|escalate/);
      expect(result[0].confidence).toBeGreaterThan(0);
    });

    it('includes the policy rule id in evidence_used', () => {
      const bundle = make_bundle({
        ticket: {
          ...base_ticket,
          customer_intent: 'refund_request',
        },
        policy_matches: [
          {
            id: 'policy-refund-001',
            title: 'Refund Policy',
            content: 'Customers may request a refund within 30 days.',
            relevance_score: 0.9,
          },
        ],
      });

      const result = match_policies(bundle);
      expect(result[0].evidence_used).toContain('policy-refund-001');
    });
  });

  describe('unknown / unmatched case', () => {
    it('returns NO_MATCH when no policy rules match the ticket intent', () => {
      const bundle = make_bundle({
        ticket: {
          ...base_ticket,
          customer_intent: 'general_inquiry',
        },
        policy_matches: [
          {
            id: 'policy-refund-001',
            title: 'Refund Policy',
            content: 'Customers may request a refund within 30 days.',
            relevance_score: 0.9,
          },
        ],
      });

      const result = match_policies(bundle);

      // general_inquiry won't match a refund policy rule
      expect(result).toHaveLength(1);
      expect(result[0].rule_id).toBe('NO_MATCH');
      expect(result[0].action).toBe('human_review');
    });
  });

  describe('privacy_request escalation', () => {
    it('escalates when customer_intent is privacy_request', () => {
      const bundle = make_bundle({
        ticket: {
          ...base_ticket,
          customer_intent: 'privacy_request',
          risk_level: 'high',
        },
        policy_matches: [
          {
            id: 'policy-privacy-001',
            title: 'Privacy Policy',
            content: 'All privacy requests must be handled per GDPR guidelines.',
            relevance_score: 0.95,
          },
        ],
      });

      const result = match_policies(bundle);
      const privacy_match = result.find((r) => r.rule_id === 'policy-privacy-001');

      expect(privacy_match).toBeDefined();
      expect(privacy_match?.action).toBe('escalate');
    });
  });
});
