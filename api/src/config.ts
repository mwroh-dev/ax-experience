import path from 'path';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.string().default('3100'),
  DB_PATH: z.string().optional(),
  OPENCLAW_BASE_URL: z.string().optional(),
  // Slack
  CS_OPS_SLACK_BOT_TOKEN: z.string().optional(),
  SLACK_BOT_TOKEN: z.string().optional(),
  CS_OPS_SLACK_APP_TOKEN: z.string().optional(),
  SLACK_APP_TOKEN: z.string().optional(),
  SLACK_VOC_REVIEW_CHANNEL: z.string().optional(),
  SLACK_VOC_LOG_CHANNEL: z.string().optional(),
  SLACK_CS_EVENTS_CHANNEL: z.string().optional(),
  SLACK_OPS_CHANNEL_ID: z.string().optional(),
  // Notion
  NOTION_API_KEY: z.string().optional(),
  NOTION_TOKEN: z.string().optional(),
  NOTION_CASES_DB_ID: z.string().optional(),
  NOTION_FAQ_DB_ID: z.string().optional(),
  NOTION_POLICIES_DB_ID: z.string().optional(),
  NOTION_IMPROVEMENT_BACKLOG_DB_ID: z.string().optional(),
  // Ollama / LLM
  OLLAMA_URL: z.string().default('http://localhost:11434'),
  OLLAMA_API_KEY: z.string().optional(),
  // Commerce
  COMMERCE_API_BASE_URL: z.string().optional(),
});

const _parsed = EnvSchema.safeParse(process.env);
if (!_parsed.success) {
  console.error('[config] ENV validation failed:', _parsed.error.issues);
  process.exit(1);
}

const _env = _parsed.data;

function _mask(val: string): string {
  if (val.length <= 8) return '***';
  return val.slice(0, 4) + '***' + val.slice(-4);
}

const _port = parseInt(_env.PORT, 10);

export const config = {
  port: _port,
  db_path: path.resolve(_env.DB_PATH ?? '.data/cs-ops.db'),
  openclaw_base_url: _env.OPENCLAW_BASE_URL ?? 'http://localhost:18789',
  ollama_url: _env.OLLAMA_URL,
  ollama_api_key: _env.OLLAMA_API_KEY ?? 'ollama',
  commerce_api_base_url: _env.COMMERCE_API_BASE_URL ?? `http://localhost:${_port}/commerce`,
  slack: {
    // CS_OPS_ prefix = cs-ops-core 전용 앱. SLACK_ fallback은 임시 단일 앱 사용 시
    bot_token: _env.CS_OPS_SLACK_BOT_TOKEN || _env.SLACK_BOT_TOKEN || '',
    app_token: _env.CS_OPS_SLACK_APP_TOKEN || _env.SLACK_APP_TOKEN || '',
    voc_review_channel: _env.SLACK_VOC_REVIEW_CHANNEL ?? '',
    voc_log_channel: _env.SLACK_VOC_LOG_CHANNEL ?? '',
    cs_events_channel: _env.SLACK_CS_EVENTS_CHANNEL ?? '',
    ops_channel_id: _env.SLACK_OPS_CHANNEL_ID ?? '',
  },
  notion: {
    // Accept either name; NOTION_API_KEY is the canonical Notion integration name
    token: _env.NOTION_API_KEY || _env.NOTION_TOKEN || '',
    cases_db_id: _env.NOTION_CASES_DB_ID ?? '',
    faq_db_id: _env.NOTION_FAQ_DB_ID ?? '',
    policies_db_id: _env.NOTION_POLICIES_DB_ID ?? '',
    improvement_backlog_db_id: _env.NOTION_IMPROVEMENT_BACKLOG_DB_ID ?? '',
  },
};

export function log_config_summary(): void {
  console.log('[config] cs-ops-core configuration:');
  console.log(`  port: ${config.port}`);
  console.log(`  db_path: ${config.db_path}`);
  console.log(`  openclaw_base_url: ${config.openclaw_base_url}`);
  console.log(`  ollama_url: ${config.ollama_url}`);
  if (config.slack.bot_token) {
    console.log(`  slack.bot_token: ${_mask(config.slack.bot_token)}`);
  } else {
    console.log('  slack.bot_token: (not set)');
  }
  if (config.slack.app_token) {
    console.log(`  slack.app_token: ${_mask(config.slack.app_token)}`);
  } else {
    console.log('  slack.app_token: (not set)');
  }
  console.log(`  slack.voc_review_channel: ${config.slack.voc_review_channel || '(not set)'}`);
  console.log(`  slack.voc_log_channel: ${config.slack.voc_log_channel || '(not set)'}`);
}
