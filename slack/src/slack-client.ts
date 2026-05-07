import { WebClient } from '@slack/web-api';
import { config } from '@api/config';

let client: WebClient | null = null;

export function get_slack_client(): WebClient {
  if (!client) {
    if (!config.slack.bot_token) {
      throw new Error('SLACK_BOT_TOKEN is not set');
    }
    client = new WebClient(config.slack.bot_token);
  }
  return client;
}

export async function post_message(channel: string, text: string, blocks?: object[]): Promise<{ ts: string; channel: string }> {
  const web = get_slack_client();
  const resp = await web.chat.postMessage({
    channel,
    text,
    blocks: blocks as any,
  });
  if (!resp.ok || !resp.ts || !resp.channel) {
    throw new Error(`Slack postMessage failed: ${resp.error}`);
  }
  return { ts: resp.ts, channel: resp.channel };
}

export async function update_message({ channel, ts, text, blocks }: { channel: string; ts: string; text: string; blocks?: object[] }): Promise<void> {
  const web = get_slack_client();
  const resp = await web.chat.update({
    channel,
    ts,
    text,
    blocks: blocks as any,
  });
  if (!resp.ok) {
    throw new Error(`Slack chat.update failed: ${resp.error}`);
  }
}

export async function post_thread_reply({ channel, thread_ts, text, blocks }: { channel: string; thread_ts: string; text: string; blocks?: object[] }): Promise<{ ts: string }> {
  const web = get_slack_client();
  const resp = await web.chat.postMessage({
    channel,
    thread_ts,
    text,
    blocks: blocks as any,
  });
  if (!resp.ok || !resp.ts) {
    throw new Error(`Slack thread reply failed: ${resp.error}`);
  }
  return { ts: resp.ts };
}
