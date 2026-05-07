import { useEffect, useState } from 'react';
import { metrics, type LatencyRow, type TrendRow } from '../lib/apiClient';

export default function OpsMetricsView() {
  const [latency, setLatency] = useState<LatencyRow[]>([]);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [period, setPeriod] = useState('24h');

  useEffect(() => {
    metrics.latency(period).then(setLatency);
  }, [period]);

  useEffect(() => {
    metrics.evalTrend(period).then(setTrend);
  }, [period]);

  const th: React.CSSProperties = { textAlign: 'left', borderBottom: '1px solid #ddd', padding: '8px 12px', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '8px 12px' };

  return (
    <div style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Ops Metrics</h2>

      <div style={{ marginBottom: '1.5rem' }}>
        <label>
          Period:{' '}
          <select value={period} onChange={e => setPeriod(e.target.value)}>
            <option value="24h">24h</option>
            <option value="7d">7d</option>
            <option value="30d">30d</option>
          </select>
        </label>
      </div>

      <h3>Latency by Run Type</h3>
      {latency.length === 0 ? (
        <p style={{ color: '#888' }}>No data for selected period.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: '2rem' }}>
          <thead>
            <tr>
              {['Run Type', 'Total', 'Failed', 'Failure %', 'P50 ms', 'P90 ms', 'P99 ms'].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {latency.map(row => (
              <tr key={row.run_type}>
                <td style={td}><code>{row.run_type}</code></td>
                <td style={td}>{row.count}</td>
                <td style={td}>{row.failed}</td>
                <td style={{ ...td, color: row.failure_rate > 0.2 ? '#c00' : 'inherit' }}>
                  {(row.failure_rate * 100).toFixed(1)}%
                </td>
                <td style={td}>{row.p50 ?? '—'}</td>
                <td style={td}>{row.p90 ?? '—'}</td>
                <td style={td}>{row.p99 ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3>Draft Eval Score Trend ({period})</h3>
      {trend.length === 0 ? (
        <p style={{ color: '#888' }}>No eval_draft data in last 7 days.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              {['Date', 'Avg Score', 'Evals Run'].map(h => (
                <th key={h} style={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trend.map(row => (
              <tr key={row.date}>
                <td style={td}>{row.date}</td>
                <td style={{ ...td, color: row.avg_score < 0.7 ? '#c00' : '#060' }}>
                  {row.avg_score.toFixed(2)}
                </td>
                <td style={td}>{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
