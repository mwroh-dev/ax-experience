// cs-ops-core/src/draft/generator.ts
import { match } from 'ts-pattern';
import { FlowResult } from '@api/pipeline/index';
import { call_cs_bot } from '../lib/openclaw-client';
import { EvidenceBundle, PolicyMatch, Draft } from '../types';

function format_lang_prefix(lang: 'ko' | 'en' | 'other' | undefined): string {
  return match(lang)
    .with('ko', () => '반드시 한국어로 응답하세요.\n')
    .with('en', () => 'Respond in English.\n')
    .with('other', () => '')
    .with(undefined, () => '')
    .exhaustive();
}

function build_evidence_snippets(bundle: EvidenceBundle): string[] {
  const snippets: string[] = [];

  if (bundle.order) {
    snippets.push(
      `[Order] orderId=${bundle.order.orderId} status=${bundle.order.status}` +
        (bundle.order.carrier ? ` carrier=${bundle.order.carrier}` : '') +
        (bundle.order.trackingNumber ? ` tracking=${bundle.order.trackingNumber}` : '')
    );
  }

  if (bundle.refund_eligibility) {
    snippets.push(
      `[Refund Eligibility] eligible=${bundle.refund_eligibility.eligible} ` +
        `reason=${bundle.refund_eligibility.reason} ` +
        `withinWindow=${bundle.refund_eligibility.withinWindow}`
    );
  }

  for (const faq of bundle.faq_matches.slice(0, 2)) {
    snippets.push(`[FAQ] ${faq.title}: ${faq.content.slice(0, 200)}`);
  }

  for (const policy of bundle.policy_matches.slice(0, 2)) {
    snippets.push(`[Policy] ${policy.title}: ${policy.content.slice(0, 200)}`);
  }

  return snippets;
}

function collect_evidence_ids(bundle: EvidenceBundle, matches: PolicyMatch[]): string[] {
  const ids: string[] = [];
  matches.forEach((m) => ids.push(m.rule_id));
  bundle.faq_matches.forEach((f) => ids.push(f.id));
  bundle.policy_matches.forEach((p) => ids.push(p.id));
  return [...new Set(ids)];
}

export async function generate_draft(
  bundle: EvidenceBundle,
  matches: PolicyMatch[]
): Promise<FlowResult<Draft>> {
  const started_at = Date.now();
  const trace_entry_base = { step: 'generate_draft', started_at };
  try {
    const snippets = build_evidence_snippets(bundle);
    const evidence_ids = collect_evidence_ids(bundle, matches);

    const lang_prefix = format_lang_prefix(bundle.ticket.language);
    const user_message = `${lang_prefix}Customer intent: ${bundle.ticket.customer_intent.replace(/_/g, ' ')}. Issue: ${bundle.ticket.issue_reason.replace(/_/g, ' ')}.`;

    const response = await call_cs_bot({
      case_id: bundle.ticket.ticket_id,
      mode: 'answer_draft',
      user_message,
      evidence_snippets: snippets,
    });

    const draft: Draft = {
      text: response.draft,
      evidence_ids,
      template_used: `mode:answer_draft confidence:${response.confidence}`,
    };

    return {
      ok: true,
      value: draft,
      trace: [{ ...trace_entry_base, duration_ms: Date.now() - started_at, ok: true }],
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      step: 'generate_draft',
      trace: [{ ...trace_entry_base, duration_ms: Date.now() - started_at, ok: false }],
    };
  }
}
