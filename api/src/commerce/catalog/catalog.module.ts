import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { QaFixtureModule } from '../qa-fixture.module';

@Module({ imports: [QaFixtureModule], controllers: [CatalogController] })
export class CommerceCatalogModule {}
