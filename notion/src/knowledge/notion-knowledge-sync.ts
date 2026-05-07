import { index_doc } from './knowledge-index';
import { config } from '@api/config';

const NOTION_VERSION = '2022-06-28';
const NOTION_BASE = 'https://api.notion.com/v1';

function notion_token(): string {
  const t = config.notion.token || process.env.NOTION_API_KEY || '';
  if (!t) throw new Error('NOTION_TOKEN or NOTION_API_KEY not set');
  return t;
}

async function notion_post(endpoint: string, body: object): Promise<any> {
  const resp = await fetch(`${NOTION_BASE}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${notion_token()}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Notion ${endpoint}: HTTP ${resp.status} — ${text.slice(0, 200)}`);
  }
  return resp.json();
}

interface SyncResult {
  synced: number;
  skipped: number;
  errors: string[];
  sources: string[];
}

export async function sync_notion_knowledge(): Promise<SyncResult> {
  const result: SyncResult = { synced: 0, skipped: 0, errors: [], sources: [] };

  // Search for FAQ and Policy pages
  let cursor: string | undefined;
  const pages: any[] = [];

  do {
    const body: any = {
      filter: { value: 'page', property: 'object' },
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;

    const data = await notion_post('/search', body);
    pages.push(...(data.results ?? []));
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor && pages.length < 500);

  const FAQ_DB = (process.env.NOTION_FAQ_DB_ID ?? '').replace(/-/g, '');
  const POLICIES_DB = (process.env.NOTION_POLICIES_DB_ID ?? '').replace(/-/g, '');

  for (const page of pages) {
    const props = page.properties ?? {};
    const db_id: string = (page.parent?.database_id ?? '').replace(/-/g, '');

    try {
      if (db_id === FAQ_DB) {
        const question = props.Question?.title?.[0]?.plain_text ?? '';
        const answer = props.Answer?.rich_text?.[0]?.plain_text ?? '';
        if (!question || !answer) { result.skipped++; continue; }

        index_doc({
          source_id: `notion_faq:${page.id}`,
          source_type: 'notion_faq',
          title: question,
          content: `Q: ${question}\nA: ${answer}`,
        });
        result.synced++;
        if (!result.sources.includes('FAQ DB')) result.sources.push('FAQ DB');

      } else if (db_id === POLICIES_DB) {
        const title = props.Title?.title?.[0]?.plain_text ?? '';
        const content = props.Content?.rich_text?.[0]?.plain_text ?? '';
        if (!title || !content) { result.skipped++; continue; }

        index_doc({
          source_id: `notion_policy:${page.id}`,
          source_type: 'notion_policy',
          title,
          content,
        });
        result.synced++;
        if (!result.sources.includes('Policies DB')) result.sources.push('Policies DB');
      }
    } catch (e: any) {
      result.errors.push(`page ${page.id}: ${e.message}`);
    }
  }

  return result;
}
