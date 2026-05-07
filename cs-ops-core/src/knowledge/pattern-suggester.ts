// cs-ops-core/src/knowledge/pattern-suggester.ts
import Database from 'better-sqlite3';

export interface KbPatternCandidate {
  intent: string;
  order_state: string | null;
  risk_level: string;
  sample_count: number;
  approve_count: number;
  escalate_count: number;
}

// COUNT(DISTINCT s.id) prevents fan-out inflation when a run_id has multiple
// reviewer_feedback rows (e.g., reviewer clicks approve then escalate).
const SUGGESTION_QUERY = `
  SELECT
    s.intent,
    s.order_state,
    s.risk_level,
    COUNT(DISTINCT s.id) AS sample_count,
    COUNT(DISTINCT CASE WHEN f.action_id = 'cs_review_approve' THEN f.id END) AS approve_count,
    COUNT(DISTINCT CASE WHEN f.action_id = 'cs_review_escalate' THEN f.id END) AS escalate_count
  FROM pipeline_run_samples s
  LEFT JOIN reviewer_feedback f ON f.run_id = s.run_id
  WHERE NOT EXISTS (
    SELECT 1 FROM auto_safe_patterns p
    WHERE p.intent = s.intent
    AND COALESCE(p.order_state, '') = COALESCE(s.order_state, '')
    AND p.enabled = 1
  )
  GROUP BY s.intent, s.order_state, s.risk_level
  HAVING COUNT(DISTINCT s.id) >= ?
  ORDER BY approve_count DESC, sample_count DESC
`;

export function suggest_kb_patterns(
  db: Database.Database,
  min_samples = 5,
): KbPatternCandidate[] {
  return db.prepare(SUGGESTION_QUERY).all(min_samples) as KbPatternCandidate[];
}
