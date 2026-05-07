import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { mask } from '../util/log';

let db_instance: Database.Database | null = null;

export function get_db(): Database.Database {
  if (db_instance) return db_instance;

  const db_dir = path.dirname(config.db_path);
  if (!fs.existsSync(db_dir)) {
    fs.mkdirSync(db_dir, { recursive: true });
  }

  db_instance = new Database(config.db_path);
  db_instance.pragma('journal_mode = WAL');
  db_instance.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db_instance.exec(schema);

  // Idempotency index — safe to run on existing DBs (IF NOT EXISTS)
  db_instance.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_ext_req_id
    ON cases(external_request_id)
    WHERE external_request_id IS NOT NULL;
  `);

  // Additive migrations — safe to re-run (ignore "duplicate column" error)
  for (const ddl of [
    `ALTER TABLE cases ADD COLUMN risk_level TEXT NOT NULL DEFAULT 'unknown'`,
    `ALTER TABLE cases ADD COLUMN recommended_path TEXT NOT NULL DEFAULT 'review_required'`,
  ]) {
    try { db_instance.exec(ddl); } catch { /* column already exists */ }
  }

  // Phase 5: AutomationRun + PromptVersion tables
  db_instance.exec(`
    CREATE TABLE IF NOT EXISTS automation_runs (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES cases(id),
      run_type TEXT NOT NULL,
      model TEXT,
      prompt_version_id TEXT,
      input_hash TEXT NOT NULL,
      output_summary TEXT,
      evidence_source_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'success',
      latency_ms INTEGER,
      error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS prompt_versions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      template TEXT NOT NULL,
      schema_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_automation_runs_ticket
      ON automation_runs(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_automation_runs_type
      ON automation_runs(run_type);
  `);

  // Phase 8: Improvement Backlog table
  db_instance.exec(`
    CREATE TABLE IF NOT EXISTS improvement_backlog (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      missing_topic TEXT NOT NULL,
      raw_query TEXT NOT NULL DEFAULT '',
      suggested_doc_type TEXT NOT NULL DEFAULT 'policy_or_faq',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_backlog_status ON improvement_backlog(status);
    CREATE INDEX IF NOT EXISTS idx_backlog_case ON improvement_backlog(case_id);
  `);

  // QA fixture store — Commerce + Admin 시나리오 데이터 (npm run seed:commerce)
  db_instance.exec(`
    CREATE TABLE IF NOT EXISTS qa_fixtures (
      collection TEXT NOT NULL,
      key        TEXT NOT NULL,
      data_json  TEXT NOT NULL,
      PRIMARY KEY (collection, key)
    );
  `);

  // Seed default prompt versions (idempotent)
  const now = new Date().toISOString();
  const seed_pv = db_instance.prepare(`
    INSERT OR IGNORE INTO prompt_versions (id, name, version, template, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  seed_pv.run('pv_classifier_v1', 'classifier', '1.0.0', 'Classify CS inquiry intent and risk. Output: {intent, risk_level, recommended_path, reason}', now);
  seed_pv.run('pv_draft_v1', 'draft_reply', '1.0.0', 'Generate a CS reply draft based on evidence. Output: {draft, confidence, needs_more_info}', now);
  seed_pv.run('pv_pending_v1', 'pending_investigation', '1.0.0', 'Determine missing information needed to resolve inquiry. Output: {required_fields, missing_fields}', now);

  console.log(mask(`[db] SQLite ready at ${config.db_path}`));
  return db_instance;
}
