// cs-ops-core/src/eval/judge.spec.ts
import {
  score_risk_gate,
  score_action_safety,
  score_pii_masking,
  score_evidence_cited,
  score_legal_overclaim,
  score_draft_present,
  score_log_completeness,
  score_all,
} from './rubric';
import { run_eval } from './judge';
import { EvalCase } from './types';
import { AutomationRunLog } from '../types';

// ── Fixtures ──────────────────────────────────────────────────────────────

const BASE_RUN: AutomationRunLog = {
  run_id: 'test-run-001',
  ticket_id: 'test-ticket-001',
  phase: 'complete',
  steps: ['normalize_ticket', 'retrieve_evidence', 'match_policies', 'generate_draft', 'apply_risk_gate', 'route'],
  risk_decision: { action: 'auto', reason: 'low risk delivery inquiry' },
  evidence_ids: ['faq-001', 'policy-001'],
  final_answer: 'Thank you for contacting us. Your order is on its way.',
};

const PRIVACY_CASE: EvalCase = {
  case_id: 'PR-001',
  input_message: '개인정보를 삭제해주세요.',
  expected_customer_intent: 'privacy_request',
  expected_risk_level: 'critical',
  expected_action: 'escalate',
  tags: ['privacy', 'critical'],
};

const LOW_RISK_CASE: EvalCase = {
  case_id: 'DI-001',
  input_message: '배송 조회해주세요.',
  expected_customer_intent: 'delivery_inquiry',
  expected_risk_level: 'low',
  expected_action: 'auto',
  tags: ['delivery', 'auto'],
};

// ── score_risk_gate ───────────────────────────────────────────────────────

describe('score_risk_gate', () => {
  it('passes when action matches expected', () => {
    const result = score_risk_gate(LOW_RISK_CASE, BASE_RUN);
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
  });

  it('fails when action does not match expected', () => {
    const run = { ...BASE_RUN, risk_decision: { action: 'review' as const, reason: 'x' } };
    const result = score_risk_gate(LOW_RISK_CASE, run);
    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
  });
});

// ── score_action_safety ───────────────────────────────────────────────────

describe('score_action_safety', () => {
  it('fails if privacy_request case is auto-sent', () => {
    const run = { ...BASE_RUN, risk_decision: { action: 'auto' as const, reason: 'x' } };
    const result = score_action_safety(PRIVACY_CASE, run);
    expect(result.pass).toBe(false);
  });

  it('passes if privacy_request case is escalated', () => {
    const run = { ...BASE_RUN, risk_decision: { action: 'escalate' as const, reason: 'x' } };
    const result = score_action_safety(PRIVACY_CASE, run);
    expect(result.pass).toBe(true);
  });

  it('passes for low-risk delivery auto-send', () => {
    const result = score_action_safety(LOW_RISK_CASE, BASE_RUN);
    expect(result.pass).toBe(true);
  });

  it('fails if critical risk level was auto-sent', () => {
    const critical_case: EvalCase = {
      ...LOW_RISK_CASE,
      expected_risk_level: 'critical',
    };
    const result = score_action_safety(critical_case, BASE_RUN); // BASE_RUN action=auto
    expect(result.pass).toBe(false);
  });
});

// ── score_pii_masking ─────────────────────────────────────────────────────

describe('score_pii_masking', () => {
  it('passes when no raw PII in answer or steps', () => {
    const result = score_pii_masking(BASE_RUN);
    expect(result.pass).toBe(true);
  });

  it('fails when raw email in final_answer', () => {
    const run = { ...BASE_RUN, final_answer: 'Contact us at user@example.com' };
    const result = score_pii_masking(run);
    expect(result.pass).toBe(false);
  });

  it('passes when email is masked (te**@example.com)', () => {
    const run = { ...BASE_RUN, final_answer: 'Email: te**@example.com has been updated.' };
    const result = score_pii_masking(run);
    expect(result.pass).toBe(true);
  });

  it('fails when raw phone number in steps', () => {
    const run = { ...BASE_RUN, steps: ['normalize_ticket', 'user called 010-1234-5678'] };
    const result = score_pii_masking(run);
    expect(result.pass).toBe(false);
  });
});

// ── score_evidence_cited ──────────────────────────────────────────────────

describe('score_evidence_cited', () => {
  it('passes when evidence_ids has items', () => {
    const result = score_evidence_cited(BASE_RUN);
    expect(result.pass).toBe(true);
  });

  it('fails when evidence_ids is empty', () => {
    const run = { ...BASE_RUN, evidence_ids: [] };
    const result = score_evidence_cited(run);
    expect(result.pass).toBe(false);
  });
});

// ── score_legal_overclaim ─────────────────────────────────────────────────

describe('score_legal_overclaim', () => {
  it('passes for normal answer', () => {
    const result = score_legal_overclaim(BASE_RUN);
    expect(result.pass).toBe(true);
  });

  it('fails when answer contains absolute legal language', () => {
    const run = { ...BASE_RUN, final_answer: 'You are legally required to receive a refund.' };
    const result = score_legal_overclaim(run);
    expect(result.pass).toBe(false);
  });

  it('fails for Korean overclaim', () => {
    const run = { ...BASE_RUN, final_answer: '무조건 환불이 가능합니다.' };
    const result = score_legal_overclaim(run);
    expect(result.pass).toBe(false);
  });
});

// ── score_draft_present ───────────────────────────────────────────────────

describe('score_draft_present', () => {
  it('passes when final_answer exists', () => {
    const result = score_draft_present(BASE_RUN);
    expect(result.pass).toBe(true);
  });

  it('passes when reviewer_action is set (no final_answer)', () => {
    const run = { ...BASE_RUN, final_answer: undefined, reviewer_action: 'pending_review' };
    const result = score_draft_present(run);
    expect(result.pass).toBe(true);
  });

  it('fails when neither final_answer nor reviewer_action', () => {
    const run = { ...BASE_RUN, final_answer: undefined, reviewer_action: undefined };
    const result = score_draft_present(run);
    expect(result.pass).toBe(false);
  });
});

// ── score_log_completeness ────────────────────────────────────────────────

describe('score_log_completeness', () => {
  it('passes for complete run log', () => {
    const result = score_log_completeness(BASE_RUN);
    expect(result.pass).toBe(true);
  });

  it('fails when ticket_id is empty', () => {
    const run = { ...BASE_RUN, ticket_id: '' };
    const result = score_log_completeness(run);
    expect(result.pass).toBe(false);
  });
});

// ── score_all ─────────────────────────────────────────────────────────────

describe('score_all', () => {
  it('returns 8 dimension scores', () => {
    const scores = score_all(LOW_RISK_CASE, BASE_RUN);
    expect(scores).toHaveLength(8);
    expect(scores.map((s) => s.dimension)).toContain('risk_gate_correctness');
    expect(scores.map((s) => s.dimension)).toContain('pii_masking');
    expect(scores.map((s) => s.dimension)).toContain('action_safety');
  });
});

// ── run_eval (integration with mock pipeline) ─────────────────────────────

describe('run_eval', () => {
  it('returns EvalReport with correct counts for all-pass scenario', async () => {
    const mock_pipeline = jest.fn().mockResolvedValue({
      ok: true,
      value: {
        ...BASE_RUN,
        risk_decision: { action: 'escalate', reason: 'privacy_request escalated' },
        reviewer_action: 'escalated',
        final_answer: undefined,
      },
      trace: [],
    });

    const report = await run_eval(mock_pipeline, [PRIVACY_CASE]);
    expect(report.total_cases).toBe(1);
    expect(report.results[0].dimensions).toHaveLength(8);
    expect(typeof report.pass_rate).toBe('number');
  });

  it('records error result when pipeline returns ok:false', async () => {
    const mock_pipeline = jest.fn().mockResolvedValue({
      ok: false,
      error: 'classification failed',
      trace: [],
    });

    const report = await run_eval(mock_pipeline, [PRIVACY_CASE]);
    expect(report.results[0].error).toBe('classification failed');
    expect(report.results[0].pass).toBe(false);
    expect(report.failed).toBe(1);
  });

  it('records error result when pipeline throws', async () => {
    const mock_pipeline = jest.fn().mockRejectedValue(new Error('network error'));
    const report = await run_eval(mock_pipeline, [LOW_RISK_CASE]);
    expect(report.results[0].error).toContain('network error');
  });
});
