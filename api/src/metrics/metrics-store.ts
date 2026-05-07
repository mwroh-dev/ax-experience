import { get_db } from '../db/sqlite';
import { AutomationRunType, AutomationRunStatus } from '../cases/automation-run-store';

const PERIOD_SECONDS: Record<string, number> = {
  '24h': 24 * 3600,
  '7d':  7 * 24 * 3600,
  '30d': 30 * 24 * 3600,
};

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(Math.ceil(sorted.length * p) - 1, sorted.length - 1);
  return sorted[idx];
}

export interface LatencyRow {
  run_type: string;
  count: number;
  failed: number;
  failure_rate: number;
  p50: number | null;
  p90: number | null;
  p99: number | null;
}

export function get_latency_metrics(period: string): LatencyRow[] {
  const seconds = PERIOD_SECONDS[period] ?? PERIOD_SECONDS['24h'];
  const cutoff = new Date(Date.now() - seconds * 1000).toISOString();
  const db = get_db();

  const rows = db
    .prepare(
      `SELECT run_type, status, latency_ms FROM automation_runs WHERE created_at >= ?`,
    )
    .all(cutoff) as { run_type: string; status: string; latency_ms: number | null }[];

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!groups.has(row.run_type)) groups.set(row.run_type, []);
    groups.get(row.run_type)!.push(row);
  }

  return Array.from(groups.entries()).map(([run_type, group_rows]) => {
    const count = group_rows.length;
    const failed = group_rows.filter(r => r.status !== 'success').length;
    const failure_rate = Math.round((failed / count) * 1000) / 1000;
    const success_latencies = group_rows
      .filter(r => r.status === 'success' && r.latency_ms !== null)
      .map(r => r.latency_ms as number)
      .sort((a, b) => a - b);

    return {
      run_type,
      count,
      failed,
      failure_rate,
      p50: percentile(success_latencies, 0.5),
      p90: percentile(success_latencies, 0.9),
      p99: percentile(success_latencies, 0.99),
    };
  });
}

const TREND_PERIOD_SECONDS: Record<string, number> = {
  '7d':  7  * 24 * 3600,
  '14d': 14 * 24 * 3600,
  '30d': 30 * 24 * 3600,
};

export interface EvalTrendRow {
  date: string;
  avg_score: number;
  count: number;
}

export function get_eval_trend(period: string): EvalTrendRow[] {
  const seconds = TREND_PERIOD_SECONDS[period] ?? TREND_PERIOD_SECONDS['7d'];
  const cutoff = new Date(Date.now() - seconds * 1000).toISOString();
  const db = get_db();

  const rows = db
    .prepare(
      `SELECT output_summary, created_at FROM automation_runs
       WHERE run_type = 'eval_draft' AND created_at >= ? AND output_summary IS NOT NULL`,
    )
    .all(cutoff) as { output_summary: string; created_at: string }[];

  const byDate = new Map<string, number[]>();
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.output_summary) as { score?: unknown };
      if (typeof parsed.score !== 'number') continue;
      const date = row.created_at.slice(0, 10);
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date)!.push(parsed.score);
    } catch {
      // skip unparseable rows
    }
  }

  return Array.from(byDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, scores]) => ({
      date,
      avg_score: Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100) / 100,
      count: scores.length,
    }));
}
