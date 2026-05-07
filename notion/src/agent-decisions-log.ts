const NOTION_VERSION = '2022-06-28';
const NOTION_BASE = 'https://api.notion.com/v1';

export interface AgentDecisionRecord {
  case_id: string;
  intent: string;
  risk_level: string;
  decision: string;
  reason: string;
  evidence_sources: string[];
  admin_api_called: boolean;
  human_review_required: boolean;
  confidence?: string;
}

function notion_token(): string {
  const t = process.env.NOTION_TOKEN ?? process.env.NOTION_API_KEY ?? '';
  if (!t) throw new Error('NOTION_TOKEN not set');
  return t;
}

async function notion_post(path: string, body: object): Promise<unknown> {
  const resp = await fetch(`${NOTION_BASE}${path}`, {
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
    throw new Error(`Notion POST ${path} failed: HTTP ${resp.status} — ${text.slice(0, 200)}`);
  }
  return resp.json();
}

export async function write_agent_decision(record: AgentDecisionRecord): Promise<void> {
  const db_id = process.env.NOTION_AGENT_DECISIONS_DB_ID;
  if (!db_id) {
    console.log(`[agent-decisions-log] NOTION_AGENT_DECISIONS_DB_ID not set — SQLite-only for case ${record.case_id}`);
    return;
  }

  const sources_text = record.evidence_sources.join(', ').slice(0, 500) || '(없음)';

  await notion_post('/pages', {
    parent: { database_id: db_id },
    properties: {
      'Case ID': {
        title: [{ text: { content: record.case_id } }],
      },
      'Intent': {
        rich_text: [{ text: { content: record.intent } }],
      },
      'Risk Level': {
        select: { name: record.risk_level },
      },
      'Decision': {
        rich_text: [{ text: { content: record.decision } }],
      },
      'Reason': {
        rich_text: [{ text: { content: record.reason.slice(0, 2000) } }],
      },
      'Evidence Sources': {
        rich_text: [{ text: { content: sources_text } }],
      },
      'Admin API Called': {
        checkbox: record.admin_api_called,
      },
      'Human Review Required': {
        checkbox: record.human_review_required,
      },
      ...(record.confidence ? {
        'Confidence': {
          select: { name: record.confidence },
        },
      } : {}),
    },
  });

  console.log(`[agent-decisions-log] wrote decision for case ${record.case_id} | intent=${record.intent} | decision=${record.decision}`);
}
