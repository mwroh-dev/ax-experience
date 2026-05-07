import { Module } from '@nestjs/common';
import { AdminCustomerModule } from './customer/customer.module';
import { AdminOrderModule } from './order/order.module';
import { AdminRefundModule } from './refund/refund.module';

@Module({
  imports: [AdminCustomerModule, AdminOrderModule, AdminRefundModule],
})
export class AdminModule {}
