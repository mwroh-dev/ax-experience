#!/usr/bin/env node
/**
 * Full pipeline E2E test — real CDP Slack interaction, no test-endpoint bypass.
 *
 * Prerequisites:
 *   - api running on :3100 (cd api && node dist/app.js)
 *   - Slack desktop app open with --remote-debugging-port=9222
 *   - Dashboard open at http://localhost:3100 or http://localhost:5173
 *   - openclaw running on :18789
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

mkdirSync('test-results', { recursive: true });
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

function parseEnv() {
  try {
    const raw = readFileSync(resolve(__dir, '../../.env'), 'utf-8');
    return Object.fromEntries(
      raw.split('\n')
        .filter(l => l.trim() && !l.startsWith('#') && l.includes('='))
        .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
    );
  } catch { return {}; }
}

const env = parseEnv();
const BASE = process.env.API_BASE ?? 'http://localhost:3100';
const CDP_URL = env.CDP_URL ?? 'http://localhost:9222';        // Slack desktop app
const DASH_CDP_URL = process.env.DASH_CDP_URL ?? 'http://localhost:9223'; // Chrome for dashboard
const SLACK_TEAM_ID = env.SLACK_TEAM_ID ?? '';
const VOC_REVIEW = env.SLACK_VOC_REVIEW_CHANNEL ?? '';
const VOC_LOG = env.SLACK_VOC_LOG_CHANNEL ?? '';

const MAX_ANCESTOR_WALK = 30;

const checks = [];
const check = (label, value) => {
  checks.push({ label, value });
  console.log(`  ${value ? '✅' : '❌'} ${label}`);
};

async function pollRuns(caseId, types, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await fetch(`${BASE}/api/automation-runs?case_id=${caseId}`)
      .then(r => r.ok ? r.json() : null).catch(() => null);
    const runs = r?.runs ?? (Array.isArray(r) ? r : []);
    const done = types.every(t => runs.some(ru => (ru.run_type ?? ru.type) === t && ru.status === 'success'));
    if (done) return runs;
    await new Promise(r => setTimeout(r, 1500));
  }
  // Log last observed state for debugging
  const last = await fetch(`${BASE}/api/automation-runs?case_id=${caseId}`)
    .then(r => r.ok ? r.json() : null).catch(() => null);
  const lastRuns = last?.runs ?? (Array.isArray(last) ? last : []);
  if (lastRuns.length > 0) {
    console.error(`  Last observed runs: ${lastRuns.map(r => `${r.run_type ?? r.type}=${r.status}`).join(', ')}`);
  }
  return null;
}

async function closeThreadAndScrollPrimary(page) {
  const hadThread = await page.evaluate(() => {
    const sec = document.querySelector('.p-view_contents--secondary');
    const closeBtn = sec?.querySelector('button[aria-label="Close"]');
    if (closeBtn) { closeBtn.click(); return true; }
    return false;
  });
  if (hadThread) await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const prim = document.querySelector('.p-view_contents--primary');
    if (!prim) return;
    const sk = prim.querySelector('[data-qa="slack_kit_scrollbar"]');
    (sk || prim).scrollTop = 999999;
  });
  await page.waitForTimeout(500);
}

async function findAndClickButton(page, caseId, label) {
  await closeThreadAndScrollPrimary(page);

  const actionIdMap = { Accept: 'case_accept', Reject: 'case_reject' };
  const actionId = actionIdMap[label];

  const rect = await page.evaluate(({ caseId, label, actionId }) => {
    const pane = document.querySelector('.p-view_contents--primary') ||
                 document.querySelector('[data-qa="message_pane"]') ||
                 document.querySelector('[data-qa="message_pane_main"]') ||
                 document.body;
    const walker = document.createTreeWalker(pane, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue.includes(caseId)) continue;
      let el = node.parentElement;
      for (let i = 0; i < MAX_ANCESTOR_WALK; i++) {
        if (!el) break;
        if (actionId) {
          const byId = el.querySelector(`[data-qa-action-id="${actionId}"]`);
          if (byId) { const r = byId.getBoundingClientRect(); if (r.width > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
        }
        const btns = Array.from(el.querySelectorAll('button'));
        const target = btns.find(b => b.textContent.trim() === label);
        if (target && btns.length >= 2) {
          const r = target.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        }
        el = el.parentElement;
      }
    }
    return null;
  }, { caseId, label, actionId });
  if (!rect) throw new Error(`Button "${label}" not found for case ${caseId}`);
  await page.mouse.click(rect.x, rect.y);
  console.log(`  🖱️  Clicked "${label}" for ${caseId}`);
}

async function run() {
  console.log('\n=== Full Pipeline E2E Test ===\n');

  // Step 1: Create CS event
  const csResp = await fetch(`${BASE}/api/cs-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'web',
      event_type: 'cs_message',
      message: `E2E 테스트 환불 요청 — ORD-REFUND — ${Date.now()}`,
    }),
  }).then(r => r.ok ? r.json() : null).catch(() => null);

  const caseId = csResp?.case_id;
  check('Step 1: CS event created (case_id returned)', !!caseId);
  if (!caseId) {
    console.error('\nFATAL: api not responding — is it running on :3100?');
    return false;
  }
  console.log(`  case_id: ${caseId}`);

  // Step 2: Wait for classify + slack_post
  console.log('\nStep 2: Waiting for classify + slack_post (up to 30s)...');
  const postRuns = await pollRuns(caseId, ['classify', 'slack_post']);
  check('Step 2: classify + slack_post succeeded', !!postRuns);
  if (!postRuns) {
    console.error('  TIMEOUT — openclaw or Slack not responding');
    return false;
  }

  // Step 3: CDP Accept in Slack
  console.log('\nStep 3: CDP — clicking Accept in #voc-review...');
  let slackBrowser;
  let slackPage;
  try {
    slackBrowser = await chromium.connectOverCDP(CDP_URL);
    const ctx = slackBrowser.contexts()[0];
    slackPage = ctx.pages().find(p => p.url().includes('app.slack.com')) ?? ctx.pages()[0];
    if (!slackPage) throw new Error('No Slack page — open Slack with --remote-debugging-port=9222');

    await slackPage.goto(`https://app.slack.com/client/${SLACK_TEAM_ID}/${VOC_REVIEW}`);
    await slackPage.waitForTimeout(2500);

    try {
      const b = slackPage.locator('[data-qa="new_messages_banner"]');
      if (await b.isVisible({ timeout: 1000 })) await b.click();
    } catch { /* ignore */ }

    await findAndClickButton(slackPage, caseId, 'Accept');
    await slackPage.screenshot({ path: `test-results/e2e-accept-${caseId}.png` });
    check('Step 3: Accept button clicked in Slack', true);
    console.log(`  📸 test-results/e2e-accept-${caseId}.png`);
  } catch (err) {
    check('Step 3: Accept button clicked in Slack', false);
    console.error(`  ERROR (Step 3): ${err.message}`);
    if (slackBrowser) await slackBrowser.close().catch(() => {});
    slackBrowser = null;
  }

  // Step 4: Wait for evidence + draft (only if Step 3 passed)
  if (slackPage) {
    console.log('\nStep 4: Waiting for retrieve_evidence + commerce_lookup + draft_reply (up to 35s)...');
    const draftRuns = await pollRuns(caseId, ['retrieve_evidence', 'commerce_lookup', 'draft_reply'], 35000);
    const draftOk = draftRuns?.find(r => (r.run_type ?? r.type) === 'draft_reply')?.status === 'success';
    check('Step 4: retrieve_evidence + commerce_lookup + draft_reply succeeded', !!draftRuns && draftOk);

    if (!draftRuns || !draftOk) {
      console.error('  Skipping Send — draft not ready');
      if (slackBrowser) await slackBrowser.close().catch(() => {});
      slackBrowser = null;
      slackPage = null;
    }
  } else {
    check('Step 4: retrieve_evidence + commerce_lookup + draft_reply succeeded', false);
    console.error('  Skipped — Step 3 failed');
  }

  // Step 5: CDP Send in Slack — open thread then click Send (only if Step 4 passed)
  if (slackPage) {
    console.log('\nStep 5: CDP — clicking Send in thread #voc-review...');
    try {
      // Navigate back to channel explicitly to get into a known state
      await slackPage.goto(`https://app.slack.com/client/${SLACK_TEAM_ID}/${VOC_REVIEW}`, { waitUntil: 'domcontentloaded' });
      await slackPage.waitForTimeout(3000);
      await closeThreadAndScrollPrimary(slackPage);

      // Open thread: find the specific message container containing caseId, then click its reply count
      const findReplyByTs = ({ caseId }) => {
        const prim = document.querySelector('.p-view_contents--primary') || document.body;
        const walker = document.createTreeWalker(prim, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          if (!node.nodeValue.includes(caseId)) continue;
          let el = node.parentElement;
          for (let i = 0; i < MAX_ANCESTOR_WALK; i++) {
            if (!el || el === prim) break;
            // Use data-qa="reply_bar_count" — Slack's reply count button
            const replyBtns = el.querySelectorAll('[data-qa="reply_bar_count"]');
            if (replyBtns.length === 1) {
              // Found the message container with exactly 1 reply button — click it
              const r = replyBtns[0].getBoundingClientRect();
              if (r.y > 0 && r.width > 0) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            } else if (replyBtns.length > 1) {
              break; // crossed message boundary
            }
            el = el.parentElement;
          }
        }
        return null;
      };
      let replyRect = null;
      const replyDeadline = Date.now() + 20000;
      while (!replyRect && Date.now() < replyDeadline) {
        replyRect = await slackPage.evaluate(findReplyByTs, { caseId });
        if (!replyRect) await slackPage.waitForTimeout(800);
      }

      if (replyRect) {
        await slackPage.mouse.click(replyRect.x, replyRect.y);
        await slackPage.waitForTimeout(4000);
        // Scroll thread panel to bottom so buttons at the end of CS Bot Draft are in viewport
        await slackPage.evaluate(() => {
          const thread = document.querySelector('[data-qa="threads_flexpane"]') ||
                         document.querySelector('.p-view_contents--secondary');
          if (!thread) return;
          const scrollable = thread.querySelector('[data-qa="slack_kit_scrollbar"]') || thread;
          scrollable.scrollTop = scrollable.scrollHeight;
        });
        await slackPage.waitForTimeout(800);
        console.log(`  🖱️  Opened thread for ${caseId}`);
      }

      // Verify the thread shows the correct caseId, then click Send via Playwright locator
      const threadCheck = await slackPage.evaluate((caseId) => {
        const thread = document.querySelector('[data-qa="threads_flexpane"]') ||
                       document.querySelector('.p-view_contents--secondary');
        if (!thread) return { noThread: true };
        const walker = document.createTreeWalker(thread, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) { if (node.nodeValue.includes(caseId)) return { ok: true }; }
        return { wrongThread: true };
      }, caseId);
      if (!threadCheck.ok) throw new Error(threadCheck.noThread ? `Thread panel not open for ${caseId}` : `Thread panel shows wrong case (not ${caseId})`);

      // Find Send button coordinates in thread panel — use mouse.click (same as Accept)
      let sendRect = null;
      const sendDeadline = Date.now() + 10000;
      while (!sendRect && Date.now() < sendDeadline) {
        sendRect = await slackPage.evaluate(() => {
          const thread = document.querySelector('[data-qa="threads_flexpane"]') ||
                         document.querySelector('.p-view_contents--secondary');
          if (!thread) return null;
          const btn = thread.querySelector('[data-qa-action-id="case_send"]');
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          if (r.width <= 0 || r.y <= 0) return null;
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        });
        if (!sendRect) await slackPage.waitForTimeout(500);
      }
      if (!sendRect) throw new Error(`Send button not found in thread after 10s`);
      await slackPage.waitForTimeout(400);
      await slackPage.mouse.click(sendRect.x, sendRect.y);

      await slackPage.waitForTimeout(500);
      await slackPage.screenshot({ path: `test-results/e2e-send-${caseId}.png` });
      check('Step 5: Send button clicked in Slack', true);
      console.log(`  🖱️  Clicked Send in thread`);
      console.log(`  📸 test-results/e2e-send-${caseId}.png`);
    } catch (err) {
      check('Step 5: Send button clicked in Slack', false);
      console.error(`  ERROR (Step 5): ${err.message}`);
    }
  } else {
    check('Step 5: Send button clicked in Slack', false);
    console.error('  Skipped — previous step failed');
  }

  // Step 6: Poll for resolved status
  console.log('\nStep 6: Waiting for case status = resolved (up to 30s)...');
  let resolved = false;
  const resolveDeadline = Date.now() + 30000;
  while (Date.now() < resolveDeadline) {
    const caseList = await fetch(`${BASE}/admin/cases?limit=200`)
      .then(r => r.ok ? r.json() : null).catch(() => null);
    const c = (caseList?.cases ?? []).find(c => c.id === caseId);
    if (c?.status === 'resolved') { resolved = true; break; }
    await new Promise(r => setTimeout(r, 1500));
  }
  check('Step 6: Case status = resolved in DB', resolved);

  // Step 7: CDP verify #voc-log
  if (slackPage) {
    console.log('\nStep 7: CDP — verifying #voc-log...');
    try {
      await slackPage.goto(`https://app.slack.com/client/${SLACK_TEAM_ID}/${VOC_LOG}`);
      await slackPage.waitForTimeout(2500);
      // Close thread panel if open in new Slack IA4 UI
      await slackPage.evaluate(() => {
        const sec = document.querySelector('.p-view_contents--secondary');
        sec?.querySelector('button[aria-label="Close"]')?.click();
      });
      await slackPage.waitForTimeout(1000);
      const logText = await slackPage.evaluate(() => {
        const prim = document.querySelector('.p-view_contents--primary');
        return (prim || document.querySelector('[data-qa="message_pane"]') || document.body).innerText ?? '';
      });
      const inLog = logText.includes(caseId) || logText.includes(caseId.slice(0, 8));
      check(`Step 7: case_id visible in #voc-log`, inLog);
      await slackPage.screenshot({ path: `test-results/e2e-voclog-${caseId}.png` });
      console.log(`  📸 test-results/e2e-voclog-${caseId}.png`);
    } catch (err) {
      check('Step 7: case_id visible in #voc-log', false);
      console.error(`  ERROR (Step 7): ${err.message}`);
    }
  } else {
    check('Step 7: case_id visible in #voc-log', false);
    console.error('  Skipped — Slack browser not available');
  }

  if (slackBrowser) await slackBrowser.close().catch(() => {});

  // Step 8 & 9: Dashboard verification via headless browser
  console.log('\nStep 8-9: Dashboard — verifying via headless browser...');
  let dashBrowser;
  try {
    dashBrowser = await chromium.launch({ headless: true });
    const dashPage = await dashBrowser.newPage();

    // Cases tab — root URL shows cases by default
    await dashPage.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
    await dashPage.waitForTimeout(2000);
    const casesText = await dashPage.evaluate(() => document.body.innerText);
    check('Step 8: Dashboard Cases tab — resolved case visible', casesText.includes(caseId) || casesText.includes(caseId.slice(0, 8)));
    await dashPage.screenshot({ path: `test-results/e2e-dashboard-cases-${caseId}.png` });
    console.log(`  📸 test-results/e2e-dashboard-cases-${caseId}.png`);

    // Automation Runs tab — navigate directly to the runs route
    await dashPage.goto('http://localhost:5173/runs', { waitUntil: 'networkidle', timeout: 15000 });
    await dashPage.waitForTimeout(2000);
    const runsText = await dashPage.evaluate(() => document.body.innerText);
    check('Step 9: Dashboard Automation Runs — classify visible', /classify/i.test(runsText));
    await dashPage.screenshot({ path: `test-results/e2e-dashboard-runs-${caseId}.png` });
    console.log(`  📸 test-results/e2e-dashboard-runs-${caseId}.png`);

    await dashBrowser.close();
  } catch (err) {
    check('Step 8-9: Dashboard headless', false);
    console.error(`  ERROR: ${err.message}`);
    if (dashBrowser) await dashBrowser.close().catch(() => {});
  }

  // Final report
  console.log('\n=== Results ===');
  const passed = checks.filter(c => c.value).length;
  const total = checks.length;
  console.log(`\n${passed}/${total} checks passed`);
  console.log(`\nOverall: ${passed === total ? '✅ PASS' : '❌ FAIL'}`);
  if (passed < total) {
    console.log('\nFailed checks:');
    checks.filter(c => !c.value).forEach(c => console.log(`  ❌ ${c.label}`));
  }

  return passed === total;
}

const pass = await run();
process.exit(pass ? 0 : 1);
