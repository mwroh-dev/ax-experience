import crypto from 'crypto';
import { z } from 'zod';
import { get_db } from '../db/sqlite';

export type AutomationRunType =
  | 'classify'
  | 'retrieve_evidence'
  | 'commerce_lookup'
  | 'draft_reply'
  | 'eval_draft'
  | 'pending_investigation'
  | 'retry_draft'
  | 'no_source_backlog'
  | 'escalation'
  | 'notion_write'
  | 'slack_post';

export type AutomationRunStatus = 'success' | 'error' | 'skipped';

export interface AutomationRun {
  id: string;
  ticket_id: string;
  run_type: AutomationRunType;
  model?: string;
  prompt_version_id?: string;
  input_hash: string;
  output_summary?: string;
  evidence_source_ids: string[];
  status: AutomationRunStatus;
  latency_ms?: number;
  error?: string;
  created_at: string;
}

const AutomationRunRowSchema = z.object({
  id: z.string(),
  ticket_id: z.string(),
  run_type: z.enum([
    'classify',
    'retrieve_evidence',
    'commerce_lookup',
    'draft_reply',
    'eval_draft',
    'pending_investigation',
    'retry_draft',
    'no_source_backlog',
    'escalation',
    'notion_write',
    'slack_post',
  ]),
  model: z.string().nullable().optional(),
  prompt_version_id: z.string().nullable().optional(),
  input_hash: z.string(),
  output_summary: z.string().nullable().optional(),
  evidence_source_ids: z.string(),
  status: z.enum(['success', 'error', 'skipped']),
  latency_ms: z.number().nullable().optional(),
  error: z.string().nullable().optional(),
  created_at: z.string(),
});

export interface CreateAutomationRunParams {
  ticket_id: string;
  run_type: AutomationRunType;
  input: object;
  model?: string;
  prompt_version_id?: string;
}

function make_id(): string {
  return `ar_${crypto.randomBytes(8).toString('hex')}`;
}

function hash_input(input: object): string {
  return crypto.createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 16);
}

export function start_automation_run(params: CreateAutomationRunParams): { id: string; started_at: number } {
  const id = make_id();
  const now = new Date().toISOString();
  const db = get_db();
  db.prepare(`
    INSERT INTO automation_runs (id, ticket_id, run_type, model, prompt_version_id, input_hash, status, evidence_source_ids, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'success', '[]', ?)
  `).run(id, params.ticket_id, params.run_type, params.model ?? null, params.prompt_version_id ?? null, hash_input(params.input), now);
  return { id, started_at: Date.now() };
}

export function complete_automation_run(
  id: string,
  result: {
    output_summary?: string;
    evidence_source_ids?: string[];
    status: AutomationRunStatus;
    latency_ms: number;
    error?: string;
  }
): void {
  const db = get_db();
  db.prepare(`
    UPDATE automation_runs
    SET output_summary = ?, evidence_source_ids = ?, status = ?, latency_ms = ?, error = ?
    WHERE id = ?
  `).run(
    result.output_summary ?? null,
    JSON.stringify(result.evidence_source_ids ?? []),
    result.status,
    result.latency_ms,
    result.error ?? null,
    id,
  );
}

export function get_automation_runs(ticket_id: string): AutomationRun[] {
  const db = get_db();
  const rows = db.prepare(`
    SELECT * FROM automation_runs WHERE ticket_id = ? ORDER BY created_at ASC
  `).all(ticket_id);
  const result: AutomationRun[] = [];
  for (const row of rows) {
    const parsed = AutomationRunRowSchema.safeParse(row);
    if (parsed.success) {
      result.push({ ...parsed.data, evidence_source_ids: JSON.parse(parsed.data.evidence_source_ids) });
    }
  }
  return result;
}

export function get_recent_automation_runs(limit = 50): AutomationRun[] {
  const db = get_db();
  const rows = db.prepare(`
    SELECT * FROM automation_runs ORDER BY created_at DESC LIMIT ?
  `).all(limit);
  const result: AutomationRun[] = [];
  for (const row of rows) {
    const parsed = AutomationRunRowSchema.safeParse(row);
    if (parsed.success) {
      result.push({ ...parsed.data, evidence_source_ids: JSON.parse(parsed.data.evidence_source_ids) });
    }
  }
  return result;
}
