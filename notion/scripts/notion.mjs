#!/usr/bin/env node
/**
 * scripts/notion.mjs — Unified Notion automation
 *
 * node scripts/notion.mjs <action> [args]
 *
 * Actions:
 *   sync [--target sysprompt|workspace|both] [--category refund]
 *   seed
 *   cleanup
 *   verify-backlog <case_id>
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

mkdirSync('test-results', { recursive: true });
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));

const action = process.argv[2];

function parseOpts() {
  const args = process.argv.slice(3);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      opts[key] = (args[i + 1] && !args[i + 1].startsWith('--')) ? args[++i] : true;
    } else {
      opts._ ??= args[i];
    }
  }
  return opts;
}

// ── Env loading ───────────────────────────────────────────────────────────────

function loadEnv(envPath) {
  try {
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key && !process.env[key]) process.env[key] = val;
    }
  } catch {
    // env file not found — rely on existing process.env
  }
}

// Load cs-ops-api/.env first (Notion-specific vars), then root .env as fallback
loadEnv(join(__dirname, '..', 'cs-ops-api', '.env'));
loadEnv(join(__dirname, '..', '.env'));

// ── Notion shared ─────────────────────────────────────────────────────────────

const NOTION_VERSION = '2022-06-28';
const NOTION_BASE = 'https://api.notion.com/v1';

function notionToken() {
  const t = process.env.NOTION_TOKEN || process.env.NOTION_API_KEY;
  if (!t) throw new Error('NOTION_TOKEN or NOTION_API_KEY is not set');
  return t;
}

async function notionRequest(method, reqPath, body) {
  const resp = await fetch(`${NOTION_BASE}${reqPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${notionToken()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Notion ${method} ${reqPath} failed: HTTP ${resp.status} — ${text.slice(0, 300)}`);
  }
  return resp.json();
}

// ── Action: sync ──────────────────────────────────────────────────────────────

const SYSPROMPT_START = '<!-- NOTION_SYSPROMPT_START -->';
const SYSPROMPT_END   = '<!-- NOTION_SYSPROMPT_END -->';
const CONTEXT_START   = '<!-- NOTION_CONTEXT_START -->';
const CONTEXT_END     = '<!-- NOTION_CONTEXT_END -->';

const CONFIG_PATH = join(__dirname, '..', 'config', 'openclaw.json');
const AGENTS_MD   = join(__dirname, '..', 'workspace', 'AGENTS.md');

async function notionSearch(category) {
  let cursor;
  do {
    const body = { page_size: 100, filter: { value: 'page', property: 'object' } };
    if (cursor) body.start_cursor = cursor;
    const data = await notionRequest('POST', '/search', body);
    for (const page of (data.results ?? [])) {
      const props = page.properties ?? {};
      const cat     = props.Category?.select?.name ?? '';
      const qParts  = props.Question?.title ?? [];
      const aParts  = props.Answer?.rich_text ?? [];
      const question = qParts[0]?.plain_text ?? '';
      const answer   = aParts[0]?.plain_text ?? '';
      if (cat === category && question && answer) {
        return { id: page.id, question, answer, category: cat };
      }
    }
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return null;
}

function buildSysprompt(item) {
  const fetchedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return (
    `${SYSPROMPT_START}\n` +
    `You are a Korean CS assistant. Answer ONLY in Korean. ` +
    `Use ONLY the following NOTION_CONTEXT to answer. Do not add any other information.\n\n` +
    `NOTION_CONTEXT (fetched ${fetchedAt}):\n` +
    `question: ${item.question}\n` +
    `answer: ${item.answer}\n` +
    `${SYSPROMPT_END}`
  );
}

function injectSysprompt(sysprompt) {
  const CHANNEL_ID = process.env.SLACK_VOC_INBOX_ID ?? '';
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const channel = config.channels.slack.channels[CHANNEL_ID];
  if (!channel) throw new Error(`Channel ${CHANNEL_ID} not found in ${CONFIG_PATH}`);
  const existing = channel.systemPrompt ?? '';

  if (existing.includes(SYSPROMPT_START) && existing.includes(SYSPROMPT_END)) {
    const before = existing.slice(0, existing.indexOf(SYSPROMPT_START));
    const after  = existing.slice(existing.indexOf(SYSPROMPT_END) + SYSPROMPT_END.length);
    channel.systemPrompt = before + sysprompt + after;
  } else {
    channel.systemPrompt = sysprompt;
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  console.log(`  → injected into ${CONFIG_PATH} (channel ${CHANNEL_ID})`);
}

function buildWorkspaceBlock(item) {
  const fetchedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return (
    `${CONTEXT_START}\n` +
    `[NOTION_CONTEXT]\n` +
    `source: Notion CS FAQ\n` +
    `fetched_at: ${fetchedAt}\n` +
    `category: ${item.category}\n` +
    `question: ${item.question}\n` +
    `answer: ${item.answer}\n` +
    `${CONTEXT_END}`
  );
}

function injectWorkspace(block) {
  if (!existsSync(AGENTS_MD)) {
    throw new Error(`${AGENTS_MD} not found — is workspace mounted?`);
  }
  let content = readFileSync(AGENTS_MD, 'utf8');
  if (content.includes(CONTEXT_START) && content.includes(CONTEXT_END)) {
    const before = content.slice(0, content.indexOf(CONTEXT_START));
    const after  = content.slice(content.indexOf(CONTEXT_END) + CONTEXT_END.length);
    content = before + block + after;
  } else {
    content = content.replace(/\n+$/, '') + '\n\n' + block + '\n';
  }
  writeFileSync(AGENTS_MD, content, 'utf8');
  console.log(`  → injected into ${AGENTS_MD}`);
}

async function actionSync(opts) {
  const target   = opts.target ?? 'sysprompt';
  const category = opts.category ?? 'refund';

  console.log(`Fetching Notion FAQ (category=${category})...`);
  const item = await notionSearch(category);
  if (!item) {
    console.error(`ERROR: no item with category='${category}' found in Notion`);
    process.exit(1);
  }

  console.log(`Found: [${item.category}] ${item.question}`);
  console.log(`Answer: ${item.answer.slice(0, 80)}...`);

  if (target === 'sysprompt' || target === 'both') {
    console.log('\nTarget: sysprompt');
    injectSysprompt(buildSysprompt(item));
  }
  if (target === 'workspace' || target === 'both') {
    console.log('\nTarget: workspace');
    injectWorkspace(buildWorkspaceBlock(item));
  }

  console.log('\nDone. Gateway will hot-reload config automatically.');
}

// ── Action: seed ──────────────────────────────────────────────────────────────

const FAQ_DB_ID     = process.env.NOTION_FAQ_DB_ID ?? '';
const POLICIES_DB_ID = process.env.NOTION_POLICIES_DB_ID ?? '';
const BACKLOG_DB_ID  = process.env.NOTION_IMPROVEMENT_BACKLOG_DB_ID ?? '';

const fixtures = [
  {
    db_id: FAQ_DB_ID,
    label: 'FAQ QA_FAQ_SUBSCRIPTION_CANCEL_001',
    properties: {
      Question: { title: [{ text: { content: 'QA_FAQ_SUBSCRIPTION_CANCEL_001' } }] },
      Answer: { rich_text: [{ text: { content: '[QA fixture] 계정 설정 > 구독 관리에서 해지할 수 있습니다.' } }] },
    },
  },
  {
    db_id: FAQ_DB_ID,
    label: 'FAQ QA_FAQ_REFUND_POLICY_001',
    properties: {
      Question: { title: [{ text: { content: 'QA_FAQ_REFUND_POLICY_001' } }] },
      Answer: { rich_text: [{ text: { content: '[QA fixture] 구매 후 7일 이내 전액 환불 가능. 디지털 콘텐츠 다운로드 후 환불 불가.' } }] },
    },
  },
  {
    db_id: POLICIES_DB_ID,
    label: 'Policy QA_POLICY_REFUND_7DAYS_001',
    properties: {
      Title: { title: [{ text: { content: 'QA_POLICY_REFUND_7DAYS_001' } }] },
      Content: { rich_text: [{ text: { content: '[QA fixture] 구매 후 7일 이내 전액 환불 가능. 디지털 콘텐츠는 다운로드 후 환불 불가.' } }] },
    },
  },
  {
    db_id: BACKLOG_DB_ID,
    label: 'Backlog QA_BACKLOG_TEST_001',
    properties: {
      Issue: { title: [{ text: { content: 'QA_BACKLOG_TEST_001' } }] },
      'Fix Needed': { rich_text: [{ text: { content: '[QA fixture] P0 fixture isolation test row' } }] },
      Priority: { select: { name: 'Low' } },
      Type: { select: { name: 'data' } },
    },
  },
];

async function actionSeed() {
  console.log('[seed-qa-fixtures] 시작');
  const created = [];

  for (const fx of fixtures) {
    try {
      const result = await notionRequest('POST', '/pages', {
        parent: { database_id: fx.db_id },
        properties: fx.properties,
      });
      created.push({ label: fx.label, page_id: result.id });
      console.log(`  ✓ 생성: ${fx.label} → page_id: ${result.id}`);
    } catch (err) {
      console.error(`  ✗ 실패: ${fx.label} — ${err.message}`);
    }
  }

  console.log(`\n[seed-qa-fixtures] 완료: ${created.length}/${fixtures.length} 생성됨`);
  if (created.length > 0) {
    console.log('\n생성된 fixture IDs:');
    for (const { label, page_id } of created) {
      console.log(`  ${label}: ${page_id}`);
    }
  }
}

// ── Action: cleanup ───────────────────────────────────────────────────────────

const FIXTURE_PREFIXES = ['QA_', 'E2E_', 'TEST_'];

const DBS = [
  {
    name: 'FAQ DB',
    id: process.env.NOTION_FAQ_DB_ID ?? '',
    title_prop: 'Question',
  },
  {
    name: 'Policies DB',
    id: process.env.NOTION_POLICIES_DB_ID ?? '',
    title_prop: 'Title',
  },
  {
    name: 'Improvement Backlog DB',
    id: process.env.NOTION_IMPROVEMENT_BACKLOG_DB_ID ?? '',
    title_prop: 'Issue',
  },
  {
    name: 'Tickets Log DB',
    id: process.env.NOTION_CASES_DB_ID ?? '',
    title_prop: 'Ticket ID',
  },
];

function extractTitle(props, propName) {
  const arr = props[propName]?.title ?? [];
  return arr[0]?.plain_text ?? '';
}

async function queryFixturePages(db) {
  const pages = [];
  let cursor = undefined;

  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const data = await notionRequest('POST', `/databases/${db.id}/query`, body);

    for (const page of (data.results ?? [])) {
      const title = extractTitle(page.properties ?? {}, db.title_prop);
      if (FIXTURE_PREFIXES.some(p => title.startsWith(p))) {
        pages.push({ id: page.id, title });
      }
    }

    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return pages;
}

async function actionCleanup() {
  console.log('[cleanup-qa-fixtures] 시작');
  let total_found = 0;
  let total_archived = 0;

  for (const db of DBS) {
    console.log(`\n  DB: ${db.name}`);
    let pages;
    try {
      pages = await queryFixturePages(db);
    } catch (err) {
      console.error(`    ✗ 쿼리 실패: ${err.message}`);
      continue;
    }

    if (pages.length === 0) {
      console.log('    (QA fixture 없음)');
      continue;
    }

    total_found += pages.length;
    for (const { id, title } of pages) {
      try {
        await notionRequest('PATCH', `/pages/${id}`, { archived: true });
        total_archived++;
        console.log(`    ✓ archived: ${title} (${id})`);
      } catch (err) {
        console.error(`    ✗ archive 실패: ${title} — ${err.message}`);
      }
    }
  }

  console.log(`\n[cleanup-qa-fixtures] 완료: ${total_archived}/${total_found} archived`);
}

// ── Action: verify-backlog ────────────────────────────────────────────────────

const NOTION_DB_ID = process.env.NOTION_IMPROVEMENT_BACKLOG_DB_ID ?? '';
const NOTION_URL   = NOTION_DB_ID ? `https://www.notion.so/${NOTION_DB_ID.replace(/-/g, '')}` : '';
const CHROME_PROFILE = process.env.CHROME_PROFILE_DIR ?? join(os.tmpdir(), 'ax-experience-chrome-profile');

async function actionVerifyBacklog(caseId) {
  if (!caseId) {
    console.error('Usage: node notion.mjs verify-backlog <case_id>');
    process.exit(1);
  }

  console.log(`[notion] case_id=${caseId}`);
  console.log('[notion] launching Chrome with user profile...');

  const browser = await chromium.launchPersistentContext(CHROME_PROFILE, {
    channel: 'chrome',
    headless: false,
    args: ['--no-first-run', '--no-default-browser-check'],
  });

  try {
    const page = await browser.newPage();

    console.log('[notion] navigating to Improvement Backlog DB');
    await page.goto(NOTION_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => {
      console.log('[notion] goto warn:', e.message.slice(0, 60));
    });
    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'test-results/notion-1-loaded.png' });

    const pageState = await page.evaluate(() => ({
      title: document.title.slice(0, 60),
      url: location.href.replace(/\/[a-f0-9]{32}/, '/[DB_ID]'),
      loggedIn: !location.href.includes('/login'),
    }));
    console.log(`[notion] state: ${JSON.stringify(pageState)}`);

    if (!pageState.loggedIn) {
      console.log('[notion] NOT LOGGED IN — cannot verify without user credentials');
      process.exitCode = 2;
      return;
    }

    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/notion-2-db.png' });

    const found = await page.evaluate((cid) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      const results = [];
      let node;
      while ((node = walker.nextNode())) {
        const txt = node.textContent?.trim() ?? '';
        if (txt.includes(cid) || txt.includes('GDPR') || txt.includes('Improvement') || txt.includes('policy_or_faq')) {
          results.push({ text: txt.slice(0, 120), tag: node.parentElement?.tagName });
        }
      }
      return results.slice(0, 20);
    }, caseId);

    console.log(`[notion] matches: ${found.length}`);
    found.forEach(f => console.log(`  [${f.tag}] ${f.text.slice(0, 80)}`));

    await page.screenshot({ path: 'test-results/notion-3-final.png', fullPage: false });
    console.log('[notion] done — check test-results/notion-*.png');
  } finally {
    await browser.close();
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

if (!action) {
  console.error('Usage: node scripts/notion.mjs <action> [args]');
  console.error('Actions: sync, seed, cleanup, verify-backlog');
  process.exit(1);
}

const opts = parseOpts();

switch (action) {
  case 'sync':
    actionSync(opts).catch(err => { console.error(err.message); process.exit(1); });
    break;
  case 'seed':
    actionSeed().catch(err => { console.error('[seed-qa-fixtures] 치명적 오류:', err.message); process.exit(1); });
    break;
  case 'cleanup':
    actionCleanup().catch(err => { console.error('[cleanup-qa-fixtures] 치명적 오류:', err.message); process.exit(1); });
    break;
  case 'verify-backlog':
    actionVerifyBacklog(opts._).catch(err => { console.error('[notion] fatal:', err.message); process.exit(1); });
    break;
  default:
    console.error(`Unknown action: ${action}`);
    console.error('Actions: sync, seed, cleanup, verify-backlog');
    process.exit(1);
}
