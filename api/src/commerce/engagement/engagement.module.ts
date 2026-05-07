import { Module } from '@nestjs/common';
import { EngagementController } from './engagement.controller';
import { QaFixtureModule } from '../qa-fixture.module';

@Module({ imports: [QaFixtureModule], controllers: [EngagementController] })
export class CommerceEngagementModule {}
