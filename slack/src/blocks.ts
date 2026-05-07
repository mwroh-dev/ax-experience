import { Case } from '@api/cases/case-store';
import { RoutingRule } from '@api/router/routing-rules';
import type { DraftEvalResult } from '@api/tools/draft-eval';

function truncate(text: string, max = 200): string {
  return text.length > max ? text.slice(0, max) + '...' : text;
}

const RISK_LABEL: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  unknown: '?',
};

const PATH_LABEL: Record<string, string> = {
  auto_reply: '자동응답 후보',
  review_required: '검토 필요',
  pending: '정보 대기',
  escalation: '에스컬레이션',
  no_source_backlog: '출처 없음',
  review_required_default: '검토 필요',
};

export function build_intake_review_blocks(
  c: Case,
  source_label: string,
  decision?: RoutingRule
): object[] {
  const text_preview = truncate(c.raw_text);
  const intent = decision?.intent ?? c.intent ?? 'unknown';
  const risk = decision?.risk_level ?? c.risk_level ?? 'unknown';
  const path = decision?.recommended_path ?? c.recommended_path ?? 'review_required';

  const blocks: object[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '[CS Intake Review]', emoji: false },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Case ID:*\n\`${c.id}\`` },
        { type: 'mrkdwn', text: `*Source:*\n${source_label}` },
        { type: 'mrkdwn', text: `*Status:*\n${c.status}` },
        { type: 'mrkdwn', text: `*Received:*\n${c.created_at}` },
      ],
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Intent:*\n\`${intent}\`` },
        { type: 'mrkdwn', text: `*Risk:*\n${RISK_LABEL[risk] ?? risk}` },
        { type: 'mrkdwn', text: `*Path:*\n${PATH_LABEL[path] ?? path}` },
        { type: 'mrkdwn', text: `*Reason:*\n${decision?.reason ?? '—'}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*문의:*\n> ${text_preview}` },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*현재 필요한 판단:*\n이 문의를 CS bot 처리 대상으로 넘길지 결정해야 합니다.',
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Keep', emoji: false },
          action_id: 'case_keep',
          value: c.id,
          style: 'danger',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Accept', emoji: false },
          action_id: 'case_accept',
          value: c.id,
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Escalate', emoji: false },
          action_id: 'case_escalate',
          value: c.id,
          style: 'danger',
        },
      ],
    },
  ];

  return blocks;
}

export function build_decision_blocks(c: Case, new_status: string, actor_id: string): object[] {
  const status_label: Record<string, string> = {
    kept: '보관 (Keep)',
    accepted: '수락 (Accept)',
    pending: '보류 (Pending)',
  };
  const text_preview = truncate(c.raw_text);

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '[CS Intake Review — 결정 완료]', emoji: false },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Case ID:*\n\`${c.id}\`` },
        { type: 'mrkdwn', text: `*결정:*\n${status_label[new_status] ?? new_status}` },
        { type: 'mrkdwn', text: `*담당자:*\n<@${actor_id}>` },
        { type: 'mrkdwn', text: `*처리 시각:*\n${new Date().toISOString()}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*문의:*\n> ${text_preview}` },
    },
  ];
}

function format_eval_result(e: Pick<DraftEvalResult, 'pass' | 'score' | 'issues'>): string {
  const score = e.score.toFixed(1);
  if (e.pass) return `✓ pass (${score})`;
  const suffix = e.issues.length > 0 ? ` — ${e.issues.join(', ')}` : '';
  return `⚠ fail (${score})${suffix}`;
}

export function build_cs_bot_draft_blocks(
  case_id: string,
  mode: string,
  draft_text: string,
  evidence: string[],
  eval_result?: Pick<DraftEvalResult, 'pass' | 'score' | 'issues'>,
): object[] {
  const evidence_text = evidence.length > 0 ? evidence.map(e => `• ${e}`).join('\n') : '• (없음)';

  const eval_text = eval_result ? format_eval_result(eval_result) : '—';

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '[CS Bot Draft]', emoji: false },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Case ID:*\n\`${case_id}\`` },
        { type: 'mrkdwn', text: `*Mode:*\n${mode}` },
        { type: 'mrkdwn', text: `*Eval:*\n${eval_text}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*근거:*\n${evidence_text}` },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*초안:*\n${draft_text}` },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Lookup', emoji: false },
          action_id: 'case_lookup',
          value: case_id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Send', emoji: false },
          action_id: 'case_send',
          value: case_id,
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Retry', emoji: false },
          action_id: 'case_retry',
          value: case_id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Deny', emoji: false },
          action_id: 'case_deny',
          value: case_id,
          style: 'danger',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Escalate', emoji: false },
          action_id: 'case_escalate',
          value: case_id,
          style: 'danger',
        },
      ],
    },
  ];
}

export function build_pending_blocks(
  case_id: string,
  ask_message: string,
  missing_fields: string[]
): object[] {
  const fields_text = missing_fields.length > 0
    ? `*필요 정보:*\n${missing_fields.map(f => `• ${f}`).join('\n')}`
    : '*상태:* 추가 검토 중';

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '[CS Pending — 정보 요청]', emoji: false },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Case ID:*\n\`${case_id}\`` },
        { type: 'mrkdwn', text: `*상태:*\npending` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: fields_text },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*고객 안내 메시지:*\n${ask_message}` },
    },
  ];
}

export function build_escalation_blocks(c: Case, playbook_ref?: string): object[] {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: '[CS Escalation — 에스컬레이션]', emoji: false },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Case ID:*\n\`${c.id}\`` },
        { type: 'mrkdwn', text: `*Intent:*\n\`${c.intent ?? 'unknown'}\`` },
        { type: 'mrkdwn', text: `*Risk:*\nhigh` },
        { type: 'mrkdwn', text: `*Playbook:*\n${playbook_ref ?? '없음'}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*문의:*\n> ${truncate(c.raw_text)}` },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*⚠ 자동 응답 금지:* 이 케이스는 인간 검토자가 직접 처리해야 합니다.',
      },
    },
  ];
}

export function build_final_status_blocks(c: Case, final_status: string, actor_id: string): object[] {
  const label: Record<string, string> = {
    resolved: '처리 완료 (Sent)',
    denied: '거부 (Denied)',
    escalated: '에스컬레이션 완료',
  };
  const text_preview = truncate(c.raw_text);
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `[CS Draft — ${label[final_status] ?? final_status}]`, emoji: false },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Case ID:*\n\`${c.id}\`` },
        { type: 'mrkdwn', text: `*상태:*\n${label[final_status] ?? final_status}` },
        { type: 'mrkdwn', text: `*담당자:*\n<@${actor_id}>` },
        { type: 'mrkdwn', text: `*처리 시각:*\n${new Date().toISOString()}` },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*문의:*\n> ${text_preview}` },
    },
  ];
}
