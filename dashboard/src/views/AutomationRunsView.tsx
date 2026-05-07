import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/apiClient';
import type { AutomationRun } from '../shared/types';

const STATUS_CLASS: Record<string, string> = {
  success: 'badge-success',
  error: 'badge-error',
  skipped: 'badge-neutral',
};

const TYPE_CLASS: Record<string, string> = {
  classify: 'badge-accent',
  retrieve_evidence: 'badge-warn',
  commerce_lookup: 'badge-warn',
  draft_reply: 'badge-accent',
  notion_write: 'badge-neutral',
  escalation: 'badge-error',
  slack_post: 'badge-neutral',
};

export default function AutomationRunsView() {
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [caseFilter, setCaseFilter] = useState('');
  const [filterInput, setFilterInput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = caseFilter
        ? await api.automationRuns.byCaseId(caseFilter)
        : await api.automationRuns.list(100);
      setRuns((data.runs ?? []) as unknown as AutomationRun[]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [caseFilter]);

  useEffect(() => { load(); }, [load]);

  const handleFilter = () => setCaseFilter(filterInput.trim());

  return (
    <div>
      <div className="view-header">
        <h2 className="view-title">Automation Runs</h2>
        <button className="refresh-btn" onClick={load}>Refresh</button>
      </div>

      <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={filterInput}
          onChange={e => setFilterInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleFilter()}
          placeholder="Filter by case_id…"
          style={{
            flex: 1, padding: '6px 12px', background: 'var(--bg)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            color: 'var(--text)', fontSize: 13,
          }}
        />
        <button className="refresh-btn" onClick={handleFilter}>Filter</button>
        {caseFilter && (
          <button className="refresh-btn" onClick={() => { setCaseFilter(''); setFilterInput(''); }}>
            Clear
          </button>
        )}
      </div>

      {loading && <div className="loading">Loading…</div>}
      {error && <div className="error-msg">Error: {error}</div>}
      {!loading && !error && runs.length === 0 && (
        <div className="empty-msg">No automation runs found</div>
      )}

      {runs.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Run ID</th>
                <th>Case ID</th>
                <th>Type</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Output</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id}>
                  <td className="mono" style={{ fontSize: 11 }}>{r.id}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{r.ticket_id.slice(0, 16)}…</td>
                  <td>
                    <span className={`badge ${TYPE_CLASS[r.run_type] ?? 'badge-neutral'}`}>
                      {r.run_type}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${STATUS_CLASS[r.status]}`}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)' }}>
                    {r.latency_ms != null ? `${r.latency_ms}ms` : '—'}
                  </td>
                  <td style={{ color: r.error ? 'var(--error)' : 'inherit', fontSize: 12, maxWidth: 300 }}>
                    {r.error ?? r.output_summary ?? '—'}
                  </td>
                  <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(r.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
