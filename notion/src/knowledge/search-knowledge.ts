import { get_db } from '@api/db/sqlite';

export interface SearchResult {
  source_id: string;
  source_type: string;
  title: string;
  matched_text: string;
  confidence: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
}

export function search_knowledge(query: string, limit = 5): SearchResponse {
  const db = get_db();
  const results: SearchResult[] = [];

  const half = Math.ceil(limit / 2);

  // 1. Search knowledge_docs (LIKE-based, reliable with Korean text)
  const docs = db.prepare(`
    SELECT source_id, source_type, title, content FROM knowledge_docs
    WHERE content LIKE ? OR title LIKE ?
    LIMIT ?
  `).all(`%${query}%`, `%${query}%`, half) as any[];

  for (const row of docs) {
    results.push({
      source_id: row.source_id,
      source_type: row.source_type,
      title: row.title,
      matched_text: extract_snippet(row.content, query),
      confidence: 0.75,
    });
  }

  // 2. Search Slack archive (LIKE-based)
  const archive = db.prepare(`
    SELECT source_id, channel_id, redacted_text FROM slack_archive_curated
    WHERE redacted_text LIKE ?
    LIMIT ?
  `).all(`%${query}%`, limit - docs.length) as any[];

  for (const row of archive) {
    results.push({
      source_id: row.source_id,
      source_type: 'slack_archive',
      title: `Slack message (${row.channel_id})`,
      matched_text: extract_snippet(row.redacted_text, query),
      confidence: 0.5,
    });
  }

  // Sort by confidence
  results.sort((a, b) => b.confidence - a.confidence);

  return {
    query,
    results: results.slice(0, limit),
    total: results.length,
  };
}

function extract_snippet(text: string, query: string, length = 200): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, length);
  const start = Math.max(0, idx - 50);
  const end = Math.min(text.length, idx + length - 50);
  return (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '');
}
