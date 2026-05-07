import { Module } from '@nestjs/common';
import { DbModule } from './db/db.module';
import { AppConfigModule } from './config/config.module';
import { CasesModule } from './cases/cases.module';
import { HealthModule } from './health/health.module';
import { CommerceModule } from './commerce/commerce.module';
import { AdminModule } from './admin/admin.module';
import { MetricsModule } from './metrics/metrics.module';
import { OpsModule } from './ops/ops.module';

@Module({
  imports: [
    DbModule,
    AppConfigModule,
    CasesModule,
    HealthModule,
    CommerceModule,
    AdminModule,
    MetricsModule,
    OpsModule,
  ],
})
export class AppModule {}
