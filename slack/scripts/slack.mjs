#!/usr/bin/env node
/**
 * scripts/slack.mjs — Unified Slack CDP automation
 *
 * node scripts/slack.mjs <action> [args]
 *
 * Actions:
 *   send [--message <msg>] [--bot <name>] [--wait <ms>]
 *   read-thread
 *   verify --phrases <p1,p2,...>
 *   full-test [--message <msg>]
 *   invite-bot
 *   accept <case_id>
 *   pending <case_id>
 *   send-reply <case_id>
 *   verify-thread <case_id>
 *   verify-cards
 *   e2e-accept
 *   e2e-nosource
 */
import { chromium } from 'playwright';
import {
  CDP_URL,
  SLACK_TEAM_ID,
  SLACK_VOC_REVIEW_CHANNEL,
  SLACK_VOC_LOG_CHANNEL,
  GATEWAY_TOKEN,
} from '../../scripts/env.mjs';

const BASE = process.env.API_BASE || 'http://localhost:3100';
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

// ── Shared CDP utilities ────────────────────────────────────────────────────

async function connectSlack() {
  const browser = await chromium.connectOverCDP(CDP_URL);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find(p => p.url().includes('app.slack.com')) ?? ctx.pages()[0];
  if (!page) throw new Error('No Slack page found — is Slack running with --remote-debugging-port=9222?');
  return { browser, page };
}

async function navigateToChannel(page, channelId) {
  await page.goto(`https://app.slack.com/client/${SLACK_TEAM_ID}/${channelId}`);
  await page.waitForTimeout(2000);
}

async function dismissBanner(page) {
  try {
    const b = page.locator('[data-qa="new_messages_banner"]');
    if (await b.isVisible({ timeout: 1500 })) await b.click();
  } catch { /* ignore */ }
}

async function findAndClickButton(page, caseId, label) {
  await page.locator('[data-qa="message_pane_main"]').waitFor({ timeout: 10000 });
  const uid = `btn-${Date.now()}`;
  const found = await page.evaluate(({ caseId, label, uid }) => {
    const pane = document.querySelector('[data-qa="message_pane_main"]') || document.body;
    const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue.includes(caseId)) continue;
      let el = node.parentElement;
      for (let i = 0; i < 20; i++) {
        if (!el) break;
        const btns = Array.from(el.querySelectorAll('button'));
        const target = btns.find(b => b.textContent.trim() === label);
        // Require ≥2 buttons in container to avoid matching single-button non-card elements
        if (target && btns.length >= 2) { target.setAttribute('data-uid', uid); return true; }
        el = el.parentElement;
      }
    }
    return false;
  }, { caseId, label, uid });
  if (!found) throw new Error(`Button "${label}" not found for case ${caseId}`);
  await page.locator(`[data-uid="${uid}"]`).click();
  console.log(`✅ Clicked "${label}" for ${caseId}`);
}

// ── API utilities ───────────────────────────────────────────────────────────

async function pollRuns(caseId, types, ms = 30000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const r = await fetch(`${BASE}/api/automation-runs?case_id=${caseId}`);
    if (!r.ok) throw new Error(`pollRuns HTTP ${r.status} for case ${caseId}`);
    const runs = await r.json();
    const got = new Set(runs.map(r => r.run_type));
    if (types.every(t => got.has(t))) return runs;
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Timeout waiting for AutomationRuns: ${types.join(', ')}`);
}

async function createCase(text) {
  const ts = Date.now();
  const r = await fetch(`${BASE}/api/intake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GATEWAY_TOKEN}` },
    body: JSON.stringify({ slack_ts: `e2e-${ts}`, channel: SLACK_VOC_REVIEW_CHANNEL, text }),
  });
  if (!r.ok) throw new Error(`createCase HTTP ${r.status}`);
  const body = await r.json();
  if (!body.case_id) throw new Error(`intake failed: ${JSON.stringify(body)}`);
  return body.case_id;
}

// ── Action handlers ─────────────────────────────────────────────────────────

async function actionSend({ message = '환불 가능한가요?', bot = 'csopsagent', wait = '35000' }) {
  const { browser, page } = await connectSlack();
  try {
    await navigateToChannel(page, SLACK_VOC_REVIEW_CHANNEL);
    const input = page.locator('[data-qa="message_input"]');
    await input.click();
    await input.type(`@${bot} ${message}`);
    const ac = page.locator('[data-qa="user_mention_sheet_list_item"]').first();
    if (await ac.isVisible({ timeout: 2000 })) await ac.click();
    await input.press('Enter');
    console.log(`✅ Sent: @${bot} ${message}`);
    if (+wait > 0) await page.waitForTimeout(+wait);
  } finally { await browser.close(); }
}

async function actionReadThread() {
  const { browser, page } = await connectSlack();
  try {
    await navigateToChannel(page, SLACK_VOC_REVIEW_CHANNEL);
    const link = page.locator('a[data-qa="replies_link"]').last();
    await link.click();
    await page.waitForTimeout(1500);
    const text = await page.locator('[data-qa="threads_flexpane"]').textContent();
    console.log('Thread content:\n', text?.slice(0, 800));
  } finally { await browser.close(); }
}

async function actionVerify({ phrases = '' }) {
  const list = phrases.split(',').map(s => s.trim()).filter(Boolean);
  const { browser, page } = await connectSlack();
  try {
    await navigateToChannel(page, SLACK_VOC_REVIEW_CHANNEL);
    const input = page.locator('[data-qa="message_input"]');
    await input.click();
    await input.type(`@csopsagent 환불 가능한가요?`);
    const ac = page.locator('[data-qa="user_mention_sheet_list_item"]').first();
    if (await ac.isVisible({ timeout: 2000 })) await ac.click();
    await input.press('Enter');
    console.log('✅ Sent message, waiting for response...');
    await page.waitForTimeout(35000);
    const text = await page.locator('[data-qa="message_pane_main"]').textContent() ?? '';
    const results = list.map(p => ({ phrase: p, found: text.includes(p) }));
    results.forEach(r => console.log(r.found ? `✅ ${r.phrase}` : `❌ ${r.phrase}`));
    process.exit(results.every(r => r.found) ? 0 : 1);
  } finally { await browser.close(); }
}

async function actionFullTest({ message = '환불 가능한가요?' }) {
  const { browser, page } = await connectSlack();
  try {
    await navigateToChannel(page, SLACK_VOC_REVIEW_CHANNEL);
    const input = page.locator('[data-qa="message_input"]');
    await input.click();
    await input.type(`@csopsagent ${message}`);
    const ac = page.locator('[data-qa="user_mention_sheet_list_item"]').first();
    if (await ac.isVisible({ timeout: 2000 })) await ac.click();
    const before = await page.locator('[data-qa="message_pane_main"] [data-qa="message_container"]').count();
    await input.press('Enter');
    console.log('⏳ Waiting for bot response...');
    await page.waitForFunction(
      (before) => document.querySelectorAll('[data-qa="message_pane_main"] [data-qa="message_container"]').length > before,
      before, { timeout: 40000 }
    );
    const text = await page.locator('[data-qa="message_pane_main"] [data-qa="message_container"]').last().textContent();
    console.log('Bot response:', text?.slice(0, 500));
    await page.screenshot({ path: '/tmp/slack-full-test.png' });
    console.log('📸 /tmp/slack-full-test.png');
  } finally { await browser.close(); }
}

async function actionInviteBot() {
  const { browser, page } = await connectSlack();
  const channels = [SLACK_VOC_REVIEW_CHANNEL, SLACK_VOC_LOG_CHANNEL];
  try {
    for (const ch of channels) {
      await navigateToChannel(page, ch);
      const input = page.locator('[data-qa="message_input"]');
      await input.click();
      await input.fill('/invite @csopsagent');
      await input.press('Enter');
      await page.waitForTimeout(2000);
      console.log(`✅ Invited @csopsagent to ${ch}`);
    }
  } finally { await browser.close(); }
}

async function actionAccept(caseId) {
  if (!caseId) { console.error('Usage: slack.mjs accept <case_id>'); process.exit(1); }
  const { browser, page } = await connectSlack();
  try {
    await navigateToChannel(page, SLACK_VOC_REVIEW_CHANNEL);
    await dismissBanner(page);
    await findAndClickButton(page, caseId, 'Accept');
    await page.waitForTimeout(10000);
    await page.screenshot({ path: `/tmp/slack-accept-${caseId}.png` });
    console.log(`📸 /tmp/slack-accept-${caseId}.png`);
  } finally { await browser.close(); }
}

async function actionPending(caseId) {
  if (!caseId) { console.error('Usage: slack.mjs pending <case_id>'); process.exit(1); }
  const { browser, page } = await connectSlack();
  try {
    await navigateToChannel(page, SLACK_VOC_REVIEW_CHANNEL);
    await dismissBanner(page);
    await findAndClickButton(page, caseId, 'Pending');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `/tmp/slack-pending-${caseId}.png` });
  } finally { await browser.close(); }
}

async function actionSendReply(caseId) {
  if (!caseId) { console.error('Usage: slack.mjs send-reply <case_id>'); process.exit(1); }
  const { browser, page } = await connectSlack();
  try {
    await navigateToChannel(page, SLACK_VOC_REVIEW_CHANNEL);
    await dismissBanner(page);
    try { await findAndClickButton(page, caseId, 'Send'); }
    catch { await findAndClickButton(page, caseId, 'Auto Send'); }
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `/tmp/slack-send-${caseId}.png` });
  } finally { await browser.close(); }
}

async function actionVerifyThread(caseId) {
  if (!caseId) { console.error('Usage: slack.mjs verify-thread <case_id>'); process.exit(1); }
  const { browser, page } = await connectSlack();
  try {
    await navigateToChannel(page, SLACK_VOC_REVIEW_CHANNEL);
    const link = page.locator('[data-qa="message_pane_main"] a[data-qa="replies_link"]').last();
    await link.click();
    await page.waitForTimeout(1500);
    const thread = await page.locator('[data-qa="threads_flexpane"]').textContent();
    console.log('Thread:\n', thread?.slice(0, 800));
    await page.screenshot({ path: `/tmp/slack-thread-${caseId}.png` });

    await navigateToChannel(page, SLACK_VOC_LOG_CHANNEL);
    await page.waitForTimeout(1500);
    const logText = await page.locator('[data-qa="message_pane_main"]').textContent() ?? '';
    console.log(logText.includes(caseId) ? `✅ ${caseId} in #voc-log` : `⚠️  ${caseId} not in #voc-log`);
  } finally { await browser.close(); }
}

async function actionVerifyCards() {
  const { browser, page } = await connectSlack();
  try {
    await navigateToChannel(page, SLACK_VOC_REVIEW_CHANNEL);
    await page.waitForTimeout(2000);
    const text = await page.locator('[data-qa="message_pane_main"]').textContent() ?? '';
    const checks = [
      ['policy_faq',         text.includes('policy_faq')],
      ['legal_threat',       text.includes('legal_threat')],
      ['auto-reply badge',   text.includes('자동응답 후보') || text.includes('Auto Reply')],
      ['escalation badge',   text.includes('에스컬레이션') || text.includes('Escalation')],
    ];
    checks.forEach(([l, ok]) => console.log(ok ? `✅ ${l}` : `❌ ${l}`));
    const passed = checks.filter(([, ok]) => ok).length;
    console.log(`${passed}/${checks.length} checks passed`);
    process.exit(passed >= 2 ? 0 : 1);
  } finally { await browser.close(); }
}

async function actionE2eAccept() {
  const caseId = await createCase(`E2E 테스트 환불 요청 ORD-${Date.now()}`);
  console.log(`📋 ${caseId}`);
  await pollRuns(caseId, ['classify', 'slack_post'], 30000);
  console.log('✅ classified + posted to Slack');

  const { browser, page } = await connectSlack();
  try {
    await navigateToChannel(page, SLACK_VOC_REVIEW_CHANNEL);
    await dismissBanner(page);
    await page.waitForTimeout(2000);
    await findAndClickButton(page, caseId, 'Accept');
    await page.screenshot({ path: `/tmp/e2e-accept-${caseId}.png` });

    const runs = await pollRuns(caseId, ['retrieve_evidence', 'commerce_lookup', 'draft_reply'], 35000);
    const draft = runs.find(r => r.run_type === 'draft_reply');
    if (draft?.status === 'success') {
      console.log('✅ E2E PASS — Accept→Draft pipeline complete');
      process.exit(0);
    } else {
      console.error(`❌ E2E FAIL — draft_reply.status=${draft?.status}`);
      process.exit(1);
    }
  } finally { await browser.close(); }
}

async function actionE2eNosource() {
  const caseId = await createCase('신제품 사전예약 언제 시작하나요? 기다리고 있어요');
  console.log(`📋 ${caseId}`);
  await pollRuns(caseId, ['classify', 'slack_post'], 30000);

  const { browser, page } = await connectSlack();
  try {
    await navigateToChannel(page, SLACK_VOC_REVIEW_CHANNEL);
    await dismissBanner(page);
    await page.waitForTimeout(2000);
    await findAndClickButton(page, caseId, 'Accept');
    const runs = await pollRuns(caseId, ['retrieve_evidence', 'draft_reply'], 35000);
    const draft = runs.find(r => r.run_type === 'draft_reply');

    const rpt = await fetch(`${BASE}/api/voc/report`);
    if (!rpt.ok) throw new Error(`report HTTP ${rpt.status}`);
    const report = await rpt.json();
    const backlog = report?.improvement_backlog?.open ?? 0;

    if (draft?.status === 'success' && backlog >= 1) {
      console.log(`✅ E2E PASS — no-source→backlog (open: ${backlog})`);
      process.exit(0);
    } else {
      console.error(`❌ E2E FAIL — draft=${draft?.status}, backlog=${backlog}`);
      process.exit(1);
    }
  } finally { await browser.close(); }
}

// ── Dispatch ────────────────────────────────────────────────────────────────

const opts = parseOpts();
switch (action) {
  case 'send':           await actionSend(opts); break;
  case 'read-thread':    await actionReadThread(); break;
  case 'verify':         await actionVerify(opts); break;
  case 'full-test':      await actionFullTest(opts); break;
  case 'invite-bot':     await actionInviteBot(); break;
  case 'accept':         await actionAccept(opts._); break;
  case 'pending':        await actionPending(opts._); break;
  case 'send-reply':     await actionSendReply(opts._); break;
  case 'verify-thread':  await actionVerifyThread(opts._); break;
  case 'verify-cards':   await actionVerifyCards(); break;
  case 'e2e-accept':     await actionE2eAccept(); break;
  case 'e2e-nosource':   await actionE2eNosource(); break;
  default:
    console.error(`Unknown action: ${action}`);
    console.error('Actions: send, read-thread, verify, full-test, invite-bot, accept, pending, send-reply, verify-thread, verify-cards, e2e-accept, e2e-nosource');
    process.exit(1);
}
