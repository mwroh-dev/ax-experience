import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { QaFixtureService } from '../qa-fixture.service';

const mockQa = { get: jest.fn().mockReturnValue(null) };

describe('Commerce / CustomerController', () => {
  let ctrl: CustomerController;

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [CustomerController],
      providers: [{ provide: QaFixtureService, useValue: mockQa }],
    }).compile();
    ctrl = m.get(CustomerController);
    jest.clearAllMocks();
  });

  it('eligible_ email returns found customer', async () => {
    const r = await ctrl.lookup('eligible_user@test.com');
    expect(r.found).toBe(true);
    expect(r).toHaveProperty('customer_id');
  });

  it('notfound_ email returns found=false', async () => {
    const r = await ctrl.lookup('notfound_user@test.com');
    expect(r.found).toBe(false);
  });

  it('missing email throws BadRequestException', async () => {
    await expect(ctrl.lookup(undefined)).rejects.toThrow(BadRequestException);
  });

  it('DB record takes precedence over fixture', async () => {
    mockQa.get.mockReturnValueOnce({ customer_id: 'db_cust', tier: 'vip' });
    const r = await ctrl.lookup('eligible_x@test.com');
    expect((r as any).customer_id).toBe('db_cust');
  });
});
