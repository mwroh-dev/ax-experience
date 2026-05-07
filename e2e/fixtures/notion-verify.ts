// e2e/fixtures/notion-verify.ts
//
// Note: @notionhq/client v5.20.0 sends Notion-Version: 2025-09-03 which does NOT
// support POST /v1/databases/{id}/query (returns invalid_request_url).
// We use fetch() directly with Notion-Version: 2022-06-28, which still supports
// the /v1/databases/{id}/query endpoint.

const NOTION_POLL_INTERVAL_MS = 2_000;

// Polls a Notion DB query until results appear or timeout expires.
// Notion writes are async so newly created pages may not be immediately visible.
async function poll_notion_db(
  db_id: string,
  filter: Record<string, unknown>,
  timeout: number,
): Promise<string | null> {
  const token = process.env.NOTION_API_KEY ?? '';
  if (!token) throw new Error('NOTION_API_KEY not set');

  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const resp = await fetch(`https://api.notion.com/v1/databases/${db_id}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filter }),
    });
    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`Notion query failed: ${resp.status} ${err}`);
    }
    const data = await resp.json() as { results: Array<{ id: string }> };
    if (data.results.length > 0) return data.results[0].id;
    await new Promise<void>((r) => setTimeout(r, NOTION_POLL_INTERVAL_MS));
  }
  return null;
}

export async function find_automation_run_by_run_id(
  run_id: string,
  timeout = 15_000,
): Promise<string | null> {
  const db_id = process.env.NOTION_AUTOMATION_RUNS_DB_ID ?? '';
  if (!db_id) throw new Error('NOTION_AUTOMATION_RUNS_DB_ID not set');
  return poll_notion_db(db_id, { property: 'run_id', title: { equals: run_id } }, timeout);
}

export async function find_notion_page_by_case_id(
  db_id: string,
  case_id: string,
  timeout = 15_000,
): Promise<string | null> {
  if (!db_id) throw new Error('db_id is required');
  return poll_notion_db(db_id, { property: 'Ticket ID', title: { equals: case_id } }, timeout);
}

export async function find_improvement_backlog_entry(case_id: string): Promise<boolean> {
  const db_id = process.env.NOTION_IMPROVEMENT_BACKLOG_DB_ID ?? '';
  if (!db_id) throw new Error('NOTION_IMPROVEMENT_BACKLOG_DB_ID not set');
  const token = process.env.NOTION_API_KEY ?? '';
  if (!token) throw new Error('NOTION_API_KEY not set');

  const resp = await fetch(`https://api.notion.com/v1/databases/${db_id}/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: {
        property: 'Fix Needed',
        rich_text: { contains: case_id },
      },
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Notion query failed: ${resp.status} ${err}`);
  }
  const data = await resp.json() as { results: Array<{ id: string }> };
  return data.results.length > 0;
}

export async function get_notion_page_status(page_id: string): Promise<string | null> {
  const token = process.env.NOTION_API_KEY ?? '';
  if (!token) throw new Error('NOTION_API_KEY not set');

  const resp = await fetch(`https://api.notion.com/v1/pages/${page_id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
    },
  });
  if (!resp.ok) return null;
  const data = await resp.json() as {
    properties?: Record<string, { type: string; select?: { name: string }; status?: { name: string }; rich_text?: Array<{ plain_text: string }> }>
  };
  // Tickets Log DB uses a 'Status' select property
  const status_prop = data.properties?.['Status'];
  if (!status_prop) return null;
  if (status_prop.type === 'select') return status_prop.select?.name ?? null;
  if (status_prop.type === 'status') return status_prop.status?.name ?? null;
  return null;
}

