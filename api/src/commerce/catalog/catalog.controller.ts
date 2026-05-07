import { Controller, Get, Param } from '@nestjs/common';
import { QaFixtureService } from '../qa-fixture.service';
import { COUPONS, PRODUCTS } from '../fixtures';

@Controller()
export class CatalogController {
  constructor(private readonly qa: QaFixtureService) {}

  @Get('commerce/coupons/:code/validation')
  validateCoupon(@Param('code') code: string) {
    const db_rec = this.qa.get('coupons', code.toUpperCase());
    if (db_rec) return { found: true, ...db_rec };
    const fixture = (COUPONS as any)[code.toUpperCase()] ?? (COUPONS as any)[code];
    if (fixture) return { found: true, ...fixture };
    return { found: false, code, valid: false, reason_code: 'INVALID_CODE', message: '존재하지 않는 쿠폰 코드입니다' };
  }

  @Get('commerce/products/:productId')
  getProduct(@Param('productId') productId: string) {
    const db_rec = this.qa.get('products', productId);
    if (db_rec) return { found: true, ...db_rec };
    const fixture = (PRODUCTS as any)[productId];
    if (fixture) return { found: true, ...fixture };
    return { found: false, product_id: productId, error: '상품을 찾을 수 없습니다' };
  }
}
