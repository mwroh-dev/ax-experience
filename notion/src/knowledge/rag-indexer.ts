import { FlowResult } from '@api/pipeline/index';
import { EmbedFn } from '@cs-ops-core/knowledge/embedder';
import { chunk_text } from '@cs-ops-core/knowledge/chunker';
import { store_chunk_embedding, SqliteDb } from './vector-store';

export interface IndexDocParams {
  source_id: string;
  content: string;
  embed: EmbedFn;
  chunk_opts?: { size: number; overlap: number };
}

export interface IndexDocResult {
  source_id: string;
  chunks_stored: number;
}

export async function index_doc_for_rag(
  db: SqliteDb,
  params: IndexDocParams,
): Promise<FlowResult<IndexDocResult>> {
  const trace = [{ step: 'index_doc_for_rag', started_at: Date.now(), duration_ms: 0, ok: true }];
  const opts = params.chunk_opts ?? { size: 512, overlap: 64 };

  const chunk_result = chunk_text(params.content, opts);
  if (!chunk_result.ok) {
    return { ok: false, error: chunk_result.error, step: 'chunk_text', trace };
  }

  const chunks = chunk_result.value;
  if (chunks.length === 0) {
    trace[0].duration_ms = Date.now() - trace[0].started_at;
    return { ok: true, value: { source_id: params.source_id, chunks_stored: 0 }, trace };
  }

  const embed_result = await params.embed(chunks);
  if (!embed_result.ok) {
    return { ok: false, error: embed_result.error, step: 'embed', trace };
  }

  const now = new Date().toISOString();
  // rowid must be provided for external content FTS5 tables so the FTS index
  // links back to the correct row in knowledge_chunks via rowid.
  const fts_stmt = db.prepare('INSERT OR REPLACE INTO knowledge_chunks_fts(rowid, source_id, content) VALUES (?, ?, ?)');

  for (let i = 0; i < chunks.length; i++) {
    const rowid = store_chunk_embedding(db, {
      id: `${params.source_id}#chunk_${i}`,
      source_id: params.source_id,
      chunk_index: i,
      content: chunks[i],
      embedding: embed_result.value[i],
      indexed_at: now,
    });

    try {
      fts_stmt.run(rowid, params.source_id, chunks[i]);
    } catch (err) {
      console.warn(`[rag-indexer] FTS insert skipped for ${params.source_id}#${i}:`, err);
    }
  }

  trace[0].duration_ms = Date.now() - trace[0].started_at;
  return { ok: true, value: { source_id: params.source_id, chunks_stored: chunks.length }, trace };
}
