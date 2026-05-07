// api/src/workflows/on_resolve.ts
import { config } from '../config';
import { Case, add_event, get_review_message } from '../cases/case-store';
import { start_automation_run, complete_automation_run } from '../cases/automation-run-store';
import { get_latest_draft, save_draft_version } from '../cases/draft-version-store';
import { call_cs_bot } from '../tools/openclaw-client';
import { write_case_summary } from '../tools/notion-client';
import { post_message, update_message } from '@slack/slack-client';
import { build_final_status_blocks } from '@slack/blocks';
import { check_trajectory } from '../tools/trajectory-eval';
import { FlowStep } from '../pipeline/index';
import { recover } from '../pipeline/monad';

export interface ResolveCtx {
  case_id: string;
  actor_id: string | undefined;
  channel_id: string | undefined;
  thread_ts: string | undefined;
  case: Case;
}

const keep_summary_step: FlowStep<ResolveCtx> = {
  name: 'openclaw_keep_summary',
  run: async (ctx) => {
    const latest_draft = get_latest_draft(ctx.case_id);
    if (latest_draft) {
      save_draft_version(ctx.case_id, latest_draft.draft_text, latest_draft.confidence, 'final_send');
    }

    const run = start_automation_run({
      ticket_id: ctx.case_id,
      run_type: 'draft_reply',
      input: { mode: 'keep_summary', case_id: ctx.case_id },
    });
    try {
      await call_cs_bot({
        case_id: ctx.case_id,
        mode: 'keep_summary',
        user_message: ctx.case.raw_text,
        known_context: { source: ctx.case.source_type },
      });
      complete_automation_run(run.id, {
        status: 'success',
        latency_ms: Date.now() - run.started_at,
        output_summary: 'keep_summary done',
      });
    } catch (err: any) {
      complete_automation_run(run.id, {
        status: 'error',
        latency_ms: Date.now() - run.started_at,
        error: err.message,
      });
      // keep_summary failure is non-blocking — log but don't abort flow
      console.warn('[on_resolve] keep_summary failed:', err.message);
    }
    return ctx;
  },
};

const notion_ticket_log_step: FlowStep<ResolveCtx> = {
  name: 'notion_ticket_log',
  run: async (ctx) => {
    const run = start_automation_run({
      ticket_id: ctx.case_id,
      run_type: 'notion_write',
      input: { action: 'case_send' },
    });
    try {
      await write_case_summary({
        case_id: ctx.case.id,
        source_type: ctx.case.source_type,
        status: 'resolved',
        intent: ctx.case.intent,
        raw_text: ctx.case.raw_text,
        final_action: 'sent',
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
      throw err; // Notion write failure IS blocking — propagate so run_flow captures it
    }
    return ctx;
  },
};

const voc_log_step = recover<ResolveCtx>(
  {
    name: 'slack_voc_log',
    run: async (ctx) => {
      if (!config.slack.voc_log_channel) return ctx;
      await post_message(
        config.slack.voc_log_channel,
        `[voc-log] case_sent | case_id: ${ctx.case_id} | actor: ${ctx.actor_id ?? 'unknown'}`,
      );
      add_event(ctx.case_id, 'draft_sent', 'human', ctx.actor_id, { final_action: 'sent' });
      return ctx;
    },
  },
  async (ctx, err) => {
    console.warn('[on_resolve] voc_log post failed:', err.message);
    return ctx;
  },
);

const update_review_card_step = recover<ResolveCtx>(
  {
    name: 'update_review_card',
    run: async (ctx) => {
      const review = get_review_message(ctx.case_id);
      if (!review) return ctx;
      await update_message({
        channel: review.review_channel_id,
        ts: review.review_message_ts,
        text: `[결정 완료] sent | case: ${ctx.case_id}`,
        blocks: build_final_status_blocks(ctx.case, 'resolved', ctx.actor_id ?? 'unknown'),
      });
      return ctx;
    },
  },
  async (ctx, err) => {
    console.warn('[on_resolve] review card update failed:', err.message);
    return ctx;
  },
);

const trajectory_check_step = recover<ResolveCtx>(
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

export const on_resolve_steps: Array<FlowStep<ResolveCtx>> = [
  keep_summary_step,
  notion_ticket_log_step,
  voc_log_step,
  update_review_card_step,
  trajectory_check_step,
];
