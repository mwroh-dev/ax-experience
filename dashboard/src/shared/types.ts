export interface Case {
  id: string;
  source_type: string;
  intent: string;
  risk_level: string;
  status: string;
  recommended_path: string;
  raw_text: string;
  created_at: string;
}

export interface AutomationRun {
  id: string;
  ticket_id: string;
  case_id: string;
  run_type: string;
  status: 'success' | 'error' | 'skipped';
  output_summary?: string;
  latency_ms?: number;
  error?: string;
  evidence_source_ids: string[];
  created_at: string;
}

export interface KnowledgeDoc {
  id: string;
  source_id: string;
  source_type: string;
  title: string;
  indexed_at: string;
}

export interface SearchResult {
  source_id: string;
  source_type: string;
  title: string;
  matched_text: string;
  confidence: number;
}

export interface HealthDeps {
  slack: { configured?: boolean; token_prefix?: string; status?: string };
  notion: { configured?: boolean; status?: string };
  openclaw: { live?: boolean; latency_ms?: number; error?: string };
  commerce_api: { live?: boolean; latency_ms?: number; error?: string };
  sqlite: { ready?: boolean; path?: string };
}

export interface VocReport {
  generated_at: string;
  period_days: number;
  cases: {
    total: number;
    by_status: Record<string, number>;
    by_intent: { intent: string; count: number }[];
    by_risk: Record<string, number>;
    no_source_count: number;
    resolution_rate: number;
  };
  automation_runs: {
    total: number;
    by_type: { run_type: string; count: number; success_count: number; avg_latency_ms: number }[];
    overall_success_rate: number;
  };
  improvement_backlog: {
    open: number;
    resolved: number;
    top_topics: { topic: string; count: number }[];
  };
  top_recurring_issues: { intent: string; count: number; risk_level: string; example_topics: string[] }[];
  improvement_suggestions: { trigger: string; suggestion: string; priority: 'high' | 'medium' | 'low' }[];
}

export interface VocScenario {
  scenario: string;
  expected_intent: string;
  expected_path: string;
}

export interface ClassifyResult {
  intent: string;
  risk_level: string;
  recommended_path: string;
  requires_commerce_api: boolean;
  requires_human_review: boolean;
  reason: string;
}

export interface BacklogItem {
  id: string;
  case_id?: string;
  missing_topic: string;
  suggested_doc_type: string;
  status: 'open' | 'resolved';
  created_at: string;
}
