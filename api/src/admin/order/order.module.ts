import { Module } from '@nestjs/common';
import { AdminOrderController } from './order.controller';

@Module({ controllers: [AdminOrderController] })
export class AdminOrderModule {}
