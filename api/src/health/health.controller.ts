import { Controller, Get, Inject } from '@nestjs/common';
import { CONFIG_TOKEN, AppConfig } from '../config/config.module';
import { get_db } from '../db/sqlite';

@Controller()
export class HealthController {
  constructor(@Inject(CONFIG_TOKEN) private readonly cfg: AppConfig) {}

  @Get('healthz')
  healthz() {
    return { ok: true, service: 'cs-ops-core', ts: new Date().toISOString() };
  }

  @Get('api/health/deps')
  async deps() {
    async function ping(url: string) {
      const t0 = Date.now();
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const r = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        return { live: r.ok, latency_ms: Date.now() - t0 };
      } catch (e: any) {
        return { live: false, error: e.cause?.code ?? e.message ?? 'UNKNOWN' };
      }
    }
    const [commerce_api] = await Promise.all([
      ping(`${process.env.COMMERCE_API_BASE_URL ?? 'http://localhost:3101'}/health`),
    ]);
    let sqlite_ready = false;
    try { get_db(); sqlite_ready = true; } catch {}
    return {
      slack: { configured: !!this.cfg.slack.bot_token, status: this.cfg.slack.bot_token ? 'valid' : 'not_configured' },
      notion: { configured: !!this.cfg.notion.token, status: this.cfg.notion.token ? 'valid' : 'not_configured' },
      commerce_api,
      sqlite: { ready: sqlite_ready, path: '[LOCAL_PATH]' },
    };
  }
}
