import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { QaFixtureModule } from '../qa-fixture.module';

@Module({
  imports: [QaFixtureModule],
  controllers: [OrderController],
})
export class CommerceOrderModule {}
