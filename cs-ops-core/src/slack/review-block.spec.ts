// cs-ops-core/src/slack/review-block.spec.ts
import { build_review_block } from './review-block';
import { Ticket, EvidenceBundle, Draft } from '../types';

const SAMPLE_TICKET: Ticket = {
  ticket_id: 'test-uuid-001',
  customer_intent: 'refund_request',
  issue_reason: 'changed_mind',
  order_state: 'delivered',
  risk_level: 'medium',
  evidence_required: ['order_status', 'refund_eligibility'],
  human_review_required: true,
  recommended_action: 'human_review',
};

const SAMPLE_BUNDLE: EvidenceBundle = {
  ticket: SAMPLE_TICKET,
  faq_matches: [
    {
      id: 'faq-1',
      title: 'How do I request a refund?',
      content: 'To request a refund, please contact our support team...',
      relevance_score: 0.9,
    },
  ],
  policy_matches: [],
  legal_references: [],
};

const SAMPLE_DRAFT: Draft = {
  text: 'Thank you for contacting us. We have received your refund request and will process it within 3-5 business days.',
  evidence_ids: ['faq-1'],
};

describe('build_review_block', () => {
  it('returns an array', () => {
    const blocks = build_review_block(SAMPLE_TICKET, SAMPLE_BUNDLE, SAMPLE_DRAFT, 'run-test-001');
    expect(Array.isArray(blocks)).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
  });

  it('contains a block with action_id cs_review_approve', () => {
    const blocks = build_review_block(SAMPLE_TICKET, SAMPLE_BUNDLE, SAMPLE_DRAFT, 'run-test-001');

    // Find the actions block that contains buttons
    const actionsBlock = blocks.find((b) => b.type === 'actions') as any;
    expect(actionsBlock).toBeDefined();
    expect(actionsBlock.elements).toBeDefined();

    const approveButton = actionsBlock.elements.find(
      (el: any) => el.action_id === 'cs_review_approve'
    );
    expect(approveButton).toBeDefined();
    expect(approveButton.action_id).toBe('cs_review_approve');
  });

  it('includes all 5 required action buttons', () => {
    const blocks = build_review_block(SAMPLE_TICKET, SAMPLE_BUNDLE, SAMPLE_DRAFT, 'run-test-001');
    const actionsBlock = blocks.find((b) => b.type === 'actions') as any;

    const actionIds = actionsBlock.elements.map((el: any) => el.action_id);
    expect(actionIds).toContain('cs_review_approve');
    expect(actionIds).toContain('cs_review_revise');
    expect(actionIds).toContain('cs_review_hold');
    expect(actionIds).toContain('cs_review_escalate');
    expect(actionIds).toContain('cs_review_evidence');
  });

  it('includes ticket_id and risk_level in block content', () => {
    const blocks = build_review_block(SAMPLE_TICKET, SAMPLE_BUNDLE, SAMPLE_DRAFT, 'run-test-001');

    // Serialize blocks to string for content check
    const blockText = JSON.stringify(blocks);
    expect(blockText).toContain('test-uuid-001');
    expect(blockText).toContain('MEDIUM');
  });

  it('includes draft text in blocks', () => {
    const blocks = build_review_block(SAMPLE_TICKET, SAMPLE_BUNDLE, SAMPLE_DRAFT, 'run-test-001');
    const blockText = JSON.stringify(blocks);
    expect(blockText).toContain('refund request');
  });

  it('buttons include run_id in value', () => {
    const blocks = build_review_block(SAMPLE_TICKET, SAMPLE_BUNDLE, SAMPLE_DRAFT, 'run-xyz');
    const actionsBlock = blocks.find((b) => b.type === 'actions') as any;
    const approveBtn = actionsBlock.elements.find((e: any) => e.action_id === 'cs_review_approve');
    const parsed = JSON.parse(approveBtn.value);
    expect(parsed.run_id).toBe('run-xyz');
    expect(parsed.ticket_id).toBe('test-uuid-001');
  });
});
