export interface SqliteDb {
  prepare(sql: string): {
    run(...args: unknown[]): { lastInsertRowid: number | bigint };
    all(...args: unknown[]): unknown[];
  };
}

export interface ChunkRow {
  id: string;
  source_id: string;
  chunk_index: number;
  content: string;
  embedding: number[];
  indexed_at: string;
}

export interface VectorHit {
  id: string;
  source_id: string;
  chunk_index: number;
  content: string;
  score: number;
}

export function cosine_similarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, mag_a = 0, mag_b = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    mag_a += a[i] * a[i];
    mag_b += b[i] * b[i];
  }
  const denom = Math.sqrt(mag_a) * Math.sqrt(mag_b);
  return denom === 0 ? 0 : dot / denom;
}

function vec_to_blob(vec: number[]): Buffer {
  const buf = Buffer.allocUnsafe(vec.length * 4);
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i], i * 4);
  return buf;
}

function blob_to_vec(blob: Buffer): number[] {
  const vec: number[] = [];
  for (let i = 0; i < blob.length; i += 4) vec.push(blob.readFloatLE(i));
  return vec;
}

export function store_chunk_embedding(db: SqliteDb, chunk: ChunkRow): number {
  // INSERT OR REPLACE (delete+insert) ensures lastInsertRowid always reflects the new row.
  // ON CONFLICT DO UPDATE would leave lastInsertRowid stale on re-index, corrupting the FTS link.
  db.prepare(`
    INSERT OR REPLACE INTO knowledge_chunks (id, source_id, chunk_index, content, embedding, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    chunk.id,
    chunk.source_id,
    chunk.chunk_index,
    chunk.content,
    vec_to_blob(chunk.embedding),
    chunk.indexed_at,
  );
  const rows = db.prepare(
    'SELECT rowid FROM knowledge_chunks WHERE source_id = ? AND chunk_index = ?'
  ).all(chunk.source_id, chunk.chunk_index) as { rowid: number }[];
  return rows[0].rowid;
}

// O(n) linear scan — acceptable for small knowledge bases (<10k chunks).
// Replace with sqlite-vss or a dedicated vector DB when scale requires it.
export function search_by_vector(
  db: SqliteDb,
  query_vec: number[],
  opts: { top_k: number },
): VectorHit[] {
  const rows = db.prepare(
    'SELECT id, source_id, chunk_index, content, embedding FROM knowledge_chunks WHERE embedding IS NOT NULL'
  ).all() as { id: string; source_id: string; chunk_index: number; content: string; embedding: Buffer }[];

  return rows
    .map(row => ({
      id: row.id,
      source_id: row.source_id,
      chunk_index: row.chunk_index,
      content: row.content,
      score: cosine_similarity(query_vec, blob_to_vec(row.embedding)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.top_k);
}
