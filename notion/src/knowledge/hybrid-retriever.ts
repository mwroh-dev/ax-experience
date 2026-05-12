import { FlowResult } from '@api/pipeline/index';
import { EmbedFn } from '@cs-ops-core/knowledge/embedder';
import { search_by_vector, VectorHit, SqliteDb } from './vector-store';

export interface RankedHit {
  id: string;
  source_id: string;
  chunk_index: number;
  content: string;
  rrf_score: number;
}

interface BM25Row { id: string; source_id: string; chunk_index: number; content: string; }

function rrf_score(rank: number, k = 60): number {
  return 1 / (k + rank + 1);
}

export async function hybrid_search(
  db: SqliteDb,
  query: string,
  embed: EmbedFn,
  opts: { top_k: number },
): Promise<FlowResult<RankedHit[]>> {
  const trace = [{ step: 'hybrid_search', started_at: Date.now(), duration_ms: 0, ok: true }];

  if (!query.trim()) {
    return { ok: true, value: [], trace };
  }

  // Escape each token so user-supplied text is treated as literal, not FTS5 syntax.
  const safe_query = query.trim().split(/\s+/).map(t => `"${t.replace(/"/g, '""')}"`).join(' ');
  let bm25_rows: BM25Row[] = [];
  try {
    bm25_rows = db.prepare(`
      SELECT kc.id, kc.source_id, kc.chunk_index, kc.content
      FROM knowledge_chunks_fts fts
      JOIN knowledge_chunks kc ON kc.rowid = fts.rowid
      WHERE knowledge_chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(safe_query, opts.top_k * 2) as BM25Row[];
  } catch {
    // FTS5 parse error — fall back to dense-only search
  }

  const embed_result = await embed([query]);
  if (!embed_result.ok) {
    return { ok: false, error: embed_result.error, step: 'hybrid_search', trace };
  }

  const query_vec = embed_result.value[0];
  const dense_hits: VectorHit[] = search_by_vector(db, query_vec, { top_k: opts.top_k * 2 });

  const scores = new Map<string, { hit: BM25Row | VectorHit; score: number }>();

  bm25_rows.forEach((row, rank) => {
    const s = scores.get(row.id) ?? { hit: row, score: 0 };
    s.score += rrf_score(rank);
    scores.set(row.id, s);
  });

  dense_hits.forEach((hit, rank) => {
    const s = scores.get(hit.id) ?? { hit, score: 0 };
    s.score += rrf_score(rank);
    scores.set(hit.id, s);
  });

  const merged: RankedHit[] = [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.top_k)
    .map(({ hit, score }) => ({
      id: hit.id,
      source_id: hit.source_id,
      chunk_index: hit.chunk_index,
      content: hit.content,
      rrf_score: score,
    }));

  trace[0].duration_ms = Date.now() - trace[0].started_at;
  return { ok: true, value: merged, trace };
}
