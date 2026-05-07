import { Module } from '@nestjs/common';
import { QaFixtureService } from './qa-fixture.service';

@Module({
  providers: [QaFixtureService],
  exports: [QaFixtureService],
})
export class QaFixtureModule {}
