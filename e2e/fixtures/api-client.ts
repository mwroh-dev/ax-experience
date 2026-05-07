// e2e/fixtures/api-client.ts
export const API_BASE = process.env.API_BASE_URL ?? 'http://localhost:3100';

export interface CsEventPayload {
  source: string;
  event_type?: string;
  message: string;
  customer_ref?: { email?: string };
  metadata?: { request_id?: string };
}

export interface CsEventResponse {
  case_id: string;
  slack_ts: string;
  duplicate?: boolean;
}

export async function post_cs_event(payload: CsEventPayload): Promise<CsEventResponse> {
  const resp = await fetch(`${API_BASE}/api/cs-events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`POST /api/cs-events failed: ${resp.status}`);
  return resp.json();
}

export async function get_case(case_id: string): Promise<{ id: string; status: string }> {
  const resp = await fetch(`${API_BASE}/admin/cases?limit=200`);
  if (!resp.ok) throw new Error(`GET /admin/cases failed: ${resp.status}`);
  const data = await resp.json();
  const found = data.cases?.find((c: any) => c.id === case_id);
  if (!found) throw new Error(`Case not found: ${case_id}`);
  return found;
}

export interface CsPipelineRunValue {
  run_id: string;
  ticket_id: string;
  phase: string;
  steps: string[];
  risk_decision: { action: string; reason: string };
  reviewer_action?: string;
  evidence_ids: string[];
  final_answer?: string;
  detected_intent?: string;
}

export interface CsPipelineResponse {
  ok: boolean;
  value?: CsPipelineRunValue;
  error?: string;
  step?: string;
}

export async function post_cs_pipeline(payload: {
  message: string;
  slack_ts?: string;
}): Promise<CsPipelineResponse> {
  const resp = await fetch(`${API_BASE}/api/ops/cs-pipeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(`POST /api/ops/cs-pipeline failed: ${resp.status}`);
  return resp.json();
}
