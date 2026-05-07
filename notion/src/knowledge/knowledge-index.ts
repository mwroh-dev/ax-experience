/**
 * Knowledge Index
 *
 * 검색 대상:
 * 1. slack_archive_curated (Slack archive)
 * 2. docs/contracts/ (API docs/contracts)
 * 3. knowledge_docs table (Notion 내보내기 또는 수동 추가 문서)
 *
 * 검색 방식: SQLite FTS5 + LIKE fallback
 */

import fs from 'fs';
import path from 'path';
import { get_db } from '@api/db/sqlite';

export function init_knowledge_tables(): void {
  const db = get_db();
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_docs (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL UNIQUE,
      source_type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      indexed_at TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
      source_id UNINDEXED,
      title,
      content,
      content='knowledge_docs',
      content_rowid='rowid'
    );
  `);
}

export function index_doc(params: {
  source_id: string;
  source_type: string;
  title: string;
  content: string;
}): void {
  const db = get_db();
  const now = new Date().toISOString();
  const id = 'kdoc_' + params.source_id.replace(/[^a-z0-9]/gi, '_').slice(0, 20);

  db.prepare(`
    INSERT INTO knowledge_docs (id, source_id, source_type, title, content, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_id) DO UPDATE SET content=excluded.content, indexed_at=excluded.indexed_at
  `).run(id, params.source_id, params.source_type, params.title, params.content, now);

  try {
    db.prepare("DELETE FROM knowledge_fts WHERE source_id=?").run(params.source_id);
    db.prepare("INSERT INTO knowledge_fts(source_id, title, content) VALUES (?,?,?)").run(
      params.source_id, params.title, params.content
    );
  } catch {
    // FTS rebuild optional
  }
}

export function index_docs_from_dir(dir: string, source_type: string): number {
  if (!fs.existsSync(dir)) return 0;
  let count = 0;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
  for (const file of files) {
    const full_path = path.join(dir, file);
    const content = fs.readFileSync(full_path, 'utf8');
    const source_id = `${source_type}:${file}`;
    index_doc({
      source_id,
      source_type,
      title: file.replace(/\.(md|txt)$/, '').replace(/[-_]/g, ' '),
      content,
    });
    count++;
  }
  return count;
}
