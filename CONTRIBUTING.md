# Contributing

## Workflow

1. Branch from `main`: `feat/event-reminders`, `fix/chat-cursor`, `chore/deps`.
2. Open a pull request. Its **title** must follow [Conventional Commits](https://www.conventionalcommits.org):
   `type(scope): subject`, e.g. `feat(api): add event reminders`, `fix(db): index notifications by user`.
   Types: feat, fix, perf, refactor, docs, test, build, ci, chore, revert. Scopes: api, web, admin, mobile, db, deps, ci.
3. CI must be green. `main` only accepts squash merges that pass **CI passed** and **PR title**, with one approval.
4. Merging to `main` deploys the API to production (migrations first, then code, then a health check).

## What CI checks (`.github/workflows/api.yml`)

| Job | Checks |
|---|---|
| Typecheck, lint, build, migration drift | `tsc`, type-aware ESLint, unit tests (production CORS), compile, schema and migration in sync, critical npm audit |
| Database + end-to-end tests | Postgres 16, migration applied twice, 377 e2e checks against the compiled API with pool size 1, cron auth, OpenAPI validation, no errors in the log |
| CI passed | The single required check: all of the above succeeded |
| Deploy preview | Pull requests: Vercel preview, URL commented on the PR |
| Deploy production | `main` only, after CI passed: migrate, deploy, verify `/health` reports the commit |

## Versioning

Release Please reads the commit history on `main` and keeps a release PR open:
`fix:` bumps the patch, `feat:` the minor, `feat!:` or `BREAKING CHANGE:` the major.
Merging the release PR updates `CHANGELOG.md`, tags `api-vX.Y.Z` and creates a GitHub release.
`/api/v1/health` reports the deployed `version` and `commit`.

## Database changes

Migrations run before the new code goes live, so every change must work with the currently deployed code:
add columns as nullable (or with defaults), backfill, then remove old columns in a later release.
