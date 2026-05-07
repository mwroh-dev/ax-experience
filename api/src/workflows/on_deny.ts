// api/src/workflows/on_deny.ts
import { config } from '../config';
import { Case, add_event, get_review_message } from '../cases/case-store';
import { start_automation_run, complete_automation_run } from '../cases/automation-run-store';
import { write_case_summary } from '../tools/notion-client';
import { post_message, update_message } from '@slack/slack-client';
import { build_final_status_blocks } from '@slack/blocks';
import { check_trajectory } from '../tools/trajectory-eval';
import { FlowStep } from '../pipeline/index';
import { recover } from '../pipeline/monad';

export interface DenyCtx {
  case_id: string;
  actor_id: string | undefined;
  case: Case;
}

const notion_ticket_log_step: FlowStep<DenyCtx> = {
  name: 'notion_ticket_log',
  run: async (ctx) => {
    const run = start_automation_run({
      ticket_id: ctx.case_id,
      run_type: 'notion_write',
      input: { action: 'case_deny' },
    });
    try {
      await write_case_summary({
        case_id: ctx.case.id,
        source_type: ctx.case.source_type,
        status: 'denied',
        intent: ctx.case.intent,
        raw_text: ctx.case.raw_text,
        final_action: 'denied',
        created_at: ctx.case.created_at,
        resolved_at: new Date().toISOString(),
      });
      complete_automation_run(run.id, {
        status: 'success',
        latency_ms: Date.now() - run.started_at,
        output_summary: 'notion tickets log written',
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

const voc_log_step = recover<DenyCtx>(
  {
    name: 'slack_voc_log',
    run: async (ctx) => {
      if (!config.slack.voc_log_channel) return ctx;
      await post_message(
        config.slack.voc_log_channel,
        `[voc-log] case_denied | case_id: ${ctx.case_id} | actor: ${ctx.actor_id ?? 'unknown'}`,
      );
      add_event(ctx.case_id, 'draft_denied', 'human', ctx.actor_id, { reason: 'reviewer_denied' });
      return ctx;
    },
  },
  async (ctx, err) => {
    console.warn('[on_deny] voc_log post failed:', err.message);
    return ctx;
  },
);

const update_review_card_step = recover<DenyCtx>(
  {
    name: 'update_review_card',
    run: async (ctx) => {
      const review = get_review_message(ctx.case_id);
      if (!review) return ctx;
      await update_message({
        channel: review.review_channel_id,
        ts: review.review_message_ts,
        text: `[결정 완료] denied | case: ${ctx.case_id}`,
        blocks: build_final_status_blocks(ctx.case, 'denied', ctx.actor_id ?? 'unknown'),
      });
      return ctx;
    },
  },
  async (ctx, err) => {
    console.warn('[on_deny] review card update failed:', err.message);
    return ctx;
  },
);

const trajectory_check_step = recover<DenyCtx>(
  {
    name: 'trajectory_check',
    run: async (ctx) => {
      if (!config.slack.voc_log_channel) return ctx;
      const traj = check_trajectory(ctx.case_id);
      if (!traj.pass) {
        await post_message(
          config.slack.voc_log_channel,
          `[eval-alert] trajectory_fail | case_id: ${ctx.case_id} | path: ${traj.path} | missing: ${traj.missing.join(', ')}`,
        );
      }
      return ctx;
    },
  },
  async (ctx) => ctx,
);

export const on_deny_steps: Array<FlowStep<DenyCtx>> = [
  notion_ticket_log_step,
  voc_log_step,
  update_review_card_step,
  trajectory_check_step,
];
