import { Module } from '@nestjs/common';
import { AdminCustomerController } from './customer.controller';

@Module({ controllers: [AdminCustomerController] })
export class AdminCustomerModule {}
