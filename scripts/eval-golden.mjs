#!/usr/bin/env node
// scripts/eval-golden.mjs — Golden regression eval runner
// Usage: node scripts/eval-golden.mjs [--api-url http://localhost:3100]

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(path.join(__dir, '../evals/golden.json'), 'utf8'));

const API_URL = process.argv.includes('--api-url')
  ? process.argv[process.argv.indexOf('--api-url') + 1]
  : 'http://localhost:3100';

const WAIT_MS = 3000;

async function run_case(tc) {
  const res = await fetch(`${API_URL}/api/cs-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: tc.input.source,
      message: tc.input.message,
      customer_ref: tc.input.customer_ref,
      metadata: { request_id: `eval_${tc.id}_${Date.now()}` },
    }),
  });

  if (!res.ok) {
    return { id: tc.id, pass: false, error: `HTTP ${res.status}` };
  }

  const { id: case_id } = await res.json();

  await new Promise(r => setTimeout(r, WAIT_MS));

  const eval_res = await fetch(`${API_URL}/admin/cases/${case_id}/eval`);
  if (!eval_res.ok) {
    return { id: tc.id, pass: false, error: `eval endpoint HTTP ${eval_res.status}` };
  }

  const { trajectory } = await eval_res.json();
  const actual_set = new Set(trajectory.actual);

  const missing_required = tc.expected.required_runs.filter(r => !actual_set.has(r));
  const path_ok = tc.expected.path_contains_one_of.some(p => trajectory.path === p || trajectory.path.includes(p));
  const pass = missing_required.length === 0 && path_ok;

  return {
    id: tc.id,
    description: tc.description,
    case_id,
    pass,
    path: trajectory.path,
    expected_path: tc.expected.path_contains_one_of,
    missing_required,
    actual_runs: trajectory.actual,
  };
}

async function main() {
  console.log(`\n=== Golden Eval — ${golden.length} cases ===\n`);
  const results = [];

  for (const tc of golden) {
    process.stdout.write(`  ${tc.id}: ${tc.description}... `);
    try {
      const result = await run_case(tc);
      results.push(result);
      console.log(result.pass ? '✓ PASS' : `✗ FAIL (missing: ${result.missing_required?.join(', ')}, path: ${result.path})`);
    } catch (err) {
      results.push({ id: tc.id, pass: false, error: err.message });
      console.log(`✗ ERROR: ${err.message}`);
    }
  }

  const passed = results.filter(r => r.pass).length;
  console.log(`\n=== Result: ${passed}/${results.length} passed ===\n`);

  if (passed < results.length) {
    process.exit(1);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
