// cs-ops-core/src/eval/judge.ts
import { AutomationRunLog } from '../types';
import { EvalCase, EvalDimension, EvalReport, EvalResult, PipelineFn } from './types';
import { score_all } from './rubric';
import { EVAL_CASES } from './cases';

const PASS_THRESHOLD = 0.75;

function make_result(ev: EvalCase, run: AutomationRunLog): EvalResult {
  const dimensions = score_all(ev, run);
  const total_score = dimensions.reduce((s, d) => s + d.score, 0) / dimensions.length;
  return {
    case_id: ev.case_id,
    input_message: ev.input_message,
    total_score,
    pass: total_score >= PASS_THRESHOLD,
    dimensions,
    run,
  };
}

function make_error_result(ev: EvalCase, error: string): EvalResult {
  return {
    case_id: ev.case_id,
    input_message: ev.input_message,
    total_score: 0,
    pass: false,
    dimensions: [],
    error,
  };
}

export async function run_eval(
  pipeline: PipelineFn,
  cases: EvalCase[] = EVAL_CASES
): Promise<EvalReport> {
  const results: EvalResult[] = [];

  for (const ev of cases) {
    try {
      const result = await pipeline(ev.input_message, `eval-${ev.case_id}`);
      if (!result.ok || !result.value) {
        results.push(make_error_result(ev, result.error ?? 'pipeline returned ok:false'));
        continue;
      }
      results.push(make_result(ev, result.value));
    } catch (err) {
      results.push(make_error_result(ev, String(err)));
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const avg_score = results.reduce((s, r) => s + r.total_score, 0) / results.length;

  const dim_totals: Record<string, { sum: number; count: number }> = {};
  for (const r of results) {
    for (const d of r.dimensions) {
      if (!dim_totals[d.dimension]) dim_totals[d.dimension] = { sum: 0, count: 0 };
      dim_totals[d.dimension].sum += d.score;
      dim_totals[d.dimension].count += 1;
    }
  }

  const dimension_scores = Object.fromEntries(
    Object.entries(dim_totals).map(([k, v]) => [k, v.count > 0 ? v.sum / v.count : 0])
  ) as Record<EvalDimension, number>;

  return {
    run_at: new Date().toISOString(),
    total_cases: cases.length,
    passed,
    failed: cases.length - passed,
    pass_rate: passed / cases.length,
    avg_score,
    dimension_scores,
    results,
  };
}

export function print_report(report: EvalReport): void {
  console.log('\n══════════════════════════════════════════');
  console.log(`  CS Ops Eval Report — ${report.run_at}`);
  console.log('══════════════════════════════════════════');
  console.log(`  Cases: ${report.total_cases} | Pass: ${report.passed} | Fail: ${report.failed}`);
  console.log(`  Pass rate: ${(report.pass_rate * 100).toFixed(1)}%  Avg score: ${(report.avg_score * 100).toFixed(1)}%`);
  console.log('\n  Dimension Breakdown:');
  for (const [dim, avg] of Object.entries(report.dimension_scores)) {
    const bar = '█'.repeat(Math.round(avg * 10)) + '░'.repeat(10 - Math.round(avg * 10));
    console.log(`  ${bar} ${(avg * 100).toFixed(0).padStart(3)}%  ${dim}`);
  }
  console.log('\n  Failures:');
  for (const r of report.results.filter((r) => !r.pass)) {
    console.log(`  [${r.case_id}] score=${(r.total_score * 100).toFixed(0)}%  ${r.error ?? ''}`);
    for (const d of r.dimensions.filter((d) => !d.pass)) {
      console.log(`    ✗ ${d.dimension}: ${d.reason}`);
    }
  }
  console.log('══════════════════════════════════════════\n');
}
