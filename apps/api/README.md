# CommUniti API

One REST API for the CommUniti member web app, admin dashboard and mobile app.

**Stack:** Node 20+ · TypeScript · Fastify 5 · Zod 4 · Drizzle ORM · Supabase Postgres, Storage and Realtime · Resend (SMTP) · Google OAuth · Vercel

- Swagger UI: `/api/docs` · OpenAPI JSON: `/api/docs/openapi.json`
- Base path: `/api/v1`
- 166 documented operations

---

## 1. Run locally

```bash
cd apps/api
npm install
cp .env.example .env         # fill in DATABASE_URL, DIRECT_URL, JWT_ACCESS_SECRET at minimum
npm run db:migrate           # applies the single migration
ADMIN_EMAIL=you@org.com ADMIN_PASSWORD='Str0ngPass1' npm run db:seed-admin
npm run dev                  # http://localhost:4000/api/docs
```

Without `SMTP_PASS`, emails are not sent. They are logged instead, including the 6-digit code, so you can test sign-up locally.

| Script | What it does |
|---|---|
| `dev` | Watch mode |
| `typecheck` / `build` | Type-check / compile |
| `lint` | Type-aware ESLint (floating promises, misused async, unused code) |
| `db:migrate` | Applies `supabase/migrations/*.sql` once each, tracked in `_migrations` |
| `db:generate` then `db:build` | Regenerate the DDL from `src/db/schema`, then rebuild the single migration file |
| `db:seed-admin` | Create or promote the first `super_admin` |
| `openapi:export` | Write `openapi.json` for client codegen or Postman |
| `mail:test` | Verify Resend SMTP and send one sample of every email template |
| `test:e2e` | End-to-end suite (359 checks) against a running API |
| `openapi:validate` | Validate `openapi.json` against the OpenAPI 3.1 spec |

## 2. The single migration

`supabase/migrations/20260924000000_init.sql` is the entire database: 46 tables, enums, keys and indexes.

It also includes:
- Trigram search indexes and `updated_at` triggers.
- Row Level Security on every table, which blocks Supabase's public REST API. All access goes through this API.
- The Realtime channel policies and the storage buckets.
- 14 seeded interest topics.

It is built from two sources by `scripts/build-migration.ts`:
- `src/db/schema/*.ts`: tables, as Drizzle TypeScript (also the query types).
- `src/db/sql/custom.sql`: triggers, RLS, Realtime policy, buckets, seed.

It is idempotent where it matters and runs on plain Postgres too (the Supabase-only parts are guarded). Apply it with `npm run db:migrate` or `supabase db push`.

Before launch, keep editing the schema and rebuilding this one file. After launch, add new timestamped files next to it.

## 3. Supabase setup

1. Create a project. Under **Project Settings → Database → Connection string**:
   - `DATABASE_URL`: the **Transaction pooler** URL (port **6543**). Required on Vercel.
   - `DIRECT_URL`: the **Session pooler** or direct URL (port **5432**), used for migrations.
2. Under **Project Settings → API**:
   - `SUPABASE_URL`, plus `SUPABASE_SERVICE_ROLE_KEY` (server only, never ship it to a client).
   - **JWT Secret** (legacy secret): set `JWT_ACCESS_SECRET` to this value. Access tokens then double as Supabase tokens, so clients can join private Realtime channels with them.
3. Run the migration. It creates the `public-media` (public) and `private-files` (private) buckets.
4. Under **Realtime → Settings**, turn off *Allow public access* so only private channels are used.

## 4. Google sign-in (the only OAuth provider)

In Google Cloud Console, go to **APIs & Services → Credentials**:

- **Web client**
  - Authorised redirect URI: `https://<api-domain>/api/v1/auth/google/callback` (and `http://localhost:4000/...` for dev).
  - Put its ID and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, and the redirect in `GOOGLE_REDIRECT_URI`.
- **iOS and Android clients** (for the Expo app): put their client IDs in `GOOGLE_MOBILE_CLIENT_IDS`, comma separated.

**Web flow (redirect + PKCE):**
1. Send the browser to `GET /api/v1/auth/google?app=web&returnTo=/projects`.
2. The API handles Google, sets the refresh cookie, and redirects to `WEB_URL/auth/callback?returnTo=…&new=0|1&onboarding=0|1`, or `?error=CODE&message=…` on failure.
3. That page calls `POST /auth/refresh` to get an access token.

The admin app uses `app=admin`; only moderators and above get in.

**Mobile flow:** get an ID token with the native Google SDK, then send it to `POST /auth/google/token { idToken }`.

## 5. Email: Resend over SMTP

Every system email goes through Resend's SMTP relay using the templates in `src/lib/mailer/templates.ts`. They share one branded layout (DM Sans, CommUniti orange, green buttons) and each has a plain-text part.

### Step A: test now, before verifying a domain (Resend onboarding)

Resend lets a new account send from `onboarding@resend.dev`, but **only to the email you signed up to Resend with**. `MAIL_REDIRECT_TO` delivers every email to that inbox, so you can test sign-up, password reset and the rest with any account email. The real recipient is shown in the subject, e.g. `[to kemi@somewhere.ng] 482913 is your CommUniti verification code`.

1. Create an API key at resend.com/api-keys.
2. Set:
   ```
   SMTP_HOST=smtp.resend.com
   SMTP_PORT=465
   SMTP_SECURE=true
   SMTP_USER=resend
   SMTP_PASS=re_your_api_key
   MAIL_FROM="CommUniti <onboarding@resend.dev>"
   MAIL_REDIRECT_TO=you@the-email-you-used-for-resend.com
   ```
3. `MAIL_TEST_TO=you@the-email-you-used-for-resend.com npm run mail:test` checks the connection and sends every template.
4. `npm run dev`, register any account in Swagger (`POST /auth/register`); the code arrives in your Resend inbox.

The API logs a warning at startup while it is in test mode.

### Step B: go live (after verifying your domain)

1. Add your domain at resend.com/domains and create the DNS records it shows (SPF, DKIM; DMARC recommended).
2. When it shows **Verified**, change `MAIL_FROM="CommUniti <no-reply@your-domain>"`, set `MAIL_REPLY_TO` if you want replies, and **clear `MAIL_REDIRECT_TO`**.
3. Update the same variables in Vercel and redeploy.

| Template | Sent when |
|---|---|
| `verifyEmail` | Sign-up, resend, login with an unverified email |
| `passwordReset` | Forgot password (code + button linking to `WEB_URL/reset-password`) |
| `passwordChanged` | Password reset or changed |
| `welcome` | Onboarding finished |
| `newSignIn` | Sign-in from a device the account has never used |
| `accountStatus` | Suspended, restricted, blocked, reinstated |
| `warning` | Moderator warning |
| `accountDeletionScheduled` | Account deletion requested (30-day grace) |
| `projectJoinRequest` | To project owners and admins |
| `projectJoinDecision` | Request accepted or declined |
| `taskAssigned` | Task assigned to you |
| `expertEvaluation` | Expert reviewed your project |
| `eventReminder` | Daily cron, a day before events you RSVP'd "going" to |
| `broadcast` | Template ready. Broadcasts are in-app only for now (see Notes) |

Users can switch off email per notification type (`PATCH /me/settings`, `notificationPrefs[type].email = false`). Security emails (codes, password changes, sign-in alerts, account status) are always sent.

## 6. CI/CD and deploying to Vercel

Deployments go through GitHub Actions, never straight from Vercel. `vercel.json` sets `git.deploymentEnabled: false`, so nothing reaches production without passing CI. The pipeline, versioning and branch rules are described in `/CONTRIBUTING.md`.

**Pull request**
- Typecheck, lint, build, migration drift check.
- Postgres plus 359 end-to-end checks.
- **CI passed** (the required check), then a preview deploy with its URL commented on the PR.

**Merge to `main`**
- The same checks.
- Migrate the production database, deploy to Vercel, then verify `/health` reports the new commit.

One-time setup:

1. In Vercel, create a project (Root Directory `apps/api`, Framework *Other*). Add every variable from `.env.example`, with `NODE_ENV=production`, to both the Production and Preview environments.
2. Locally, run `npx vercel link` in `apps/api` to get `orgId`/`projectId` (in `.vercel/project.json`). Create a token at vercel.com/account/tokens.
3. In GitHub → Settings → Secrets and variables → Actions:
   - Secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `PRODUCTION_DIRECT_URL` (Supabase session pooler, port 5432).
   - Variable: `PRODUCTION_API_URL`.
4. Run `./scripts/setup-github.sh` from the repo root (GitHub CLI). It turns on branch protection: PR required, 1 approval, **CI passed** and **PR title** checks, squash only, no force-push.

Vercel's own cron still runs daily against `/api/v1/internal/cron/cleanup` with `CRON_SECRET`.

**Cookies across domains.** The refresh token is an httpOnly cookie scoped to `/api/v1/auth`.
- **Same site** (recommended), e.g. `app.communiti.app` + `api.communiti.app`: `COOKIE_SAMESITE=lax`, `COOKIE_DOMAIN=.communiti.app`.
- **Different sites** (e.g. `*.vercel.app` previews): `COOKIE_SAMESITE=none` (forces `Secure`), and leave `COOKIE_DOMAIN` empty.

Also add preview frontend origins to `CORS_ORIGINS`.

## 7. Frontend integration

**Every request**
- Send `X-Client: web | admin | ios | android`.
- Send `Authorization: Bearer <accessToken>` (tokens last 15 min).

**Web / admin**
- Use `fetch(url, { credentials: 'include' })` for auth calls.
- Keep the access token in memory only.
- On app load, and on any `401 TOKEN_EXPIRED`, call `POST /auth/refresh` with no body (the cookie is sent). Retry the request once.
- Build an `/auth/callback` page for Google.

**Mobile (Expo)**
- Login responses include `refreshToken`. Store it in SecureStore.
- Send `{ refreshToken }` to `/auth/refresh` and store the new one it returns.
- If `refreshToken` comes back as `null`, keep the old one (a parallel refresh already rotated it).

**Sign-up flow**
1. `POST /auth/register`
2. `POST /auth/verify-email` (returns tokens)
3. If `user.onboardingComplete` is false: `GET /topics`, then `PATCH /me/onboarding`

Content-creating routes return `403 ONBOARDING_REQUIRED` until onboarding is done.

**Forgot password flow**
1. `POST /auth/password/forgot`
2. `POST /auth/password/verify-code` (returns `resetToken`)
3. `POST /auth/password/reset`

**Uploads**
1. `POST /uploads/presign`
2. `PUT` the file bytes to `uploadUrl`
3. `POST /uploads/{id}/complete`
4. Pass the `mediaId` to posts, messages or workspace items (or use `publicUrl` for an avatar or cover).

**Realtime (Supabase)**
```ts
supabase.realtime.setAuth(accessToken);
supabase
  .channel(`conversation:${id}`, { config: { private: true } })
  .on('broadcast', { event: 'message:new' }, ({ payload }) => { /* append */ })
  .subscribe();
```
Channels and events:
- `user:<myId>`: `notification:new`, `account:status`
- `conversation:<id>`: `message:new`, `message:updated`, `message:deleted`, `read`
- `project:<id>`: `ledger:new`

Clients may broadcast `typing` on conversation channels.

**Errors.** Every error is `{ error: { code, message, fields?, requestId } }`. Show `message`, branch on `code`, and map `fields` to form inputs.

**Pagination.**
- Lists: `?cursor=&limit=`, returning `{ data, nextCursor }`.
- Admin tables: `?page=&pageSize=`, returning `{ data, page, pageSize, total }`.

## 8. Project structure

```
apps/api
├── api/index.ts               Vercel entry (reuses one Fastify instance per warm function)
├── src/
│   ├── app.ts                 Fastify setup: CORS, cookies, helmet, rate limit, Swagger, auth, routes
│   ├── server.ts              Local server
│   ├── config/env.ts          Zod-validated environment (fails fast on boot)
│   ├── db/
│   │   ├── schema/*.ts        Tables by domain: users, content, forums, projects, chat, explore, ...
│   │   ├── sql/custom.sql     Triggers, RLS, Realtime policy, buckets, seed
│   │   └── client.ts          postgres-js + Drizzle (pooler-safe)
│   ├── lib/                   errors, jwt, password (argon2id), crypto, mailer/, storage, realtime,
│   │                          google, pagination, audit, logger, zod (patchOf)
│   ├── plugins/               auth (authenticate, requireMember, requireRole), error handler, swagger
│   └── modules/<domain>/      *.routes.ts (HTTP + schemas) · *.service.ts (logic) · *.schemas.ts
├── scripts/                   migrate, build-migration, seed-admin, export-openapi, test-mail
└── supabase/migrations/       THE single migration
```

**Conventions**
- Routes validate with Zod. The same schemas generate the Swagger docs and strip unlisted fields from responses (no accidental leaks).
- IDs are UUID v7, which are time-ordered and double as pagination cursors.
- Counters (likes, members, followers) are updated in the same transaction as the change.
- Content is soft-deleted (`deletedAt` by the author, `removedAt` by moderation).
- PATCH bodies use `patchOf()`, so omitted fields are never reset to defaults.
- Every privileged action is written to `audit_logs`.
- Raw SQL fragments passed to `and()`/`or()` must be parenthesised (Drizzle does not wrap them).
- Never use the global `db` inside `db.transaction(...)`; use `tx`. In production the pool is 1 connection, so it would deadlock.
- LIKE searches go through `contains()` from `lib/like.ts`, so `%` and `_` in user input are escaped.

Tests: see `tests/e2e/README.md` (359 end-to-end checks, run by CI on every push).

## 9. Security summary

**Passwords and login**
- Argon2id password hashing.
- Constant-time responses for unknown emails, and no account enumeration on forgot-password or resend.
- Login lockout: 5 failures locks the account for 15 minutes.

**Codes**
- 6-digit codes: 10-minute expiry, 60-second resend cooldown, 5 per hour, 5 attempts per code.

**Tokens and sessions**
- Refresh tokens are opaque, stored hashed, and rotated on every use. Replaying an old token after a 30-second grace window revokes the session.
- Each request re-checks the session and account status, so logout, suspension and blocking take effect immediately.
- Password reset tokens are single-use: they are bound to the password's last-changed timestamp.

**Transport and data**
- Google OAuth uses PKCE plus a signed state cookie.
- RLS is on for every table.
- The service role key is used only on the server.
- Rate limits: global and stricter per auth route.

## 10. Notes and next steps

- **Rate limiting** is in-memory per serverless instance. For one shared limit across instances, add an Upstash Redis store to `@fastify/rate-limit`. Auth-critical limits (OTP, lockout) already live in Postgres.
- **Email volume.** Emails are sent inline and awaited. That is right for transactional mail, but a broadcast to thousands of users by email needs a queue (for example Vercel Queues or Upstash QStash) and Resend's batch API. The `broadcast` template is ready for that.
- **Feed ranking** is chronological over a relevant set (people you follow, your forums, your interests, public posts). An engagement score can be added later.
- **Local testing without Supabase:** Storage and Realtime calls are skipped or logged when `SUPABASE_URL` is not set, so everything except uploads works against plain Postgres.
