// cs-ops-core/src/mock-admin/server.spec.ts
import request from 'supertest';
import { create_mock_admin_app } from './server';

const app = create_mock_admin_app();

describe('Mock Admin API', () => {
  describe('GET /admin/orders/:orderId/status', () => {
    it('returns expected shape for order 12345', async () => {
      const res = await request(app).get('/admin/orders/12345/status');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        orderId: '12345',
        status: expect.any(String),
      });
    });

    it('returns 404 for unknown order', async () => {
      const res = await request(app).get('/admin/orders/99999/status');
      expect(res.status).toBe(404);
    });

    it('includes carrier and trackingNumber for order 12345', async () => {
      const res = await request(app).get('/admin/orders/12345/status');
      expect(res.body).toHaveProperty('carrier');
      expect(res.body).toHaveProperty('trackingNumber');
    });
  });

  describe('GET /admin/customers/lookup', () => {
    it('returns expected shape for known email', async () => {
      const res = await request(app).get('/admin/customers/lookup?email=user@example.com');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        customerId: expect.any(String),
        email_masked: expect.stringMatching(/\*+/),
        orderCount: expect.any(Number),
        firstOrderDate: expect.any(String),
      });
    });

    it('returns 400 when email is missing', async () => {
      const res = await request(app).get('/admin/customers/lookup');
      expect(res.status).toBe(400);
    });

    it('returns fallback data for unknown email', async () => {
      const res = await request(app).get('/admin/customers/lookup?email=unknown@unknown.com');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('customerId');
    });
  });

  describe('GET /admin/refunds/eligibility', () => {
    it('returns expected shape for order 12345', async () => {
      const res = await request(app).get('/admin/refunds/eligibility?orderId=12345');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        eligible: expect.any(Boolean),
        reason: expect.any(String),
        daysReturn: expect.any(Number),
        withinWindow: expect.any(Boolean),
      });
    });

    it('returns 400 when orderId is missing', async () => {
      const res = await request(app).get('/admin/refunds/eligibility');
      expect(res.status).toBe(400);
    });
  });
});
