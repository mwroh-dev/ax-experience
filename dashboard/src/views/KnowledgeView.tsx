import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/apiClient';
import type { KnowledgeDoc, SearchResult } from '../shared/types';

const TYPE_CLASS: Record<string, string> = {
  notion_faq: 'badge-accent',
  notion_policy: 'badge-accent',
  api_doc: 'badge-neutral',
  slack_archive: 'badge-warn',
};

export default function KnowledgeView() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.knowledge.list(200);
      setDocs(data.docs ?? []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSyncNotion = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const data = await api.knowledge.syncNotion();
      setSyncMsg(`Synced ${data.synced} docs from Notion (${data.sources?.join(', ') || 'no sources'}). Skipped: ${data.skipped}.`);
      load();
    } catch (e: any) {
      setSyncMsg(`Sync failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleReindex = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const data = await api.knowledge.reindex();
      setSyncMsg(`Re-indexed ${data.indexed} docs from ${data.source}.`);
      load();
    } catch (e: any) {
      setSyncMsg(`Reindex failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = async (source_id: string) => {
    setDeleting(source_id);
    try {
      await api.knowledge.delete(source_id);
      setDocs(prev => prev.filter(d => d.source_id !== source_id));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setDeleting(null);
    }
  };

  const handleSearch = async () => {
    if (!searchQ.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const data = await api.knowledge.search(searchQ, 10);
      setSearchResults(data.results ?? []);
    } catch (e: any) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const by_type: Record<string, number> = {};
  for (const d of docs) {
    by_type[d.source_type] = (by_type[d.source_type] ?? 0) + 1;
  }

  return (
    <div>
      <div className="view-header">
        <h2 className="view-title">Knowledge Index</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="refresh-btn" onClick={handleReindex} disabled={syncing}>
            {syncing ? '…' : 'Re-index Docs'}
          </button>
          <button className="refresh-btn" onClick={handleSyncNotion} disabled={syncing}>
            {syncing ? 'Syncing…' : 'Sync Notion'}
          </button>
          <button className="refresh-btn" onClick={load}>Refresh</button>
        </div>
      </div>

      {syncMsg && (
        <div className="card" style={{ marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          {syncMsg}
        </div>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {Object.entries(by_type).map(([type, count]) => (
          <div key={type} className="card" style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`badge ${TYPE_CLASS[type] ?? 'badge-neutral'}`}>{type}</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{count}</span>
          </div>
        ))}
        {docs.length > 0 && (
          <div className="card" style={{ padding: '8px 14px' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Total: {docs.length}</span>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Search knowledge…"
          style={{
            flex: 1, padding: '6px 12px', background: 'var(--bg)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            color: 'var(--text)', fontSize: 13,
          }}
        />
        <button className="refresh-btn" onClick={handleSearch} disabled={searching || !searchQ.trim()}>
          {searching ? 'Searching…' : 'Search'}
        </button>
        {searchResults !== null && (
          <button className="refresh-btn" onClick={() => { setSearchResults(null); setSearchQ(''); }}>
            Clear
          </button>
        )}
      </div>

      {/* Search results */}
      {searchResults !== null && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
            Search Results ({searchResults.length})
          </div>
          {searchResults.length === 0
            ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No results found</div>
            : searchResults.map(r => (
              <div key={r.source_id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span className={`badge ${TYPE_CLASS[r.source_type] ?? 'badge-neutral'}`}>{r.source_type}</span>
                  <span style={{ fontWeight: 500, fontSize: 13 }}>{r.title}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 'auto' }}>
                    {Math.round(r.confidence * 100)}%
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  {r.matched_text}
                </div>
              </div>
            ))
          }
        </div>
      )}

      {loading && <div className="loading">Loading…</div>}
      {error && <div className="error-msg">Error: {error}</div>}

      {!loading && !error && docs.length === 0 && (
        <div className="empty-msg">No knowledge docs indexed. Use "Sync Notion" or "Re-index Docs".</div>
      )}

      {docs.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Source ID</th>
                <th>Type</th>
                <th>Title</th>
                <th>Indexed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.source_id}>
                  <td className="mono" style={{ fontSize: 10 }}>{d.source_id.slice(0, 32)}{d.source_id.length > 32 ? '…' : ''}</td>
                  <td>
                    <span className={`badge ${TYPE_CLASS[d.source_type] ?? 'badge-neutral'}`}>
                      {d.source_type}
                    </span>
                  </td>
                  <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.title}
                  </td>
                  <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 11 }}>
                    {new Date(d.indexed_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    <button
                      onClick={() => handleDelete(d.source_id)}
                      disabled={deleting === d.source_id}
                      style={{
                        padding: '2px 8px', background: 'transparent',
                        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                        color: 'var(--error)', fontSize: 11, cursor: 'pointer',
                      }}
                    >
                      {deleting === d.source_id ? '…' : 'Del'}
                    </button>
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
