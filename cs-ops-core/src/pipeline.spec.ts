// cs-ops-core/src/pipeline.spec.ts
// AC 8: process_cs_message with customer_intent=privacy_request
//        produces FlowResult with risk_decision=escalate
// AC 6: route=hold path calls call_cs_bot keep_summary mode

// ---- Module mocks (hoisted by Jest) ----
jest.mock('./classifier/ticket');
jest.mock('./evidence/retriever');
jest.mock('./draft/generator');
jest.mock('./logging/automation-run');
jest.mock('./knowledge/db', () => ({
  get_kb: jest.fn().mockReturnValue({}),
  open_knowledge_db: jest.fn().mockReturnValue({}),
  is_auto_safe: jest.fn().mockReturnValue(false),
  log_run_sample: jest.fn(),
  log_judge_decision: jest.fn(),
}));
jest.mock('./lib/llm-judge', () => ({
  claude_cli_judge: jest.fn().mockResolvedValue({
    ok: true,
    value: { is_auto_safe: true, reason: 'mock', confidence: 'high' },
    trace: [],
  }),
  passthrough_judge: jest.fn().mockResolvedValue({
    ok: true,
    value: { is_auto_safe: true, reason: 'passthrough', confidence: 'high' },
    trace: [],
  }),
}));
jest.mock('./llm/claude-cli-draft-adapter', () => ({
  claude_cli_draft_adapter: { generateDraft: jest.fn() },
  claude_cli_summary_adapter: { keepSummary: jest.fn().mockResolvedValue({ summary: 'mock summary' }) },
}));
jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({
    chat: {
      postMessage: jest.fn().mockResolvedValue({ ok: true }),
    },
  })),
}));

import { process_cs_message } from './pipeline';
import { normalize_ticket } from './classifier/ticket';
import { retrieve_evidence } from './evidence/retriever';
import { generate_draft } from './draft/generator';
import { log_automation_run } from './logging/automation-run';
import { claude_cli_summary_adapter } from './llm/claude-cli-draft-adapter';
import { Ticket, EvidenceBundle, Draft } from './types';
import { KB_FAST_PATH_REASON } from './pipeline';
import * as knowledge_db_module from './knowledge/db';

const mock_normalize_ticket = normalize_ticket as jest.MockedFunction<typeof normalize_ticket>;
const mock_retrieve_evidence = retrieve_evidence as jest.MockedFunction<typeof retrieve_evidence>;
const mock_generate_draft = generate_draft as jest.MockedFunction<typeof generate_draft>;
const mock_log_automation_run = log_automation_run as jest.MockedFunction<typeof log_automation_run>;
const mock_summary_llm = claude_cli_summary_adapter as jest.Mocked<typeof claude_cli_summary_adapter>;
const mock_is_auto_safe = knowledge_db_module.is_auto_safe as jest.MockedFunction<typeof knowledge_db_module.is_auto_safe>;
const mock_log_judge_decision = knowledge_db_module.log_judge_decision as jest.MockedFunction<typeof knowledge_db_module.log_judge_decision>;

beforeEach(() => {
  mock_is_auto_safe.mockReturnValue(false);  // Default: not in KB (use full pipeline path)
});

// ---- Fixtures ----
const privacy_ticket: Ticket = {
  ticket_id: 'test-ticket-privacy-001',
  customer_intent: 'privacy_request',
  issue_reason: 'data_breach_concern',
  order_state: 'no_order',
  risk_level: 'critical',
  evidence_required: ['legal_reference'],
  human_review_required: true,
  recommended_action: 'escalate',
};

// Delivery inquiry ticket — no escalation trigger → routes to review (hold)
const hold_ticket: Ticket = {
  ticket_id: 'test-ticket-hold-001',
  customer_intent: 'delivery_inquiry',
  issue_reason: 'late_delivery',
  order_state: 'in_transit',
  risk_level: 'medium',
  evidence_required: ['delivery_proof'],
  human_review_required: false,
  recommended_action: 'human_review',
};

const minimal_bundle: EvidenceBundle = {
  ticket: privacy_ticket,
  faq_matches: [],
  policy_matches: [],
  legal_references: [],
};

// Bundle for hold path — empty policy_matches forces NO_MATCH → review route
const hold_bundle: EvidenceBundle = {
  ticket: hold_ticket,
  faq_matches: [],
  policy_matches: [],
  legal_references: [],
};

const minimal_draft: Draft = {
  text: 'We have received your privacy request and will process it according to applicable regulations.',
  evidence_ids: [],
  template_used: 'mode:answer_draft confidence:high',
};

const trace_entry = { step: 'test', started_at: Date.now(), duration_ms: 1, ok: true as const };

// ---- Tests ----
describe('process_cs_message — privacy_request → escalate (AC 8)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mock_normalize_ticket.mockResolvedValue({
      ok: true,
      value: privacy_ticket,
      trace: [trace_entry],
    });

    mock_retrieve_evidence.mockResolvedValue({
      ok: true,
      value: minimal_bundle,
      trace: [trace_entry],
    });

    mock_generate_draft.mockResolvedValue({
      ok: true,
      value: minimal_draft,
      trace: [trace_entry],
    });

    mock_log_automation_run.mockResolvedValue(undefined);
  });

  it('returns FlowResult with ok=true', async () => {
    const result = await process_cs_message(
      'Please delete all my personal data immediately',
      '1700000000.000000'
    );
    expect(result.ok).toBe(true);
  });

  it('produces risk_decision.action = escalate for privacy_request', async () => {
    const result = await process_cs_message(
      'Please delete all my personal data immediately',
      '1700000000.000000'
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.risk_decision.action).toBe('escalate');
    }
  });

  it('risk_decision.reason is a non-empty string', async () => {
    const result = await process_cs_message(
      'I want my data erased under GDPR',
      '1700000000.000001'
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.risk_decision.reason).toBeTruthy();
      expect(typeof result.value.risk_decision.reason).toBe('string');
    }
  });

  it('logs the run via log_automation_run', async () => {
    await process_cs_message(
      'Please delete all my personal data immediately',
      '1700000000.000000'
    );
    expect(mock_log_automation_run).toHaveBeenCalledTimes(1);
    const logged = mock_log_automation_run.mock.calls[0][0];
    expect(logged.risk_decision.action).toBe('escalate');
  });

  it('logged run contains expected steps', async () => {
    await process_cs_message(
      'Delete my account and all data',
      '1700000000.000002'
    );
    const logged = mock_log_automation_run.mock.calls[0][0];
    expect(logged.steps).toContain('normalize_ticket');
    expect(logged.steps).toContain('retrieve_evidence');
    expect(logged.steps).toContain('apply_risk_gate');
  });

  it('reviewer_action is set to escalated in the logged run', async () => {
    await process_cs_message(
      'I request deletion of my personal information',
      '1700000000.000003'
    );
    const logged = mock_log_automation_run.mock.calls[0][0];
    expect(logged.reviewer_action).toBe('escalated');
  });

  it('result value includes the ticket_id from the normalized ticket', async () => {
    const result = await process_cs_message(
      'Please delete all my personal data immediately',
      '1700000000.000000'
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.ticket_id).toBe(privacy_ticket.ticket_id);
    }
  });

  describe('short-circuit behaviour on upstream failure', () => {
    it('returns FlowResult ok=false when normalize_ticket fails', async () => {
      mock_normalize_ticket.mockResolvedValue({
        ok: false,
        error: 'LLM unreachable',
        step: 'normalize_ticket',
        trace: [{ ...trace_entry, ok: false }],
      });

      const result = await process_cs_message('test', '0.0');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.step).toBe('normalize_ticket');
      }
    });

    it('calls log_automation_run even when normalize_ticket fails', async () => {
      mock_normalize_ticket.mockResolvedValue({
        ok: false,
        error: 'LLM unreachable',
        step: 'normalize_ticket',
        trace: [{ ...trace_entry, ok: false }],
      });

      await process_cs_message('test', '0.0');
      expect(mock_log_automation_run).toHaveBeenCalledTimes(1);
    });
  });
});

// ---- AC 6: Hold path — keep_summary integration ----
describe('process_cs_message — review/hold path with keep_summary (AC 6)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mock_normalize_ticket.mockResolvedValue({
      ok: true,
      value: hold_ticket,
      trace: [trace_entry],
    });

    mock_retrieve_evidence.mockResolvedValue({
      ok: true,
      value: hold_bundle,
      trace: [trace_entry],
    });

    mock_generate_draft.mockResolvedValue({
      ok: true,
      value: minimal_draft,
      trace: [trace_entry],
    });

    mock_log_automation_run.mockResolvedValue(undefined);
  });

  it('stores hold_summary when keep_summary succeeds', async () => {
    (mock_summary_llm.keepSummary as jest.Mock).mockResolvedValueOnce({
      summary: 'Customer inquiry about delivery delay. Ticket placed on hold for agent review.',
    });

    const result = await process_cs_message('Where is my package?', '1700000000.000010');
    expect(result.ok).toBe(true);

    const logged = mock_log_automation_run.mock.calls[0][0];
    expect(logged.hold_summary).toBe(
      'Customer inquiry about delivery delay. Ticket placed on hold for agent review.',
    );
    // final_answer should be populated from hold_summary (not already set for non-auto path)
    expect(logged.final_answer).toBe(
      'Customer inquiry about delivery delay. Ticket placed on hold for agent review.',
    );
    // Risk decision must be review (not escalate/auto)
    expect(logged.risk_decision.action).toBe('review');
  });

  it('pipeline succeeds and hold_summary is undefined when keep_summary throws', async () => {
    (mock_summary_llm.keepSummary as jest.Mock).mockRejectedValueOnce(new Error('LLM timeout'));

    const result = await process_cs_message('Where is my package?', '1700000000.000011');
    // Pipeline should complete successfully despite keep_summary failure
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hold_summary).toBeUndefined();
      // final_answer also undefined since no summary was generated
      expect(result.value.final_answer).toBeUndefined();
    }
  });

  it('does not call keep_summary on the escalate path', async () => {
    // Re-configure for escalate path (privacy_request ticket)
    mock_normalize_ticket.mockResolvedValue({
      ok: true,
      value: privacy_ticket,
      trace: [trace_entry],
    });
    mock_retrieve_evidence.mockResolvedValue({
      ok: true,
      value: minimal_bundle,
      trace: [trace_entry],
    });

    await process_cs_message('Delete all my data', '1700000000.000012');
    // claude_cli_summary_adapter.keepSummary should NOT be called on the escalate path
    expect(mock_summary_llm.keepSummary).not.toHaveBeenCalled();
  });
});

// ---- AC: KB fast-path ----
describe('process_cs_message — KB fast-path for known auto-safe queries', () => {
  const delivery_ticket_low: Ticket = {
    ticket_id: 'test-kb-001',
    customer_intent: 'delivery_inquiry',
    issue_reason: 'late_delivery',
    order_state: 'in_transit',
    risk_level: 'low',
    evidence_required: ['order_status'],
    human_review_required: false,
    recommended_action: 'auto_respond',
  };

  const delivery_bundle: EvidenceBundle = {
    ticket: delivery_ticket_low,
    faq_matches: [],
    policy_matches: [],
    legal_references: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mock_is_auto_safe.mockReturnValue(true);  // KB says safe for these tests

    mock_normalize_ticket.mockResolvedValue({
      ok: true,
      value: delivery_ticket_low,
      trace: [trace_entry],
    });

    mock_retrieve_evidence.mockResolvedValue({
      ok: true,
      value: delivery_bundle,
      trace: [trace_entry],
    });

    mock_generate_draft.mockResolvedValue({
      ok: true,
      value: minimal_draft,
      trace: [trace_entry],
    });

    mock_log_automation_run.mockResolvedValue(undefined);
  });

  it('routes via KB fast-path when is_auto_safe returns true', async () => {
    const result = await process_cs_message('배송이 어디까지 왔어요?', 'ts-kb-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.risk_decision.reason).toBe(KB_FAST_PATH_REASON);
    }
  });

  it('KB fast-path sets reviewer_action to auto_suppressed when CS_OPS_ALLOW_AUTO_SEND is not true', async () => {
    delete process.env.CS_OPS_ALLOW_AUTO_SEND;
    const result = await process_cs_message('배송이 어디까지 왔어요?', 'ts-kb-2');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.reviewer_action).toBe('auto_suppressed');
    }
  });

  it('KB fast-path steps include retrieve_evidence and generate_draft', async () => {
    mock_normalize_ticket.mockResolvedValue({ ok: true, value: delivery_ticket_low, trace: [] });

    const result = await process_cs_message('배송 어디쯤인가요?', '111.000');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.steps).toContain('retrieve_evidence');
    expect(result.value.steps).toContain('generate_draft');
    expect(result.value.steps).toContain('knowledge_db_fast_path');
  });

  it('KB fast-path fallthrough trims steps so retrieve_evidence appears exactly once', async () => {
    mock_normalize_ticket.mockResolvedValue({ ok: true, value: delivery_ticket_low, trace: [] });

    // First call (fast-path attempt) fails — triggers steps.length = kb_sub_start trim + fallthrough
    mock_retrieve_evidence.mockResolvedValueOnce({
      ok: false,
      error: 'evidence fetch failed',
      step: 'retrieve_evidence',
      trace: [],
    });
    // Subsequent call (normal pipeline) uses the beforeEach default (success)

    const result = await process_cs_message('배송 어디쯤인가요?', '111.001');

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Trim guard: retrieve_evidence must appear exactly once (not twice)
    const retrieve_count = result.value.steps.filter(s => s === 'retrieve_evidence').length;
    expect(retrieve_count).toBe(1);

    // knowledge_db_fast_path marker is preserved in steps even on fallthrough
    expect(result.value.steps).toContain('knowledge_db_fast_path');
  });
});

// ---- AC: KB fast-path refund eligibility gate ----
describe('KB fast-path refund eligibility gate', () => {
  const refund_ticket: Ticket = {
    ticket_id: 'test-ticket-refund-001',
    customer_intent: 'refund_request',
    issue_reason: 'changed_mind',
    order_state: 'delivered',
    risk_level: 'low',
    evidence_required: ['refund_eligibility'],
    human_review_required: false,
    recommended_action: 'auto_respond',
  };

  function make_refund_bundle(eligible: boolean | undefined): EvidenceBundle {
    return {
      ticket: refund_ticket,
      refund_eligibility: eligible !== undefined
        ? { eligible, reason: 'test', daysReturn: 30, withinWindow: eligible }
        : undefined,
      faq_matches: [],
      policy_matches: [],
      legal_references: [],
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mock_is_auto_safe.mockReturnValue(true);

    mock_normalize_ticket.mockResolvedValue({
      ok: true,
      value: refund_ticket,
      trace: [trace_entry],
    });

    mock_log_automation_run.mockResolvedValue(undefined);
  });

  it('refund_request + eligible=true → returns auto result (kb_fast_path taken)', async () => {
    mock_retrieve_evidence.mockResolvedValueOnce({
      ok: true,
      value: make_refund_bundle(true),
      trace: [],
    });
    mock_generate_draft.mockResolvedValueOnce({
      ok: true,
      value: { text: 'auto-refund', evidence_ids: [] },
      trace: [],
    });

    const result = await process_cs_message('환불 요청합니다.', 'ts-refund-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.risk_decision.reason).toBe(KB_FAST_PATH_REASON);
      expect(['auto_sent', 'auto_suppressed']).toContain(result.value.reviewer_action);
    }
  });

  it('refund_request + eligible=false → falls through to normal pipeline', async () => {
    mock_retrieve_evidence.mockResolvedValue({
      ok: true,
      value: make_refund_bundle(false),
      trace: [],
    });
    mock_generate_draft.mockResolvedValue({
      ok: true,
      value: { text: 'draft', evidence_ids: [] },
      trace: [],
    });

    const result = await process_cs_message('환불 요청합니다.', 'ts-refund-2');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.risk_decision.reason).not.toBe(KB_FAST_PATH_REASON);
    }
  });

  it('refund_request + no refund_eligibility in bundle → falls through to normal pipeline', async () => {
    mock_retrieve_evidence.mockResolvedValue({
      ok: true,
      value: make_refund_bundle(undefined),
      trace: [],
    });
    mock_generate_draft.mockResolvedValue({
      ok: true,
      value: { text: 'draft', evidence_ids: [] },
      trace: [],
    });

    const result = await process_cs_message('환불 요청합니다.', 'ts-refund-3');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.risk_decision.reason).not.toBe(KB_FAST_PATH_REASON);
    }
  });

  it('delivery_inquiry (non-refund) + kb_safe → returns auto result (eligibility gate skipped)', async () => {
    const delivery_ticket_low: Ticket = {
      ticket_id: 'test-ticket-delivery-kb-001',
      customer_intent: 'delivery_inquiry',
      issue_reason: 'late_delivery',
      order_state: 'in_transit',
      risk_level: 'low',
      evidence_required: ['order_status'],
      human_review_required: false,
      recommended_action: 'auto_respond',
    };

    mock_normalize_ticket.mockResolvedValue({
      ok: true,
      value: delivery_ticket_low,
      trace: [trace_entry],
    });

    mock_retrieve_evidence.mockResolvedValueOnce({
      ok: true,
      value: { ticket: delivery_ticket_low, faq_matches: [], policy_matches: [], legal_references: [] },
      trace: [],
    });
    mock_generate_draft.mockResolvedValueOnce({
      ok: true,
      value: { text: 'delivery auto', evidence_ids: [] },
      trace: [],
    });

    const result = await process_cs_message('배송 조회해주세요.', 'ts-refund-4');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.risk_decision.reason).toBe(KB_FAST_PATH_REASON);
    }
  });
});

// ---- AC: Judge demotion ----
describe('process_cs_message — LLM judge demotes gate auto to review', () => {
  const auto_ticket: Ticket = {
    ticket_id: 'test-judge-demotion-001',
    customer_intent: 'general_inquiry',
    issue_reason: 'other',
    order_state: 'unknown',
    risk_level: 'low',
    evidence_required: [],
    human_review_required: false,
    recommended_action: 'auto_respond',
  };

  const auto_bundle: EvidenceBundle = {
    ticket: auto_ticket,
    faq_matches: [],
    policy_matches: [],
    legal_references: [],
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reviewer_action is judge_demoted_to_review when judge says not safe', async () => {
    mock_is_auto_safe.mockReturnValue(false);

    mock_normalize_ticket.mockResolvedValue({
      ok: true,
      value: auto_ticket,
      trace: [trace_entry],
    });

    mock_retrieve_evidence.mockResolvedValue({
      ok: true,
      value: auto_bundle,
      trace: [trace_entry],
    });

    mock_generate_draft.mockResolvedValue({
      ok: true,
      value: minimal_draft,
      trace: [trace_entry],
    });

    mock_log_automation_run.mockResolvedValue(undefined);

    const matcher_module = require('./policy/matcher');
    jest.spyOn(matcher_module, 'match_policies').mockReturnValue([
      { rule_id: 'test-rule', action: 'auto_respond', confidence: 1, evidence_used: [] },
    ]);

    const unsafe_judge = async () => ({
      ok: true as const,
      value: { is_auto_safe: false, reason: 'edge case detected', confidence: 'medium' as const },
      trace: [],
    });

    const result = await process_cs_message('일반 문의입니다.', 'ts-judge-1', unsafe_judge);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.reviewer_action).toBe('judge_demoted_to_review');
    }

    jest.restoreAllMocks();
  });
});

describe('process_cs_message — judge decision logging', () => {
  const auto_ticket: Ticket = {
    ticket_id: 'test-judge-log-001',
    customer_intent: 'general_inquiry',
    issue_reason: 'other',
    order_state: 'unknown',
    risk_level: 'low',
    evidence_required: [],
    human_review_required: false,
    recommended_action: 'auto_respond',
  };

  const auto_bundle: EvidenceBundle = {
    ticket: auto_ticket,
    faq_matches: [],
    policy_matches: [],
    legal_references: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mock_is_auto_safe.mockReturnValue(false);
    mock_normalize_ticket.mockResolvedValue({ ok: true, value: auto_ticket, trace: [trace_entry] });
    mock_retrieve_evidence.mockResolvedValue({ ok: true, value: auto_bundle, trace: [trace_entry] });
    mock_generate_draft.mockResolvedValue({ ok: true, value: minimal_draft, trace: [trace_entry] });
    mock_log_automation_run.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs judge decision when judge runs on auto route', async () => {
    const matcher_module = require('./policy/matcher');
    jest.spyOn(matcher_module, 'match_policies').mockReturnValue([
      { rule_id: 'test-rule', action: 'auto_respond', confidence: 1, evidence_used: [] },
    ]);

    const safe_judge = async () => ({
      ok: true as const,
      value: { is_auto_safe: true, reason: 'safe query', confidence: 'high' as const },
      trace: [],
    });

    await process_cs_message('배송 조회해주세요.', 'ts-judge-log-1', safe_judge);

    expect(mock_log_judge_decision).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        is_auto_safe: true,
        reason: 'safe query',
        confidence: 'high',
      })
    );
  });

  it('does not log judge decision on KB fast-path', async () => {
    mock_is_auto_safe.mockReturnValue(true);

    await process_cs_message('배송 조회해주세요.', 'ts-judge-log-2');

    expect(mock_log_judge_decision).not.toHaveBeenCalled();
  });

  it('logs sentinel judge decision with confidence=low when judge call fails', async () => {
    const matcher_module = require('./policy/matcher');
    jest.spyOn(matcher_module, 'match_policies').mockReturnValue([
      { rule_id: 'test-rule', action: 'auto_respond', confidence: 1, evidence_used: [] },
    ]);

    const failing_judge = async () => ({
      ok: false as const,
      error: 'LLM unavailable',
      step: 'llm_judge',
      trace: [],
    });

    await process_cs_message('일반 문의입니다.', 'ts-judge-log-3', failing_judge);

    expect(mock_log_judge_decision).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        is_auto_safe: true,
        confidence: 'low',
        reason: expect.stringContaining('judge call failed'),
      })
    );
  });
});
