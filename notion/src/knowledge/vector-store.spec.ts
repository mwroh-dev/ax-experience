import { cosine_similarity, store_chunk_embedding, search_by_vector, VectorHit, SqliteDb } from './vector-store';

function make_test_db(): SqliteDb {
  const rows = new Map<string, { id: string; source_id: string; chunk_index: number; content: string; embedding: unknown; indexed_at: string; rowid: number }>();
  let next_rowid = 1;

  return {
    prepare(sql: string) {
      return {
        run(...args: unknown[]) {
          if (sql.includes('knowledge_chunks') && sql.includes('INSERT') && !sql.includes('fts')) {
            const [id, source_id, chunk_index, content, embedding, indexed_at] = args;
            const key = `${source_id}#${chunk_index}`;
            const existing = [...rows.values()].find(r => r.source_id === source_id && r.chunk_index === chunk_index);
            const rowid = existing ? existing.rowid : next_rowid++;
            rows.set(key, { id: id as string, source_id: source_id as string, chunk_index: chunk_index as number, content: content as string, embedding, indexed_at: indexed_at as string, rowid });
          }
          return { lastInsertRowid: 0 };
        },
        all(...args: unknown[]) {
          if (sql.includes('SELECT rowid FROM knowledge_chunks')) {
            const [source_id, chunk_index] = args;
            const key = `${source_id}#${chunk_index}`;
            const row = rows.get(key);
            return row ? [{ rowid: row.rowid }] : [];
          }
          if (sql.includes('SELECT') && sql.includes('knowledge_chunks')) {
            return [...rows.values()];
          }
          return [];
        },
      };
    },
  };
}

describe('cosine_similarity', () => {
  it('동일 벡터는 1.0', () => {
    const v = [0.6, 0.8];
    expect(cosine_similarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('직교 벡터는 0.0', () => {
    expect(cosine_similarity([1, 0], [0, 1])).toBeCloseTo(0.0, 5);
  });
});

describe('store_chunk_embedding + search_by_vector', () => {
  it('저장 후 검색에서 가장 유사한 청크 반환', () => {
    const db = make_test_db();

    store_chunk_embedding(db, {
      id: 'c1',
      source_id: 'doc1',
      chunk_index: 0,
      content: '환불 정책 안내',
      embedding: [1, 0, 0],
      indexed_at: new Date().toISOString(),
    });

    store_chunk_embedding(db, {
      id: 'c2',
      source_id: 'doc2',
      chunk_index: 0,
      content: '배송 조회 방법',
      embedding: [0, 1, 0],
      indexed_at: new Date().toISOString(),
    });

    const results: VectorHit[] = search_by_vector(db, [1, 0, 0], { top_k: 2 });

    expect(results.length).toBe(2);
    expect(results[0].id).toBe('c1');
    expect(results[0].score).toBeCloseTo(1.0, 5);
    expect(results[1].score).toBeCloseTo(0.0, 5);
  });
});
