// api/src/ops/ops.controller.spec.ts
// Integration test: HTTP → pipeline → admin endpoints (real NestJS) → KB (in-memory SQLite)
// Only mocks: normalize_ticket (no LLM), llm-judge (no Claude CLI)

jest.mock('@cs-ops-core/classifier/ticket');
jest.mock('@cs-ops-core/lib/llm-judge', () => ({
  claude_cli_judge: jest.fn().mockResolvedValue({ ok: true, value: { is_auto_safe: true, reason: 'mock', confidence: 'high' }, trace: [] }),
  passthrough_judge: jest.fn().mockResolvedValue({ ok: true, value: { is_auto_safe: true, reason: 'passthrough', confidence: 'high' }, trace: [] }),
}));
jest.mock('@cs-ops-core/logging/automation-run', () => ({ log_automation_run: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@cs-ops-core/lib/openclaw-client', () => ({ call_cs_bot: jest.fn() }));
jest.mock('@slack/web-api', () => ({
  WebClient: jest.fn().mockImplementation(() => ({ chat: { postMessage: jest.fn().mockResolvedValue({ ok: true }) } })),
}));
jest.mock('@cs-ops-core/draft/generator', () => ({
  generate_draft: jest.fn().mockResolvedValue({
    ok: true,
    value: { text: '배송 현황: 배송 중입니다.', evidence_ids: ['order-status'] },
    trace: [],
  }),
}));

import { Test, TestingModule } from '@nestjs/testing';
import supertest from 'supertest';
import { INestApplication } from '@nestjs/common';
import { OpsModule } from './ops.module';
import { AdminModule } from '../admin/admin.module';
import { normalize_ticket } from '@cs-ops-core/classifier/ticket';
import { Ticket } from '@cs-ops-core/types';
import { KB_FAST_PATH_REASON } from '@cs-ops-core/pipeline';

const mock_normalize = normalize_ticket as jest.MockedFunction<typeof normalize_ticket>;

const delivery_ticket: Ticket = {
  ticket_id: 'integ-delivery-001',
  customer_intent: 'delivery_inquiry',
  issue_reason: 'late_delivery',
  order_state: 'in_transit',
  risk_level: 'low',
  evidence_required: ['order_status'],
  human_review_required: false,
  recommended_action: 'auto_respond',
};

const privacy_ticket: Ticket = {
  ticket_id: 'integ-privacy-001',
  customer_intent: 'privacy_request',
  issue_reason: 'data_breach_concern',
  order_state: 'no_order',
  risk_level: 'critical',
  evidence_required: [],
  human_review_required: true,
  recommended_action: 'escalate',
};

describe('OpsController — POST /api/ops/cs-pipeline (real AdminModule)', () => {
  let app: INestApplication;
  let port: number;
  const orig_admin_url = process.env.MOCK_ADMIN_API_URL;
  const orig_kb_path = process.env.KNOWLEDGE_DB_PATH;

  beforeAll(async () => {
    process.env.KNOWLEDGE_DB_PATH = ':memory:';

    const module: TestingModule = await Test.createTestingModule({
      imports: [OpsModule, AdminModule],
    }).compile();

    app = module.createNestApplication();
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;
    process.env.MOCK_ADMIN_API_URL = `http://localhost:${port}`;
  });

  afterAll(async () => {
    await app.close();
    if (orig_admin_url === undefined) delete process.env.MOCK_ADMIN_API_URL;
    else process.env.MOCK_ADMIN_API_URL = orig_admin_url;
    if (orig_kb_path === undefined) delete process.env.KNOWLEDGE_DB_PATH;
    else process.env.KNOWLEDGE_DB_PATH = orig_kb_path;
  });

  beforeEach(() => jest.clearAllMocks());

  it('returns 400 when message is missing', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/api/ops/cs-pipeline')
      .send({});
    expect(res.status).toBe(400);
  });

  it('delivery_inquiry in_transit → KB fast-path auto route', async () => {
    mock_normalize.mockResolvedValue({ ok: true, value: delivery_ticket, trace: [] });

    const res = await supertest(app.getHttpServer())
      .post('/api/ops/cs-pipeline')
      .send({ message: '제 주문 배송이 어디쯤 있나요? 주문번호 transit_12345' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.value.risk_decision.reason).toBe(KB_FAST_PATH_REASON);
    expect(['auto_sent', 'auto_suppressed']).toContain(res.body.value.reviewer_action);
    expect(res.body.value.detected_intent).toBe('delivery_inquiry');
  });

  it('privacy_request → NOT KB fast-path → escalate', async () => {
    mock_normalize.mockResolvedValue({ ok: true, value: privacy_ticket, trace: [] });

    const res = await supertest(app.getHttpServer())
      .post('/api/ops/cs-pipeline')
      .send({ message: '제 개인정보를 모두 삭제해주세요. GDPR 요청입니다.' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.value.reviewer_action).toBe('escalated');
  });

  it('normalize_ticket failure → returns ok:false', async () => {
    mock_normalize.mockResolvedValue({ ok: false, error: 'LLM unavailable', step: 'normalize_ticket', trace: [] });

    const res = await supertest(app.getHttpServer())
      .post('/api/ops/cs-pipeline')
      .send({ message: '배송 조회해주세요' });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toBe('LLM unavailable');
  });
});
