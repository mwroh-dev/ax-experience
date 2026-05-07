import type { Case, AutomationRun, KnowledgeDoc, SearchResult, HealthDeps, VocReport, ClassifyResult, BacklogItem } from '../shared/types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  cases: {
    list: (limit = 50) =>
      request<{ cases: Case[] }>(`/admin/cases?limit=${limit}`),
  },
  automationRuns: {
    list: (limit = 50) =>
      request<{ runs: AutomationRun[] }>(`/api/automation-runs?limit=${limit}`),
    byCaseId: (case_id: string) =>
      request<{ runs: AutomationRun[] }>(`/api/automation-runs?case_id=${case_id}`),
  },
  knowledge: {
    list: (limit = 200) =>
      request<{ docs: KnowledgeDoc[]; total: number }>(`/admin/knowledge?limit=${limit}`),
    search: (q: string, limit = 10) =>
      request<{ results: SearchResult[] }>(`/api/knowledge/search?q=${encodeURIComponent(q)}&limit=${limit}`),
    syncNotion: () =>
      request<{ ok: boolean; synced?: number; skipped?: number; sources?: string[] }>('/admin/knowledge/sync-notion', { method: 'POST' }),
    reindex: () =>
      request<{ ok: boolean; indexed: number; source: string }>('/admin/knowledge/reindex-docs', { method: 'POST' }),
    delete: (source_id: string) =>
      request<{ ok: boolean; deleted: string }>(`/admin/knowledge/${encodeURIComponent(source_id)}`, { method: 'DELETE' }),
  },
  health: {
    deps: () => request<HealthDeps>('/api/health/deps'),
  },
  voc: {
    report: (days = 30) =>
      request<VocReport>(`/api/voc/report?days=${days}`),
    scenarios: () =>
      request<{ scenarios: unknown[] }>('/api/voc/scenarios'),
    classify: (text: string) =>
      request<ClassifyResult>('/api/voc/classify', json({ text })),
    generate: (scenario: string, message_index = 0) =>
      request<unknown>('/api/voc/generate', json({ scenario, message_index })),
  },
  backlog: {
    list: (status?: 'open' | 'resolved', limit = 20) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (status) params.set('status', status);
      return request<{ items: BacklogItem[] }>(`/admin/improvement-backlog?${params}`);
    },
    resolve: (id: string) =>
      request<{ ok: boolean; id: string }>(`/admin/improvement-backlog/${encodeURIComponent(id)}/resolve`, { method: 'POST' }),
  },
};

export type LatencyRow = {
  run_type: string; count: number; failed: number;
  failure_rate: number; p50: number | null; p90: number | null; p99: number | null;
};

export type TrendRow = { date: string; avg_score: number; count: number };

export const metrics = {
  latency: (period = '24h') =>
    request<LatencyRow[]>(`/api/metrics/latency?period=${period}`),
  evalTrend: (period = '7d') =>
    request<TrendRow[]>(`/api/metrics/eval-trend?period=${period}`),
};
