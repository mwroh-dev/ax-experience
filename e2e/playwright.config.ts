// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Load e2e/.env manually (no dotenv dependency at root)
const env_file = path.resolve(__dirname, '.env');
if (fs.existsSync(env_file)) {
  fs.readFileSync(env_file, 'utf-8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  });
}

export default defineConfig({
  testDir: './flows',
  testMatch: '**/*.e2e.ts',
  timeout: 120_000,
  retries: 0,
  // All tests share one Slack Electron CDP context (single visible page).
  // Parallel execution causes navigate_to_channel races → must run serially.
  workers: 1,
  reporter: [['list']],
  use: {
    headless: false, // CDP connects to running Slack Electron
  },
});
