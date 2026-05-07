// cs-ops-core/src/policy/matcher.ts
// Pure policy matching function — no async, no side effects

import { match } from 'ts-pattern';
import { EvidenceBundle, PolicyMatch, CustomerIntent } from '../types';

/** Intent keywords that hint at each policy category */
const INTENT_KEYWORDS: Record<string, CustomerIntent[]> = {
  refund: ['refund_request', 'exchange_request'],
  delivery: ['delivery_inquiry'],
  subscription: ['subscription_cancel'],
  privacy: ['privacy_request'],
  defect: ['product_defect_report'],
  complaint: ['complaint'],
  general: ['general_inquiry'],
};

/** Determine action from policy rule content + ticket intent */
function derive_action(
  rule_content: string,
  intent: CustomerIntent,
): PolicyMatch['action'] {
  const content_lower = rule_content.toLowerCase();

  return match(intent)
    .with('privacy_request', () => 'escalate' as const)
    .with(
      'refund_request',
      'exchange_request',
      'delivery_inquiry',
      'subscription_cancel',
      'product_defect_report',
      'general_inquiry',
      'complaint',
      () => {
        // Explicit escalation triggers in the rule text
        if (content_lower.includes('escalate') || content_lower.includes('manager')) {
          return 'escalate' as const;
        }

        // Rules that require human review
        if (
          content_lower.includes('review') ||
          content_lower.includes('approve') ||
          content_lower.includes('manual')
        ) {
          return 'human_review' as const;
        }

        // Default: auto-respond for clear low-risk policy matches
        return 'auto_respond' as const;
      },
    )
    .exhaustive();
}

/** Score how well a policy rule matches the ticket intent (0.0 – 1.0) */
function score_rule(
  rule_title: string,
  rule_content: string,
  intent: CustomerIntent,
): number {
  const text = `${rule_title} ${rule_content}`.toLowerCase();

  for (const [keyword, intents] of Object.entries(INTENT_KEYWORDS)) {
    if (intents.includes(intent) && text.includes(keyword)) {
      return 0.8;
    }
  }

  // Partial match: the rule mentions the intent name directly
  if (text.includes(intent.replace('_', ' ').split('_')[0])) {
    return 0.6;
  }

  return 0.0;
}

/**
 * Pure function. Matches EvidenceBundle against PolicyRules.
 *
 * Returns an array of PolicyMatch. If nothing matches, returns
 * [{rule_id:'NO_MATCH', action:'human_review', confidence:0, evidence_used:[]}]
 */
export function match_policies(bundle: EvidenceBundle): PolicyMatch[] {
  const { ticket, policy_matches: rules, faq_matches } = bundle;

  if (!rules || rules.length === 0) {
    return [
      {
        rule_id: 'NO_MATCH',
        rule_label: 'No matching policy',
        action: 'human_review',
        confidence: 0,
        evidence_used: [],
      },
    ];
  }

  const results: PolicyMatch[] = [];

  for (const rule of rules) {
    const confidence = score_rule(rule.title, rule.content, ticket.customer_intent);
    if (confidence === 0) continue;

    const evidence_used: string[] = [rule.id];
    // Include any FAQ matches as supporting evidence
    faq_matches.slice(0, 2).forEach((f) => evidence_used.push(f.id));

    results.push({
      rule_id: rule.id,
      rule_label: rule.title,
      action: derive_action(rule.content, ticket.customer_intent),
      confidence,
      evidence_used,
    });
  }

  if (results.length === 0) {
    return [
      {
        rule_id: 'NO_MATCH',
        rule_label: 'No matching policy',
        action: 'human_review',
        confidence: 0,
        evidence_used: [],
      },
    ];
  }

  // Sort by confidence descending
  return results.sort((a, b) => b.confidence - a.confidence);
}
