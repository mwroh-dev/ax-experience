/**
 * seeds/knowledge-docs/ 의 마크다운 파일을 RAG용 knowledge_chunks 테이블에 인덱싱한다.
 *
 * 사용법 (api/ 디렉토리에서):
 *   npx ts-node -r tsconfig-paths/register src/seed/seed-rag-docs.ts
 *   OPENAI_API_KEY=sk-... npx ts-node -r tsconfig-paths/register src/seed/seed-rag-docs.ts
 *
 * OPENAI_API_KEY 없으면 결정론적 mock 임베더로 실행 (의미적 유사도 없음).
 */
import fs from 'fs';
import path from 'path';
import { get_db } from '@api/db/sqlite';
import { init_knowledge_tables } from '@notion/knowledge/knowledge-index';
import { index_doc_for_rag } from '@notion/knowledge/rag-indexer';
import { make_mock_embedder } from '@cs-ops-core/knowledge/embedder';
import { make_openai_embedder } from '@api/knowledge/openai-embedder';
import { config } from '@api/config';

const DOCS_DIR = path.resolve(__dirname, '../../../seeds/knowledge-docs');

async function main(): Promise<void> {
  const db = get_db();
  init_knowledge_tables();

  const api_key = config.openai_api_key;
  if (!api_key) console.warn('[seed] OPENAI_API_KEY not set — using mock embedder (no semantic meaning)');
  const embed = api_key ? make_openai_embedder(api_key) : make_mock_embedder(1536);

  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`[seed] Directory not found: ${DOCS_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(DOCS_DIR).filter(f => f.endsWith('.md'));
  console.log(`[seed] Indexing ${files.length} documents from ${DOCS_DIR}`);

  let ok_count = 0, fail_count = 0;

  for (const file of files) {
    const content = fs.readFileSync(path.join(DOCS_DIR, file), 'utf8');
    const source_id = `seed:${file.replace('.md', '')}`;

    const result = await index_doc_for_rag(db, { source_id, content, embed });

    if (result.ok) {
      console.log(`  ✓ ${file} → ${result.value.chunks_stored} chunks`);
      ok_count++;
    } else {
      console.error(`  ✗ ${file}: ${result.error}`);
      fail_count++;
    }
  }

  console.log(`\n[seed] Done: ${ok_count} indexed, ${fail_count} failed`);
}

main().catch(err => { console.error(err); process.exit(1); });
