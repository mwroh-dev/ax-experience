// cs-ops-core/src/types.ts
// Shared domain types for the CS Ops Automation Harness

export type CustomerIntent =
  | 'refund_request'
  | 'exchange_request'
  | 'delivery_inquiry'
  | 'subscription_cancel'
  | 'privacy_request'
  | 'product_defect_report'
  | 'general_inquiry'
  | 'complaint';

export type IssueReason =
  | 'changed_mind'
  | 'defective_product'
  | 'not_as_described'
  | 'late_delivery'
  | 'wrong_item'
  | 'payment_dispute'
  | 'subscription_billing'
  | 'data_breach_concern'
  | 'other';

export type OrderState =
  | 'not_shipped'
  | 'in_transit'
  | 'delivered'
  | 'returned'
  | 'cancelled'
  | 'unknown'
  | 'no_order';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type EvidenceType =
  | 'order_status'
  | 'delivery_proof'
  | 'customer_history'
  | 'refund_eligibility'
  | 'faq_entry'
  | 'policy_rule'
  | 'legal_reference';

export interface Ticket {
  ticket_id: string;
  raw_message?: string;
  language?: 'ko' | 'en' | 'other';
  customer_intent: CustomerIntent;
  issue_reason: IssueReason;
  order_state: OrderState;
  risk_level: RiskLevel;
  evidence_required: EvidenceType[];
  human_review_required: boolean;
  recommended_action: 'auto_respond' | 'human_review' | 'escalate' | 'request_more_info';
}

export interface OrderStatus {
  orderId: string;
  status: string;
  carrier?: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
}

export interface CustomerInfo {
  customerId: string;
  email_masked: string;
  orderCount: number;
  firstOrderDate: string;
}

export interface RefundEligibility {
  eligible: boolean;
  reason: string;
  daysReturn: number;
  withinWindow: boolean;
}

export interface EvidenceBundle {
  ticket: Ticket;
  order?: OrderStatus;
  customer?: CustomerInfo;
  refund_eligibility?: RefundEligibility;
  faq_matches: FaqMatch[];
  policy_matches: PolicyRuleMatch[];
  legal_references: LegalReference[];
}

export interface FaqMatch {
  id: string;
  title: string;
  content: string;
  relevance_score: number;
}

export interface PolicyRuleMatch {
  id: string;
  title: string;
  content: string;
  relevance_score: number;
}

export interface LegalReference {
  id: string;
  title: string;
  url?: string;
}

export interface PolicyMatch {
  rule_id: string;
  rule_label?: string;
  action: 'auto_respond' | 'human_review' | 'escalate';
  confidence: number;
  evidence_used: string[];
}

export interface RiskDecision {
  action: 'auto' | 'review' | 'escalate';
  reason: string;
}

export interface Draft {
  text: string;
  evidence_ids: string[];
  template_used?: string;
}

export interface AutomationRunLog {
  run_id: string;
  ticket_id: string;
  phase: string;
  steps: string[];
  risk_decision: RiskDecision;
  reviewer_action?: string;
  reviewer_id?: string;
  evidence_ids: string[];
  final_answer?: string;
  hold_summary?: string;
  eval_score?: number;
  detected_intent?: CustomerIntent;
  audit_log_failed?: boolean;
}

export interface TraceEntry {
  step: string;
  started_at: number;
  duration_ms: number;
  ok: boolean;
  meta?: Record<string, unknown>;
}
