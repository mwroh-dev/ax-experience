import { Module, Global } from '@nestjs/common';
import { get_db } from './sqlite';

export const DB_TOKEN = 'DB';

@Global()
@Module({
  providers: [{ provide: DB_TOKEN, useValue: get_db() }],
  exports: [DB_TOKEN],
})
export class DbModule {}
