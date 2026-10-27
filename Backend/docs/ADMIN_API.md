# Admin dashboard API

This guide maps every admin dashboard screen to its endpoints. The live, complete reference is Swagger at `/api/docs`, generated from the same Zod schemas. Every path below is under `/api/v1`.

**Access**
- All `/admin/*` routes need a staff token. Sign in with `POST /auth/admin/login`.
- Moderators can read everything and moderate users, content, forums and projects.
- Routes marked **(admin)** need `admin` or `super_admin`.
- Routes marked **(super admin)** need `super_admin`.

**Conventions**
- Tables use `?page=&pageSize=` and return `{ data, page, pageSize, total }`. That's enough for "15 of 2000 row(s) shown" and the numbered pager.
- KPI cards return a `Kpi` object: `{ value, previous, changePct }`.
  - `changePct` is a signed percentage with one decimal. Use its sign for the green or red trend arrow.
  - It is `null` when there's no baseline to compare against.
- Every KPI endpoint takes `?range=7d|30d|90d|12m` (default `30d`), which drives the "Last 30 days" picker.
  - Cards whose subtitle says *Last N days* count what happened inside the range and compare it with the range before it.
  - Totals compare the value now with the value at the start of the range.

---

## Overview

| Screen part | Call |
|---|---|
| 4 KPI cards: Total Users, Active Events, Active Forums, Active Projects | `GET /admin/stats/overview?range=30d` → `cards.totalUsers / activeEvents / activeForums / activeProjects` |
| User Activity chart | `GET /admin/stats/user-activity?range=30d` → `data[].signups` per `bucket` (day, or month for `12m`) |
| Moderation Queue card (View All) | `GET /admin/reports?status=all&pageSize=7` |
| Pending role verifications (badge) | `pendingVerifications` on `GET /admin/stats/overview` |
| Admin logs card (See All) | `GET /admin/audit-logs?pageSize=3` **(admin)** |
| Bell | `GET /notifications`, `GET /notifications/unread-count`, `POST /notifications/read { all: true }` (Mark all as read) |

**Bell notifications.** When a staff member signs in to the dashboard, every admin and super admin gets an in-app notification:
- `type: "admin_activity"`
- `title`: the role (for example "Admin")
- `body`: "Terry Jameson logged into the admin dashboard"

## Users

| Screen part | Call |
|---|---|
| KPI cards: Total, Active, New, Blocked | `GET /admin/stats/users?range=30d` (also returns `totals` by account status) |
| User Activity chart | `GET /admin/stats/user-activity?range=30d` → `signups` |
| Moderation Queue | `GET /admin/reports?status=all&targetType=user,post,comment` |
| Users table | `GET /admin/users?q=&status=&role=&memberRole=&verificationStatus=&sort=newest\|oldest\|most_reported` |
| User details panel | `GET /admin/users/{id}` |
| Account logs (View all, Filter by date) | `GET /admin/users/{id}/logs?from=2026-10-01&to=2026-10-31` **(admin)** |
| Warn / restrict / suspend / block / reinstate | `POST /admin/users/{id}/status { action, reason, durationDays? }`. Only admins can block |
| Change platform role | `PATCH /admin/users/{id}/role { platformRole }` **(super admin)** |

**Users table columns.** Each row has:
- `shortId` (User Id column, the last 8 hex characters of the id)
- `fullName`, `email`
- `reportCount` (Reports column)
- `createdAt` (Joined)
- `status`: `active | flagged | restricted | suspended | blocked`

`q` matches name, email, username or the short id.

**User details panel.** Adds these fields to the row:
- `avatarUrl`, `location`, `memberRole` (Role)
- `verificationStatus` and `verification`: the member's role form (all roles), with evidence files. `institutionalEmail`, `researchLink`, `researchEvidence` mirror a researcher's form
- `reportHistory { previousReports, previousWarnings, accountStatus }`
- `history`: moderation actions

**Account logs rows.**
- `label` is the Action column: Logged in, Logged out, Changed email, Password changed, User warned, and so on.
- `details` is the Details column, for example "changed email to jemima@inoov.com".
- `location` is the Location column.
- Also returned: `ip`, `actor`, `createdAt`.

## Role verifications

Members submit a role form during onboarding (Researcher, Innovator, Professional or Learner), and again when they change their role or institutional email. Each submission waits here for review. The member-side flow is in [`USER_API.md`](USER_API.md).

| Action | Call |
|---|---|
| Queue | `GET /admin/verifications?status=pending\|verified\|rejected\|all&memberRole=&q=` (pending is oldest first) |
| Open one (with evidence files) | `GET /admin/verifications/{userId}` |
| Approve (member gets the verified badge) | `POST /admin/verifications/{userId}/approve { note? }` |
| Reject (reason required) | `POST /admin/verifications/{userId}/reject { note }` |

- The member is emailed and notified in-app either way.
- A rejected member can fix their details and submit again, which puts them back in the queue.
- The user details panel (`GET /admin/users/{id}`) also returns `verificationStatus` and the full `verification` form.
- Verified researchers and professionals can submit expert evaluations on projects.

## Moderation queue and Review Report panel

These are shared by the Users, Forums and Projects pages.

| Screen part | Call |
|---|---|
| Tabs All / Pending / Reviewed / Dismissed | `GET /admin/reports?status=all\|pending\|reviewed\|dismissed` (default `pending`) |
| Forums / Projects queues | `&targetType=forum` / `&targetType=project` (comma lists allowed) |
| Search reports | `&q=` matches the reported person, forum name, project title or report number |
| Review Report side panel | `GET /admin/reports/{id}` |
| Dismiss Report, Remove Content / Delete Forum / Delete Project, Send warning, Suspend user / forum / project, Block user | `POST /admin/reports/{id}/action` |

**Queue rows.**
- `number` → "Report #2341"
- `targetName` → the Name / Title column
- `reason`
- `status`
- `outcome`: `dismissed | content_removed | warned | restricted | suspended | blocked`. Show `outcome ?? status` in the Status pill.
- `reportsCount`

**Review Report panel.** Adds two objects to the row:
- `content`, the reported item. For a post: `body`, `author` (with `memberRole`), `media`, `likeCount`, `commentCount`, `createdAt`. For a forum or project: `title`, `members` (avatar stack), `memberCount`, `topics` (Focus), `body` (About), `owner` as `author`, `status`.
- `history { previousReports, previousWarnings, accountStatus }`: the Report History block.

**Action body.**

```json
{ "action": "dismiss | remove_content | warn | restrict | suspend | block",
  "note": "reason typed in the confirmation modal",
  "durationDays": 7,
  "removeContent": false,
  "applyTo": "target | owner" }
```

- For **post / comment / user / message** reports, `warn`, `suspend` and `block` act on the person.
- For **forum / project** reports:
  - `warn`, `restrict` and `suspend` act on the forum or project itself (Send warning, Suspend Forum). Pass `applyTo: "owner"` to act on its owner instead.
  - `remove_content` is **Delete Forum / Delete Project**.
  - `block` always blocks the owner.
- The response is the updated panel, so you don't need to refetch it.
- Other pending reports on the same item are resolved at the same time.

## Forums

| Screen part | Call |
|---|---|
| KPI cards: Total, Active, Restricted, Flagged | `GET /admin/stats/forums?range=30d` |
| Forum Activity chart | `GET /admin/stats/user-activity?range=30d` → `forumPosts` (also `forumsCreated`) |
| Moderation Queue | `GET /admin/reports?status=all&targetType=forum` |
| All Forums table | `GET /admin/forums?q=&status=active\|flagged\|restricted\|suspended\|removed&sort=newest\|oldest\|most_members\|most_reported` |
| Warn / restrict / suspend / reinstate | `POST /admin/forums/{id}/status { action, reason, durationDays? }` |
| Delete / restore | `POST /admin/content/forum/{id}/remove`, `.../restore` |

**All Forums table rows.** Each row has:
- `name`, `coverUrl`, `shortId` (Forum Id)
- `owner` (Creator / Moderator)
- `memberCount`, `reportCount`, `createdAt`
- `moderationStatus` (the Status pill)
- `removedAt`, set when the forum is deleted

**What each moderation status does.**

| Status | Effect |
|---|---|
| `flagged` | Warned. The owner gets an email and an in-app notice. |
| `restricted` | No new members or posts. Members get `403`. |
| `suspended` | Hidden from members until reinstated, or until `durationDays` pass. The daily cron lifts it. |

## Projects

| Screen part | Call |
|---|---|
| KPI cards: Total, Active, Completed, New, and Project distribution donut | `GET /admin/stats/projects?range=30d` → `distribution.featured / inDevelopment / inactive / completed` as `{ count, pct }` |
| Project moderation queue | `GET /admin/reports?status=all&targetType=project` |
| All projects table | `GET /admin/projects?q=&status=&projectStatus=open\|ongoing\|completed\|archived&sort=` |
| Warn / restrict / suspend / reinstate | `POST /admin/projects/{id}/status` |
| Delete / restore | `POST /admin/content/project/{id}/remove`, `.../restore` |

- Rows have the same columns as forums, plus `status` (the project lifecycle) and `featuredAt`.
- The Status pill uses `moderationStatus`. Show `flagged` as "Warned".
- A `restricted` project stops accepting join requests.

## Events

| Screen part | Call |
|---|---|
| KPI cards: Total, Active, Concluded, Upcoming | `GET /admin/stats/events?range=30d` |
| Upcoming Events row | `GET /admin/events?when=upcoming` (soonest first) |
| Concluded row (View All) | `GET /admin/events?when=concluded` |
| Search in Events | `&q=` (title, venue, organizer) |
| Add Event | `POST /admin/events` **(admin)** |
| Event view (Challenge view) | `GET /admin/events/{id}`; Upcoming Events sidebar: `GET /admin/events?when=upcoming&pageSize=3` |
| Edit / delete | `PATCH /admin/events/{id}`, `DELETE /admin/events/{id}` **(admin)** |

**Add Event form fields.**

| Form field | API field |
|---|---|
| Cover upload | `POST /uploads/presign` with purpose `event`, then pass `coverUrl` |
| Event Title | `title` |
| Event Type / Category | `category`: `hackathon \| workshop \| bootcamp \| networking_fair` (older values `meetup`, `conference`, `webinar`, `other` still work) |
| Date Range | `startsAt` / `endsAt` (ISO with offset) |
| Location (optional) | `venue` |
| Registration link (**required**) | `registrationUrl` |
| About this event | `description` |
| Organized by | `organizerName`, plus optional `organizerLogoUrl` and `organizerTagline` ("Creative Media") |
| (no field) | Send `status: "published"` to show the event to members |

## Community Highlights

| Screen part | Call |
|---|---|
| Albums grid, Search in Highlights | `GET /admin/highlights?q=` |
| Highlights view, More like this | `GET /admin/highlights/{id}`; `GET /admin/highlights?eventId=` |
| Add Highlights | `POST /admin/highlights { title?, eventId?, mediaIds[], caption?, publish? }` **(admin)** |
| Featured innovations | `GET /admin/featured`, `POST /admin/featured`, `PATCH /admin/featured/{id}`, `DELETE /admin/featured/{id}` **(admin)**. Body adds `topicIds` (for the members' "Sort topics" filter) and `mediaIds` (the gallery; upload with purpose `featured`) |
| "Use an existing event" picker | `GET /admin/events?q=` (past events included) |
| Edit (title, images, publish) | `PATCH /admin/highlights/{id}`. `mediaIds` replaces the images, in that order |

- Either `title` or `eventId` is required. With an event and no title, the album takes the event's title.
- Upload images with purpose `highlight`.
- Each highlight returns `event { id, title, category, startsAt, endsAt }` (or `null`). The member-facing `/highlights` returns it too.

## Notifications (system-wide alerts)

Per the design note, these alerts reach members **by email**, not in-app.

| Form field | API |
|---|---|
| Platform: All (Users, Forums, Projects) / Users / Forums / Projects | `audience.platform`: `all \| users \| forums \| projects` |
| Forum / Projects dropdown, IDs (optional) | `audience.ids`: user ids for `users`, or forum/project ids whose members receive it. Omit to reach everyone on that platform |
| Title, Body | `title`, `body` |
| Send notification | `POST /admin/broadcasts` **(admin)**, rate-limited to 5 per hour |
| History | `GET /admin/broadcasts`, `GET /admin/broadcasts/{id}` |

**Channels.**
- `channels` defaults to `{ "email": true, "inApp": false }`.
- Set `inApp: true` to also add the alert to members' in-app notifications.

**Who is skipped.**
- Blocked accounts
- Unverified emails
- Members who switched off broadcast emails (`notificationPrefs.broadcast.email = false`)

**Large audiences.** Emails go out in batches for up to about 20 seconds per request.
- If any are still queued, the response has `status: "sending"`.
- Call `POST /admin/broadcasts/{id}/resume` to keep going. The daily cron also finishes them.
- Progress is tracked in `recipientCount`, `deliveredCount` and `failedCount`.

## Logs

| Screen part | Call |
|---|---|
| Admin logs table: Action, Timestamp, Log Message, Ip | `GET /admin/audit-logs?q=&from=&to=&action=&actorId=` **(admin)** → `label`, `createdAt`, `details`, `ip` (plus `location`, `actor`) |

**What gets logged.** Every privileged action:
- Sign-ins and sign-outs, failed logins, password changes and email changes
- Role changes and moderation actions
- Event, highlight and featured create/edit/delete
- Broadcasts
- Settings and maintenance changes

**Location.** It's filled in from Vercel's geo headers in production, and is empty when running locally.

## Settings

**Profile**

| Screen part | Call |
|---|---|
| Profile Photo upload / Remove | `POST /uploads/presign` with purpose `avatar`, then `PATCH /me { avatarUrl }`. Remove with `PATCH /me { avatarUrl: null }` |
| First name, Last name | `PATCH /me { fullName: "Terry Jameson" }`. Join the two inputs with a space |
| Phone Number (optional) | `PATCH /me { phone }` |
| Email Address | `POST /me/email { newEmail, password }`, then a 6-digit code goes to the new address, then `POST /me/email/verify { newEmail, code }` |
| Change Password | `POST /auth/password/change { currentPassword, newPassword }` |

**Platform settings**

| Screen part | Call |
|---|---|
| Image Optimization toggle | `GET /admin/settings`, `PATCH /admin/settings { imageOptimization }` **(admin)** |
| Schedule maintenance | `POST /admin/maintenance { message, startsAt, endsAt, disableAccess, notifyUsers? }` **(admin)** |
| Edit, extend or cancel | `PATCH /admin/maintenance/{id}`, `DELETE /admin/maintenance/{id}` **(admin)** |
| History | `GET /admin/maintenance?state=upcoming\|past\|all` |

**How maintenance works.**
- `notifyUsers` (default true) emails `message` to every member with the dates. It ignores the broadcast email opt-out because it's a service notice.
- `disableAccess: true` makes the API answer `503 MAINTENANCE` (with `Retry-After`) to members while the window runs.
  - Sign-in, `/admin/*`, `/health` and `/app-config` keep working.
  - Staff tokens get through everywhere.
- Windows can't overlap. An overlapping window gets `409`.

**For the member web and mobile apps.**
- Call the public `GET /app-config` on start-up.
- It returns `{ imageOptimization, maintenance: { message, startsAt, endsAt, disableAccess, active } | null }`. Use it to show a banner ahead of time and the maintenance screen when a call returns `503 MAINTENANCE`.

---

## What changed in this update

**New endpoints (20)**
- `GET /admin/stats/users`, `/stats/forums`, `/stats/projects`, `/stats/events`
- `GET /admin/users/{id}/logs`
- `POST /admin/forums/{id}/status`, `POST /admin/projects/{id}/status`
- `GET /admin/events/{id}`
- `GET /admin/highlights/{id}`
- `GET /admin/broadcasts/{id}`, `POST /admin/broadcasts/{id}/resume`
- `GET|PATCH /admin/settings`
- `GET|POST /admin/maintenance`, `PATCH|DELETE /admin/maintenance/{id}`
- `GET /app-config`
- `POST /me/email`, `POST /me/email/verify`

**Extended. Additive only: existing fields and parameters still work.**
- `stats/overview`: `range` and `cards`
- `stats/user-activity`: `range` alias, `90d`, forum and project series
- `/admin/users`: `shortId`, `memberRole` filter, id search
- `/admin/users/{id}`: profile and verification fields, `reportHistory`
- `/admin/reports`:
  - `status=all`, `q`, comma-separated `targetType`
  - new fields: `number`, `targetName`, `outcome`, `reportsCount`
  - the detail adds `content` and `history`
- `/admin/forums`, `/admin/projects`: `shortId`, `coverUrl`, `reportCount`, `moderationStatus`, filters and sorting
- `/admin/events`: `when`, `q`, `category`; organizer fields
- `/admin/highlights`: `eventId`, `q`; `title` optional with an event; `mediaIds` editable
- `/admin/audit-logs`: `q`, `from`, `to`, `label`, `details`, `location`
- `PATCH /me`, `GET /me`: `location`, `phone` (role and verification details are submitted with `PUT /me/role`; see USER_API.md)

**Behaviour changes to note**
1. `POST /admin/events` now **requires** `registrationUrl` (the design marks it required). `PATCH` does not.
2. `POST /admin/broadcasts` now sends **email** by default (the design note). Pass `channels: { email: false, inApp: true }` for the old in-app behaviour.
3. For **forum / project** reports, `warn` / `suspend` now act on the forum or project itself, which is what Suspend Forum and Send warning mean in the design. Use `applyTo: "owner"` for the old behaviour. Post, comment and user reports are unchanged.
4. `POST /admin/reports/{id}/action` returns the full panel (`content`, `history`) as well as the previous fields.
5. Fixed bug: the users table's `reportCount` (and the `most_reported` sort) always returned 0. Inside the subquery, `users.id` lost its table name and matched the report's own id.
6. Logging out (`/auth/logout`, `/auth/logout-all`) is now written to the audit log, so it shows in Account logs.

**Database**
- `supabase/migrations/20261027000000_admin_dashboard.sql` upgrades an existing database. It's idempotent.
- `20260924000000_init.sql` was rebuilt with the same schema, so a fresh database gets everything from the init file, and the second file is a no-op there.
