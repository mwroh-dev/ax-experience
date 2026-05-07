import { Module } from '@nestjs/common';
import { RefundController } from './refund.controller';
import { QaFixtureModule } from '../qa-fixture.module';

@Module({ imports: [QaFixtureModule], controllers: [RefundController] })
export class CommerceRefundModule {}
