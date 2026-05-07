import { Test } from '@nestjs/testing';
import { DbModule, DB_TOKEN } from './db.module';
import Database from 'better-sqlite3';

describe('DbModule', () => {
  it('provides a Database instance', async () => {
    const module = await Test.createTestingModule({
      imports: [DbModule],
    }).compile();
    const db = module.get<Database.Database>(DB_TOKEN);
    expect(db).toBeDefined();
    expect(typeof db.prepare).toBe('function');
  });

  it('provides a singleton Database instance', async () => {
    const module = await Test.createTestingModule({
      imports: [DbModule],
    }).compile();
    const db1 = module.get<Database.Database>(DB_TOKEN);
    const db2 = module.get<Database.Database>(DB_TOKEN);
    expect(db1).toBe(db2);
  });
});
