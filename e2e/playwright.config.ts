// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './flows',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  retries: 0,
  // All tests share one Slack Electron CDP context (single visible page).
  // Parallel execution causes navigate_to_channel races → must run serially.
  workers: 1,
  reporter: [['list']],
  use: {
    headless: false, // CDP connects to running Slack Electron
  },
});
