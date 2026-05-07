// cs-ops-core/src/mock-admin/server.ts
import express, { Request, Response } from 'express';
import { OrderStatus, CustomerInfo, RefundEligibility } from '../types';

const ORDER_RECORDS = new Map<string, OrderStatus>([
  ['12345', { orderId: '12345', status: 'delivered', carrier: 'FedEx', trackingNumber: 'FX123456789', estimatedDelivery: '2025-05-01' }],
  ['67890', { orderId: '67890', status: 'in_transit', carrier: 'UPS', trackingNumber: 'UPS987654321', estimatedDelivery: '2025-05-15' }],
  ['11111', { orderId: '11111', status: 'not_shipped', estimatedDelivery: '2025-05-20' }],
  ['22222', { orderId: '22222', status: 'returned', carrier: 'USPS', trackingNumber: 'USPS111222333' }],
  ['33333', { orderId: '33333', status: 'cancelled' }],
]);

const CUSTOMER_RECORDS = new Map<string, CustomerInfo>([
  ['user@example.com', { customerId: 'cust-001', email_masked: 'u***@example.com', orderCount: 5, firstOrderDate: '2023-01-15' }],
  ['jane@test.com', { customerId: 'cust-002', email_masked: 'j***@test.com', orderCount: 2, firstOrderDate: '2024-06-01' }],
  ['john@shop.com', { customerId: 'cust-003', email_masked: 'j***@shop.com', orderCount: 12, firstOrderDate: '2022-03-20' }],
]);

const REFUND_RECORDS = new Map<string, RefundEligibility>([
  ['12345', { eligible: true, reason: 'Within 30-day return window', daysReturn: 30, withinWindow: true }],
  ['67890', { eligible: false, reason: 'Order still in transit', daysReturn: 30, withinWindow: false }],
  ['11111', { eligible: true, reason: 'Order not yet shipped', daysReturn: 30, withinWindow: true }],
  ['22222', { eligible: false, reason: 'Already returned', daysReturn: 30, withinWindow: false }],
  ['33333', { eligible: true, reason: 'Cancelled order refund', daysReturn: 30, withinWindow: true }],
]);

function mask_email(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  return `${local[0] ?? ''}***@${domain}`;
}

export function create_mock_admin_app(): express.Application {
  const app = express();
  app.use(express.json());

  // GET /admin/orders/:orderId/status
  app.get('/admin/orders/:orderId/status', (req: Request, res: Response) => {
    const orderId = String(req.params['orderId'] ?? '');
    const record = ORDER_RECORDS.get(orderId);
    if (!record) {
      res.status(404).json({ error: 'Order not found', orderId });
      return;
    }
    res.json(record);
  });

  // GET /admin/customers/lookup?email=
  app.get('/admin/customers/lookup', (req: Request, res: Response) => {
    const email = String(req.query['email'] ?? '');
    if (!email) {
      res.status(400).json({ error: 'email query param required' });
      return;
    }
    const record = CUSTOMER_RECORDS.get(email.toLowerCase());
    if (!record) {
      // Return deterministic fallback based on email
      const masked = mask_email(email);
      res.json({
        customerId: `cust-${Buffer.from(email).toString('hex').slice(0, 8)}`,
        email_masked: masked,
        orderCount: 0,
        firstOrderDate: '',
      } satisfies CustomerInfo);
      return;
    }
    res.json(record);
  });

  // GET /admin/refunds/eligibility?orderId=
  app.get('/admin/refunds/eligibility', (req: Request, res: Response) => {
    const orderId = String(req.query['orderId'] ?? '');
    if (!orderId) {
      res.status(400).json({ error: 'orderId query param required' });
      return;
    }
    const record = REFUND_RECORDS.get(orderId);
    if (!record) {
      res.json({
        eligible: false,
        reason: 'Order not found in refund records',
        daysReturn: 30,
        withinWindow: false,
      } satisfies RefundEligibility);
      return;
    }
    res.json(record);
  });

  return app;
}

export const create_app = create_mock_admin_app;
