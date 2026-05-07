import { Module } from '@nestjs/common';
import { CustomerController } from './customer.controller';
import { QaFixtureModule } from '../qa-fixture.module';

@Module({
  imports: [QaFixtureModule],
  controllers: [CustomerController],
})
export class CommerceCustomerModule {}
