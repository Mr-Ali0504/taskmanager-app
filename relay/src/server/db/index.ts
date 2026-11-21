import path from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { env } from '../env';
import * as schema from './schema';

const sqlite = new Database(path.join(env.dataDir, 'relay.db'));
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { schema };

/** Applies any SQL migrations in ./drizzle that this database has not seen yet. */
export function runMigrations() {
  migrate(db, { migrationsFolder: path.resolve(process.env.MIGRATIONS_DIR ?? './drizzle') });
}
