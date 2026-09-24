# End-to-end tests

Black-box tests against a running API and a fresh database. CI runs them on every push and pull request.

Locally (SMTP_PASS must be empty so verification codes are written to the log):

```bash
npm run db:migrate
ADMIN_EMAIL=admin@communiti.app ADMIN_PASSWORD='Admin12345' npm run db:seed-admin
DB_POOL_MAX=1 npm run dev > /tmp/api.log 2>&1 &
API_LOG=/tmp/api.log npm run test:e2e
```

Environment: `API_URL` (default `http://localhost:4000`), `API_LOG` (server log file), `DATABASE_URL`.
`DB_POOL_MAX=1` matches production and catches transaction deadlocks.

| File | Covers |
|---|---|
| `test_auth.py` | sign-up, verification, login, sessions, refresh rotation, forgot/reset/change password, lockout |
| `test_cors.py` | allowed and blocked origins (including look-alike domains), refresh cookie attributes |
| `test_modules.py` | onboarding, follows, feed, posts, comments, forums, search, projects, workspace, chat, notifications, explore, reports, admin |
| `test_extended.py` | permissions, media attachments, edits/deletes, ownership, moderation, account deletion, regression checks |
