import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/apiClient';
import type { VocReport, BacklogItem } from '../shared/types';

const STATUS_CLASS: Record<string, string> = {
  resolved: 'badge-success',
  denied: 'badge-neutral',
  escalated: 'badge-error',
  accepted: 'badge-accent',
  intake_review: 'badge-warn',
  pending: 'badge-warn',
  kept: 'badge-neutral',
};

const RISK_CLASS: Record<string, string> = {
  low: 'badge-success',
  medium: 'badge-warn',
  high: 'badge-error',
  unknown: 'badge-neutral',
};

function MetricCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card" style={{ padding: '14px 18px', minWidth: 120 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BarRow({ label, count, total, className }: { label: string; count: number; total: number; className?: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
      <div style={{ width: 160, fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>
        {className ? <span className={`badge ${className}`}>{label}</span> : label}
      </div>
      <div style={{ flex: 1, background: 'var(--bg)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', borderRadius: 4, transition: 'width 0.4s' }} />
      </div>
      <div style={{ width: 40, fontSize: 12, textAlign: 'right', color: 'var(--text)' }}>{count}</div>
    </div>
  );
}

const PERIODS = [7, 14, 30, 90];

export default function VocReportView() {
  const [report, setReport] = useState<VocReport | null>(null);
  const [backlog, setBacklog] = useState<BacklogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [resolving, setResolving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rData, bData] = await Promise.all([
        api.voc.report(days),
        api.backlog.list('open', 20),
      ]);
      setReport(rData);
      setBacklog(bData.items ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const handleResolve = async (id: string) => {
    setResolving(id);
    try {
      await api.backlog.resolve(id);
      setBacklog(prev => prev.filter(b => b.id !== id));
    } finally {
      setResolving(null);
    }
  };

  return (
    <div>
      <div className="view-header">
        <h2 className="view-title">VOC Report</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {PERIODS.map(d => (
              <button
                key={d}
                className={`refresh-btn ${days === d ? 'active' : ''}`}
                style={{ background: days === d ? 'var(--accent)' : undefined, color: days === d ? '#fff' : undefined }}
                onClick={() => setDays(d)}
              >
                {d}d
              </button>
            ))}
          </div>
          <button className="refresh-btn" onClick={load}>Refresh</button>
        </div>
      </div>

      {loading && <div className="loading">Loading report…</div>}
      {error && <div className="error-msg">Error: {error}</div>}

      {report && (
        <>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            Last {report.period_days} days · Generated {new Date(report.generated_at).toLocaleString('ko-KR')}
          </div>

          {/* Key metrics */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <MetricCard label="Total Cases" value={report.cases.total} />
            <MetricCard
              label="Resolution Rate"
              value={`${Math.round(report.cases.resolution_rate * 100)}%`}
              sub="resolved + denied + escalated"
            />
            <MetricCard
              label="No-Source Rate"
              value={report.cases.no_source_count}
              sub="cases with no knowledge hit"
            />
            <MetricCard label="Automation Runs" value={report.automation_runs.total} />
            <MetricCard
              label="Run Success Rate"
              value={`${Math.round(report.automation_runs.overall_success_rate * 100)}%`}
            />
            <MetricCard label="Backlog Open" value={report.improvement_backlog.open} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {/* Cases by status */}
            <div className="card">
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Cases by Status</div>
              {Object.entries(report.cases.by_status)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => (
                  <BarRow key={status} label={status} count={count} total={report.cases.total} className={STATUS_CLASS[status]} />
                ))
              }
            </div>

            {/* Cases by intent */}
            <div className="card">
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Top Intents</div>
              {report.cases.by_intent.slice(0, 8).map(({ intent, count }) => (
                <BarRow key={intent} label={intent} count={count} total={report.cases.total} />
              ))}
              {report.cases.by_intent.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No data</div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            {/* Automation by type */}
            <div className="card">
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Automation Runs by Type</div>
              {report.automation_runs.by_type.map(r => (
                <div key={r.run_type} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 12 }}>
                  <span className="mono" style={{ fontSize: 11 }}>{r.run_type}</span>
                  <div style={{ display: 'flex', gap: 12, color: 'var(--text-muted)' }}>
                    <span>{r.success_count}/{r.count}</span>
                    <span>{r.avg_latency_ms}ms</span>
                  </div>
                </div>
              ))}
              {report.automation_runs.by_type.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>No automation runs</div>
              )}
            </div>

            {/* Cases by risk */}
            <div className="card">
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Cases by Risk Level</div>
              {Object.entries(report.cases.by_risk)
                .sort((a, b) => b[1] - a[1])
                .map(([risk, count]) => (
                  <BarRow key={risk} label={risk} count={count} total={report.cases.total} className={RISK_CLASS[risk]} />
                ))
              }
            </div>
          </div>

          {/* Top Recurring Issues */}
          {(report.top_recurring_issues?.length ?? 0) > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Top Recurring Issues</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Intent</th>
                      <th>Count</th>
                      <th>Risk</th>
                      <th>Example Topics</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.top_recurring_issues.map(issue => (
                      <tr key={issue.intent}>
                        <td className="mono" style={{ fontSize: 11 }}>{issue.intent}</td>
                        <td style={{ fontWeight: 600 }}>{issue.count}</td>
                        <td>
                          <span className={`badge ${RISK_CLASS[issue.risk_level] ?? 'badge-neutral'}`}>
                            {issue.risk_level}
                          </span>
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 320 }}>
                          {issue.example_topics.slice(0, 2).map((t, i) => (
                            <div key={i} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {t}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Improvement Suggestions */}
          {(report.improvement_suggestions?.length ?? 0) > 0 && (
            <div className="card" style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>Improvement Suggestions</div>
              {report.improvement_suggestions.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 12, paddingBottom: 12, borderBottom: i < report.improvement_suggestions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <span className={`badge ${s.priority === 'high' ? 'badge-error' : s.priority === 'medium' ? 'badge-warn' : 'badge-neutral'}`} style={{ flexShrink: 0, marginTop: 2 }}>
                    {s.priority}
                  </span>
                  <div>
                    <div style={{ fontSize: 13 }}>{s.suggestion}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{s.trigger}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Improvement Backlog */}
          {backlog.length > 0 && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>
                  Open Improvement Backlog ({report.improvement_backlog.open})
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {report.improvement_backlog.resolved} resolved total
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Topic</th>
                      <th>Case ID</th>
                      <th>Type</th>
                      <th>Created</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {backlog.map(b => (
                      <tr key={b.id}>
                        <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {b.missing_topic}
                        </td>
                        <td className="mono" style={{ fontSize: 10 }}>{b.case_id?.slice(0, 14) ?? '—'}…</td>
                        <td>
                          <span className="badge badge-neutral">{b.suggested_doc_type}</span>
                        </td>
                        <td style={{ color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                          {new Date(b.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td>
                          <button
                            onClick={() => handleResolve(b.id)}
                            disabled={resolving === b.id}
                            className="refresh-btn"
                            style={{ fontSize: 11, padding: '2px 8px' }}
                          >
                            {resolving === b.id ? '…' : 'Resolve'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {backlog.length === 0 && report.improvement_backlog.open === 0 && (
            <div className="card" style={{ color: 'var(--success)', fontSize: 13, textAlign: 'center', padding: 20 }}>
              No open improvement backlog items
            </div>
          )}
        </>
      )}
    </div>
  );
}
