# Release notes — 2026-10-30

## Deploy steps

1. Run the migration once: `DIRECT_URL='postgresql://…:5432/postgres' npm run db:migrate` (applies `supabase/migrations/20261030000000_auto_verification.sql`; idempotent, safe to re-run). Or paste that file into the Supabase SQL editor.
2. Optional new environment variables (all have safe defaults): `VERIFICATION_NETWORK_CHECKS=true`, `ORCID_API_URL=https://pub.orcid.org/v3.0`, `ADMIN_NEW_MEMBER_EMAILS=false`.
3. Deploy (`npx vercel deploy --prod`) and check `GET /api/v1/health`.

## Onboarding: automatic verification (no admin gate)

- `PUT /me/role` verifies the role form on submit. Pass → `verified` immediately (badge, `decidedBy: "auto"`, trust score). Fail → `422 VERIFICATION_FAILED` with one message per field (`details.<field>`), nothing saved.
- Checks: placeholder/gibberish text, levels, ORCID checksum + issued range + public ORCID record + name match, disposable and consumer email domains in institutional/work/student fields, email domain exists and receives mail, links are public and open (not 404, "not found" or parked), LinkedIn profile URL shape, and one ORCID iD / role email per account.
- Outbound lookups are SSRF-safe (private, loopback, link-local and cloud-metadata addresses refused at connect time, including after redirects), time-limited and size-capped. A lookup that can't complete never rejects anyone.
- Admins and super admins get a `new_member` notification (in-app, realtime; email with `ADMIN_NEW_MEMBER_EMAILS=true`) for every member who finishes onboarding or changes role, with the role, result, trust score and warning flags.
- Admin verifications: default list is now `status=all`; new filters `decidedBy` and `maxTrust`; detail returns every automatic check; approve/reject now override any decision (revoke a verified member, approve a refused one); new `POST /admin/verifications/{userId}/recheck`.
- Forms left `pending` from the old manual flow are re-checked by the daily cron.
- Sign-up and profile names are validated (`John123`, `asdf ghjk`, `Test User` → 400).

## Fixes

- **Stored XSS:** every link field (`avatarUrl`, `coverUrl`, project `videoUrl`, event `meetingUrl` / `registrationUrl` / `organizerLogoUrl`, workspace covers, role-form links) accepted `javascript:` and `data:` URLs. Only `http(s)` is accepted now.
- Restricted members could still edit existing posts, comments and messages; those edits now need the same permission as posting.
- Onboarding completion is atomic, so concurrent requests can't send the welcome email (or the admin notification) twice.
- Security updates: `zod` 4.6.7 (memory exhaustion advisory), `nodemailer` 10.3.1 (address parser advisories). `npm audit` for production dependencies: 0 vulnerabilities.
- Added the missing `.env.production.example` (it was referenced by the README but ignored by `.gitignore`), and corrected `apps/api` paths in the README.

## Documentation

- `docs/FRONTEND_INTEGRATION.md` — start here: headers, a drop-in API client with token refresh, error codes and what to do with each, pagination, uploads, realtime, onboarding with automatic verification, admin verification screens, pre-release checklist.
- `docs/API_REFERENCE.md` — all 210 endpoints with access level, parameters, request fields (required, limits, defaults), response fields and errors to handle. Regenerate with `npm run docs:reference`.
- `docs/USER_API.md`, `docs/ADMIN_API.md`, `README.md` updated.

## Tests

- Unit: 97 (`npm test`), including the verification engine against all 10,249 listed university names (no false refusals).
- End-to-end: 839 checks pass (`npm run test:e2e`), up from 802.
