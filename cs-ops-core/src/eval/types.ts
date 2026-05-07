// cs-ops-core/src/eval/types.ts
import { CustomerIntent, RiskLevel, AutomationRunLog } from '../types';

export interface EvalCase {
  case_id: string;
  input_message: string;
  expected_customer_intent: CustomerIntent;
  expected_risk_level: RiskLevel;
  expected_action: 'auto' | 'review' | 'escalate';
  tags: string[];
}

export interface DimensionScore {
  dimension: EvalDimension;
  score: number; // 0 or 1 (binary for deterministic dims)
  pass: boolean;
  reason: string;
}

export type EvalDimension =
  | 'classification_correctness'
  | 'risk_gate_correctness'
  | 'action_safety'
  | 'pii_masking'
  | 'evidence_cited'
  | 'legal_overclaim_prevention'
  | 'draft_present'
  | 'log_completeness';

export interface EvalResult {
  case_id: string;
  input_message: string;
  total_score: number; // 0–1 average across dimensions
  pass: boolean;       // total_score >= 0.75
  dimensions: DimensionScore[];
  run?: AutomationRunLog;
  error?: string;
}

export interface EvalReport {
  run_at: string;
  total_cases: number;
  passed: number;
  failed: number;
  pass_rate: number;
  avg_score: number;
  dimension_scores: Record<EvalDimension, number>; // avg per dimension
  results: EvalResult[];
}

export type PipelineFn = (
  message: string,
  slack_ts: string
) => Promise<{ ok: boolean; value?: AutomationRunLog; error?: string; trace?: unknown[] }>;
