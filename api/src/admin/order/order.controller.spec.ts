import { Test } from '@nestjs/testing';
import { AdminOrderController } from './order.controller';

describe('AdminOrderController', () => {
  let ctrl: AdminOrderController;

  beforeEach(async () => {
    const m = await Test.createTestingModule({ controllers: [AdminOrderController] }).compile();
    ctrl = m.get(AdminOrderController);
  });

  it('transit_ prefix → in_transit with carrier', () => {
    const r = ctrl.getOrderStatus('transit_001');
    expect(r.orderId).toBe('transit_001');
    expect(r.status).toBe('in_transit');
    expect(r.carrier).toBeDefined();
    expect(r.trackingNumber).toBeDefined();
  });

  it('delivered_ prefix → delivered', () => {
    const r = ctrl.getOrderStatus('delivered_001');
    expect(r.orderId).toBe('delivered_001');
    expect(r.status).toBe('delivered');
  });

  it('12345 → delivered (legacy compat)', () => {
    const r = ctrl.getOrderStatus('12345');
    expect(r.status).toBe('delivered');
  });

  it('67890 → in_transit (legacy compat)', () => {
    const r = ctrl.getOrderStatus('67890');
    expect(r.status).toBe('in_transit');
  });

  it('unknown orderId → in_transit default', () => {
    const r = ctrl.getOrderStatus('unknown-999');
    expect(r.orderId).toBe('unknown-999');
    expect(r.status).toBe('in_transit');
  });

  it('cancelled_ prefix → cancelled', () => {
    const r = ctrl.getOrderStatus('cancelled_001');
    expect(r.orderId).toBe('cancelled_001');
    expect(r.status).toBe('cancelled');
  });

  it('returned_ prefix → returned', () => {
    const r = ctrl.getOrderStatus('returned_001');
    expect(r.orderId).toBe('returned_001');
    expect(r.status).toBe('returned');
  });

  it('notshipped_ prefix → not_shipped with estimatedDelivery', () => {
    const r = ctrl.getOrderStatus('notshipped_001');
    expect(r.orderId).toBe('notshipped_001');
    expect(r.status).toBe('not_shipped');
    expect(r.estimatedDelivery).toBeDefined();
  });
});
