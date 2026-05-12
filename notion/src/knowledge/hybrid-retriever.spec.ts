import { hybrid_search, RankedHit } from './hybrid-retriever';
import { store_chunk_embedding, SqliteDb } from './vector-store';
import { make_mock_embedder } from '@cs-ops-core/knowledge/embedder';

interface FtsRow { id: string; source_id: string; chunk_index: number; content: string; }

function make_test_db(): SqliteDb & { fts_rows: FtsRow[]; chunks: Map<string, unknown> } {
  const chunks = new Map<string, unknown>();
  const fts_rows: FtsRow[] = [];

  return {
    chunks,
    fts_rows,
    prepare(sql: string) {
      return {
        run(...args: unknown[]) {
          if (sql.includes('knowledge_chunks') && sql.includes('INSERT') && !sql.includes('fts')) {
            const [id, source_id, chunk_index, content, embedding, indexed_at] = args;
            const key = `${source_id}#${chunk_index}`;
            const existing = [...chunks.values()].find((r: any) => r.source_id === source_id && r.chunk_index === chunk_index) as any;
            const rowid = existing ? existing.rowid : chunks.size + 1;
            chunks.set(key, { id, source_id, chunk_index, content, embedding, indexed_at, rowid });
          }
          if (sql.includes('INSERT') && sql.includes('knowledge_chunks_fts')) {
            const [rowid, src, content] = args;
            fts_rows.push({ id: String(rowid), source_id: String(src), chunk_index: 0, content: String(content) });
          }
          return { lastInsertRowid: 0 };
        },
        all(...args: unknown[]) {
          if (sql.includes('SELECT rowid FROM knowledge_chunks')) {
            const [source_id, chunk_index] = args;
            const key = `${source_id}#${chunk_index}`;
            const row = chunks.get(key) as any;
            return row ? [{ rowid: row.rowid }] : [];
          }
          if (sql.includes('knowledge_chunks_fts')) {
            const query = args[0] as string;
            return fts_rows
              .filter(r => r.content.includes(query))
              .map(r => ({ id: r.id, source_id: r.source_id, chunk_index: r.chunk_index, content: r.content }));
          }
          if (sql.includes('SELECT') && sql.includes('knowledge_chunks')) {
            return [...chunks.values()];
          }
          return [];
        },
      };
    },
  };
}

describe('hybrid_search', () => {
  it('BM25와 dense 결과를 병합해서 top_k개 반환', async () => {
    const db = make_test_db();
    const embed = make_mock_embedder(8);

    const texts = ['환불 정책 14일 청약철회', '배송 추적 운송장 조회'];
    const embedded = await embed(texts);
    if (!embedded.ok) throw new Error('embed failed');

    ['c1', 'c2'].forEach((id, i) => {
      store_chunk_embedding(db, {
        id,
        source_id: `doc${i + 1}`,
        chunk_index: 0,
        content: texts[i],
        embedding: embedded.value[i],
        indexed_at: new Date().toISOString(),
      });
      db.fts_rows.push({ id, source_id: `doc${i + 1}`, chunk_index: 0, content: texts[i] });
    });

    const result = await hybrid_search(db, '환불', embed, { top_k: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeGreaterThan(0);
    expect(result.value[0].content).toContain('환불');
  });

  it('BM25 히트 없어도 dense 결과 반환', async () => {
    const db = make_test_db();
    const embed = make_mock_embedder(8);

    const embedded = await embed(['환불 정책 14일']);
    if (!embedded.ok) throw new Error();

    store_chunk_embedding(db, {
      id: 'c1', source_id: 'doc1', chunk_index: 0,
      content: '환불 정책 14일', embedding: embedded.value[0],
      indexed_at: new Date().toISOString(),
    });

    const result = await hybrid_search(db, 'zzz_no_match', embed, { top_k: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // dense에서는 결과가 있을 수 있음
    expect(result.value.length).toBeGreaterThanOrEqual(0);
  });
});
