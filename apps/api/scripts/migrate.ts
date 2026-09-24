/**
 * Applies supabase/migrations/*.sql in order, once each, inside a transaction.
 * Tracks applied files in public._migrations.
 *
 *   npm run db:migrate            (uses DIRECT_URL, falls back to DATABASE_URL)
 *
 * Alternative: `supabase db push` with the Supabase CLI applies the same file.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) throw new Error('Set DIRECT_URL (port 5432) or DATABASE_URL');

const sql = postgres(url, { max: 1, prepare: false, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : 'require', onnotice: () => {} });
const dir = new URL('../supabase/migrations/', import.meta.url).pathname;

try {
  await sql`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`;
  await sql`alter table public._migrations enable row level security`;
  const applied = new Set((await sql<{ name: string }[]>`select name from public._migrations`).map((r) => r.name));
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = readFileSync(join(dir, file), 'utf8');
    process.stdout.write(`Applying ${file} ... `);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public._migrations (name) values (${file})`;
    });
    console.log('done');
    count++;
  }
  console.log(count ? `Applied ${count} migration(s).` : 'Database is up to date.');
} finally {
  await sql.end();
}
