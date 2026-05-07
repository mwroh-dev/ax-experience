// cs-ops-core/src/lib/notion-client.ts
// Local notion client — uses @notionhq/client directly, no workspace deps

import { Client } from '@notionhq/client';
import { FlowResult } from '@api/pipeline/index';

let _client: Client | null = null;

function get_client(): Client {
  if (!_client) {
    const token = process.env.NOTION_API_KEY ?? process.env.NOTION_TOKEN ?? '';
    if (!token) throw new Error('NOTION_API_KEY not set');
    // notionVersion 2022-06-28 enables the databases/{id}/query endpoint
    // used via c.request() since @notionhq/client v5 removed databases.query()
    _client = new Client({ auth: token, notionVersion: '2022-06-28' });
  }
  return _client;
}

type NotionRichText = { plain_text: string };
type NotionProp =
  | { type: 'title'; title: NotionRichText[] }
  | { type: 'rich_text'; rich_text: NotionRichText[] }
  | { type: string };

type DbQueryResponse = {
  results: Array<{ object: string; id: string; properties?: Record<string, NotionProp> }>;
};

async function query_notion_db(
  notion: Client,
  db_id: string,
  bodyParams: Record<string, unknown>,
): Promise<DbQueryResponse> {
  return (notion as unknown as { request: (args: unknown) => Promise<DbQueryResponse> }).request({
    method: 'post',
    path: `databases/${db_id}/query`,
    bodyParams,
  });
}

export interface NotionHit {
  source_db: 'faq' | 'policy';
  source_id: string;
  title: string;
  content: string;
}

export async function search_faq(query: string, limit = 5): Promise<NotionHit[]> {
  return search_db(query, process.env.NOTION_FAQ_DB_ID ?? '', 'faq', limit);
}

export async function search_policies(query: string, limit = 5): Promise<NotionHit[]> {
  return search_db(query, process.env.NOTION_POLICIES_DB_ID ?? '', 'policy', limit);
}

async function search_db(
  query: string,
  db_id: string,
  source: 'faq' | 'policy',
  limit: number,
): Promise<NotionHit[]> {
  if (!query.trim() || !db_id) return [];

  const notion = get_client();
  const property_name = source === 'faq' ? 'Question' : 'Title';

  let results: DbQueryResponse['results'];
  try {
    const response = await query_notion_db(notion, db_id, {
      filter: {
        property: property_name,
        title: { contains: query.slice(0, 100) },
      },
      page_size: limit * 2,
    });
    results = response.results;
  } catch {
    return [];
  }

  const hits: NotionHit[] = [];

  for (const page of results) {
    if (hits.length >= limit) break;
    if (page.object !== 'page') continue;

    const props = page.properties ?? {};

    if (source === 'faq') {
      const q = props['Question'];
      const a = props['Answer'];
      const question = q?.type === 'title' && 'title' in q ? (q.title[0]?.plain_text ?? '') : '';
      const answer = a?.type === 'rich_text' && 'rich_text' in a ? (a.rich_text[0]?.plain_text ?? '') : '';
      if (question && answer) {
        hits.push({ source_db: 'faq', source_id: page.id, title: question, content: answer });
      }
    } else {
      const t = props['Title'];
      const cv = props['Content'];
      const title = t?.type === 'title' && 'title' in t ? (t.title[0]?.plain_text ?? '') : '';
      const content = cv?.type === 'rich_text' && 'rich_text' in cv ? (cv.rich_text[0]?.plain_text ?? '') : '';
      if (title && content) {
        hits.push({ source_db: 'policy', source_id: page.id, title, content });
      }
    }
  }

  return hits;
}

export async function update_automation_run_reviewer(
  run_id: string,
  reviewer_action: string,
  reviewer_id: string,
): Promise<void> {
  const db_id = process.env.NOTION_AUTOMATION_RUNS_DB_ID ?? '';
  if (!db_id) {
    console.warn('[notion] NOTION_AUTOMATION_RUNS_DB_ID not set — skipping reviewer update');
    return;
  }

  const notion = get_client();

  // Query the Automation_Runs DB for page where run_id property matches
  let page_id: string | undefined;
  try {
    const response = await query_notion_db(notion, db_id, {
      filter: {
        property: 'run_id',
        title: { equals: run_id },
      },
    });
    const page = response.results.find(r => r.object === 'page');
    page_id = page?.id;
  } catch (err) {
    console.warn('[notion] Failed to query Automation_Runs for reviewer update:', err);
    return;
  }

  if (!page_id) {
    console.warn(`[notion] Automation run not found for run_id: ${run_id} — skipping reviewer update`);
    return;
  }

  try {
    await notion.pages.update({
      page_id,
      properties: {
        reviewer_action: { select: { name: reviewer_action } },
        reviewer_id: { rich_text: [{ type: 'text', text: { content: reviewer_id } }] },
      },
    });
  } catch (err) {
    console.warn('[notion] Failed to update Automation_Run reviewer fields:', err);
  }
}

export async function write_automation_run(params: {
  run_id: string;
  ticket_id: string;
  phase: string;
  steps: string[];
  risk_decision: { action: string; reason: string };
  reviewer_action?: string;
  evidence_ids: string[];
  final_answer?: string;
  eval_score?: number;
  detected_intent?: string;
}): Promise<void> {
  const db_id = process.env.NOTION_AUTOMATION_RUNS_DB_ID ?? '';
  if (!db_id) {
    console.warn('[notion] NOTION_AUTOMATION_RUNS_DB_ID not set — skipping log write');
    return;
  }

  const notion = get_client();
  await notion.pages.create({
    parent: { database_id: db_id },
    properties: {
      run_id:          { title: [{ text: { content: params.run_id } }] },
      ticket_id:       { rich_text: [{ text: { content: params.ticket_id } }] },
      phase:           { select: { name: params.phase } },
      steps:           { rich_text: [{ text: { content: params.steps.join(' → ').slice(0, 2000) } }] },
      risk_action:     { select: { name: params.risk_decision.action } },
      risk_reason:     { rich_text: [{ text: { content: params.risk_decision.reason.slice(0, 2000) } }] },
      reviewer_action: params.reviewer_action
        ? { select: { name: params.reviewer_action } }
        : { select: null },
      evidence_ids:    { rich_text: [{ text: { content: params.evidence_ids.join(', ').slice(0, 2000) } }] },
      final_answer:    params.final_answer
        ? { rich_text: [{ text: { content: params.final_answer.slice(0, 2000) } }] }
        : { rich_text: [] },
      eval_score:      params.eval_score !== undefined
        ? { number: params.eval_score }
        : { number: null },
      // NOTE: detected_intent is a domain-model field kept in the function signature
      // for future DB schema additions; it is intentionally omitted from the Notion
      // properties payload because the Automation_Runs DB does not yet have this column.
    },
  });
}

/**
 * Retrieve a Notion page by its ID.
 * Returns ok:false on any API error (including missing token or invalid page_id).
 */
export async function read_page(
  page_id: string,
): Promise<FlowResult<{ title: string; properties: Record<string, unknown> }>> {
  const started_at = Date.now();
  try {
    const notion = get_client();
    const page = await notion.pages.retrieve({ page_id });

    const raw_props = 'properties' in page ? page.properties : {};

    // Extract the first title property value
    let title = '';
    for (const prop of Object.values(raw_props)) {
      if (prop.type === 'title') {
        const texts = prop.title;
        if (Array.isArray(texts) && texts[0]?.plain_text) {
          title = texts[0].plain_text;
          break;
        }
      }
    }

    return {
      ok: true,
      value: { title, properties: raw_props as Record<string, unknown> },
      trace: [
        {
          step: 'read_page',
          started_at,
          duration_ms: Date.now() - started_at,
          ok: true,
        },
      ],
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      step: 'read_page',
      trace: [
        {
          step: 'read_page',
          started_at,
          duration_ms: Date.now() - started_at,
          ok: false,
        },
      ],
    };
  }
}

/**
 * Update the Status property of a Notion page.
 * Returns ok:false on any API error (including missing token or invalid page_id).
 */
export async function update_page_status(
  page_id: string,
  status: string,
): Promise<FlowResult<void>> {
  const started_at = Date.now();
  try {
    const notion = get_client();
    await notion.pages.update({
      page_id,
      properties: {
        Status: { status: { name: status } },
      },
    });

    return {
      ok: true,
      value: undefined,
      trace: [
        {
          step: 'update_page_status',
          started_at,
          duration_ms: Date.now() - started_at,
          ok: true,
        },
      ],
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      step: 'update_page_status',
      trace: [
        {
          step: 'update_page_status',
          started_at,
          duration_ms: Date.now() - started_at,
          ok: false,
        },
      ],
    };
  }
}
