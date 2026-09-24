import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '../config/env.js';
import * as schema from './schema/index.js';

/**
 * One pooled client per serverless instance. Supabase's transaction pooler (port 6543)
 * does not support prepared statements, so `prepare: false` is required.
 */
const globalForDb = globalThis as unknown as { __pg?: postgres.Sql };

const sqlClient =
  globalForDb.__pg ??
  postgres(env.DATABASE_URL, {
    prepare: false,
    max: env.DB_POOL_MAX ?? (env.isProd ? 1 : 10),
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: /localhost|127\.0\.0\.1/.test(env.DATABASE_URL) ? false : 'require',
  });

if (!env.isProd) globalForDb.__pg = sqlClient;

export const db = drizzle(sqlClient, { schema, casing: 'snake_case' });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export type DbOrTx = DB | Tx;
export { sqlClient, schema };
