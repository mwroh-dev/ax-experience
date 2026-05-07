// e2e/fixtures/sqlite-verify.ts
//
// Read-only SQLite helpers for E2E assertions.
// Opens the live knowledge.db used by the running API server.
// Both this process and the server use WAL mode so concurrent reads are safe.
//
// better-sqlite3 lives in cs-ops-core/node_modules — resolved at runtime since
// the e2e package has no direct dependency on it.

import path from 'path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

function open_readonly_kb(): DB {
  const db_path = process.env.KNOWLEDGE_DB_PATH ?? path.join(process.cwd(), 'knowledge.db');
  // Resolve better-sqlite3 from cs-ops-core since e2e has no direct dep
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require(
    require.resolve('better-sqlite3', {
      paths: [path.join(__dirname, '..', '..', 'cs-ops-core')],
    })
  );
  return new Database(db_path, { readonly: true });
}

function with_readonly_kb<T>(fn: (db: DB) => T): T {
  const db = open_readonly_kb();
  try { return fn(db); } finally { db.close(); }
}

export interface ReviewerFeedbackRow {
  id: number;
  run_id: string;
  ticket_id: string;
  action_id: string;
  reviewer_slack_id: string | null;
  created_at: string;
}

export interface JudgeDecisionRow {
  id: number;
  run_id: string;
  intent: string;
  order_state: string | null;
  risk_level: string;
  is_auto_safe: number;
  reason: string;
  confidence: string;
  created_at: string;
}

export function find_reviewer_feedback(run_id: string): ReviewerFeedbackRow | null {
  return with_readonly_kb(db =>
    (db.prepare('SELECT * FROM reviewer_feedback WHERE run_id = ? ORDER BY created_at DESC LIMIT 1').get(run_id) as ReviewerFeedbackRow) ?? null
  );
}

export function find_judge_decision(run_id: string): JudgeDecisionRow | null {
  return with_readonly_kb(db =>
    (db.prepare('SELECT * FROM judge_decisions WHERE run_id = ? LIMIT 1').get(run_id) as JudgeDecisionRow) ?? null
  );
}

export function count_reviewer_feedback(run_id: string): number {
  return with_readonly_kb(db => {
    const row = db.prepare('SELECT COUNT(*) as cnt FROM reviewer_feedback WHERE run_id = ?').get(run_id) as { cnt: number };
    return row.cnt;
  });
}
