import { Module, Controller, Get } from '@nestjs/common';
import { CommerceCustomerModule } from './customer/customer.module';
import { CommerceOrderModule } from './order/order.module';
import { CommerceRefundModule } from './refund/refund.module';
import { CommerceCatalogModule } from './catalog/catalog.module';
import { CommerceEngagementModule } from './engagement/engagement.module';

@Controller()
class CommerceHealthController {
  @Get('commerce/health')
  health() {
    return { ok: true, service: 'commerce-api', ts: new Date().toISOString() };
  }
}

@Module({
  imports: [
    CommerceCustomerModule,
    CommerceOrderModule,
    CommerceRefundModule,
    CommerceCatalogModule,
    CommerceEngagementModule,
  ],
  controllers: [CommerceHealthController],
})
export class CommerceModule {}
