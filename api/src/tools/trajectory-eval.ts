import { get_automation_runs, AutomationRunType } from '../cases/automation-run-store';
import { get_case } from '../cases/case-store';

export interface TrajectoryEvalResult {
  case_id: string;
  path: string;
  expected: AutomationRunType[];
  actual: AutomationRunType[];
  missing: AutomationRunType[];
  unexpected: AutomationRunType[];
  pass: boolean;
}

const EXPECTED_BY_PATH: Record<string, AutomationRunType[]> = {
  auto_reply:              ['classify', 'retrieve_evidence', 'commerce_lookup', 'draft_reply'],
  review_required:         ['classify', 'retrieve_evidence', 'commerce_lookup', 'draft_reply'],
  review_required_default: ['classify', 'retrieve_evidence', 'commerce_lookup', 'draft_reply'],
  pending:                 ['classify', 'pending_investigation'],
  escalation:              ['classify', 'escalation'],
  no_source_backlog:       ['classify', 'no_source_backlog'],
};

export function check_trajectory(case_id: string): TrajectoryEvalResult {
  const c = get_case(case_id);
  const path = c?.recommended_path ?? 'unknown';
  const expected = EXPECTED_BY_PATH[path] ?? ['classify'];

  const runs = get_automation_runs(case_id);
  const actual = runs
    .filter(r => r.status !== 'error')
    .map(r => r.run_type);

  const actual_set = new Set(actual);
  const expected_set = new Set(expected);

  const missing = expected.filter(t => !actual_set.has(t));
  const unexpected = actual.filter(t => !expected_set.has(t) && t !== 'eval_draft' && t !== 'slack_post' && t !== 'notion_write');

  return {
    case_id,
    path,
    expected,
    actual,
    missing,
    unexpected,
    pass: missing.length === 0,
  };
}
