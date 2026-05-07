import { Module, Global } from '@nestjs/common';
import { config } from '../config';

export const CONFIG_TOKEN = 'CONFIG';

export interface AppConfig {
  port: number;
  db_path: string;
  openclaw_base_url: string;
  ollama_url: string;
  ollama_api_key: string;
  commerce_api_base_url: string;
  slack: {
    bot_token?: string;
    app_token?: string;
    voc_review_channel?: string;
    voc_log_channel?: string;
    cs_events_channel?: string;
    ops_channel_id?: string;
  };
  notion: {
    token?: string;
    cases_db_id?: string;
    faq_db_id?: string;
    policies_db_id?: string;
    improvement_backlog_db_id?: string;
  };
}

@Global()
@Module({
  providers: [{ provide: CONFIG_TOKEN, useValue: config }],
  exports: [CONFIG_TOKEN],
})
export class AppConfigModule {}
