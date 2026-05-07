// cs-ops-core/src/slack/actions.ts
import { WebClient } from '@slack/web-api';
import { AutomationRunLog } from '../types';
import { write_automation_run, update_automation_run_reviewer } from '../lib/notion-client';

let _slack_client: WebClient | null = null;

function get_slack_client(): WebClient {
  if (!_slack_client) {
    const token = process.env.SLACK_BOT_TOKEN ?? '';
    if (!token) throw new Error('SLACK_BOT_TOKEN not set');
    _slack_client = new WebClient(token);
  }
  return _slack_client;
}

export interface ReviewActionPayload {
  run_id: string;
  ticket_id: string;
  draft_text?: string;
  channel_id?: string;
  thread_ts?: string;
  reviewer_id?: string;
}

export async function handle_review_action(
  action_id: string,
  payload: ReviewActionPayload
): Promise<void> {
  const slack = get_slack_client();
  const voc_log_channel = process.env.SLACK_VOC_LOG_CHANNEL_ID ?? '';
  const manager_channel = process.env.SLACK_CS_MANAGER_CHANNEL_ID ?? '';

  switch (action_id) {
    case 'cs_review_approve': {
      // Post draft to voc-log channel
      if (voc_log_channel && payload.draft_text) {
        await slack.chat.postMessage({
          channel: voc_log_channel,
          text: payload.draft_text,
          metadata: {
            event_type: 'cs_response_approved',
            event_payload: { run_id: payload.run_id, ticket_id: payload.ticket_id },
          },
        });
      }
      // Update AutomationRun in Notion
      await update_notion_reviewer_action(payload.run_id, payload.ticket_id, 'approved', payload.draft_text);
      break;
    }

    case 'cs_review_escalate': {
      // Post to manager channel
      if (manager_channel) {
        await slack.chat.postMessage({
          channel: manager_channel,
          text: `🚨 *Escalation Required*\nTicket: \`${payload.ticket_id}\`\nRun: \`${payload.run_id}\`\nReason: Manual escalation from review queue`,
        });
      }
      await update_notion_reviewer_action(payload.run_id, payload.ticket_id, 'escalated');
      break;
    }

    case 'cs_review_hold': {
      // Update AutomationRun + post thread reply
      await update_notion_reviewer_action(payload.run_id, payload.ticket_id, 'held');
      if (payload.channel_id && payload.thread_ts) {
        await slack.chat.postMessage({
          channel: payload.channel_id,
          thread_ts: payload.thread_ts,
          text: `⏸️ Case held for further review. Ticket: \`${payload.ticket_id}\``,
        });
      }
      break;
    }

    case 'cs_review_revise': {
      await update_notion_reviewer_action(payload.run_id, payload.ticket_id, 'revision_requested');
      if (payload.channel_id && payload.thread_ts) {
        await slack.chat.postMessage({
          channel: payload.channel_id,
          thread_ts: payload.thread_ts,
          text: `✏️ Revision requested for ticket \`${payload.ticket_id}\`. Please update the draft.`,
        });
      }
      break;
    }

    case 'cs_review_evidence': {
      await update_notion_reviewer_action(payload.run_id, payload.ticket_id, 'evidence_requested');
      if (payload.channel_id && payload.thread_ts) {
        await slack.chat.postMessage({
          channel: payload.channel_id,
          thread_ts: payload.thread_ts,
          text: `🔍 Additional evidence requested for ticket \`${payload.ticket_id}\`.`,
        });
      }
      break;
    }

    default:
      console.warn(`[cs-review] Unknown action_id: ${action_id}`);
  }

  // Persist reviewer's decision to the Automation_Run Notion page
  await update_automation_run_reviewer(
    payload.ticket_id,
    action_id,
    payload.reviewer_id ?? 'unknown',
  );
}

async function update_notion_reviewer_action(
  run_id: string,
  ticket_id: string,
  reviewer_action: string,
  final_answer?: string
): Promise<void> {
  try {
    await write_automation_run({
      run_id,
      ticket_id,
      phase: 'review_complete',
      steps: ['review_action'],
      risk_decision: { action: 'review', reason: `Reviewer action: ${reviewer_action}` },
      reviewer_action,
      evidence_ids: [],
      final_answer,
    });
  } catch (err) {
    console.warn('[cs-review] Failed to update Notion AutomationRun:', err);
  }
}
