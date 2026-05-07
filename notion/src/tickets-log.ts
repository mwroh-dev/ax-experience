/**
 * Tickets Log — formal Notion write for case outcomes.
 * Delegated from notion-client.ts write_case_summary for backward compat.
 */

const EMAIL_PATTERN = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /(\+?82|0)[0-9\-\s]{8,12}[0-9]/g;
const TOKEN_PATTERN = /\b(ntn_[A-Za-z0-9]{10,}|xox[bpsa]-[A-Za-z0-9\-]+|xapp-[A-Za-z0-9\-]+|sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9\-_]{30,}|Bearer\s+[A-Za-z0-9\-._~+\/]+=*)/g;
const URL_SENSITIVE = /https?:\/\/[^\s]+(?:token|key|secret|auth|password)[^\s]*/gi;
const LOCAL_PATH = /\/(?:Users|home|root|var|tmp)\/[^\s]{3,}/g;

function redact(text: string): string {
  return text
    .replace(EMAIL_PATTERN, '[EMAIL]')
    .replace(PHONE_PATTERN, '[PHONE]')
    .replace(TOKEN_PATTERN, '[TOKEN]')
    .replace(URL_SENSITIVE, '[SENSITIVE_URL]')
    .replace(LOCAL_PATH, '[LOCAL_PATH]');
}

const NOTION_VERSION = '2022-06-28';
const NOTION_BASE = 'https://api.notion.com/v1';

export interface TicketLogParams {
  case_id: string;
  source_type: string;
  status: string;
  intent: string;
  raw_text: string;
  final_action?: string;
  created_at: string;
  resolved_at?: string;
}

function get_db_id(): string {
  return process.env.NOTION_CASES_DB_ID ?? '';
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

function map_status(status: string): string {
  const map: Record<string, string> = {
    intake_review: 'In progress',
    kept: 'Resolved',
    accepted: 'In progress',
    pending: 'New',
    draft_ready: 'In progress',
    resolved: 'Resolved',
    denied: 'Resolved',
    escalated: 'Resolved',
  };
  return map[status] ?? 'In progress';
}

const CATEGORY_MAP: Record<string, string> = {
  refund: '환불',
  shipping: '기타',
  account: '계정',
  subscription: '구독',
  legal_threat: '기타',
  privacy_request: '기타',
  payment: '결제',
  unknown: '기타',
};

export async function write_ticket_log(params: TicketLogParams): Promise<{ notion_page_id: string }> {
  const redacted_question = redact(params.raw_text);
  const intent_key = params.intent.split('.')[0];

  const body = {
    parent: { database_id: get_db_id() },
    properties: {
      'Ticket ID': {
        title: [{ text: { content: params.case_id } }],
      },
      'Question': {
        rich_text: [{ text: { content: redacted_question.slice(0, 2000) } }],
      },
      'Status': {
        status: { name: map_status(params.status) },
      },
      'Category': {
        select: { name: CATEGORY_MAP[intent_key] ?? '기타' },
      },
      'Agent Used': {
        select: { name: 'cs-ops-core' },
      },
      'Final Answer': {
        rich_text: [{ text: { content: params.final_action ? params.final_action.slice(0, 2000) : '(미결)' } }],
      },
    },
  };

  const result = await notion_post('/pages', body) as any;
  console.log(`[tickets-log] wrote ticket for case ${params.case_id} | status=${params.status} | page_id=${result.id}`);
  return { notion_page_id: result.id };
}
