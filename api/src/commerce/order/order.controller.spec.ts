import { Test } from '@nestjs/testing';
import { OrderController } from './order.controller';
import { QaFixtureService } from '../qa-fixture.service';

const mockQa = { get: jest.fn().mockReturnValue(null) };

describe('Commerce / OrderController', () => {
  let ctrl: OrderController;

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [{ provide: QaFixtureService, useValue: mockQa }],
    }).compile();
    ctrl = m.get(OrderController);
    jest.clearAllMocks();
  });

  it('ORD-QA-REFUNDABLE returns order data', () => {
    const r = ctrl.getOrder('ORD-QA-REFUNDABLE');
    expect(r.found).toBe(true);
    expect((r as any).order_id).toBe('ORD-QA-REFUNDABLE');
  });

  it('ORD-QA-DELAYED shipment returns delayed status', () => {
    const r = ctrl.getShipment('ORD-QA-DELAYED');
    expect(r.found).toBe(true);
    expect((r as any).status).toBe('delayed');
  });

  it('ORD-QA-CONFLICT payment returns not_found status', () => {
    const r = ctrl.getPayment('ORD-QA-CONFLICT');
    expect(r.found).toBe(true);
    expect((r as any).status).toBe('not_found');
  });

  it('unknown order ID falls back to scenario matching', () => {
    const r = ctrl.getOrder('ORD-UNKNOWN-DELIVERED-001');
    expect(r.found).toBe(true);
  });
});
