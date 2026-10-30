# CommUniti API — frontend integration guide

For the member web app, the mobile app (Expo) and the admin dashboard. Read this once, keep **[API_REFERENCE.md](API_REFERENCE.md)** open for the exact fields of every endpoint, and use Swagger at `/api/docs` to try calls.

| | |
|---|---|
| Production base URL | `https://api.mycommuniti.org/api/v1` |
| Local base URL | `http://localhost:4000/api/v1` |
| Swagger UI / OpenAPI JSON | `/api/docs` · `/api/docs/openapi.json` (generate typed clients from it) |
| Screen → endpoint maps | [USER_API.md](USER_API.md) (member apps) · [ADMIN_API.md](ADMIN_API.md) (admin dashboard) |

---

## 1. The five rules that prevent almost every integration bug

1. **Send `X-Client` on every request:** `web`, `admin`, `ios` or `android`. It decides whether the refresh token comes back in a cookie (web/admin) or in the JSON body (mobile).
2. **Web/admin: every call uses `credentials: 'include'`** (axios: `withCredentials: true`). Without it the refresh cookie is never stored or sent, and users are logged out after 15 minutes.
3. **Keep the access token in memory only** (not localStorage). On app start, and whenever a call fails with `401 TOKEN_EXPIRED`, call `POST /auth/refresh` once, then retry the original request once. Only one refresh may be in flight at a time (see the client in §3).
4. **Branch on `error.code`, never on the message text or only the status.** Show `error.message` to the user and put `error.fields[<path>]` under the matching input.
5. **After every sign-in, call `GET /me/onboarding` and route on `nextStep`.** Content routes answer `403 ONBOARDING_REQUIRED` until onboarding is done.

---

## 2. Requests and responses

**Headers**

| Header | When | Value |
|---|---|---|
| `X-Client` | always | `web` \| `admin` \| `ios` \| `android` |
| `Authorization` | every authenticated call | `Bearer <accessToken>` |
| `Content-Type` | requests with a body | `application/json` |
| `X-Request-Id` | optional | your own id; echoed back in the response header and in errors |

- JSON bodies are capped at 1 MB. Files never go through the API (see §8).
- Unknown body fields are ignored. Responses contain only the documented fields.
- Dates are ISO-8601 strings in UTC (`2026-10-30T08:32:00.000Z`). IDs are UUID v7 strings.
- `PATCH` bodies are partial: send only what changed. A field set to `null` is cleared; an omitted field is left alone.

**Error shape (every non-2xx response)**

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Enter a valid email address", "fields": { "email": "Enter a valid email address" }, "requestId": "01a18b…" } }
```

`fields` keys are dot paths into your request body (`email`, `details.orcidId`, `topicIds.0`). Log `requestId`; it finds the request in the server logs.

**Error codes and what the UI should do**

| Status | `code` | Meaning → what to do |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Bad or missing input. Show `fields` under the inputs, `message` as a toast if there is no matching input. |
| 400 | `BAD_REQUEST` | Request not valid in the current state. Show `message`. |
| 400 | `OTP_INVALID` / `OTP_EXPIRED` / `OTP_TOO_MANY_ATTEMPTS` | 6-digit code wrong / expired / 5 wrong tries. Offer "Resend code". |
| 401 | `UNAUTHENTICATED` | No token. Go to sign-in. |
| 401 | `TOKEN_EXPIRED` | Access token expired. Refresh once and retry (automatic in the client below). |
| 401 | `TOKEN_INVALID` | Session ended (logout elsewhere, password change, revoked). Clear state, go to sign-in. |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password. |
| 400 | `PASSWORD_NOT_SET` | Google-only account tried a password login: offer "Continue with Google" or "Forgot password". |
| 403 | `EMAIL_NOT_VERIFIED` | Login before the email code. A new code was sent: open the code screen. |
| 403 | `ACCOUNT_LOCKED` | 5 failed logins: locked for 15 minutes (the message says how long). Offer "Reset password". |
| 403 | `ONBOARDING_REQUIRED` | Send the user to the screen `GET /me/onboarding` names. |
| 403 | `ACCOUNT_SUSPENDED` / `ACCOUNT_BLOCKED` / `ACCOUNT_DELETED` | Sign out and show the account status screen. |
| 403 | `FORBIDDEN` | Not allowed (not the owner, role too low, account restricted from posting). Show `message`. |
| 404 | `NOT_FOUND` | Show an empty / "not found" state. |
| 409 | `CONFLICT`, `EMAIL_TAKEN`, `USERNAME_TAKEN`, `ALREADY_MEMBER`, `REQUEST_PENDING` | Already exists / already done. Show `message`, refresh the view. |
| 422 | `VERIFICATION_FAILED` | **Onboarding role form failed automatic verification** (see §6). Show `fields["details.<field>"]` under each input. Nothing was saved. |
| 413 / 415 | `FILE_TOO_LARGE` / `UNSUPPORTED_MEDIA` | `POST /uploads/presign` refused the file (too big / type not allowed for that purpose). |
| 429 | `RATE_LIMITED` | Too many requests. Wait `Retry-After` seconds. |
| 503 | `MAINTENANCE` | Maintenance window: show the maintenance screen, retry after `Retry-After`. |
| 503 | `SERVICE_UNAVAILABLE` | A dependency is down (e.g. storage). Retry later. |
| 500 | `INTERNAL` | Bug. Show a generic error and report `requestId`. |

**Pagination**

- Feeds and lists: `?limit=20&cursor=<nextCursor>` → `{ data: [...], nextCursor: string | null }`. Stop when `nextCursor` is `null`. Never build cursors yourself.
- Admin tables: `?page=1&pageSize=20` → `{ data, page, pageSize, total }`.

**Rate limits:** 300 requests/minute per IP overall; auth routes 10/minute (login, register, codes); `PUT /me/role` 30/hour; `POST /auth/refresh` 60/minute.

---

## 3. A drop-in API client (TypeScript, fetch)

Works in the browser and in React Native. It attaches the token, refreshes once on `TOKEN_EXPIRED` (one refresh shared by every concurrent request), retries, and turns errors into a typed `ApiError`.

```ts
// api.ts
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api/v1';
const CLIENT: 'web' | 'admin' | 'ios' | 'android' = 'web';
const isMobile = CLIENT === 'ios' || CLIENT === 'android';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields: Record<string, string> = {}, public requestId?: string) {
    super(message);
  }
}

let accessToken: string | null = null;
export const setAccessToken = (t: string | null) => { accessToken = t; };

// Mobile only: keep the refresh token in SecureStore (expo-secure-store).
const tokenStore = {
  get: async (): Promise<string | null> => null, // SecureStore.getItemAsync('refreshToken')
  set: async (_t: string) => {},                  // SecureStore.setItemAsync('refreshToken', t)
  clear: async () => {},                          // SecureStore.deleteItemAsync('refreshToken')
};

let refreshing: Promise<boolean> | null = null;

/** Gets a new access token. Shared by concurrent callers; resolves false when the session is gone. */
export function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const body = isMobile ? JSON.stringify({ refreshToken: await tokenStore.get() }) : undefined;
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'X-Client': CLIENT, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body,
      });
      if (!res.ok) { setAccessToken(null); if (isMobile) await tokenStore.clear(); return false; }
      const data = await res.json();
      setAccessToken(data.accessToken);
      // `null` means a parallel refresh already rotated it: keep the one you have.
      if (isMobile && data.refreshToken) await tokenStore.set(data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

type Options = Omit<RequestInit, 'body'> & { body?: unknown; auth?: boolean; timeoutMs?: number };

export async function api<T = unknown>(path: string, opts: Options = {}, retried = false): Promise<T> {
  const { body, auth = true, timeoutMs = 30_000, headers, ...rest } = opts;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: 'include',
    signal: rest.signal ?? AbortSignal.timeout(timeoutMs),
    headers: {
      'X-Client': CLIENT,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (res.ok) return data as T;

  const e = data?.error ?? {};
  if (res.status === 401 && e.code === 'TOKEN_EXPIRED' && !retried && (await refresh())) return api<T>(path, opts, true);
  if (res.status === 401 && (e.code === 'TOKEN_INVALID' || e.code === 'TOKEN_EXPIRED')) onSignedOut();
  throw new ApiError(res.status, e.code ?? 'INTERNAL', e.message ?? 'Something went wrong', e.fields ?? {}, e.requestId);
}

function onSignedOut() {
  setAccessToken(null);
  // navigate('/login')
}

/** Call on app start: restores the session from the cookie (web) or SecureStore (mobile). */
export async function bootstrap() {
  if (!(await refresh())) return null;
  return api<Me>('/me');
}

// Sign-in responses: store the token pair.
export async function signIn(email: string, password: string) {
  const r = await api<TokenResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false });
  setAccessToken(r.accessToken);
  if (isMobile && r.refreshToken) await tokenStore.set(r.refreshToken);
  return r;
}

type Me = Record<string, unknown>;
type TokenResponse = { accessToken: string; accessTokenExpiresIn: number; refreshToken: string | null; user: Me; isNewUser?: boolean };
```

**Showing field errors (React Hook Form example)**

```ts
try {
  await api('/me/role', { method: 'PUT', body: { memberRole: 'researcher', details } });
} catch (err) {
  if (err instanceof ApiError && (err.code === 'VALIDATION_FAILED' || err.code === 'VERIFICATION_FAILED')) {
    for (const [path, msg] of Object.entries(err.fields)) setError(path.replace(/^details\./, '') as never, { message: msg });
    if (!Object.keys(err.fields).length) toast.error(err.message);
  } else throw err;
}
```

---

## 4. Sign up, sign in, sessions

**Create an account (email)**

1. `POST /auth/register { fullName, email, password, confirmPassword?, location?, acceptTerms: true }` → `201 { email, verificationRequired: true, codeExpiresIn, resendAvailableIn }`. A 6-digit code is emailed.
   - `fullName` must be a real name: letters (any alphabet), spaces, hyphens, apostrophes, dots. `John123`, `asdf ghjk`, `Test User` → `400` with `fields.fullName`.
   - Passwords: 8–128 characters with at least one letter and one number. `confirmPassword`, when sent, must match.
   - An email that already has a verified account → `409 EMAIL_TAKEN` ("Sign in instead"). Registering again with an unverified email just sends a new code.
2. `POST /auth/verify-email { email, code }` → **signed in** (`TokenResponse`). Resend: `POST /auth/verify-email/resend { email }` (60 s cooldown, 5 per hour).
3. `GET /me/onboarding` → route on `nextStep` (§6).

**Sign in:** `POST /auth/login { email, password }` → `TokenResponse`. `403 EMAIL_NOT_VERIFIED` means a fresh code was sent: show the code screen. Admin dashboard: `POST /auth/admin/login` (moderator and above only).

**Google**
- Web: navigate (full page) to `GET /auth/google?app=web&returnTo=/feed`. The API redirects back to `WEB_URL/auth/callback?returnTo=…&new=0|1&onboarding=0|1`, or `?error=CODE&message=…`. On that page call `POST /auth/refresh` (the cookie is set), then `GET /me/onboarding`. Admin app: `app=admin`.
- Mobile: get an ID token with the native Google SDK and send `POST /auth/google/token { idToken }`.

**Forgot password:** `POST /auth/password/forgot { email }` → `POST /auth/password/verify-code { email, code }` → `{ resetToken }` → `POST /auth/password/reset { resetToken, newPassword }`. All sessions are signed out.

**Change password (signed in):** `POST /auth/password/change { currentPassword?, newPassword }` (Google-only accounts set a first password without `currentPassword`).

**Change email:** `POST /me/email { newEmail, password }` → code to the new address → `POST /me/email/verify { newEmail, code }`.

**Sessions:** `GET /auth/sessions` (devices), `DELETE /auth/sessions/{id}`, `POST /auth/logout` (this device), `POST /auth/logout-all`.

**Token facts**
- Access token: JWT, 15 minutes. Refresh token: opaque, 30 days, **rotated on every refresh**. Reusing an old one after a 30-second grace window revokes the whole session (theft protection), so never refresh from two places with the same token — the single-flight client above handles this.
- Each request re-checks the session: logout, suspension and blocking take effect immediately.

---

## 5. Me, profile and settings

- `GET /me` — the signed-in user with profile, counts, interests and `verification` (their role form and its status).
- `PATCH /me` — edit profile (`fullName`, `username`, `headline`, `bio`, `avatarUrl`, `coverUrl`, `location`, `phone`, `openToCollaborate`, …). Changing `memberRole` here sets `verificationStatus: unverified`; use `PUT /me/role` to change role **with** verification.
- `GET /me/settings`, `PATCH /me/settings` — theme, privacy, message permission, online status, `notificationPrefs[type] = { inApp, push, email }`.
- `GET /me/username-available?username=` → `{ available }` before saving a username.
- All link fields (`avatarUrl`, `coverUrl`, event/project links, role-form links) accept only `http://` or `https://` URLs.

---

## 6. Onboarding with automatic verification

```
register → verify-email (signed in) → GET /me/onboarding
   nextStep = select_role → Select Role → role form → PUT /me/role ──► 200 verified (badge)  ──► nextStep = interests
                                                                  └─► 422 VERIFICATION_FAILED: fix the fields, submit again
   nextStep = interests   → "One more thing!" → GET /topics → PUT /me/interests ──► onboarding complete (welcome email)
   nextStep = done        → Home
```

`GET /me/onboarding` → `{ complete, nextStep: "select_role" | "interests" | "done", emailVerified, roleSubmitted, interestsSelected, memberRole, verificationStatus }`. Call it after every sign-in and after each onboarding step; don't compute the step yourself.

### 6.1 Role forms — `PUT /me/role { memberRole, details }`

`memberRole` is `researcher | innovator | professional | learner` (legacy `expert`, `investor`, `student` can't be chosen). `details` depends on the role:

| Role | Field | Required | Format (checked by the schema → 400) |
|---|---|---|---|
| Researcher | `institutionalEmail` | one of these two | email |
| | `orcidId` | one of these two | `0000-0000-0000-000X` (16 digits, last may be X) |
| | `researchProjectLink` | no | `https://…`, ≤ 500 chars |
| | `researchEvidence` | no | ≤ 2000 chars |
| Innovator | `ventureName` | **yes** | 2–120 chars |
| | `description` | no | ≤ 2000 chars |
| | `developmentStage` | **yes** | `open` \| `ongoing` \| `closed` |
| | `evidenceLink` | no | `https://…` |
| | `evidenceFileIds` | no | ≤ 5 media ids, upload purpose `verification` |
| | `otherCueFileIds` | no | ≤ 10 media ids, upload purpose `verification` |
| Professional | `organizationName` | **yes** | 2–160 chars |
| | `professionalTitle` | **yes** | 2–100 chars (becomes the headline if there is none) |
| | `profileLink` | no | `https://…` (LinkedIn: `https://www.linkedin.com/in/<name>`) |
| | `workEmail` | no | email |
| Learner | `institution` | **yes** | 2–160 chars |
| | `courseOfStudy` | **yes** | 2–160 chars |
| | `studentEmail` | no | email |
| | `level` | no | e.g. `200`, `200L`, `300 level`, `Year 2`, `Final year`, `HND 1`, `ND2`, `SS3`, `MSc`, `PhD` |

Send optional fields only when the user filled them in (omit them, don't send `""`).

### 6.2 What happens on submit

There is **no admin review queue**. The server checks the answers immediately and answers in about 1–6 seconds (it may look up the email domain, the ORCID record and the links):

| Check | Refused when |
|---|---|
| Text fields | placeholders (`test`, `n/a`, `none`, `abc`, `lorem ipsum`), keyboard mashing (`asdfgh`, `qwerty`), repeated characters, letter strings that aren't words; evidence/description too short to mean anything |
| Level | not a recognisable level |
| ORCID iD | wrong checksum; no such ORCID record; deactivated; the record's name doesn't match the profile name |
| Emails | disposable/temporary domains; personal Gmail/Yahoo/Outlook/iCloud… addresses in an institutional/work/student field; placeholder domains (`example.com`); a domain that doesn't exist or can't receive email |
| Links | not `http(s)`; private/internal addresses or IPs; a site that doesn't exist; a page that returns 404/410 or says "not found"; parked "domain for sale" pages; a LinkedIn link that isn't a profile/company page |
| Identity | the same ORCID iD or role email already backs another account |

- **Pass → `200`** with the updated `Me`: `verificationStatus: "verified"`, `verification.status: "verified"`, `verification.decidedBy: "auto"`. Show the verified badge. The member also gets an in-app notification (`type: "verification"`).
- **Fail → `422 VERIFICATION_FAILED`.** Nothing is saved (a member changing role keeps their previous form and badge). `error.fields` has one message per field to fix, keyed `details.<field>`:

```json
{ "error": { "code": "VERIFICATION_FAILED",
  "message": "We couldn't verify 2 of your answers. Fix the highlighted fields and submit again.",
  "fields": {
    "details.institutionalEmail": "A personal gmail.com address can't confirm your institution. Use the email your institution gave you, or leave this blank",
    "details.orcidId": "This ORCID iD is not valid (the last character does not match). Copy it from your ORCID profile"
  }, "requestId": "…" } }
```

- A **`400 VALIDATION_FAILED`** is still possible for schema problems (missing required field, bad email format, ORCID not in `0000-0000-0000-0000` form, `javascript:` link, files not yours or still uploading) — handle it the same way.
- When a lookup can't be completed (a website blocks robots, a timeout), it never causes a refusal.

**UX checklist for the role form**

- Show a "Verifying your details…" state on submit and disable the button; use a request timeout of at least 20 seconds (the client above uses 30 s).
- Map `details.<field>` messages onto the inputs; keep the user's answers in the form.
- Upload innovator evidence **before** submitting: `POST /uploads/presign { purpose: "verification", … }` → `PUT` → `POST /uploads/{id}/complete`, then send the ids.
- After `200`, call `GET /me/onboarding` and go to `nextStep` (normally `interests`).

### 6.3 Interests — `PUT /me/interests { topicIds }`

`GET /topics` lists the chips (`{ id, slug, name, description }`). Send 1–20 ids. If the role form is already verified this completes onboarding, sends the welcome email and notifies the admins.

### 6.4 Later: Settings → "Change my role" / "Change this email"

Same `PUT /me/role` call and the same automatic checks. On `422` the old role, form and badge stay. `GET /me` → `verification` shows the current form, `status`, `decidedBy` and, when an admin rejected or revoked it, `reviewNote` (show it with a "Fix and resubmit" button).

> `PATCH /me/onboarding` (one-call legacy flow) still works for old clients but gives no verified badge. New clients should not use it.

---

## 7. Badges and roles everywhere

Every person object (`UserSummary`) has `memberRole` and `verified`. Show the role label, plus the verified badge when `verified` is `true`. `platformRole` (`member | moderator | admin | super_admin`) controls access to the admin dashboard.

---

## 8. Uploads (direct to storage)

1. `POST /uploads/presign { purpose, mimeType, sizeBytes, fileName?, width?, height?, durationSeconds? }` → `{ mediaId, uploadUrl, token, publicUrl }`.
2. `PUT uploadUrl` with the raw file bytes and `Content-Type: <mimeType>` (no Authorization header — the URL is signed).
3. `POST /uploads/{mediaId}/complete` → `Media`.
4. Use the `mediaId` in posts, comments, messages, workspace items and role forms; use `publicUrl` for `avatarUrl` / `coverUrl`.

| Purpose | Kinds | Max size | Visibility |
|---|---|---|---|
| `avatar` | image | 5 MB | public |
| `cover`, `forum`, `event`, `featured` | image | 10 MB | public |
| `post` | image, video, document | 200 MB | public |
| `comment` | image, document | 25 MB | public |
| `project`, `highlight` | image, video | 200 MB | public |
| `message` | image, video, document, audio | 50 MB | private |
| `research` | document, image | 25 MB | private |
| `prototype` | image, video, document | 200 MB | private |
| `contract` | document | 25 MB | private |
| `verification` | document, image | 10 MB | private |

Accepted types: JPEG, PNG, WebP, GIF, HEIC, MP4, MOV, WebM, MP3/M4A/AAC/OGG/WebM audio, PDF, Word, Excel, PowerPoint, TXT, CSV. Private files come back as signed links valid for 1 hour — don't cache them longer.

---

## 9. Realtime (Supabase)

```ts
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
supabase.realtime.setAuth(accessToken); // call again after every refresh
supabase.channel(`user:${me.id}`, { config: { private: true } })
  .on('broadcast', { event: 'notification:new' }, ({ payload }) => addNotification(payload))
  .on('broadcast', { event: 'account:status' }, ({ payload }) => handleStatus(payload))
  .subscribe();
```

| Channel | Events |
|---|---|
| `user:<myId>` | `notification:new`, `account:status` |
| `conversation:<id>` | `message:new`, `message:updated`, `message:deleted`, `read` (clients may broadcast `typing`) |
| `project:<id>` | `ledger:new` |

---

## 10. Notifications

`GET /notifications?filter=all|unread&cursor=&limit=` · `GET /notifications/unread-count` · `POST /notifications/read { ids }` or `{ all: true }` · push: `POST /push-tokens { token, platform }`.

`type` values: `follow`, `post_like`, `post_comment`, `comment_reply`, `mention`, `forum_join`, `project_invite`, `project_join_request`, `project_join_accepted`, `project_join_declined`, `task_assigned`, `task_completed`, `expert_evaluation`, `research_comment`, `prototype_version`, `message`, `event_reminder`, `moderation`, `broadcast`, `collaboration_request`, `collaboration_accepted`, `verification` (role verified / rejected), and for staff `admin_activity`, `new_member`.

Use `targetType` + `targetId` to open the right screen (`user`, `post`, `comment`, `forum`, `project`, `conversation`, `event`, …).

---

## 11. Maintenance and app config

Call `GET /app-config` (no auth) on start-up: image prefetch settings and the current or next `maintenance` window (show a banner ahead of time). While a window with `disableAccess` runs, member requests get `503 MAINTENANCE` with `Retry-After`. Sign-in, the admin dashboard and staff tokens are not affected.

---

## 12. Admin dashboard: verifications and new members

- **New-member alerts.** Every member who finishes onboarding (and every role change) creates an in-app + realtime notification for admins and super admins: `type: "new_member"`, `targetType: "user"`, `targetId` = the member, `title` "New member: Ada Obi", `body` "Researcher · verified automatically (trust 85/100)", `data: { event: "onboarded" | "role_changed", memberRole, verificationStatus, trustScore, flags }`. Link it to the user details page. Email copies are sent when `ADMIN_NEW_MEMBER_EMAILS=true` on the server.
- **Verifications page.** `GET /admin/verifications?status=all|verified|rejected|pending&memberRole=&decidedBy=auto|admin&maxTrust=&q=&page=&pageSize=` — default `status=all`. Each row has `decidedBy`, `trustScore` (0–100, how much independent evidence backed the form) and `flags` (checks that raised a warning). `maxTrust=40` lists low-evidence verifications worth a look.
- **Detail.** `GET /admin/verifications/{userId}` → the form, evidence files and `autoChecks` (every check with `outcome: pass | warn | fail | skipped` and its message).
- **Overrides.** `POST /admin/verifications/{userId}/approve { note? }` (e.g. approve a refused form) and `POST /admin/verifications/{userId}/reject { note }` (revoke a verification; the note is shown to the member). `409` when it already has that status.
- **Re-check.** `POST /admin/verifications/{userId}/recheck` runs the automatic checks again (useful when ORCID or a website was down).
- `pendingVerifications` on `GET /admin/stats/overview` is normally `0` now (only forms from before automatic verification, which the daily job clears).

---

## 13. Pre-release checklist

- [ ] `X-Client` sent everywhere; `credentials: 'include'` on web/admin.
- [ ] Access token in memory; refresh on start-up and on `TOKEN_EXPIRED`; single-flight refresh; mobile stores the rotated refresh token and keeps the old one when `refreshToken` is `null`.
- [ ] `TOKEN_INVALID`, `ACCOUNT_SUSPENDED`, `ACCOUNT_BLOCKED`, `ACCOUNT_DELETED` sign the user out.
- [ ] Every form maps `error.fields` to inputs (including `details.*` for the role form and `422 VERIFICATION_FAILED`).
- [ ] Routing after sign-in uses `GET /me/onboarding`; `403 ONBOARDING_REQUIRED` redirects there.
- [ ] Role form shows a verifying state and uses a ≥ 20 s timeout.
- [ ] Pagination stops at `nextCursor: null`.
- [ ] Uploads use presign → PUT → complete; the right `purpose`; size checked client-side first.
- [ ] Realtime `setAuth` is called again after every token refresh.
- [ ] `GET /app-config` on start-up; `503 MAINTENANCE` shows the maintenance screen.
- [ ] Links rendered from user content are only `http(s)` (the API enforces this, but don't render other schemes).
