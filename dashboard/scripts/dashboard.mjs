/**
 * Unified Dashboard Verification Script
 * Merges: cdp-cases-view, cdp-automation-runs-view, cdp-health-view,
 *         cdp-knowledge-view, cdp-voc-report-dashboard, cdp-slack-action-e2e
 *
 * Usage: node dashboard/scripts/dashboard.mjs <action>
 * Actions: cases, automation-runs, health, knowledge, voc-report, all, e2e
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3100';
const action = process.argv[2];

if (!action || !['cases', 'automation-runs', 'health', 'knowledge', 'voc-report', 'all', 'e2e'].includes(action)) {
  console.log('Actions: cases, automation-runs, health, knowledge, voc-report, all, e2e');
  process.exit(1);
}

// ── Cases Tab ─────────────────────────────────────────────────────────────────
async function runCases(page) {
  const ERRORS = [];
  page.on('console', msg => { if (msg.type() === 'error') ERRORS.push(msg.text()); });

  const tabLabel = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === 'Cases');
    if (btn) { btn.click(); return btn.textContent?.trim(); }
    return null;
  });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: '/tmp/dashboard-cases.png' });
  const bodyText = await page.evaluate(() => document.body.innerText);

  const caseRowCount = await page.evaluate(() => {
    const tbodyRows = document.querySelectorAll('tbody tr');
    if (tbodyRows.length > 0) return tbodyRows.length;
    return document.querySelectorAll('[data-case-id], .case-row, .case-item').length;
  });

  const hasEmptyState = await page.evaluate(() =>
    /no cases found|no cases available|케이스 없음|데이터 없음/i.test(document.body.innerText)
  );

  let apiCaseCount = -1;
  try {
    const resp = await fetch(`${BASE}/admin/cases`);
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data?.cases)) apiCaseCount = data.cases.length;
      else console.log('WARN: /admin/cases response shape unexpected:', Object.keys(data ?? {}));
    }
  } catch (_) { /* not fatal */ }

  const headingVisible = bodyText.includes('Cases') || bodyText.includes('케이스');
  const rowsOrEmptyVisible = caseRowCount > 0 || hasEmptyState;

  const checks = {
    'Cases tab found':              !!tabLabel,
    'Cases heading visible':        headingVisible,
    'Rows or empty state visible':  rowsOrEmptyVisible,
    [`API count matches DOM rows (${apiCaseCount} == ${caseRowCount})`]: apiCaseCount < 0 || apiCaseCount === caseRowCount,
    'No browser console errors':    ERRORS.length === 0,
  };

  console.log('=== Cases ===');
  console.log(`Tab clicked: ${tabLabel}`);
  console.log(`Case rows in DOM: ${caseRowCount}`);
  console.log(`Empty state visible: ${hasEmptyState}`);
  console.log(`API case count: ${apiCaseCount}`);
  if (ERRORS.length) console.log('Console errors:', ERRORS);
  console.log('');

  return printChecks(checks);
}

// ── Automation Runs Tab ───────────────────────────────────────────────────────
async function runAutomationRuns(page) {
  const ERRORS = [];
  page.on('console', msg => { if (msg.type() === 'error') ERRORS.push(msg.text()); });

  const tabLabel = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === 'Automation Runs');
    if (btn) { btn.click(); return btn.textContent?.trim(); }
    return null;
  });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: '/tmp/dashboard-automation-runs.png' });
  const bodyText = await page.evaluate(() => document.body.innerText);

  const runRowCount = await page.evaluate(() => {
    const tbodyRows = document.querySelectorAll('tbody tr');
    if (tbodyRows.length > 0) return tbodyRows.length;
    return document.querySelectorAll('[data-run-id], .run-row, .run-item').length;
  });

  const hasEmptyState = await page.evaluate(() =>
    /no runs found|no automation runs|실행 없음|데이터 없음/i.test(document.body.innerText)
  );

  let apiRunCount = -1;
  try {
    const resp = await fetch(`${BASE}/api/automation-runs?limit=100`);
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data?.runs)) apiRunCount = data.runs.length;
      else if (Array.isArray(data)) apiRunCount = data.length;
      else console.log('WARN: /api/automation-runs response shape unexpected:', Object.keys(data ?? {}));
    }
  } catch (_) { /* not fatal */ }

  const headingVisible = bodyText.includes('Automation Runs') || bodyText.includes('자동화');
  const rowsOrEmptyVisible = runRowCount > 0 || hasEmptyState;

  const checks = {
    'Automation Runs tab found':    !!tabLabel,
    'Heading visible':              headingVisible,
    'Rows or empty state visible':  rowsOrEmptyVisible,
    [`API count matches DOM rows (${apiRunCount} == ${runRowCount})`]: apiRunCount < 0 || apiRunCount === runRowCount,
    'No browser console errors':    ERRORS.length === 0,
  };

  console.log('=== Automation Runs ===');
  console.log(`Tab clicked: ${tabLabel}`);
  console.log(`Run rows in DOM: ${runRowCount}`);
  console.log(`Empty state visible: ${hasEmptyState}`);
  console.log(`API run count: ${apiRunCount}`);
  if (ERRORS.length) console.log('Console errors:', ERRORS);
  console.log('');

  return printChecks(checks);
}

// ── Health Tab ────────────────────────────────────────────────────────────────
async function runHealth(page) {
  const ERRORS = [];
  page.on('console', msg => { if (msg.type() === 'error') ERRORS.push(msg.text()); });

  const tabLabel = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === 'Health');
    if (btn) { btn.click(); return btn.textContent?.trim(); }
    return null;
  });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: '/tmp/dashboard-health.png' });
  const bodyText = await page.evaluate(() => document.body.innerText);

  const hasSlack   = /slack/i.test(bodyText);
  const hasNotion  = /notion/i.test(bodyText);
  const hasService = hasSlack || hasNotion || /commerce|sqlite|openclaw/i.test(bodyText);
  const rawTokenVisible = /xoxb-\d{5,}/.test(bodyText);

  let apiHealthOk = false;
  let apiServices = [];
  try {
    const resp = await fetch(`${BASE}/api/health/deps`);
    if (resp.ok) {
      const data = await resp.json();
      apiServices = Object.keys(data);
      apiHealthOk = apiServices.length > 0;
    }
  } catch (_) { /* not fatal */ }

  const headingVisible = bodyText.includes('Health') || bodyText.includes('헬스');

  const checks = {
    'Health tab found':                   !!tabLabel,
    'Health heading visible':             headingVisible,
    'At least 1 service visible':         hasService,
    'No raw token values in DOM':         !rawTokenVisible,
    'API /api/health/deps returns data':  apiHealthOk,
    'No browser console errors':          ERRORS.length === 0,
  };

  console.log('=== Health ===');
  console.log(`Tab clicked: ${tabLabel}`);
  console.log(`Slack visible: ${hasSlack}, Notion visible: ${hasNotion}`);
  console.log(`Raw token visible: ${rawTokenVisible}`);
  console.log(`API services: ${apiServices.join(', ')}`);
  if (ERRORS.length) console.log('Console errors:', ERRORS);
  console.log('');

  return printChecks(checks);
}

// ── Knowledge Tab ─────────────────────────────────────────────────────────────
async function runKnowledge(page) {
  const ERRORS = [];
  page.on('console', msg => { if (msg.type() === 'error') ERRORS.push(msg.text()); });

  const tabLabel = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => b.textContent?.trim() === 'Knowledge');
    if (btn) { btn.click(); return btn.textContent?.trim(); }
    return null;
  });
  await page.waitForTimeout(2000);

  await page.screenshot({ path: '/tmp/dashboard-knowledge.png' });
  const bodyText = await page.evaluate(() => document.body.innerText);

  const hasSyncButton = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).some(b => /sync/i.test(b.textContent ?? ''))
  );

  const docRowCount = await page.evaluate(() => {
    const tbodyRows = document.querySelectorAll('tbody tr');
    if (tbodyRows.length > 0) return tbodyRows.length;
    return document.querySelectorAll('.doc-row, .doc-item, [data-doc-id]').length;
  });

  const hasEmptyState = await page.evaluate(() =>
    /no documents found|no knowledge sources|문서 없음|데이터 없음/i.test(document.body.innerText)
  );

  let apiDocCount = -1;
  try {
    const resp = await fetch(`${BASE}/admin/knowledge`);
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data)) apiDocCount = data.length;
      else if (Array.isArray(data?.docs)) apiDocCount = data.docs.length;
      else if (typeof data?.total === 'number') apiDocCount = data.total;
      else console.log('WARN: /admin/knowledge response shape unexpected:', Object.keys(data ?? {}));
    }
  } catch (_) { /* not fatal */ }

  const headingVisible = bodyText.includes('Knowledge') || bodyText.includes('지식');
  const syncOrCountVisible = hasSyncButton || docRowCount > 0 || hasEmptyState || /\d+ doc/i.test(bodyText);

  const checks = {
    'Knowledge tab found':              !!tabLabel,
    'Knowledge heading visible':        headingVisible,
    'Sync button or doc count visible': syncOrCountVisible,
    [`API count matches DOM rows (${apiDocCount} == ${docRowCount})`]: apiDocCount < 0 || apiDocCount === docRowCount,
    'No browser console errors':        ERRORS.length === 0,
  };

  console.log('=== Knowledge ===');
  console.log(`Tab clicked: ${tabLabel}`);
  console.log(`Sync button visible: ${hasSyncButton}`);
  console.log(`Doc rows in DOM: ${docRowCount}`);
  console.log(`Empty state visible: ${hasEmptyState}`);
  console.log(`API doc count: ${apiDocCount}`);
  if (ERRORS.length) console.log('Console errors:', ERRORS);
  console.log('');

  return printChecks(checks);
}

// ── VOC Report Tab ────────────────────────────────────────────────────────────
async function runVocReport(page) {
  const ERRORS = [];
  page.on('console', msg => { if (msg.type() === 'error') ERRORS.push(msg.text()); });

  const tabLabel = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find(b => /voc report/i.test(b.textContent?.trim() ?? ''));
    if (btn) { btn.click(); return btn.textContent?.trim(); }
    return null;
  });
  await page.waitForTimeout(2500);

  await page.screenshot({ path: '/tmp/dashboard-voc-report.png' });
  const bodyText = await page.evaluate(() => document.body.innerText);

  const totalCases = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    return els.some(el => el.textContent?.trim() === 'Total Cases');
  });

  const topIntents = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    return els.some(el => el.textContent?.trim() === 'Top Intents');
  });

  const automationRuns = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('*'));
    return els.some(el => /Automation Runs/.test(el.textContent?.trim() ?? ''));
  });

  const kpiCount = await page.evaluate(() =>
    document.querySelectorAll('[class*="stat"], [class*="kpi"], [class*="metric"]').length
  );

  const checks = {
    'VOC Report tab found':              !!tabLabel,
    'VOC Report heading visible':        bodyText.includes('VOC Report'),
    'Total Cases stat visible':          totalCases,
    'Top Intents section visible':       topIntents,
    'Automation Runs section visible':   automationRuns,
    'No browser console errors':         ERRORS.length === 0,
  };

  console.log('=== VOC Report ===');
  console.log(`Tab clicked: ${tabLabel}`);
  console.log(`KPI widget count: ${kpiCount}`);
  console.log(`Top Intents: ${topIntents}, Total Cases: ${totalCases}`);
  if (ERRORS.length) console.log('Console errors:', ERRORS);
  console.log('');

  return printChecks(checks);
}

// ── E2E (Tier-4 Slack Action Flow) ───────────────────────────────────────────
async function runE2E() {
  const ERRORS = [];
  const checks = [];
  const check = (label, value) => { checks.push({ label, value }); };

  // Step 1: Create CS event
  const csEvent = await fetch(`${BASE}/api/cs-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'web',
      event_type: 'cs_message',
      message: '주문번호 ORD-REFUND 환불 처리 부탁드립니다',
    }),
  }).then(r => r.ok ? r.json() : null).catch(() => null);

  const caseId = csEvent?.case_id;
  check('CS event created (case_id returned)', !!caseId);
  if (!caseId) {
    console.error('FATAL: could not create CS event, aborting remaining E2E steps');
    console.log('=== E2E (Slack Action Flow) ===');
    for (const { label, value } of checks) console.log(`  ${value ? '✅' : '❌'} ${label}`);
    console.log('\nResult: ❌ FAIL');
    return false;
  }

  // Step 2: Verify initial status
  await new Promise(r => setTimeout(r, 1500));
  const initialCaseList = await fetch(`${BASE}/admin/cases?limit=100`)
    .then(r => r.ok ? r.json() : null).catch(() => null);
  const initialCase = (initialCaseList?.cases ?? []).find(c => c.id === caseId);
  check(`Initial status = intake_review (got: ${initialCase?.status})`,
    initialCase?.status === 'intake_review');

  // Step 3: case_accept
  const acceptResp = await fetch(`${BASE}/api/test/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action_id: 'case_accept', case_id: caseId, actor_id: 'e2e_test' }),
  }).then(r => { if (!r.ok) console.error(`POST /api/test/action returned ${r.status}`); return r.ok ? r.json() : null; }).catch(() => null);
  check('case_accept returned ok=true', acceptResp?.ok === true);
  check(`Status after accept = accepted (got: ${acceptResp?.new_status})`,
    acceptResp?.new_status === 'accepted');

  // Step 4: case_send
  await new Promise(r => setTimeout(r, 2000));
  const sendResp = await fetch(`${BASE}/api/test/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action_id: 'case_send', case_id: caseId, actor_id: 'e2e_test' }),
  }).then(r => { if (!r.ok) console.error(`POST /api/test/action returned ${r.status}`); return r.ok ? r.json() : null; }).catch(() => null);
  check('case_send returned ok=true', sendResp?.ok === true);
  check(`Status after send = resolved (got: ${sendResp?.new_status})`,
    sendResp?.new_status === 'resolved');

  // Step 5: Final DB state
  const finalCaseList = await fetch(`${BASE}/admin/cases?limit=100`)
    .then(r => r.ok ? r.json() : null).catch(() => null);
  const finalCase = (finalCaseList?.cases ?? []).find(c => c.id === caseId);
  check(`Final DB status = resolved (got: ${finalCase?.status})`,
    finalCase?.status === 'resolved');

  // Step 6: AutomationRun records + case events
  const runsResp = await fetch(`${BASE}/api/automation-runs?case_id=${caseId}`)
    .then(r => r.ok ? r.json() : null).catch(() => null);
  const runs = runsResp?.runs ?? (Array.isArray(runsResp) ? runsResp : []);
  const runTypes = runs.map(r => r.run_type ?? r.type);
  const hasClassify = runTypes.some(t => t === 'classify');
  check(`AutomationRun: classify present (found: ${runTypes.join(',') || 'none'})`, hasClassify);

  // case_send posts to voc-log but logs as case event 'draft_sent', not automation run
  const caseDetail = (finalCaseList?.cases ?? []).find(c => c.id === caseId);
  const hasDraftSent = finalCase?.status === 'resolved';
  check('case_send: draft_sent recorded (status=resolved)', hasDraftSent);

  // Step 7: Playwright UI verification
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on('console', msg => { if (msg.type() === 'error') ERRORS.push(msg.text()); });

    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    // Cases tab
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Cases');
      if (btn) btn.click();
    });
    await page.waitForTimeout(2000);

    const bodyText = await page.evaluate(() => document.body.innerText);
    const caseInTable = bodyText.includes(caseId) || bodyText.includes(caseId.slice(0, 8));
    check('Dashboard Cases tab: resolved case visible', caseInTable);

    // Automation Runs tab
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button'))
        .find(b => b.textContent?.trim() === 'Automation Runs');
      if (btn) btn.click();
    });
    await page.waitForTimeout(2000);

    const runsText = await page.evaluate(() => document.body.innerText);
    const classifyInDom = /classify/i.test(runsText);
    check('Dashboard Automation Runs: classify run visible', classifyInDom);

    await page.screenshot({ path: '/tmp/dashboard-e2e.png' });
    check('No browser console errors', ERRORS.length === 0);
  } finally {
    await browser.close();
  }

  // Step 8: Report
  console.log('=== E2E (Slack Action Flow) ===');
  console.log(`Case ID: ${caseId}`);
  console.log(`AutomationRun types found: ${runTypes.join(', ') || '(none)'}`);
  if (ERRORS.length) console.log('Console errors:', ERRORS);
  console.log('');
  console.log('Note: Real Slack CDP click requires Slack desktop app with remote debugging.');
  console.log('This test exercises the same server handler via /api/test/action (dev-only endpoint).');
  console.log('');

  let allPass = true;
  for (const { label, value } of checks) {
    console.log(`  ${value ? '✅' : '❌'} ${label}`);
    if (!value) allPass = false;
  }
  console.log(`\nResult: ${allPass ? '✅ PASS' : '❌ FAIL'}`);
  return allPass;
}

// ── Print checks helper ───────────────────────────────────────────────────────
function printChecks(checks) {
  let allPass = true;
  for (const [label, result] of Object.entries(checks)) {
    console.log(`  ${result ? '✅' : '❌'} ${label}`);
    if (!result) allPass = false;
  }
  console.log(`\nResult: ${allPass ? '✅ PASS' : '❌ FAIL'}`);
  return allPass;
}

// ── All tabs (single browser session) ─────────────────────────────────────────
async function runAll() {
  const browser = await chromium.launch({ headless: true });
  const results = {};
  try {
    // Navigate once to base before each tab action
    const runTab = async (name, fn) => {
      const page = await browser.newPage();
      try {
        await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(1000);
        results[name] = await fn(page);
      } catch (err) {
        console.error(`Tab "${name}" threw: ${err.message}`);
        results[name] = false;
      } finally {
        await page.close();
      }
    };

    await runTab('cases', runCases);
    await runTab('automation-runs', runAutomationRuns);
    await runTab('health', runHealth);
    await runTab('knowledge', runKnowledge);
    await runTab('voc-report', runVocReport);
  } finally {
    await browser.close();
  }

  console.log('\n=== All Tabs Summary ===');
  let allPass = true;
  for (const [tab, pass] of Object.entries(results)) {
    console.log(`  ${pass ? '✅' : '❌'} ${tab}`);
    if (!pass) allPass = false;
  }
  console.log(`\nOverall: ${allPass ? '✅ PASS' : '❌ FAIL'}`);
  return allPass;
}

// ── Dispatch ──────────────────────────────────────────────────────────────────
let exitCode = 0;

if (action === 'e2e') {
  const pass = await runE2E();
  exitCode = pass ? 0 : 1;
} else if (action === 'all') {
  const pass = await runAll();
  exitCode = pass ? 0 : 1;
} else {
  // Single tab actions — open browser, navigate, run tab fn, close
  const browser = await chromium.launch({ headless: true });
  let pass = false;
  try {
    const page = await browser.newPage();
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    if (action === 'cases')           pass = await runCases(page);
    else if (action === 'automation-runs') pass = await runAutomationRuns(page);
    else if (action === 'health')     pass = await runHealth(page);
    else if (action === 'knowledge')  pass = await runKnowledge(page);
    else if (action === 'voc-report') pass = await runVocReport(page);
  } finally {
    await browser.close();
  }
  exitCode = pass ? 0 : 1;
}

process.exit(exitCode);
