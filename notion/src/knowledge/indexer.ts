import { get_db } from '@api/db/sqlite';

export interface IndexResult {
  indexed_count: number;
  skipped_count: number;
}

/**
 * Syncs curated Slack archive messages into knowledge_docs for search.
 * Uses source_type=slack_archive and source_id=slack:{channel}:{ts}.
 */
export function index_archive_to_knowledge(): IndexResult {
  const db = get_db();
  let indexed_count = 0;
  let skipped_count = 0;

  try {
    const curated = db.prepare(
      `SELECT source_id, channel_id, redacted_text, collected_at
       FROM slack_archive_curated
       WHERE LENGTH(redacted_text) >= 30
       LIMIT 500`
    ).all() as any[];

    for (const row of curated) {
      const existing = db.prepare(
        'SELECT id FROM knowledge_docs WHERE source_id = ?'
      ).get(row.source_id);

      if (existing) {
        skipped_count++;
        continue;
      }

      db.prepare(
        `INSERT OR IGNORE INTO knowledge_docs (id, source_id, source_type, title, content, indexed_at)
         VALUES (?, ?, 'slack_archive', ?, ?, ?)`
      ).run(
        `ki_${row.source_id.replace(/[^a-z0-9]/gi, '_').slice(0, 32)}`,
        row.source_id,
        `Slack message (${row.channel_id})`,
        row.redacted_text,
        row.collected_at ?? new Date().toISOString()
      );
      indexed_count++;
    }
  } catch { /* table may not exist */ }

  return { indexed_count, skipped_count };
}
