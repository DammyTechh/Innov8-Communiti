## What

<!-- One or two sentences. The PR title must follow Conventional Commits, e.g. "feat(api): add event reminders". -->

## Why

## How to test

- [ ] `npm run typecheck && npm run lint` pass in `apps/api`
- [ ] `npm run test:e2e` passes locally (or CI is green)
- [ ] Schema changed? Ran `npm run db:generate && npm run db:build` and committed the migration
- [ ] New endpoint? It has a Swagger `summary`, request and response schemas, and an e2e check
- [ ] New env var? Added to `.env.example`, `src/config/env.ts`, the README and Vercel
