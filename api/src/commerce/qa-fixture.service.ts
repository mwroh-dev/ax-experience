import { Injectable, Inject } from '@nestjs/common';
import Database from 'better-sqlite3';
import { DB_TOKEN } from '../db/db.module';

@Injectable()
export class QaFixtureService {
  constructor(@Inject(DB_TOKEN) private readonly db: Database.Database) {}

  get(collection: string, key: string): Record<string, any> | null {
    const row = this.db.prepare(
      'SELECT data_json FROM qa_fixtures WHERE collection = ? AND key = ?'
    ).get(collection, key) as { data_json: string } | undefined;
    return row ? JSON.parse(row.data_json) : null;
  }
}
