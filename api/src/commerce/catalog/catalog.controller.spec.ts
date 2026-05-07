import { Test } from '@nestjs/testing';
import { CatalogController } from './catalog.controller';
import { QaFixtureService } from '../qa-fixture.service';

const mockQa = { get: jest.fn().mockReturnValue(null) };

describe('Commerce / CatalogController', () => {
  let ctrl: CatalogController;

  beforeEach(async () => {
    const m = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [{ provide: QaFixtureService, useValue: mockQa }],
    }).compile();
    ctrl = m.get(CatalogController);
    jest.clearAllMocks();
  });

  it('QA-VALID-10 coupon returns valid=true', () => {
    const r = ctrl.validateCoupon('QA-VALID-10');
    expect((r as any).valid).toBe(true);
  });

  it('QA-EXPIRED coupon returns valid=false with reason_code', () => {
    const r = ctrl.validateCoupon('QA-EXPIRED');
    expect((r as any).valid).toBe(false);
    expect((r as any).reason_code).toBe('COUPON_EXPIRED');
  });

  it('PROD-QA-OOS returns in_stock=false', () => {
    const r = ctrl.getProduct('PROD-QA-OOS');
    expect(r.found).toBe(true);
    expect((r as any).in_stock).toBe(false);
  });

  it('unknown product returns found=false', () => {
    const r = ctrl.getProduct('PROD-DOES-NOT-EXIST');
    expect(r.found).toBe(false);
  });
});
