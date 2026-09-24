import { defineConfig } from 'drizzle-kit';

// Schema lives in TypeScript; `npm run db:generate` produces the single SQL migration
// in ./supabase/migrations. Custom SQL (triggers, RLS, seed) is appended to that same file.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '' },
  strict: true,
  casing: 'snake_case',
  verbose: true,
});
