import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/apiClient';
import type { Case } from '../shared/types';

const STATUS_CLASS: Record<string, string> = {
  intake_review: 'badge-warn',
  accepted: 'badge-accent',
  resolved: 'badge-success',
  denied: 'badge-neutral',
  escalated: 'badge-error',
  pending: 'badge-warn',
  kept: 'badge-neutral',
};

const RISK_CLASS: Record<string, string> = {
  low: 'badge-success',
  medium: 'badge-warn',
  high: 'badge-error',
};

export default function CasesView() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.cases.list(50);
      setCases(data.cases ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="view-header">
        <h2 className="view-title">Cases</h2>
        <button className="refresh-btn" onClick={load}>Refresh</button>
      </div>

      {loading && <div className="loading">Loading…</div>}
      {error && <div className="error-msg">Error: {error}</div>}
      {!loading && !error && cases.length === 0 && (
        <div className="empty-msg">No cases found</div>
      )}

      {cases.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Status</th>
                <th>Risk</th>
                <th>Intent</th>
                <th>Path</th>
                <th>Source</th>
                <th>Text</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.id}>
                  <td className="mono">{c.id.slice(0, 16)}…</td>
                  <td>
                    <span className={`badge ${STATUS_CLASS[c.status] ?? 'badge-neutral'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${RISK_CLASS[c.risk_level] ?? 'badge-neutral'}`}>
                      {c.risk_level}
                    </span>
                  </td>
                  <td className="mono" style={{ fontSize: 11 }}>{c.intent}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{c.recommended_path}</td>
                  <td>{c.source_type}</td>
                  <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.raw_text}
                  </td>
                  <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(c.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
