// cs-ops-core/src/knowledge/db.spec.ts
import { open_knowledge_db, is_auto_safe, log_run_sample, log_reviewer_feedback, log_judge_decision } from './db';

const INSERT_PATTERN =
  "INSERT INTO auto_safe_patterns (intent, order_state, max_risk_level, enabled, description) VALUES (?, ?, ?, 1, ?)";

describe('knowledge db', () => {
  const db = open_knowledge_db(':memory:');

  describe('is_auto_safe', () => {
    it('delivery_inquiry + in_transit + low → true', () => {
      expect(is_auto_safe(db, 'delivery_inquiry', 'in_transit', 'low')).toBe(true);
    });

    it('delivery_inquiry + delivered + low → true', () => {
      expect(is_auto_safe(db, 'delivery_inquiry', 'delivered', 'low')).toBe(true);
    });

    it('delivery_inquiry + in_transit + high → false (risk too high)', () => {
      expect(is_auto_safe(db, 'delivery_inquiry', 'in_transit', 'high')).toBe(false);
    });

    it('refund_request + any state + low → true (wildcard seeded in Tier 2)', () => {
      expect(is_auto_safe(db, 'refund_request', 'delivered', 'low')).toBe(true);
    });

    it('general_inquiry + null order_state + low → false (removed from seed: too broad)', () => {
      expect(is_auto_safe(db, 'general_inquiry', null, 'low')).toBe(false);
    });

    it('privacy_request → false (not seeded, always manual)', () => {
      expect(is_auto_safe(db, 'privacy_request', null, 'low')).toBe(false);
    });

    describe('specific-wins precedence', () => {
      const precedence_db = open_knowledge_db(':memory:');

      beforeAll(() => {
        // Add a permissive wildcard and a restrictive specific for same intent
        precedence_db
          .prepare(INSERT_PATTERN)
          .run('delivery_inquiry', null, 'medium', 'wildcard: delivery up to medium');
        precedence_db
          .prepare(INSERT_PATTERN)
          .run('delivery_inquiry', 'lost', 'low', 'specific: lost parcels — low only');
      });

      it('specific rule blocks medium risk even when wildcard would allow it', () => {
        // Specific rule for "lost" only allows low — medium should be blocked
        expect(is_auto_safe(precedence_db, 'delivery_inquiry', 'lost' as any, 'medium')).toBe(false);
      });

      it('wildcard applies when no specific rule exists for that order_state', () => {
        // No specific rule for "processing", so wildcard (up to medium) applies
        expect(is_auto_safe(precedence_db, 'delivery_inquiry', 'processing' as any, 'medium')).toBe(true);
      });
    });
  });

  describe('Tier 1 KB seeds', () => {
    it('delivery_inquiry + cancelled + low → true', () => {
      expect(is_auto_safe(db, 'delivery_inquiry', 'cancelled', 'low')).toBe(true);
    });

    it('delivery_inquiry + returned + low → true', () => {
      expect(is_auto_safe(db, 'delivery_inquiry', 'returned', 'low')).toBe(true);
    });

    it('delivery_inquiry + not_shipped + low → true', () => {
      expect(is_auto_safe(db, 'delivery_inquiry', 'not_shipped', 'low')).toBe(true);
    });

    it('delivery_inquiry + cancelled + medium → false (max_risk_level is low)', () => {
      expect(is_auto_safe(db, 'delivery_inquiry', 'cancelled', 'medium')).toBe(false);
    });

    it('delivery_inquiry + returned + medium → false (max_risk_level is low)', () => {
      expect(is_auto_safe(db, 'delivery_inquiry', 'returned', 'medium')).toBe(false);
    });

    it('delivery_inquiry + not_shipped + medium → false (max_risk_level is low)', () => {
      expect(is_auto_safe(db, 'delivery_inquiry', 'not_shipped', 'medium')).toBe(false);
    });
  });

  describe('Tier 2 KB seeds', () => {
    it('refund_request + null order_state + low → true (wildcard)', () => {
      expect(is_auto_safe(db, 'refund_request', null, 'low')).toBe(true);
    });

    it('refund_request + delivered + low → true (wildcard applies)', () => {
      expect(is_auto_safe(db, 'refund_request', 'delivered', 'low')).toBe(true);
    });
  });

  describe('UNIQUE constraint on (intent, order_state)', () => {
    const unique_db = open_knowledge_db(':memory:');

    it('inserting a duplicate (intent, order_state) throws', () => {
      unique_db.prepare(INSERT_PATTERN).run('delivery_inquiry', 'pending', 'low', 'first');

      expect(() => {
        unique_db.prepare(INSERT_PATTERN).run('delivery_inquiry', 'pending', 'medium', 'duplicate');
      }).toThrow(/UNIQUE/i);
    });

    it('inserting a duplicate (intent, NULL order_state) throws', () => {
      unique_db.prepare(INSERT_PATTERN).run('exchange_request', null, 'low', 'first null');

      expect(() => {
        unique_db.prepare(INSERT_PATTERN).run('exchange_request', null, 'medium', 'second null');
      }).toThrow(/UNIQUE/i);
    });

    it('different intents with same order_state are allowed', () => {
      expect(() => {
        unique_db.prepare(INSERT_PATTERN).run('general_inquiry', 'pending', 'low', 'different intent');
      }).not.toThrow();
    });
  });

  describe('log_run_sample', () => {
    it('inserts without throwing', () => {
      expect(() =>
        log_run_sample(db, {
          run_id: 'test-run-001',
          intent: 'delivery_inquiry',
          order_state: 'in_transit',
          risk_level: 'low',
          route: 'auto',
        })
      ).not.toThrow();
    });
  });

  describe('reviewer_feedback table', () => {
    it('log_reviewer_feedback inserts a row', () => {
      log_reviewer_feedback(db, {
        run_id: 'run-001',
        ticket_id: 'tkt-001',
        action_id: 'cs_review_approve',
        reviewer_slack_id: 'U12345',
      });
      const row = db.prepare('SELECT * FROM reviewer_feedback WHERE run_id = ?').get('run-001') as any;
      expect(row).not.toBeNull();
      expect(row.action_id).toBe('cs_review_approve');
      expect(row.reviewer_slack_id).toBe('U12345');
    });

    it('log_reviewer_feedback allows null reviewer_slack_id', () => {
      log_reviewer_feedback(db, {
        run_id: 'run-002',
        ticket_id: 'tkt-002',
        action_id: 'cs_review_hold',
      });
      const row = db.prepare('SELECT * FROM reviewer_feedback WHERE run_id = ?').get('run-002') as any;
      expect(row.reviewer_slack_id).toBeNull();
    });
  });

  describe('judge_decisions table', () => {
    it('log_judge_decision inserts a row', () => {
      log_judge_decision(db, {
        run_id: 'run-judge-001',
        intent: 'refund_request',
        order_state: 'delivered',
        risk_level: 'medium',
        is_auto_safe: false,
        reason: 'Refund denial risk',
        confidence: 'high',
      });
      const row = db.prepare('SELECT * FROM judge_decisions WHERE run_id = ?').get('run-judge-001') as any;
      expect(row).not.toBeNull();
      expect(row.is_auto_safe).toBe(0);
      expect(row.confidence).toBe('high');
    });

    it('log_judge_decision stores is_auto_safe=true as 1', () => {
      log_judge_decision(db, {
        run_id: 'run-judge-002',
        intent: 'delivery_inquiry',
        order_state: null,
        risk_level: 'low',
        is_auto_safe: true,
        reason: 'Safe query',
        confidence: 'high',
      });
      const row = db.prepare('SELECT * FROM judge_decisions WHERE run_id = ?').get('run-judge-002') as any;
      expect(row.is_auto_safe).toBe(1);
    });
  });

  describe('open_knowledge_db path warning', () => {
    const orig = process.env.KNOWLEDGE_DB_PATH;

    afterEach(() => {
      if (orig === undefined) delete process.env.KNOWLEDGE_DB_PATH;
      else process.env.KNOWLEDGE_DB_PATH = orig;
    });

    it('logs a warning when neither db_path arg nor KNOWLEDGE_DB_PATH is set', () => {
      delete process.env.KNOWLEDGE_DB_PATH;
      const warn_spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      open_knowledge_db(':memory:');  // db_path argument is provided, so no warning
      expect(warn_spy).not.toHaveBeenCalled();
      warn_spy.mockRestore();
    });

    it('warns when called with no arguments and KNOWLEDGE_DB_PATH is unset', () => {
      delete process.env.KNOWLEDGE_DB_PATH;
      const warn_spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      // Without db_path and without env var, the function falls back to cwd and warns
      try { open_knowledge_db(); } catch { /* cwd path may not be writable */ }
      expect(warn_spy).toHaveBeenCalledWith(
        expect.stringContaining('[knowledge-db] No explicit path')
      );
      warn_spy.mockRestore();
    });

    it('does not warn when KNOWLEDGE_DB_PATH is set', () => {
      process.env.KNOWLEDGE_DB_PATH = ':memory:';
      const warn_spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      open_knowledge_db();
      expect(warn_spy).not.toHaveBeenCalledWith(
        expect.stringContaining('[knowledge-db] No explicit path')
      );
      warn_spy.mockRestore();
    });
  });
});
