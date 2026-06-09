import { App } from '@slack/bolt';
import { config } from '@api/config';
import { mask } from '@api/util/log';
import { get_case, try_update_case_status, add_event, save_tool_call, update_tool_call, get_review_message } from '@api/cases/case-store';
import { post_message, post_thread_reply, update_message } from './slack-client';
import { dry_run_commerce_refund } from '@api/tools/commerce-api-client';
import { build_commerce_evidence } from '@api/tools/commerce-evidence-builder';
import { build_decision_blocks } from './blocks';
import { on_accept } from '@api/workflows/on_accept';
import { call_cs_bot } from '@api/llm/claude-cli-adapter';
import { save_draft_version } from '@api/cases/draft-version-store';
import { run_flow } from '@api/pipeline/index';
import { on_resolve_steps, ResolveCtx } from '@api/workflows/on_resolve';
import { on_deny_steps, DenyCtx } from '@api/workflows/on_deny';
import { on_escalate_steps, EscalateCtx } from '@api/workflows/on_escalate';
import { get_kb, log_reviewer_feedback } from '@cs-ops-core/knowledge/db';
import { handle_review_action } from '@cs-ops-core/slack/actions';

const ALLOWED_REVIEWER_IDS = (process.env.ALLOWED_REVIEWER_IDS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);

function is_authorized(actor_id: string | undefined): boolean {
  if (ALLOWED_REVIEWER_IDS.length === 0) return true;
  return !!actor_id && ALLOWED_REVIEWER_IDS.includes(actor_id);
}

export function register_actions(app: App): void {
  app.action('case_keep', async ({ ack, body, action, client }) => {
    await ack();
    const case_id = (action as any).value;
    const actor_id = (body as any).user?.id;

    if (!is_authorized(actor_id)) {
      const ch = (body as any).channel?.id;
      const ts = (body as any).message?.ts;
      add_event(case_id, 'unauthorized_action', 'system', actor_id, { action_type: 'case_keep' });
      if (ch && ts) {
        await client.chat.postEphemeral({ channel: ch, user: actor_id ?? '', thread_ts: ts, text: '권한 없음: 리뷰어 허용 목록에 포함되지 않은 사용자입니다.' }).catch(() => {});
      }
      console.warn(`[action] unauthorized keep | actor=${mask(actor_id ?? '')}`);
      return;
    }
    console.log(`[action] case_keep | case_id=${case_id} | actor=${mask(actor_id ?? '')}`);

    const c = get_case(case_id);
    if (!c) {
      console.warn(`[action] case_keep: case not found: ${case_id}`);
      return;
    }

    const updated = try_update_case_status({ case_id, expected_status: 'intake_review', new_status: 'kept', actor_id });
    if (!updated) {
      add_event(case_id, 'stale_action_rejected', 'human', actor_id, { attempted: 'kept', current: c.status });
      console.warn(`[action] case_keep stale | case_id=${case_id} current=${c.status}`);
      return;
    }

    add_event(case_id, 'archive_candidate', 'system', actor_id, { reason: 'kept_by_reviewer' });

    if (config.slack.voc_log_channel) {
      await post_message(
        config.slack.voc_log_channel,
        `[voc-log] case_kept | case_id: ${case_id} | actor: ${actor_id ?? 'unknown'}`
      ).catch(err => console.warn('[voc-log] post failed:', err.message));
    }

    const review_keep = get_review_message(case_id);
    if (review_keep) {
      await update_message({
        channel: review_keep.review_channel_id,
        ts: review_keep.review_message_ts,
        text: `[결정 완료] kept | case: ${case_id}`,
        blocks: build_decision_blocks(c, 'kept', actor_id ?? 'unknown'),
      }).catch(err => console.warn('[review-card] update failed:', err.message));
    }

    console.log(`[action] case_keep done | case_id=${case_id} status=kept`);
  });

  app.action('case_accept', async ({ ack, body, action, client }) => {
    await ack();
    const case_id = (action as any).value;
    const actor_id = (body as any).user?.id;
    const thread_ts = (body as any).message?.ts;
    const channel_id = (body as any).channel?.id;
    console.log(`[action] case_accept | case_id=${case_id} | actor=${mask(actor_id ?? '')} | channel=${mask(channel_id ?? '')} | ts=${thread_ts}`);

    if (!is_authorized(actor_id)) {
      add_event(case_id, 'unauthorized_action', 'system', actor_id, { action_type: 'case_accept' });
      if (channel_id && thread_ts) {
        await client.chat.postEphemeral({ channel: channel_id, user: actor_id ?? '', thread_ts, text: '권한 없음: 리뷰어 허용 목록에 포함되지 않은 사용자입니다.' }).catch(() => {});
      }
      console.warn(`[action] unauthorized accept | actor=${mask(actor_id ?? '')}`);
      return;
    }

    const c = get_case(case_id);
    if (!c) {
      console.warn(`[action] case_accept: case not found: ${case_id}`);
      return;
    }

    const updated = try_update_case_status({ case_id, expected_status: 'intake_review', new_status: 'accepted', actor_id });
    if (!updated) {
      add_event(case_id, 'stale_action_rejected', 'human', actor_id, { attempted: 'accepted', current: c.status });
      console.warn(`[action] case_accept stale | case_id=${case_id} current=${c.status}`);
      return;
    }

    if (config.slack.voc_log_channel) {
      await post_message(
        config.slack.voc_log_channel,
        `[voc-log] case_accepted | case_id: ${case_id} | actor: ${actor_id ?? 'unknown'}`
      ).catch(err => console.warn('[voc-log] post failed:', err.message));
    }

    const review_accept = get_review_message(case_id);
    if (review_accept) {
      await update_message({
        channel: review_accept.review_channel_id,
        ts: review_accept.review_message_ts,
        text: `[결정 완료] accepted | case: ${case_id}`,
        blocks: build_decision_blocks(c, 'accepted', actor_id ?? 'unknown'),
      }).catch(err => console.warn('[review-card] update failed:', err.message));
    }

    // Async: run draft pipeline (Notion search + Admin API + conflict detection + CS bot)
    on_accept(c, channel_id, thread_ts).then(result => {
      console.log(`[action] case_accept draft done | case_id=${case_id} confidence=${result.confidence}`);
    }).catch(err => {
      console.error(`[action] case_accept draft error:`, err.message);
    });

    console.log(`[action] case_accept done | case_id=${case_id} status=accepted`);
  });

  app.action('case_lookup', async ({ ack, body, action }) => {
    await ack();
    const case_id = (action as any).value;
    const channel_id = (body as any).channel?.id;
    const thread_ts = (body as any).message?.ts;
    console.log(`[action] case_lookup | case_id=${case_id}`);

    const c = get_case(case_id);
    if (!c) {
      console.warn(`[action] case_lookup: case not found: ${case_id}`);
      return;
    }

    const tool_id = save_tool_call({ case_id, tool_name: 'commerce_lookup', input: { case_id } });
    try {
      const commerce_result = await build_commerce_evidence(case_id, c.raw_text);
      if (!commerce_result) {
        update_tool_call(tool_id, { error: 'no_identifier_in_raw_text' }, 'error');
        add_event(case_id, 'commerce_lookup_failed', 'bot', 'commerce-evidence-builder', { error: 'no_identifier_in_raw_text' });
        if (channel_id && thread_ts) {
          await post_thread_reply({ channel: channel_id, thread_ts, text: `[Commerce Lookup] 이메일 또는 주문번호를 찾을 수 없습니다 — 수동 조회 필요` }).catch(() => {});
        }
        return;
      }

      let dry_run_result: Record<string, any> | null = null;
      if (commerce_result.found && commerce_result.refund_eligible && commerce_result.customer_id) {
        dry_run_result = await dry_run_commerce_refund(
          commerce_result.order_id ?? null,
          commerce_result.customer_id,
          'lookup_dry_run'
        ) as Record<string, any>;
      }

      update_tool_call(tool_id, { commerce_result, dry_run_result }, 'success');
      add_event(case_id, 'commerce_lookup_done', 'bot', 'commerce-evidence-builder', {
        customer_id: commerce_result.customer_id ?? null,
        refund_eligible: commerce_result.refund_eligible,
        dry_run_executed: !!dry_run_result,
      });

      if (channel_id && thread_ts) {
        const summary = { commerce_result, dry_run_result };
        await post_thread_reply({
          channel: channel_id,
          thread_ts,
          text: `[Commerce Lookup]\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\``,
        }).catch(err => console.warn('[commerce-lookup] thread reply failed:', err.message));
      }
      console.log(`[action] case_lookup done | case_id=${case_id} found=${commerce_result.found} eligible=${commerce_result.refund_eligible} dry_run=${!!dry_run_result}`);
    } catch (err: any) {
      update_tool_call(tool_id, { error: err.message }, 'error');
      add_event(case_id, 'commerce_lookup_failed', 'bot', 'commerce-evidence-builder', { error: err.message });
      console.error(`[action] case_lookup error:`, err.message);
    }
  });

  // case_send — mark as resolved, delegate async business logic to on_resolve flow
  app.action('case_send', async ({ ack, body, action }) => {
    await ack();
    const case_id = (action as any).value;
    const actor_id = (body as any).user?.id;
    const channel_id = (body as any).channel?.id;
    const thread_ts = (body as any).message?.ts;

    if (!is_authorized(actor_id)) {
      add_event(case_id, 'unauthorized_action', 'system', actor_id, { action_type: 'case_send' });
      return;
    }

    const c = get_case(case_id);
    if (!c) return;

    const updated = try_update_case_status({ case_id, expected_status: 'accepted', new_status: 'resolved', actor_id });
    if (!updated) {
      add_event(case_id, 'stale_action_rejected', 'human', actor_id, { attempted: 'resolved', current: c.status });
      return;
    }

    const ctx: ResolveCtx = { case_id, actor_id, channel_id, thread_ts, case: c };
    run_flow(on_resolve_steps, ctx)
      .then((r) => { if (!r.ok) console.error(`[on_resolve] ${r.step}: ${r.error}`); })
      .catch((err) => console.error('[on_resolve] unexpected:', err.message));
  });

  // case_deny — mark as denied, delegate async business logic to on_deny flow
  app.action('case_deny', async ({ ack, body, action }) => {
    await ack();
    const case_id = (action as any).value;
    const actor_id = (body as any).user?.id;

    if (!is_authorized(actor_id)) {
      add_event(case_id, 'unauthorized_action', 'system', actor_id, { action_type: 'case_deny' });
      return;
    }

    const c = get_case(case_id);
    if (!c) return;

    const updated = try_update_case_status({ case_id, expected_status: 'accepted', new_status: 'denied', actor_id });
    if (!updated) {
      add_event(case_id, 'stale_action_rejected', 'human', actor_id, { attempted: 'denied', current: c.status });
      return;
    }

    const ctx: DenyCtx = { case_id, actor_id, case: c };
    run_flow(on_deny_steps, ctx)
      .then((r) => { if (!r.ok) console.error(`[on_deny] ${r.step}: ${r.error}`); })
      .catch((err) => console.error('[on_deny] unexpected:', err.message));
  });

  // case_retry — re-call CS bot with optional instruction, post draft v2
  app.action('case_retry', async ({ ack, body, action }) => {
    await ack();
    const case_id = (action as any).value;
    const actor_id = (body as any).user?.id;
    const channel_id = (body as any).channel?.id;
    const thread_ts = (body as any).message?.ts;
    console.log(`[action] case_retry | case_id=${case_id} | actor=${mask(actor_id ?? '')}`);

    if (!is_authorized(actor_id)) {
      add_event(case_id, 'unauthorized_action', 'system', actor_id, { action_type: 'case_retry' });
      return;
    }

    const c = get_case(case_id);
    if (!c) return;

    const tool_id = save_tool_call({ case_id, tool_name: 'claude_cli_retry', input: { case_id, mode: 'answer_draft_retry' } });

    call_cs_bot({
      case_id, mode: 'answer_draft',
      user_message: c.raw_text,
      known_context: { source: c.source_type, retry: true },
    }).then(async (bot_response: any) => {
      const draft_text = bot_response.draft ?? '';
      const draft_v = save_draft_version(case_id, draft_text, bot_response.confidence, 'retry');
      update_tool_call(tool_id, bot_response, 'success');
      add_event(case_id, 'cs_bot_draft_retry', 'bot', 'claude-cli', {
        version: draft_v.version, confidence: bot_response.confidence,
      });

      if (channel_id && thread_ts && draft_text) {
        await post_thread_reply({
          channel: channel_id,
          thread_ts,
          text: `[Draft v${draft_v.version} — Retry]\n\n${draft_text}`,
        }).catch(() => {});
      }
      console.log(`[action] case_retry done | case_id=${case_id} version=${draft_v.version}`);
    }).catch(err => {
      update_tool_call(tool_id, { error: err.message }, 'error');
      add_event(case_id, 'cs_bot_retry_failed', 'bot', 'claude-cli', { error: err.message });
      console.error(`[action] case_retry error:`, err.message);
    });
  });

  // case_escalate — mark as escalated, delegate async business logic to on_escalate flow
  app.action('case_escalate', async ({ ack, body, action }) => {
    await ack();
    const case_id = (action as any).value;
    const actor_id = (body as any).user?.id;

    if (!is_authorized(actor_id)) {
      add_event(case_id, 'unauthorized_action', 'system', actor_id, { action_type: 'case_escalate' });
      return;
    }

    const c = get_case(case_id);
    if (!c) return;

    const updated = try_update_case_status({ case_id, expected_status: c.status, new_status: 'escalated', actor_id });
    if (!updated) {
      add_event(case_id, 'stale_action_rejected', 'human', actor_id, { attempted: 'escalated', current: c.status });
      return;
    }

    add_event(case_id, 'escalated', 'human', actor_id, { reason: 'reviewer_escalated' });

    const ctx: EscalateCtx = { case_id, actor_id, case: c };
    run_flow(on_escalate_steps, ctx)
      .then((r) => { if (!r.ok) console.error(`[on_escalate] ${r.step}: ${r.error}`); })
      .catch((err) => console.error('[on_escalate] unexpected:', err.message));
  });

  const REVIEW_ACTION_IDS = [
    'cs_review_approve',
    'cs_review_revise',
    'cs_review_hold',
    'cs_review_escalate',
    'cs_review_evidence',
  ] as const;

  for (const action_id of REVIEW_ACTION_IDS) {
    app.action(action_id, async ({ ack, body, action }) => {
      await ack();
      const raw = (action as any).value as string;
      let run_id = '';
      let ticket_id = raw;
      try {
        const parsed = JSON.parse(raw) as { run_id: string; ticket_id: string };
        run_id = parsed.run_id;
        ticket_id = parsed.ticket_id;
      } catch {
        // old button format — run_id stays empty
      }
      const reviewer_id = (body as any).user?.id as string | undefined;

      try {
        log_reviewer_feedback(get_kb(), { run_id, ticket_id, action_id, reviewer_slack_id: reviewer_id });
      } catch (err) {
        console.warn('[cs-review] log_reviewer_feedback failed:', (err as Error).message);
      }

      await handle_review_action(action_id, { run_id, ticket_id, reviewer_id }).catch(
        (err) => console.warn('[cs-review] handle_review_action failed:', (err as Error).message)
      );
    });
  }
}
