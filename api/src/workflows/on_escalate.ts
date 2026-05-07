// api/src/workflows/on_escalate.ts
import { config } from '../config';
import { Case, add_event, get_review_message } from '../cases/case-store';
import { start_automation_run, complete_automation_run } from '../cases/automation-run-store';
import { write_agent_decision } from '@notion/agent-decisions-log';
import { post_message, update_message } from '@slack/slack-client';
import { build_escalation_blocks } from '@slack/blocks';
import { FlowStep } from '../pipeline/index';
import { recover } from '../pipeline/monad';

export interface EscalateCtx {
  case_id: string;
  actor_id: string | undefined;
  case: Case;
}

const notion_agent_decision_step: FlowStep<EscalateCtx> = {
  name: 'notion_agent_decision',
  run: async (ctx) => {
    const run = start_automation_run({
      ticket_id: ctx.case_id,
      run_type: 'notion_write',
      input: { action: 'case_escalate' },
    });
    try {
      await write_agent_decision({
        case_id: ctx.case_id,
        intent: ctx.case.intent,
        risk_level: ctx.case.risk_level,
        decision: 'escalated',
        reason: 'reviewer_escalated',
        evidence_sources: [],
        admin_api_called: false,
        human_review_required: true,
      });
      complete_automation_run(run.id, {
        status: 'success',
        latency_ms: Date.now() - run.started_at,
        output_summary: 'notion agent decisions log written',
      });
    } catch (err: any) {
      complete_automation_run(run.id, {
        status: 'error',
        latency_ms: Date.now() - run.started_at,
        error: err.message,
      });
      throw err;
    }
    return ctx;
  },
};

const voc_log_step = recover<EscalateCtx>(
  {
    name: 'slack_voc_log',
    run: async (ctx) => {
      if (!config.slack.voc_log_channel) return ctx;
      await post_message(
        config.slack.voc_log_channel,
        `[voc-log] case_escalated | case_id: ${ctx.case_id} | actor: ${ctx.actor_id ?? 'unknown'}`,
      );
      add_event(ctx.case_id, 'draft_escalated', 'human', ctx.actor_id, { reason: 'reviewer_escalated' });
      return ctx;
    },
  },
  async (ctx, err) => {
    console.warn('[on_escalate] voc_log post failed:', err.message);
    return ctx;
  },
);

const update_review_card_step = recover<EscalateCtx>(
  {
    name: 'update_review_card',
    run: async (ctx) => {
      const review = get_review_message(ctx.case_id);
      if (!review) return ctx;
      await update_message(
        review.review_channel_id,
        review.review_message_ts,
        `[에스컬레이션] case: ${ctx.case_id}`,
        build_escalation_blocks(ctx.case),
      );
      return ctx;
    },
  },
  async (ctx, err) => {
    console.warn('[on_escalate] review card update failed:', err.message);
    return ctx;
  },
);

export const on_escalate_steps: Array<FlowStep<EscalateCtx>> = [
  notion_agent_decision_step,
  voc_log_step,
  update_review_card_step,
];
