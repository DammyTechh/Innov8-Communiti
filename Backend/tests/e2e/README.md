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
| `test_member.py` | member apps: sign-up with location, role onboarding and verification, post views, Not interested, comment attachments, blocking, search tabs, trending by topic, collaboration requests, online status, chat search and delete, project/forum tabs, forum mute and post filters, featured topics and gallery, highlights, Suggested for you |
| `test_admin.py` | admin dashboard: KPI cards, moderation queue and Review Report actions, forum/project status, user details and account logs, change email, events, highlights, email broadcasts, settings, maintenance mode, logs |
