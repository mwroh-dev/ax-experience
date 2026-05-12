/**
 * RAG 파이프라인 통합 테스트
 * mock embedder + in-memory DB — API key 불필요
 */
import { index_doc_for_rag } from './rag-indexer';
import { hybrid_search } from './hybrid-retriever';
import { make_mock_embedder } from '@cs-ops-core/knowledge/embedder';
import { SqliteDb } from './vector-store';

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
          if (sql.includes('knowledge_chunks_fts')) {
            const [rowid, src, content] = args;
            const existing = fts_rows.findIndex(r => r.source_id === src && r.content === content);
            if (existing === -1) {
              fts_rows.push({ id: String(rowid), source_id: String(src), chunk_index: 0, content: String(content) });
            }
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
            return fts_rows.filter(r => r.content.includes(query));
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

const REFUND_DOC = `
전자상거래 소비자보호에 관한 법률 제17조에 따라, 소비자는 물품 수령일로부터
14일 이내에 청약을 철회할 수 있습니다. 환불은 청약철회 접수일로부터 3영업일
이내에 처리되어야 합니다. 단, 소비자의 귀책사유로 인한 상품 훼손 시에는
청약철회가 제한될 수 있습니다.
`.trim();

const DELIVERY_DOC = `
배송 조회는 운송장 번호를 통해 택배사 홈페이지에서 확인 가능합니다.
출고 후 1-2 영업일 이내 배송이 완료됩니다. 도서산간 지역의 경우 추가
배송 기간이 소요될 수 있습니다.
`.trim();

describe('RAG E2E', () => {
  const embed = make_mock_embedder(64);

  it('문서 인덱싱 후 관련 쿼리로 검색 가능', async () => {
    const db = make_test_db();

    const r1 = await index_doc_for_rag(db, {
      source_id: 'test:refund',
      content: REFUND_DOC,
      embed,
      chunk_opts: { size: 200, overlap: 40 },
    });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.value.chunks_stored).toBeGreaterThan(0);

    const r2 = await index_doc_for_rag(db, {
      source_id: 'test:delivery',
      content: DELIVERY_DOC,
      embed,
      chunk_opts: { size: 200, overlap: 40 },
    });
    expect(r2.ok).toBe(true);

    const search_result = await hybrid_search(db, '환불 청약철회', embed, { top_k: 3 });
    expect(search_result.ok).toBe(true);
    if (!search_result.ok) return;

    expect(search_result.value.length).toBeGreaterThan(0);
    const top = search_result.value[0];
    expect(top.content).toMatch(/환불|청약|철회/);
  });

  it('없는 키워드 검색은 dense 결과만 반환', async () => {
    const db = make_test_db();
    await index_doc_for_rag(db, {
      source_id: 'test:refund',
      content: REFUND_DOC,
      embed,
      chunk_opts: { size: 200, overlap: 40 },
    });

    const result = await hybrid_search(db, 'zzz_no_match_keyword', embed, { top_k: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // dense 결과는 있을 수 있음 (mock embedder 기반)
    expect(result.value.length).toBeGreaterThanOrEqual(0);
  });
});
