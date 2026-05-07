import { Test } from '@nestjs/testing';
import { AdminRefundController } from './refund.controller';
import { BadRequestException } from '@nestjs/common';

describe('AdminRefundController', () => {
  let ctrl: AdminRefundController;

  beforeEach(async () => {
    const m = await Test.createTestingModule({ controllers: [AdminRefundController] }).compile();
    ctrl = m.get(AdminRefundController);
  });

  it('eligible_ orderId → eligible:true RefundEligibility shape', async () => {
    const r = await ctrl.checkEligibility('eligible_12345');
    expect(r.eligible).toBe(true);
    expect(typeof r.reason).toBe('string');
    expect(typeof r.daysReturn).toBe('number');
    expect(typeof r.withinWindow).toBe('boolean');
  });

  it('ineligible_ orderId → eligible:false, withinWindow:false', async () => {
    const r = await ctrl.checkEligibility('ineligible_67890');
    expect(r.eligible).toBe(false);
    expect(r.withinWindow).toBe(false);
  });

  it('default orderId → eligible:true', async () => {
    const r = await ctrl.checkEligibility('12345');
    expect(r.eligible).toBe(true);
  });

  it('throws BadRequestException when orderId missing', async () => {
    await expect(ctrl.checkEligibility(undefined)).rejects.toThrow(BadRequestException);
  });
});
