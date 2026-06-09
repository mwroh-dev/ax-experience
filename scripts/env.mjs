/**
 * Reads .env from the project root and exports typed constants for test scripts.
 * Use: import { GATEWAY_TOKEN, GATEWAY_URL, CDP_URL, SLACK_TEAM_ID, SLACK_CHANNEL_ID } from '../env.mjs';
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

function parseEnv() {
  try {
    const raw = readFileSync(resolve(__dir, '../.env'), 'utf-8');
    return Object.fromEntries(
      raw.split('\n')
        .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
    );
  } catch { return {}; }
}

const e = parseEnv();

export const CDP_URL                 = e.CDP_URL                    ?? 'http://localhost:9222';
export const SLACK_TEAM_ID           = e.SLACK_TEAM_ID              ?? '';
export const SLACK_CHANNEL_ID        = e.SLACK_VOC_INBOX_ID         ?? '';
export const SLACK_VOC_REVIEW_CHANNEL = e.SLACK_VOC_REVIEW_CHANNEL  ?? '';
export const SLACK_VOC_LOG_CHANNEL    = e.SLACK_VOC_LOG_CHANNEL     ?? '';
