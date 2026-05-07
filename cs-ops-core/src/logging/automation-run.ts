// cs-ops-core/src/logging/automation-run.ts
import { AutomationRunLog } from '../types';
import { write_automation_run } from '../lib/notion-client';
import { mask_pii } from '../lib/pii';

function sanitize_run(run: AutomationRunLog): AutomationRunLog {
  return {
    ...run,
    steps: run.steps.map(mask_pii),
    final_answer: run.final_answer ? mask_pii(run.final_answer) : undefined,
  };
}

export async function log_automation_run(run: AutomationRunLog): Promise<void> {
  const sanitized = sanitize_run(run);
  await write_automation_run(sanitized);
}
