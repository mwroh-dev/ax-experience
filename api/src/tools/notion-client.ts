// api/src/tools/notion-client.ts
import { Client, isNotionClientError } from '@notionhq/client';
import { write_ticket_log } from '@notion/tickets-log';
import { config } from '../config';

let _client: Client | null = null;

function get_notion_client(): Client {
  if (!_client) {
    const token = config.notion.token;
    if (!token) throw new Error('NOTION_API_KEY not set');
    _client = new Client({ auth: token });
  }
  return _client;
}

export interface KnowledgeHit {
  source_db: string;
  source_id: string;
  title: string;
  content: string;
}

export async function search_notion_knowledge(query: string, limit = 5): Promise<KnowledgeHit[]> {
  if (!query.trim()) return [];
  const notion = get_notion_client();

  const response = await notion.search({
    query,
    filter: { value: 'page', property: 'object' },
    page_size: limit * 3,
  });

  const hits: KnowledgeHit[] = [];
  const faq_db = config.notion.faq_db_id.replace(/-/g, '');
  const policies_db = config.notion.policies_db_id.replace(/-/g, '');

  for (const page of response.results) {
    if (hits.length >= limit) break;
    if (page.object !== 'page') continue;

    const db_id = ('parent' in page && page.parent.type === 'database_id')
      ? page.parent.database_id.replace(/-/g, '')
      : '';
    const props = 'properties' in page ? page.properties : {};

    if (faq_db && db_id === faq_db) {
      const q_prop = props['Question'];
      const a_prop = props['Answer'];
      const question = (q_prop?.type === 'title' && q_prop.title[0]?.plain_text) ?? '';
      const answer   = (a_prop?.type === 'rich_text' && a_prop.rich_text[0]?.plain_text) ?? '';
      if (question && answer) {
        hits.push({ source_db: 'FAQ DB', source_id: page.id, title: question, content: answer });
      }
      continue;
    }

    if (policies_db && db_id === policies_db) {
      const t_prop = props['Title'];
      const c_prop = props['Content'];
      const title   = (t_prop?.type === 'title'     && t_prop.title[0]?.plain_text)     ?? '';
      const content = (c_prop?.type === 'rich_text' && c_prop.rich_text[0]?.plain_text) ?? '';
      if (title && content) {
        hits.push({ source_db: 'Policies DB', source_id: page.id, title, content });
      }
      continue;
    }
  }

  return hits;
}

export interface CaseSummaryWriteParams {
  case_id: string;
  source_type: string;
  status: string;
  intent: string;
  raw_text: string;
  final_action?: string;
  created_at: string;
  resolved_at?: string;
}

export async function write_case_summary(params: CaseSummaryWriteParams): Promise<{ notion_page_id: string }> {
  return write_ticket_log(params);
}

export async function write_improvement_backlog(params: {
  case_id: string;
  missing_topic: string;
  raw_query: string;
  suggested_doc_type: 'policy_or_faq' | 'template' | 'playbook';
}): Promise<void> {
  const db_id = config.notion.improvement_backlog_db_id;
  if (!db_id) {
    console.warn('[notion] NOTION_IMPROVEMENT_BACKLOG_DB_ID not set — skipping backlog write');
    return;
  }

  const notion = get_notion_client();
  const type_map: Record<string, string> = {
    policy_or_faq: 'policy',
    template: 'data',
    playbook: 'data',
  };

  try {
    await notion.pages.create({
      parent: { database_id: db_id },
      properties: {
        Issue: {
          title: [{ text: { content: params.missing_topic.slice(0, 200) } }],
        },
        'Fix Needed': {
          rich_text: [{
            text: {
              content: `case_id: ${params.case_id}\n쿼리: ${params.raw_query.slice(0, 500)}\n유형: ${params.suggested_doc_type}`,
            },
          }],
        },
        Priority: { select: { name: 'Medium' } },
        Type: { select: { name: type_map[params.suggested_doc_type] ?? 'policy' } },
      },
    });
  } catch (err) {
    if (isNotionClientError(err)) {
      throw new Error(`Notion API error: ${err.code} — ${err.message}`);
    }
    throw err;
  }
}
