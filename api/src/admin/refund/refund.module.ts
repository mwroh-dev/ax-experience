import { Module } from '@nestjs/common';
import { AdminRefundController } from './refund.controller';

@Module({ controllers: [AdminRefundController] })
export class AdminRefundModule {}
