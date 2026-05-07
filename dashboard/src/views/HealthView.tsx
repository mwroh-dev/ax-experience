import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/apiClient';
import type { HealthDeps } from '../shared/types';

interface DepStatus {
  configured?: boolean;
  token_prefix?: string;
  status?: string;
  live?: boolean;
  latency_ms?: number;
  error?: string;
  ready?: boolean;
  path?: string;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: ok ? 'var(--success)' : 'var(--error)',
      marginRight: 8, flexShrink: 0,
    }} />
  );
}

function DepRow({ name, dep }: { name: string; dep: DepStatus }) {
  const isOk = dep.live === true || dep.ready === true ||
    (dep.configured === true && dep.status === 'valid');

  const details: string[] = [];
  if (dep.token_prefix) details.push(dep.token_prefix);
  if (dep.status) details.push(`status: ${dep.status}`);
  if (dep.latency_ms != null) details.push(`${dep.latency_ms}ms`);
  if (dep.error) details.push(dep.error);
  if (dep.path) details.push(dep.path);
  if (!dep.configured && dep.configured !== undefined) details.push('not configured');

  return (
    <tr>
      <td style={{ display: 'flex', alignItems: 'center', paddingTop: 10, paddingBottom: 10 }}>
        <StatusDot ok={isOk} />
        <span style={{ fontWeight: 500 }}>{name}</span>
      </td>
      <td>
        <span className={`badge ${isOk ? 'badge-success' : 'badge-error'}`}>
          {isOk ? 'ok' : 'down'}
        </span>
      </td>
      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>
        {details.join(' · ') || '—'}
      </td>
    </tr>
  );
}

export default function HealthView() {
  const [deps, setDeps] = useState<HealthDeps | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.health.deps();
      setDeps(data);
      setLastChecked(new Date());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const allOk = deps
    ? Object.values(deps).every(d =>
        d.live === true || d.ready === true ||
        (d.configured === true && d.status === 'valid'))
    : false;

  return (
    <div>
      <div className="view-header">
        <h2 className="view-title">Connection Health</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastChecked && (
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {lastChecked.toLocaleTimeString('ko-KR')}
            </span>
          )}
          <button className="refresh-btn" onClick={load}>Refresh</button>
        </div>
      </div>

      {loading && <div className="loading">Checking connections…</div>}
      {error && <div className="error-msg">Error: {error}</div>}

      {deps && (
        <>
          <div className="card" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusDot ok={allOk} />
            <span style={{ fontWeight: 600 }}>
              {allOk ? 'All systems operational' : 'One or more dependencies degraded'}
            </span>
          </div>

          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dependency</th>
                  <th>Status</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                <DepRow name="Slack" dep={deps.slack} />
                <DepRow name="Notion" dep={deps.notion} />
                <DepRow name="OpenClaw API" dep={deps.openclaw} />
                <DepRow name="Commerce API" dep={deps.commerce_api} />
                <DepRow name="SQLite" dep={deps.sqlite} />
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
