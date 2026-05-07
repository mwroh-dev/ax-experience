import { App, LogLevel } from '@slack/bolt';
import { config } from '@api/config';
import { register_actions } from './actions';
import { register_messages } from './messages';

let bolt_app: App | null = null;
let _exception_handler_registered = false;

export function create_bolt_app(options?: { ignoreSelf?: boolean }): App {
  if (!config.slack.bot_token) throw new Error('SLACK_BOT_TOKEN not set');
  if (!config.slack.app_token) throw new Error('SLACK_APP_TOKEN not set');

  const app = new App({
    token: config.slack.bot_token,
    appToken: config.slack.app_token,
    socketMode: true,
    logLevel: LogLevel.WARN,
    ignoreSelf: options?.ignoreSelf ?? true,
  });

  register_actions(app);
  register_messages(app);

  return app;
}

export async function start_socket_app(): Promise<void> {
  if (!config.slack.app_token) {
    console.warn('[socket] SLACK_APP_TOKEN not set — Slack Socket Mode disabled');
    return;
  }

  bolt_app = create_bolt_app();
  await bolt_app.start();
  console.log('[socket] Slack Socket Mode connected');

  // finity state machine throws synchronously on 'server explicit disconnect' —
  // catch it here so it doesn't kill the API process; Bolt auto-reconnects.
  if (!_exception_handler_registered) {
    _exception_handler_registered = true;
    process.on('uncaughtException', (err) => {
      if (err.message?.includes('server explicit disconnect')) {
        console.warn('[socket] Server disconnect — Bolt will reconnect automatically');
      } else {
        console.error('[uncaught]', err);
        process.exit(1);
      }
    });
  }
}
