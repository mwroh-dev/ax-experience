import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { get_db } from '../db/sqlite';

export interface Case {
  id: string;
  source_type: string;
  source_channel_id?: string;
  source_thread_ts?: string;
  source_message_ts?: string;
  external_request_id?: string;
  requester_slack_user_id?: string;
  raw_text: string;
  intent: string;
  risk_level: string;
  recommended_path: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CaseEvent {
  id: string;
  case_id: string;
  event_type: string;
  actor_type: 'system' | 'human' | 'bot';
  actor_id?: string;
  payload_json: string;
  created_at: string;
}

export interface ReviewMessage {
  id: string;
  case_id: string;
  review_channel_id: string;
  review_message_ts: string;
  blocks_json: string;
  created_at: string;
}

export interface ToolCall {
  id: string;
  case_id: string;
  tool_name: string;
  input_json: string;
  output_json?: string;
  status: string;
  created_at: string;
}

const CaseRowSchema = z.object({
  id: z.string(),
  source_type: z.string(),
  source_channel_id: z.string().optional().nullable(),
  source_thread_ts: z.string().optional().nullable(),
  source_message_ts: z.string().optional().nullable(),
  external_request_id: z.string().optional().nullable(),
  requester_slack_user_id: z.string().optional().nullable(),
  raw_text: z.string(),
  intent: z.string(),
  risk_level: z.string(),
  recommended_path: z.string(),
  status: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const ReviewMessageRowSchema = z.object({
  id: z.string(),
  case_id: z.string(),
  review_channel_id: z.string(),
  review_message_ts: z.string(),
  blocks_json: z.string(),
  created_at: z.string(),
});

export function create_case(params: {
  source_type: string;
  external_request_id?: string;
  raw_text: string;
  intent?: string;
  risk_level?: string;
  recommended_path?: string;
  source_channel_id?: string;
  source_thread_ts?: string;
  source_message_ts?: string;
  requester_slack_user_id?: string;
}): Case {
  const db = get_db();
  const now = new Date().toISOString();
  const id = 'case_' + uuidv4().replace(/-/g, '').slice(0, 16);

  const case_row: Case = {
    id,
    source_type: params.source_type,
    source_channel_id: params.source_channel_id,
    source_thread_ts: params.source_thread_ts,
    source_message_ts: params.source_message_ts,
    external_request_id: params.external_request_id,
    requester_slack_user_id: params.requester_slack_user_id,
    raw_text: params.raw_text,
    intent: params.intent ?? 'unknown',
    risk_level: params.risk_level ?? 'unknown',
    recommended_path: params.recommended_path ?? 'review_required',
    status: 'intake_review',
    created_at: now,
    updated_at: now,
  };

  db.prepare(`
    INSERT INTO cases (id, source_type, source_channel_id, source_thread_ts,
      source_message_ts, external_request_id, requester_slack_user_id,
      raw_text, intent, risk_level, recommended_path, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    case_row.id, case_row.source_type, case_row.source_channel_id ?? null,
    case_row.source_thread_ts ?? null, case_row.source_message_ts ?? null,
    case_row.external_request_id ?? null, case_row.requester_slack_user_id ?? null,
    case_row.raw_text, case_row.intent, case_row.risk_level, case_row.recommended_path,
    case_row.status, case_row.created_at, case_row.updated_at
  );

  add_event(id, 'case_created', 'system', undefined, { source_type: params.source_type });
  return case_row;
}

export function get_case(id: string): Case | null {
  const db = get_db();
  const row = db.prepare('SELECT * FROM cases WHERE id = ?').get(id);
  const parsed = CaseRowSchema.safeParse(row);
  if (!parsed.success) return null;
  return parsed.data as Case;
}

export function find_case_by_external_request_id(ext_id: string): Case | null {
  const db = get_db();
  const row = db.prepare('SELECT * FROM cases WHERE external_request_id = ?').get(ext_id);
  const parsed = CaseRowSchema.safeParse(row);
  if (!parsed.success) return null;
  return parsed.data as Case;
}

export function list_cases(limit = 50): Case[] {
  const db = get_db();
  const rows = db.prepare('SELECT * FROM cases ORDER BY created_at DESC LIMIT ?').all(limit);
  return rows
    .map((row) => CaseRowSchema.safeParse(row))
    .filter((r) => r.success)
    .map((r) => r.data as Case);
}

export function update_case_status(case_id: string, status: string, actor_id?: string): void {
  const db = get_db();
  const now = new Date().toISOString();
  db.prepare('UPDATE cases SET status = ?, updated_at = ? WHERE id = ?').run(status, now, case_id);
  add_event(case_id, `status_changed_to_${status}`, 'human', actor_id, { status });
}

export function try_update_case_status({ case_id, expected_status, new_status, actor_id }: { case_id: string; expected_status: string; new_status: string; actor_id?: string }): boolean {
  const db = get_db();
  const now = new Date().toISOString();
  const result = db.prepare(
    'UPDATE cases SET status = ?, updated_at = ? WHERE id = ? AND status = ?'
  ).run(new_status, now, case_id, expected_status);

  if (result.changes === 0) return false;
  add_event(case_id, `status_changed_to_${new_status}`, 'human', actor_id, { status: new_status });
  return true;
}

export function add_event(
  case_id: string,
  event_type: string,
  actor_type: 'system' | 'human' | 'bot',
  actor_id?: string,
  payload?: object
): CaseEvent {
  const db = get_db();
  const now = new Date().toISOString();
  const id = 'evt_' + uuidv4().replace(/-/g, '').slice(0, 16);

  const event: CaseEvent = {
    id,
    case_id,
    event_type,
    actor_type,
    actor_id,
    payload_json: JSON.stringify(payload ?? {}),
    created_at: now,
  };

  db.prepare(`
    INSERT INTO case_events (id, case_id, event_type, actor_type, actor_id, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(event.id, event.case_id, event.event_type, event.actor_type, event.actor_id ?? null, event.payload_json, event.created_at);

  return event;
}

export function save_review_message(params: {
  case_id: string;
  review_channel_id: string;
  review_message_ts: string;
  blocks_json: string;
}): ReviewMessage {
  const db = get_db();
  const now = new Date().toISOString();
  const id = 'rev_' + uuidv4().replace(/-/g, '').slice(0, 16);

  const row: ReviewMessage = {
    id,
    case_id: params.case_id,
    review_channel_id: params.review_channel_id,
    review_message_ts: params.review_message_ts,
    blocks_json: params.blocks_json,
    created_at: now,
  };

  db.prepare(`
    INSERT INTO review_messages (id, case_id, review_channel_id, review_message_ts, blocks_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(row.id, row.case_id, row.review_channel_id, row.review_message_ts, row.blocks_json, row.created_at);

  return row;
}

export function get_review_message(case_id: string): ReviewMessage | null {
  const db = get_db();
  const row = db.prepare('SELECT * FROM review_messages WHERE case_id = ? ORDER BY created_at DESC LIMIT 1').get(case_id);
  const parsed = ReviewMessageRowSchema.safeParse(row);
  if (!parsed.success) return null;
  return parsed.data;
}

export function save_tool_call(params: {
  case_id: string;
  tool_name: string;
  input: object;
}): string {
  const db = get_db();
  const now = new Date().toISOString();
  const id = 'tool_' + uuidv4().replace(/-/g, '').slice(0, 16);

  db.prepare(`
    INSERT INTO tool_calls (id, case_id, tool_name, input_json, status, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(id, params.case_id, params.tool_name, JSON.stringify(params.input), now);

  return id;
}

export function update_tool_call(id: string, output: object, status: 'success' | 'error'): void {
  const db = get_db();
  db.prepare('UPDATE tool_calls SET output_json = ?, status = ? WHERE id = ?')
    .run(JSON.stringify(output), status, id);
}
