import { get_db } from '../db/sqlite';
import { v4 as uuidv4 } from 'uuid';

export interface DraftVersion {
  id: string;
  case_id: string;
  version: number;
  draft_text: string;
  instruction?: string;
  confidence?: string;
  created_at: string;
}

// Ensure table exists (additive, idempotent)
try {
  get_db().exec(`
    CREATE TABLE IF NOT EXISTS draft_versions (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      draft_text TEXT NOT NULL,
      instruction TEXT,
      confidence TEXT,
      created_at TEXT NOT NULL
    )
  `);
} catch { /* already exists */ }

export function save_draft_version(
  case_id: string,
  draft_text: string,
  confidence?: string,
  instruction?: string
): DraftVersion {
  const existing = get_db().prepare(
    'SELECT COALESCE(MAX(version), 0) as max_v FROM draft_versions WHERE case_id = ?'
  ).get(case_id) as { max_v: number };

  const version = existing.max_v + 1;
  const draft: DraftVersion = {
    id: 'dv_' + uuidv4().replace(/-/g, '').slice(0, 16),
    case_id,
    version,
    draft_text,
    instruction,
    confidence,
    created_at: new Date().toISOString(),
  };

  get_db().prepare(
    'INSERT INTO draft_versions (id, case_id, version, draft_text, instruction, confidence, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(draft.id, draft.case_id, draft.version, draft.draft_text, draft.instruction ?? null, draft.confidence ?? null, draft.created_at);

  return draft;
}

export function get_latest_draft(case_id: string): DraftVersion | null {
  return get_db().prepare(
    'SELECT * FROM draft_versions WHERE case_id = ? ORDER BY version DESC LIMIT 1'
  ).get(case_id) as DraftVersion | null;
}
