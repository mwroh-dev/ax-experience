// cs-ops-core/src/knowledge/db.ts
import Database from 'better-sqlite3';
import path from 'path';
import { RiskLevel, CustomerIntent, OrderState } from '../types';

export interface AutoSafePattern {
  id: number;
  intent: string;
  order_state: string | null;
  max_risk_level: RiskLevel;
  enabled: number;
  description: string | null;
}

export interface PipelineRunSample {
  run_id: string;
  intent: string;
  order_state: OrderState | null;
  risk_level: RiskLevel;
  route: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS auto_safe_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intent TEXT NOT NULL,
  order_state TEXT,
  max_risk_level TEXT NOT NULL DEFAULT 'low',
  enabled INTEGER NOT NULL DEFAULT 1,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- COALESCE maps NULL order_state to '' so SQLite treats wildcard rows as unique per intent.
-- Without this, SQLite considers each NULL distinct and allows duplicate wildcard rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_auto_safe_pattern
ON auto_safe_patterns(intent, COALESCE(order_state, ''));

CREATE TABLE IF NOT EXISTS pipeline_run_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  order_state TEXT,
  risk_level TEXT NOT NULL,
  route TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviewer_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  ticket_id TEXT NOT NULL,
  action_id TEXT NOT NULL,
  reviewer_slack_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS judge_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  intent TEXT NOT NULL,
  order_state TEXT,
  risk_level TEXT NOT NULL,
  is_auto_safe INTEGER NOT NULL,
  reason TEXT,
  confidence TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

const SEED_PATTERNS: Omit<AutoSafePattern, 'id'>[] = [
  {
    intent: 'delivery_inquiry',
    order_state: 'in_transit',
    max_risk_level: 'low',
    enabled: 1,
    description: '배송 중 위치 조회 — Commerce API로 직접 답변 가능',
  },
  {
    intent: 'delivery_inquiry',
    order_state: 'delivered',
    max_risk_level: 'low',
    enabled: 1,
    description: '배송 완료 확인 조회 — 정보 제공 가능',
  },
  {
    intent: 'delivery_inquiry',
    order_state: 'cancelled',
    max_risk_level: 'low',
    enabled: 1,
    description: '취소된 주문 배송 조회 — 취소 확인 정보 제공 가능',
  },
  {
    intent: 'delivery_inquiry',
    order_state: 'returned',
    max_risk_level: 'low',
    enabled: 1,
    description: '반품 처리 중 배송 조회 — 반품 상태 정보 제공 가능',
  },
  {
    intent: 'delivery_inquiry',
    order_state: 'not_shipped',
    max_risk_level: 'low',
    enabled: 1,
    description: '미출고 주문 조회 — 출고 전 상태 안내 가능',
  },
  {
    intent: 'refund_request',
    order_state: null,
    max_risk_level: 'low',
    enabled: 1,
    description: '환불 자격 확인된 환불 요청 — 자격 API 확인 후 자동 처리 가능',
  },
  // general_inquiry + NULL 와일드카드는 의도적으로 제외.
  // general_inquiry는 catch-all intent로 범위가 너무 넓어 오분류 시
  // 위험한 케이스가 자동 처리될 수 있다.
];

const RISK_ORDER: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, critical: 3 };

let _kb: Database.Database | null = null;
export function get_kb(): Database.Database {
  if (!_kb) _kb = open_knowledge_db();
  return _kb;
}

export function close_kb(): void {
  if (_kb) { _kb.close(); _kb = null; }
}
process.on('exit', close_kb);

export function open_knowledge_db(db_path?: string): Database.Database {
  const resolved = db_path ?? process.env.KNOWLEDGE_DB_PATH ?? path.join(process.cwd(), 'knowledge.db');
  if (!db_path && !process.env.KNOWLEDGE_DB_PATH) {
    console.warn(
      `[knowledge-db] No explicit path — resolved to: ${resolved}. ` +
      'Set KNOWLEDGE_DB_PATH explicitly in production to avoid path drift.'
    );
  }
  const db = new Database(resolved);
  db.exec('PRAGMA journal_mode=WAL;');
  db.exec(SCHEMA);

  // INSERT OR IGNORE on every open: new patterns in SEED_PATTERNS are added without migration.
  // Existing rows are preserved as-is — changes to max_risk_level/description in code
  // do NOT propagate to already-seeded rows; those require a manual UPDATE or DB reset.
  const insert_or_ignore = db.prepare(
    'INSERT OR IGNORE INTO auto_safe_patterns (intent, order_state, max_risk_level, enabled, description) VALUES (?, ?, ?, ?, ?)'
  );
  db.transaction(() => {
    for (const p of SEED_PATTERNS) {
      insert_or_ignore.run(p.intent, p.order_state ?? null, p.max_risk_level, p.enabled, p.description ?? null);
    }
  })();

  return db;
}

export function is_auto_safe(
  db: Database.Database,
  intent: CustomerIntent,
  order_state: OrderState | null,
  risk_level: RiskLevel
): boolean {
  // Specific-wins: exact order_state match takes precedence over wildcard patterns.
  // This prevents a permissive wildcard from overriding a restrictive specific rule.
  if (order_state !== null) {
    const exact = db
      .prepare(
        `SELECT max_risk_level FROM auto_safe_patterns
         WHERE intent = ? AND order_state = ? AND enabled = 1`
      )
      .all(intent, order_state) as Pick<AutoSafePattern, 'max_risk_level'>[];

    if (exact.length > 0) {
      return exact.some((p) => RISK_ORDER[risk_level] <= RISK_ORDER[p.max_risk_level]);
    }
  }

  // Wildcard fallback: order_state IS NULL means "applies to any order state"
  const wildcard = db
    .prepare(
      `SELECT max_risk_level FROM auto_safe_patterns
       WHERE intent = ? AND order_state IS NULL AND enabled = 1`
    )
    .all(intent) as Pick<AutoSafePattern, 'max_risk_level'>[];

  return wildcard.some((p) => RISK_ORDER[risk_level] <= RISK_ORDER[p.max_risk_level]);
}

export function log_run_sample(db: Database.Database, sample: PipelineRunSample): void {
  db.prepare(
    'INSERT INTO pipeline_run_samples (run_id, intent, order_state, risk_level, route) VALUES (?, ?, ?, ?, ?)'
  ).run(sample.run_id, sample.intent, sample.order_state ?? null, sample.risk_level, sample.route);
}

export function log_reviewer_feedback(
  db: Database.Database,
  entry: {
    run_id: string;
    ticket_id: string;
    action_id: string;
    reviewer_slack_id?: string;
  }
): void {
  db.prepare(
    'INSERT INTO reviewer_feedback (run_id, ticket_id, action_id, reviewer_slack_id) VALUES (?, ?, ?, ?)'
  ).run(entry.run_id, entry.ticket_id, entry.action_id, entry.reviewer_slack_id ?? null);
}

export function log_judge_decision(
  db: Database.Database,
  entry: {
    run_id: string;
    intent: CustomerIntent;
    order_state: OrderState | null;
    risk_level: RiskLevel;
    is_auto_safe: boolean;
    reason: string;
    confidence: 'high' | 'medium' | 'low';
  }
): void {
  db.prepare(
    `INSERT INTO judge_decisions
     (run_id, intent, order_state, risk_level, is_auto_safe, reason, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.run_id,
    entry.intent,
    entry.order_state ?? null,
    entry.risk_level,
    entry.is_auto_safe ? 1 : 0,
    entry.reason,
    entry.confidence,
  );
}
