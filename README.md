# CommUniti

Monorepo for the CommUniti platform.

| App | Path | Status |
|---|---|---|
| API (Node.js, TypeScript, Fastify, Supabase) | `apps/api` | Ready. See `apps/api/README.md` |
| Member web (React) | `apps/web` | Next |
| Admin dashboard (React) | `apps/admin` | Next |
| Mobile (React Native, Expo) | `apps/mobile` | Next |

Each app deploys as its own Vercel project, with its Root Directory set to its folder.

## Development workflow

- Branch, open a PR with a Conventional Commit title (`feat(api): …`), get CI green and one approval, squash-merge.
- Merging to `main` deploys the API to production automatically after all checks pass.
- Versions and `CHANGELOG.md` are managed by Release Please.

Details: [CONTRIBUTING.md](CONTRIBUTING.md). First-time GitHub setup: `./scripts/setup-github.sh`.
