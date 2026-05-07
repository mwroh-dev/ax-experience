// cs-ops-core/src/knowledge/pattern-suggester.spec.ts
import Database from 'better-sqlite3';
import { open_knowledge_db, log_run_sample, log_reviewer_feedback } from './db';
import { suggest_kb_patterns, KbPatternCandidate } from './pattern-suggester';

describe('suggest_kb_patterns', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = open_knowledge_db(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('returns empty array when no samples', () => {
    const results = suggest_kb_patterns(db);
    expect(results).toEqual([]);
  });

  it('suggests pattern when (intent, order_state, risk_level) appears >= min_samples times', () => {
    for (let i = 0; i < 5; i++) {
      log_run_sample(db, {
        run_id: `run-${i}`,
        intent: 'exchange_request',
        order_state: 'delivered',
        risk_level: 'low',
        route: 'auto',
      });
    }

    const results = suggest_kb_patterns(db, 5);
    expect(results).toHaveLength(1);
    expect(results[0].intent).toBe('exchange_request');
    expect(results[0].order_state).toBe('delivered');
    expect(results[0].sample_count).toBe(5);
  });

  it('excludes combinations already in auto_safe_patterns', () => {
    // delivery_inquiry + in_transit is seeded by default in open_knowledge_db
    for (let i = 0; i < 10; i++) {
      log_run_sample(db, {
        run_id: `run-d-${i}`,
        intent: 'delivery_inquiry',
        order_state: 'in_transit',
        risk_level: 'low',
        route: 'auto',
      });
    }

    const results = suggest_kb_patterns(db, 5);
    const has_delivery_in_transit = results.some(
      (r) => r.intent === 'delivery_inquiry' && r.order_state === 'in_transit'
    );
    expect(has_delivery_in_transit).toBe(false);
  });

  it('counts approvals and escalations from reviewer_feedback', () => {
    for (let i = 0; i < 5; i++) {
      log_run_sample(db, {
        run_id: `run-r-${i}`,
        intent: 'complaint',
        order_state: 'delivered',
        risk_level: 'medium',
        route: 'review',
      });
    }
    log_reviewer_feedback(db, { run_id: 'run-r-0', ticket_id: 'tkt-0', action_id: 'cs_review_approve' });
    log_reviewer_feedback(db, { run_id: 'run-r-1', ticket_id: 'tkt-1', action_id: 'cs_review_approve' });
    log_reviewer_feedback(db, { run_id: 'run-r-2', ticket_id: 'tkt-2', action_id: 'cs_review_escalate' });

    const results = suggest_kb_patterns(db, 5);
    const complaint = results.find((r) => r.intent === 'complaint');
    expect(complaint).toBeDefined();
    expect(complaint!.approve_count).toBe(2);
    expect(complaint!.escalate_count).toBe(1);
  });

  it('sample_count is not inflated when one run has multiple feedback rows', () => {
    for (let i = 0; i < 5; i++) {
      log_run_sample(db, {
        run_id: `run-fanout-${i}`,
        intent: 'general_inquiry',
        order_state: null,
        risk_level: 'low',
        route: 'review',
      });
    }
    // run-fanout-0 gets two feedback rows — must not inflate sample_count to 6
    log_reviewer_feedback(db, { run_id: 'run-fanout-0', ticket_id: 'tkt-f0', action_id: 'cs_review_approve' });
    log_reviewer_feedback(db, { run_id: 'run-fanout-0', ticket_id: 'tkt-f0', action_id: 'cs_review_escalate' });
    log_reviewer_feedback(db, { run_id: 'run-fanout-1', ticket_id: 'tkt-f1', action_id: 'cs_review_approve' });

    const results = suggest_kb_patterns(db, 5);
    const row = results.find((r) => r.intent === 'general_inquiry');
    expect(row).toBeDefined();
    expect(row!.sample_count).toBe(5);
    expect(row!.approve_count).toBe(2);
    expect(row!.escalate_count).toBe(1);
  });

  it('does not suggest below min_samples threshold', () => {
    for (let i = 0; i < 4; i++) {
      log_run_sample(db, {
        run_id: `run-below-${i}`,
        intent: 'subscription_cancel',
        order_state: null,
        risk_level: 'low',
        route: 'auto',
      });
    }

    const results = suggest_kb_patterns(db, 5);
    expect(results.find((r) => r.intent === 'subscription_cancel')).toBeUndefined();
  });
});
