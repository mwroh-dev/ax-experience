import { Test } from '@nestjs/testing';
import { AdminCustomerController } from './customer.controller';
import { BadRequestException } from '@nestjs/common';

describe('AdminCustomerController', () => {
  let ctrl: AdminCustomerController;

  beforeEach(async () => {
    const m = await Test.createTestingModule({ controllers: [AdminCustomerController] }).compile();
    ctrl = m.get(AdminCustomerController);
  });

  it('returns CustomerInfo-compatible shape', async () => {
    const r = await ctrl.lookup('user@example.com');
    expect(typeof r!.customerId).toBe('string');
    expect(typeof r!.email_masked).toBe('string');
    expect(typeof r!.orderCount).toBe('number');
    expect(typeof r!.firstOrderDate).toBe('string');
  });

  it('notfound_ prefix → returns null', async () => {
    const r = await ctrl.lookup('notfound_user@example.com');
    expect(r).toBeNull();
  });

  it('throws BadRequestException when email missing', async () => {
    await expect(ctrl.lookup(undefined)).rejects.toThrow(BadRequestException);
  });

  it('email_masked masks correctly', async () => {
    const r = await ctrl.lookup('testuser@example.com');
    expect(r!.email_masked).toMatch(/\*\*\*/);
  });
});
