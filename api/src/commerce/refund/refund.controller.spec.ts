import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RefundController } from './refund.controller';
import { QaFixtureService } from '../qa-fixture.service';

const mockQa = { get: jest.fn().mockReturnValue(null) };

describe('Commerce / RefundController', () => {
  let ctrl: RefundController;

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [RefundController],
      providers: [{ provide: QaFixtureService, useValue: mockQa }],
    }).compile();
    ctrl = m.get(RefundController);
    jest.clearAllMocks();
  });

  it('ORD-QA-REFUNDABLE returns eligible=true', () => {
    const r = ctrl.checkEligibility('ORD-QA-REFUNDABLE', undefined);
    expect((r as any).eligible).toBe(true);
  });

  it('ORD-QA-DIGITAL returns eligible=false with reason_code', () => {
    const r = ctrl.checkEligibility('ORD-QA-DIGITAL', undefined);
    expect((r as any).eligible).toBe(false);
    expect((r as any).reason_codes).toContain('DIGITAL_CONTENT_DOWNLOADED');
  });

  it('missing both orderId and email throws BadRequestException', () => {
    expect(() => ctrl.checkEligibility(undefined, undefined)).toThrow(BadRequestException);
  });

  it('dry-run without order_id or customer_id throws BadRequestException', () => {
    expect(() => ctrl.dryRunRefund({})).toThrow(BadRequestException);
  });
});
