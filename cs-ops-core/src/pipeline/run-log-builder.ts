// cs-ops-core/src/pipeline/run-log-builder.ts
import { AutomationRunLog } from '../types';

export function make_failed_run(
  run_id: string,
  ticket_id: string,
  phase: string,
  steps: string[],
  reason: string,
  evidence_ids: string[] = [],
): AutomationRunLog {
  return {
    run_id,
    ticket_id,
    phase,
    steps,
    risk_decision: { action: 'review', reason },
    evidence_ids,
  };
}
