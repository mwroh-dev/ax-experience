// cs-ops-core/src/gate/risk.ts
// Pure function: no async, no side effects
// Applies hard-coded risk rules to produce a RiskDecision

import { Ticket, PolicyMatch, RiskDecision } from '../types';

/**
 * apply_risk_gate
 *
 * Evaluates a ticket against hard-coded risk rules and policy matches
 * to determine the required action: auto | review | escalate.
 *
 * HARD RULES (cannot be overridden, evaluated in priority order):
 * 1. customer_intent = privacy_request → escalate
 * 2. risk_level = critical → escalate
 * 3. matches empty or only NO_MATCH → review
 * 4. risk_level = high → review
 * 5. refund denial possible (any match action = 'human_review' and intent = refund) → review
 * 6. any match action = 'escalate' → escalate
 * 7. any match action = 'auto_respond' → auto
 * 8. default → review
 */
export function apply_risk_gate(ticket: Ticket, matches: PolicyMatch[]): RiskDecision {
  // HARD RULE 1: Privacy requests always escalate (GDPR / legal compliance)
  if (ticket.customer_intent === 'privacy_request') {
    return {
      action: 'escalate',
      reason: 'Privacy request — mandatory escalation (legal compliance)',
    };
  }

  // HARD RULE 2: Critical risk always escalates
  if (ticket.risk_level === 'critical') {
    return {
      action: 'escalate',
      reason: 'Critical risk level — mandatory escalation',
    };
  }

  // HARD RULE 3: No policy match → human review
  const has_real_match =
    matches.length > 0 && matches.some((m) => m.rule_id !== 'NO_MATCH');

  if (!has_real_match) {
    return {
      action: 'review',
      reason: 'No policy match found — requires human review',
    };
  }

  // HARD RULE 4: High risk → review
  if (ticket.risk_level === 'high') {
    return {
      action: 'review',
      reason: 'High risk level — requires human review',
    };
  }

  // HARD RULE 5: Refund denial possible → review
  // A refund denial is possible when the intent is a refund request and
  // the policy requires human review (i.e., outcome could be a denial)
  const refund_review_possible =
    ticket.customer_intent === 'refund_request' &&
    matches.some((m) => m.action === 'human_review');

  if (refund_review_possible) {
    return {
      action: 'review',
      reason: 'Refund denial possible — requires human review',
    };
  }

  // Policy-driven escalation
  const has_policy_escalate = matches.some((m) => m.action === 'escalate');
  if (has_policy_escalate) {
    return {
      action: 'escalate',
      reason: 'Policy rule requires escalation',
    };
  }

  // Policy-driven auto response
  const has_auto_respond = matches.some((m) => m.action === 'auto_respond');
  if (has_auto_respond) {
    return {
      action: 'auto',
      reason: 'Policy match found — auto response applicable',
    };
  }

  // Default: human review
  return {
    action: 'review',
    reason: 'Policy match requires human review',
  };
}
