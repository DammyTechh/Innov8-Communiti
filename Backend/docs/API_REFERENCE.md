# CommUniti API — endpoint reference

_Generated from the code by `npm run docs:reference` · 210 endpoints · base URL `https://api.mycommuniti.org/api/v1` (local: `http://localhost:4000/api/v1`)._

Read **[FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md)** first: headers, tokens and refresh, errors, pagination, uploads, realtime and the onboarding flow. This file lists every endpoint. Swagger UI with "Try it out" is at `/api/docs`.

**Reading the tables.** Request tables mark required fields. Response tables list every field the API returns (unlisted fields are never sent). `null` means the field is present with no value. Linked types are described under [Schemas](#schemas).

## Index

| Area | Method | Path | What it does |
|---|---|---|---|
| Health | `GET` | [`/health`](#get-health) | Liveness and database check |
| App | `GET` | [`/app-config`](#get-app-config) | Public app configuration (image prefetching, maintenance banner) |
| Auth | `POST` | [`/auth/register`](#post-auth-register) | Create an account with email and password |
| Auth | `POST` | [`/auth/verify-email`](#post-auth-verify-email) | Verify email with the 6-digit code and sign in |
| Auth | `POST` | [`/auth/verify-email/resend`](#post-auth-verify-email-resend) | Resend the email verification code |
| Auth | `POST` | [`/auth/login`](#post-auth-login) | Sign in with email and password |
| Auth | `POST` | [`/auth/admin/login`](#post-auth-admin-login) | Admin dashboard sign-in (moderator, admin, super_admin) |
| Auth | `POST` | [`/auth/refresh`](#post-auth-refresh) | Get a new access token |
| Auth | `POST` | [`/auth/logout`](#post-auth-logout) | Sign out of this device |
| Auth | `POST` | [`/auth/logout-all`](#post-auth-logout-all) | Sign out of every device |
| Auth | `GET` | [`/auth/sessions`](#get-auth-sessions) | List signed-in devices |
| Auth | `DELETE` | [`/auth/sessions/{sessionId}`](#delete-auth-sessions-sessionid-) | Sign out a specific device |
| Auth | `GET` | [`/auth/google`](#get-auth-google) | Start Google sign-in (web redirect flow) |
| Auth | `GET` | [`/auth/google/callback`](#get-auth-google-callback) | Google OAuth callback (called by Google) |
| Auth | `POST` | [`/auth/google/token`](#post-auth-google-token) | Sign in with a Google ID token (mobile apps, Google One Tap) |
| Auth | `POST` | [`/auth/password/forgot`](#post-auth-password-forgot) | Forgot password: email a reset code |
| Auth | `POST` | [`/auth/password/verify-code`](#post-auth-password-verify-code) | Verify the reset code and get a reset token |
| Auth | `POST` | [`/auth/password/reset`](#post-auth-password-reset) | Set a new password with the reset token |
| Auth | `POST` | [`/auth/password/change`](#post-auth-password-change) | Change password (or set one for a Google-only account) |
| Me | `GET` | [`/me/`](#get-me-) | Current user with profile, counts and interests |
| Me | `PATCH` | [`/me/`](#patch-me-) | Edit profile |
| Me | `DELETE` | [`/me/`](#delete-me-) | Delete my account (30-day grace period) |
| Me | `PATCH` | [`/me/onboarding`](#patch-me-onboarding) | Finish onboarding in one call (legacy) |
| Me | `GET` | [`/me/onboarding`](#get-me-onboarding) | Onboarding progress (where to send the member after sign-in) |
| Me | `PUT` | [`/me/role`](#put-me-role) | Submit my role and its verification form (Select Role → Researcher / Innovator / Professional / Learner) |
| Me | `GET` | [`/me/blocked-users`](#get-me-blocked-users) | People I blocked |
| Me | `POST` | [`/me/email`](#post-me-email) | Change my email: step 1, send a code to the new address |
| Me | `POST` | [`/me/email/verify`](#post-me-email-verify) | Change my email: step 2, confirm the code |
| Me | `GET` | [`/me/username-available`](#get-me-username-available) | Check if a username is free |
| Me | `PUT` | [`/me/interests`](#put-me-interests) | Replace my interest topics (onboarding step 2: "One more thing!") |
| Me | `GET` | [`/me/settings`](#get-me-settings) | My settings (theme, privacy, visibility, notifications) |
| Me | `PATCH` | [`/me/settings`](#patch-me-settings) | Update my settings |
| Topics | `GET` | [`/topics`](#get-topics) | All interest topics |
| Users | `GET` | [`/users/suggested`](#get-users-suggested) | People to follow ("Suggested Community") |
| Users | `GET` | [`/users/by-username/{username}`](#get-users-by-username-username-) | Public profile by username |
| Users | `GET` | [`/users/{id}`](#get-users-id-) | Public profile by id ("View Profile") |
| Users | `POST` | [`/users/{id}/block`](#post-users-id-block) | Block a member |
| Users | `DELETE` | [`/users/{id}/block`](#delete-users-id-block) | Unblock a member |
| Users | `POST` | [`/users/{id}/follow`](#post-users-id-follow) | Follow a user |
| Users | `DELETE` | [`/users/{id}/follow`](#delete-users-id-follow) | Unfollow a user |
| Users | `GET` | [`/users/{id}/followers`](#get-users-id-followers) | People who follow this user |
| Users | `GET` | [`/users/{id}/following`](#get-users-id-following) | People this user follows |
| Users | `GET` | [`/users/lookup`](#get-users-lookup) | Look up many users by id (for mentions, avatars) |
| Uploads | `POST` | [`/uploads/presign`](#post-uploads-presign) | Step 1: get a signed URL to upload a file directly to storage |
| Uploads | `POST` | [`/uploads/{id}/complete`](#post-uploads-id-complete) | Step 2: confirm the upload finished |
| Uploads | `DELETE` | [`/uploads/{id}`](#delete-uploads-id-) | Delete an upload I own |
| Feed & Posts | `GET` | [`/feed`](#get-feed) | Home feed |
| Feed & Posts | `POST` | [`/posts`](#post-posts) | Create a post |
| Feed & Posts | `GET` | [`/posts/{id}`](#get-posts-id-) | Get a post (Post view) |
| Feed & Posts | `PATCH` | [`/posts/{id}`](#patch-posts-id-) | Edit my post |
| Feed & Posts | `DELETE` | [`/posts/{id}`](#delete-posts-id-) | Delete my post |
| Feed & Posts | `POST` | [`/posts/{id}/not-interested`](#post-posts-id-not-interested) | "Not interested": hide a post from my feeds |
| Feed & Posts | `DELETE` | [`/posts/{id}/not-interested`](#delete-posts-id-not-interested) | Undo "Not interested" |
| Feed & Posts | `POST` | [`/posts/{id}/like`](#post-posts-id-like) | Like a post |
| Feed & Posts | `DELETE` | [`/posts/{id}/like`](#delete-posts-id-like) | Unlike a post |
| Feed & Posts | `POST` | [`/posts/{id}/share`](#post-posts-id-share) | Record a share and get the share link |
| Feed & Posts | `GET` | [`/users/{id}/posts`](#get-users-id-posts) | A user's posts (profile Posts tab) |
| Feed & Posts | `GET` | [`/posts/{id}/comments`](#get-posts-id-comments) | Top-level comments on a post |
| Feed & Posts | `POST` | [`/posts/{id}/comments`](#post-posts-id-comments) | Comment on a post, or reply to a comment |
| Feed & Posts | `GET` | [`/comments/{id}/replies`](#get-comments-id-replies) | Replies to a comment (oldest first) |
| Feed & Posts | `PATCH` | [`/comments/{id}`](#patch-comments-id-) | Edit my comment |
| Feed & Posts | `DELETE` | [`/comments/{id}`](#delete-comments-id-) | Delete a comment (mine, or on my post) |
| Feed & Posts | `POST` | [`/comments/{id}/like`](#post-comments-id-like) | Like a comment |
| Feed & Posts | `DELETE` | [`/comments/{id}/like`](#delete-comments-id-like) | Unlike a comment |
| Search | `GET` | [`/search`](#get-search) | Search posts, people, events, highlights, topics, forums and projects |
| Search | `GET` | [`/search/recent`](#get-search-recent) | My recent searches |
| Search | `DELETE` | [`/search/recent`](#delete-search-recent) | Clear my recent searches |
| Search | `GET` | [`/trending/topics`](#get-trending-topics) | Trending topics (most-used in posts over the last 7 days) |
| Search | `GET` | [`/trending/forums`](#get-trending-forums) | Trending forums (most active in the last 7 days) |
| Forums | `GET` | [`/forums/`](#get-forums-) | Browse forums |
| Forums | `POST` | [`/forums/`](#post-forums-) | Create a forum |
| Forums | `POST` | [`/forums/{id}/mute`](#post-forums-id-mute) | "Mute notifications & messages" for a forum I joined |
| Forums | `GET` | [`/forums/{id}`](#get-forums-id-) | Forum details |
| Forums | `PATCH` | [`/forums/{id}`](#patch-forums-id-) | Edit a forum (owner, moderator) |
| Forums | `DELETE` | [`/forums/{id}`](#delete-forums-id-) | Delete a forum (owner) |
| Forums | `POST` | [`/forums/{id}/join`](#post-forums-id-join) | Join a public forum |
| Forums | `DELETE` | [`/forums/{id}/join`](#delete-forums-id-join) | Leave a forum |
| Forums | `GET` | [`/forums/{id}/members`](#get-forums-id-members) | Forum members |
| Forums | `POST` | [`/forums/{id}/members`](#post-forums-id-members) | Add a member or set a role (owner, moderator) |
| Forums | `DELETE` | [`/forums/{id}/members/{userId}`](#delete-forums-id-members-userid-) | Remove a member (owner, moderator) |
| Forums | `GET` | [`/forums/{id}/posts`](#get-forums-id-posts) | Posts in a forum |
| Projects | `GET` | [`/projects`](#get-projects) | Browse projects |
| Projects | `POST` | [`/projects`](#post-projects) | Create a project |
| Projects | `GET` | [`/users/{id}/projects`](#get-users-id-projects) | A user's projects (profile Projects tab) |
| Projects | `GET` | [`/projects/{id}`](#get-projects-id-) | Project overview |
| Projects | `PATCH` | [`/projects/{id}`](#patch-projects-id-) | Edit a project (owner, admin) |
| Projects | `DELETE` | [`/projects/{id}`](#delete-projects-id-) | Delete a project (owner) |
| Projects | `GET` | [`/projects/{id}/members`](#get-projects-id-members) | Project members |
| Projects | `PATCH` | [`/projects/{id}/members/{userId}`](#patch-projects-id-members-userid-) | Change a member's role or title (owner, admin) |
| Projects | `DELETE` | [`/projects/{id}/members/{userId}`](#delete-projects-id-members-userid-) | Remove a member (owner, admin) or leave (yourself) |
| Projects | `POST` | [`/projects/{id}/transfer-ownership`](#post-projects-id-transfer-ownership) | Transfer ownership to another member (owner) |
| Projects | `POST` | [`/projects/{id}/join-requests`](#post-projects-id-join-requests) | Ask to join a project |
| Projects | `GET` | [`/projects/{id}/join-requests`](#get-projects-id-join-requests) | Join requests (owner, admin) |
| Projects | `DELETE` | [`/projects/{id}/join-requests/mine`](#delete-projects-id-join-requests-mine) | Cancel my pending request |
| Projects | `POST` | [`/projects/{id}/join-requests/{requestId}/accept`](#post-projects-id-join-requests-requestid-accept) | Accept a join request (owner, admin) |
| Projects | `POST` | [`/projects/{id}/join-requests/{requestId}/decline`](#post-projects-id-join-requests-requestid-decline) | Decline a join request (owner, admin) |
| Workspace | `GET` | [`/projects/{id}/research`](#get-projects-id-research) | Research documents |
| Workspace | `POST` | [`/projects/{id}/research`](#post-projects-id-research) | Add research: write in-app or upload a file (contributor+) |
| Workspace | `GET` | [`/projects/{id}/research/{docId}`](#get-projects-id-research-docid-) | A research document |
| Workspace | `PATCH` | [`/projects/{id}/research/{docId}`](#patch-projects-id-research-docid-) | Edit a research document (author or admin) |
| Workspace | `DELETE` | [`/projects/{id}/research/{docId}`](#delete-projects-id-research-docid-) | Delete a research document (author or admin) |
| Workspace | `GET` | [`/projects/{id}/prototypes`](#get-projects-id-prototypes) | Prototypes |
| Workspace | `POST` | [`/projects/{id}/prototypes`](#post-projects-id-prototypes) | Create a prototype (contributor+) |
| Workspace | `GET` | [`/projects/{id}/prototypes/{prototypeId}`](#get-projects-id-prototypes-prototypeid-) | A prototype with its versions (newest first) |
| Workspace | `PATCH` | [`/projects/{id}/prototypes/{prototypeId}`](#patch-projects-id-prototypes-prototypeid-) | Edit a prototype (contributor+) |
| Workspace | `DELETE` | [`/projects/{id}/prototypes/{prototypeId}`](#delete-projects-id-prototypes-prototypeid-) | Delete a prototype (admin) |
| Workspace | `POST` | [`/projects/{id}/prototypes/{prototypeId}/versions`](#post-projects-id-prototypes-prototypeid-versions) | Upload a new prototype version (contributor+) |
| Workspace | `GET` | [`/projects/{id}/workspace-comments`](#get-projects-id-workspace-comments) | Comments on a research doc or prototype version |
| Workspace | `POST` | [`/projects/{id}/workspace-comments`](#post-projects-id-workspace-comments) | Comment on a research doc or prototype version (any member) |
| Workspace | `DELETE` | [`/projects/{id}/workspace-comments/{commentId}`](#delete-projects-id-workspace-comments-commentid-) | Delete my workspace comment (or any, as admin) |
| Workspace | `GET` | [`/projects/{id}/evaluations`](#get-projects-id-evaluations) | Expert evaluations with averages |
| Workspace | `POST` | [`/projects/{id}/evaluations`](#post-projects-id-evaluations) | Submit an expert evaluation (verified researchers and professionals) |
| Workspace | `PATCH` | [`/projects/{id}/evaluations/{evaluationId}`](#patch-projects-id-evaluations-evaluationid-) | Edit my evaluation |
| Workspace | `DELETE` | [`/projects/{id}/evaluations/{evaluationId}`](#delete-projects-id-evaluations-evaluationid-) | Delete my evaluation |
| Workspace | `GET` | [`/projects/{id}/contracts`](#get-projects-id-contracts) | Contracts (file links are signed, valid 1 hour) |
| Workspace | `POST` | [`/projects/{id}/contracts`](#post-projects-id-contracts) | Upload a contract (admin) |
| Workspace | `PATCH` | [`/projects/{id}/contracts/{contractId}`](#patch-projects-id-contracts-contractid-) | Update a contract (admin) |
| Workspace | `DELETE` | [`/projects/{id}/contracts/{contractId}`](#delete-projects-id-contracts-contractid-) | Delete a contract (admin) |
| Workspace | `GET` | [`/projects/{id}/tasks`](#get-projects-id-tasks) | Tasks |
| Workspace | `POST` | [`/projects/{id}/tasks`](#post-projects-id-tasks) | Create a task (contributor+) |
| Workspace | `PATCH` | [`/projects/{id}/tasks/{taskId}`](#patch-projects-id-tasks-taskid-) | Update a task or mark it done (contributor+) |
| Workspace | `DELETE` | [`/projects/{id}/tasks/{taskId}`](#delete-projects-id-tasks-taskid-) | Delete a task (creator or admin) |
| Workspace | `GET` | [`/projects/{id}/ledger`](#get-projects-id-ledger) | Project activity ledger (newest first) |
| Workspace | `GET` | [`/projects/{id}/notification-settings`](#get-projects-id-notification-settings) | My notification settings for this project |
| Workspace | `PUT` | [`/projects/{id}/notification-settings`](#put-projects-id-notification-settings) | Update my notification settings for this project |
| Chat | `GET` | [`/conversations`](#get-conversations) | My conversations (most recent first) |
| Chat | `GET` | [`/conversations/unread-count`](#get-conversations-unread-count) | Total unread messages (badge) |
| Chat | `POST` | [`/conversations/direct`](#post-conversations-direct) | Open (or create) a direct conversation with a user |
| Chat | `GET` | [`/conversations/{id}`](#get-conversations-id-) | Conversation details with members |
| Chat | `DELETE` | [`/conversations/{id}`](#delete-conversations-id-) | "Delete chat history": clear the messages and remove the chat from my list |
| Chat | `GET` | [`/conversations/{id}/messages`](#get-conversations-id-messages) | Messages (newest first; page backwards with the cursor) |
| Chat | `POST` | [`/conversations/{id}/messages`](#post-conversations-id-messages) | Send a message |
| Chat | `DELETE` | [`/conversations/{id}/messages`](#delete-conversations-id-messages) | "Clear conversation history": clear messages for me only (the chat stays in my list) |
| Chat | `PATCH` | [`/messages/{id}`](#patch-messages-id-) | Edit my message (within 15 minutes) |
| Chat | `DELETE` | [`/messages/{id}`](#delete-messages-id-) | Delete my message for everyone |
| Chat | `POST` | [`/conversations/{id}/read`](#post-conversations-id-read) | Mark the conversation as read |
| Chat | `POST` | [`/conversations/{id}/mute`](#post-conversations-id-mute) | Mute or unmute notifications for a conversation |
| Collaboration | `POST` | [`/collaboration-requests`](#post-collaboration-requests) | Ask someone to collaborate |
| Collaboration | `GET` | [`/collaboration-requests`](#get-collaboration-requests) | My collaboration requests (Chats → Sort by: Collaboration requests) |
| Collaboration | `GET` | [`/collaboration-requests/pending-count`](#get-collaboration-requests-pending-count) | Pending requests I received (badge) |
| Collaboration | `GET` | [`/collaboration-requests/{id}`](#get-collaboration-requests-id-) | A collaboration request ("View request") |
| Collaboration | `DELETE` | [`/collaboration-requests/{id}`](#delete-collaboration-requests-id-) | Cancel a request I sent |
| Collaboration | `POST` | [`/collaboration-requests/{id}/accept`](#post-collaboration-requests-id-accept) | Accept Request |
| Collaboration | `POST` | [`/collaboration-requests/{id}/decline`](#post-collaboration-requests-id-decline) | Decline a request |
| Explore | `GET` | [`/events`](#get-events) | Events |
| Explore | `GET` | [`/events/{id}`](#get-events-id-) | Event details |
| Explore | `PUT` | [`/events/{id}/rsvp`](#put-events-id-rsvp) | RSVP to an event (going / interested) |
| Explore | `DELETE` | [`/events/{id}/rsvp`](#delete-events-id-rsvp) | Remove my RSVP |
| Explore | `GET` | [`/featured`](#get-featured) | Featured innovations (curated by admins) |
| Explore | `GET` | [`/featured/{id}`](#get-featured-id-) | Featured innovation details (Featured View) |
| Explore | `GET` | [`/highlights`](#get-highlights) | Community highlights |
| Explore | `GET` | [`/highlights/{id}`](#get-highlights-id-) | A highlight album (expand image view) |
| Explore | `GET` | [`/explore/suggested`](#get-explore-suggested) | Explore → "Suggested for you" |
| Notifications | `GET` | [`/notifications`](#get-notifications) | List my notifications |
| Notifications | `GET` | [`/notifications/unread-count`](#get-notifications-unread-count) | Unread count for the sidebar badge |
| Notifications | `POST` | [`/notifications/read`](#post-notifications-read) | Mark notifications as read |
| Notifications | `POST` | [`/push-tokens`](#post-push-tokens) | Register an Expo push token for this device |
| Notifications | `DELETE` | [`/push-tokens`](#delete-push-tokens) | Remove a push token (on logout) |
| Reports | `POST` | [`/reports`](#post-reports) | Report a post, comment, forum, project, message or user |
| Admin | `GET` | [`/admin/stats/users`](#get-admin-stats-users) | Users page KPI cards: Total, Active, New, Blocked |
| Admin | `GET` | [`/admin/stats/forums`](#get-admin-stats-forums) | Forums page KPI cards: Total, Active, Restricted, Flagged |
| Admin | `GET` | [`/admin/stats/projects`](#get-admin-stats-projects) | Projects page KPI cards (Total, Active, Completed, New) and Project distribution donut |
| Admin | `GET` | [`/admin/stats/events`](#get-admin-stats-events) | Events page KPI cards: Total, Active, Concluded, Upcoming |
| Admin | `GET` | [`/admin/settings`](#get-admin-settings) | Platform settings |
| Admin | `PATCH` | [`/admin/settings`](#patch-admin-settings) | Update platform settings (admin) |
| Admin | `GET` | [`/admin/maintenance`](#get-admin-maintenance) | Maintenance windows |
| Admin | `POST` | [`/admin/maintenance`](#post-admin-maintenance) | Schedule maintenance (admin) |
| Admin | `PATCH` | [`/admin/maintenance/{id}`](#patch-admin-maintenance-id-) | Edit a maintenance window (admin) |
| Admin | `DELETE` | [`/admin/maintenance/{id}`](#delete-admin-maintenance-id-) | Cancel a maintenance window (admin) |
| Admin | `GET` | [`/admin/verifications`](#get-admin-verifications) | Role verifications (automatic decisions and overrides) |
| Admin | `GET` | [`/admin/verifications/{userId}`](#get-admin-verifications-userid-) | A member's verification form, evidence and automatic checks |
| Admin | `POST` | [`/admin/verifications/{userId}/recheck`](#post-admin-verifications-userid-recheck) | Re-run automatic verification on a stored form |
| Admin | `POST` | [`/admin/verifications/{userId}/approve`](#post-admin-verifications-userid-approve) | Approve a role verification (override: member gets the verified badge) |
| Admin | `POST` | [`/admin/verifications/{userId}/reject`](#post-admin-verifications-userid-reject) | Reject or revoke a role verification (override) |
| Admin | `GET` | [`/admin/stats/overview`](#get-admin-stats-overview) | KPI cards: users, activity, content, moderation |
| Admin | `GET` | [`/admin/stats/user-activity`](#get-admin-stats-user-activity) | Activity over time (User Activity, Forum Activity charts) |
| Admin | `GET` | [`/admin/users`](#get-admin-users) | Users table (search, filter, paginate) |
| Admin | `GET` | [`/admin/users/{id}`](#get-admin-users-id-) | User details panel with report history and moderation history |
| Admin | `GET` | [`/admin/users/{id}/logs`](#get-admin-users-id-logs) | A user's account logs (admin) |
| Admin | `POST` | [`/admin/users/{id}/status`](#post-admin-users-id-status) | Warn, restrict, suspend, block or reinstate a user |
| Admin | `PATCH` | [`/admin/users/{id}/role`](#patch-admin-users-id-role) | Change platform role (super admin) |
| Admin | `GET` | [`/admin/reports`](#get-admin-reports) | Moderation queue |
| Admin | `GET` | [`/admin/reports/{id}`](#get-admin-reports-id-) | Review Report panel: reported content, details and history |
| Admin | `POST` | [`/admin/reports/{id}/action`](#post-admin-reports-id-action) | Resolve a report |
| Admin | `POST` | [`/admin/content/{type}/{id}/remove`](#post-admin-content-type-id-remove) | Remove content (hide from members) |
| Admin | `POST` | [`/admin/content/{type}/{id}/restore`](#post-admin-content-type-id-restore) | Restore removed content |
| Admin | `GET` | [`/admin/content/posts`](#get-admin-content-posts) | Posts table |
| Admin | `GET` | [`/admin/forums`](#get-admin-forums) | All Forums table |
| Admin | `GET` | [`/admin/projects`](#get-admin-projects) | All projects table |
| Admin | `POST` | [`/admin/forums/{id}/status`](#post-admin-forums-id-status) | Warn, restrict, suspend or reinstate a forum |
| Admin | `POST` | [`/admin/projects/{id}/status`](#post-admin-projects-id-status) | Warn, restrict, suspend or reinstate a project |
| Admin | `GET` | [`/admin/events`](#get-admin-events) | All events (including drafts) |
| Admin | `POST` | [`/admin/events`](#post-admin-events) | Create an event (admin) |
| Admin | `GET` | [`/admin/events/{id}`](#get-admin-events-id-) | Event view (including drafts) |
| Admin | `PATCH` | [`/admin/events/{id}`](#patch-admin-events-id-) | Edit an event (admin) |
| Admin | `DELETE` | [`/admin/events/{id}`](#delete-admin-events-id-) | Delete an event (admin) |
| Admin | `GET` | [`/admin/featured`](#get-admin-featured) | Featured innovations (including unpublished) |
| Admin | `POST` | [`/admin/featured`](#post-admin-featured) | Create a featured innovation (admin) |
| Admin | `PATCH` | [`/admin/featured/{id}`](#patch-admin-featured-id-) | Edit or publish a featured innovation (admin) |
| Admin | `DELETE` | [`/admin/featured/{id}`](#delete-admin-featured-id-) | Delete a featured innovation (admin) |
| Admin | `GET` | [`/admin/highlights`](#get-admin-highlights) | Highlights (including unpublished) |
| Admin | `POST` | [`/admin/highlights`](#post-admin-highlights) | Create a highlight (admin) |
| Admin | `GET` | [`/admin/highlights/{id}`](#get-admin-highlights-id-) | Highlight view |
| Admin | `PATCH` | [`/admin/highlights/{id}`](#patch-admin-highlights-id-) | Edit or publish a highlight (admin) |
| Admin | `DELETE` | [`/admin/highlights/{id}`](#delete-admin-highlights-id-) | Delete a highlight (admin) |
| Admin | `GET` | [`/admin/broadcasts`](#get-admin-broadcasts) | Sent broadcasts (history) |
| Admin | `POST` | [`/admin/broadcasts`](#post-admin-broadcasts) | Send a notification email to all members or a segment (admin) |
| Admin | `GET` | [`/admin/broadcasts/{id}`](#get-admin-broadcasts-id-) | Broadcast details and delivery progress |
| Admin | `POST` | [`/admin/broadcasts/{id}/resume`](#post-admin-broadcasts-id-resume) | Continue sending a broadcast that is still "sending" (admin) |
| Admin | `GET` | [`/admin/audit-logs`](#get-admin-audit-logs) | Admin logs (admin) |

## Health

Liveness and readiness

### GET /health

<a id="get-health"></a>**Liveness and database check**

- **Access:** Public (a token is optional; some fields are personalised when sent)

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `status` | `ok` |  |
| `db` | `ok` |  |
| `env` | string |  |
| `version` | string |  |
| `commit` | string |  |
| `time` | string |  |

**Errors to handle:** `503`, `429 RATE_LIMITED`

---

## App

Public app configuration: image prefetching and the maintenance banner

### GET /app-config

<a id="get-app-config"></a>**Public app configuration (image prefetching, maintenance banner)**

- **Access:** Public (a token is optional; some fields are personalised when sent)

No auth. Clients call it on start-up to show a maintenance banner, and when any call returns `503 MAINTENANCE`.

**Response 200**

Returns [AppConfig](#appconfig)

**Errors to handle:** `429 RATE_LIMITED`

---

## Auth

Sign up, email verification, login, Google OAuth, tokens, password reset

### POST /auth/register

<a id="post-auth-register"></a>**Create an account with email and password**

- **Access:** Public (a token is optional; some fields are personalised when sent)

Create account screen: full name, email, location, password, confirm password, terms. Creates an unverified account and emails a 6-digit code (then POST /auth/verify-email). Retrying with an unverified email updates the details and resends the code. After sign-in, GET /me/onboarding says which onboarding screen comes next.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `fullName` | string | **yes** | Full name, e.g. Adaeze Okafor · min 2 chars, max 80 chars |
| `email` | string (email) | **yes** | Email address (case-insensitive) · max 254 chars |
| `location` | string | no | "Input your location", e.g. Lugbe, Abuja · min 2 chars, max 120 chars |
| `password` | string | **yes** | 8–128 characters with at least one letter and one number · min 8 chars, max 128 chars |
| `confirmPassword` | string | no | "Confirm password". When sent, it must match `password` · max 128 chars |
| `acceptTerms` | `true` | **yes** |  |

**Response 201**

Returns [VerificationPending](#verificationpending)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `429 RATE_LIMITED`

---

### POST /auth/verify-email

<a id="post-auth-verify-email"></a>**Verify email with the 6-digit code and sign in**

- **Access:** Public (a token is optional; some fields are personalised when sent)

On success the user is signed in. Next step: onboarding (`PATCH /me/onboarding`) when `user.onboardingComplete` is false.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string (email) | **yes** | Email address (case-insensitive) · max 254 chars |
| `code` | string | **yes** | 6-digit code sent by email · pattern `^\d{6}$` |

**Response 200**

Returns [TokenResponse](#tokenresponse)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `429 RATE_LIMITED`

---

### POST /auth/verify-email/resend

<a id="post-auth-verify-email-resend"></a>**Resend the email verification code**

- **Access:** Public (a token is optional; some fields are personalised when sent)

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string (email) | **yes** | Email address (case-insensitive) · max 254 chars |

**Response 202**

Returns [Accepted](#accepted)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `429 RATE_LIMITED`

---

### POST /auth/login

<a id="post-auth-login"></a>**Sign in with email and password**

- **Access:** Public (a token is optional; some fields are personalised when sent)

Errors: `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED` (a new code is emailed), `PASSWORD_NOT_SET` (Google-only account), `ACCOUNT_LOCKED` (5 failed attempts, 15 min), `ACCOUNT_SUSPENDED`, `ACCOUNT_BLOCKED`.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string (email) | **yes** | Email address (case-insensitive) · max 254 chars |
| `password` | string | **yes** | min 1 chars, max 128 chars |

**Response 200**

Returns [TokenResponse](#tokenresponse)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `429 RATE_LIMITED`

---

### POST /auth/admin/login

<a id="post-auth-admin-login"></a>**Admin dashboard sign-in (moderator, admin, super_admin)**

- **Access:** Public (a token is optional; some fields are personalised when sent)

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string (email) | **yes** | Email address (case-insensitive) · max 254 chars |
| `password` | string | **yes** | min 1 chars, max 128 chars |

**Response 200**

Returns [TokenResponse](#tokenresponse)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `429 RATE_LIMITED`

---

### POST /auth/refresh

<a id="post-auth-refresh"></a>**Get a new access token**

- **Access:** Public (a token is optional; some fields are personalised when sent)

Web: sends the httpOnly cookie automatically (use `credentials: "include"`). Mobile: send `{ refreshToken }`. The refresh token rotates on every call.

**Request body** (JSON)

*When variant 1:*

| Field | Type | Required | Notes |
|---|---|---|---|
| `refreshToken` | string | no | Mobile only. Web sends the httpOnly cookie automatically. · min 20 chars |

**Response 200**

Returns [TokenResponse](#tokenresponse)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `429 RATE_LIMITED`

---

### POST /auth/logout

<a id="post-auth-logout"></a>**Sign out of this device**

- **Access:** Signed in (Bearer token)

**Response 204** — no body

**Errors to handle:** `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`

---

### POST /auth/logout-all

<a id="post-auth-logout-all"></a>**Sign out of every device**

- **Access:** Signed in (Bearer token)

**Response 204** — no body

**Errors to handle:** `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`

---

### GET /auth/sessions

<a id="get-auth-sessions"></a>**List signed-in devices**

- **Access:** Signed in (Bearer token)

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Session](#session)[] |  |

**Errors to handle:** `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`

---

### DELETE /auth/sessions/{sessionId}

<a id="delete-auth-sessions-sessionid-"></a>**Sign out a specific device**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `sessionId` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### GET /auth/google

<a id="get-auth-google"></a>**Start Google sign-in (web redirect flow)**

- **Access:** Public (a token is optional; some fields are personalised when sent)

Open this URL in the browser (full-page navigation, not fetch). Redirects to Google, then back to `/auth/google/callback`, which sets the refresh cookie and redirects to `{WEB_URL|ADMIN_URL}/auth/callback`. The frontend then calls `POST /auth/refresh` to get an access token.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `app` | `web` \| `admin` | no | Which frontend to return to after sign-in · default `"web"` |
| `returnTo` | string | no | Relative path in the frontend to land on after sign-in, e.g. /projects · max 300 chars, pattern `^\/(?!\/)[\w\-/?=&.%]*$` |

**Response 200** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `429 RATE_LIMITED`

---

### GET /auth/google/callback

<a id="get-auth-google-callback"></a>**Google OAuth callback (called by Google)**

- **Access:** Public (a token is optional; some fields are personalised when sent)

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `code` | string | no |  |
| `state` | string | no |  |
| `error` | string | no |  |

**Response 200** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `429 RATE_LIMITED`

---

### POST /auth/google/token

<a id="post-auth-google-token"></a>**Sign in with a Google ID token (mobile apps, Google One Tap)**

- **Access:** Public (a token is optional; some fields are personalised when sent)

Verifies the ID token against the web and mobile client IDs. Creates the account on first sign-in (`isNewUser: true`).

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `idToken` | string | **yes** | Google ID token from the native / One Tap sign-in SDK · min 20 chars |

**Response 200**

Returns [TokenResponse](#tokenresponse)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `429 RATE_LIMITED`

---

### POST /auth/password/forgot

<a id="post-auth-password-forgot"></a>**Forgot password: email a reset code**

- **Access:** Public (a token is optional; some fields are personalised when sent)

Always returns 202, whether or not the email is registered.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string (email) | **yes** | Email address (case-insensitive) · max 254 chars |

**Response 202**

Returns [Accepted](#accepted)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `429 RATE_LIMITED`

---

### POST /auth/password/verify-code

<a id="post-auth-password-verify-code"></a>**Verify the reset code and get a reset token**

- **Access:** Public (a token is optional; some fields are personalised when sent)

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string (email) | **yes** | Email address (case-insensitive) · max 254 chars |
| `code` | string | **yes** | 6-digit code sent by email · pattern `^\d{6}$` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `resetToken` | string | Single-use token for POST /auth/password/reset |
| `expiresIn` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `429 RATE_LIMITED`

---

### POST /auth/password/reset

<a id="post-auth-password-reset"></a>**Set a new password with the reset token**

- **Access:** Public (a token is optional; some fields are personalised when sent)

Signs the user out of every device and emails a confirmation. The user then signs in with the new password.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `resetToken` | string | **yes** | min 20 chars |
| `newPassword` | string | **yes** | 8–128 characters with at least one letter and one number · min 8 chars, max 128 chars |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `429 RATE_LIMITED`

---

### POST /auth/password/change

<a id="post-auth-password-change"></a>**Change password (or set one for a Google-only account)**

- **Access:** Signed in (Bearer token)

Keeps this device signed in and signs out every other device.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `currentPassword` | string | no | Required unless the account has no password yet (Google-only) · max 128 chars |
| `newPassword` | string | **yes** | 8–128 characters with at least one letter and one number · min 8 chars, max 128 chars |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`

---

## Me

Current user, onboarding (role + verification form, interests), settings, change email, blocked people, account deletion

### GET /me/

<a id="get-me-"></a>**Current user with profile, counts and interests**

- **Access:** Signed in (Bearer token)

**Response 200**

Returns [Me](#me)

**Errors to handle:** `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PATCH /me/

<a id="patch-me-"></a>**Edit profile**

- **Access:** Signed in (Bearer token)

Edit Profile: profile name (`fullName`), profession (`headline`), avatar (upload with POST /uploads/presign, purpose `avatar`, then pass `avatarUrl`). Settings: `location`, `phone`. Changing role here clears verification (`verificationStatus: unverified`); to change role with its form ("Change my role"), use PUT /me/role. Institutional email and research details are changed through PUT /me/role too, which sends them for review again.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `fullName` | string | no | Full name, e.g. Adaeze Okafor · min 2 chars, max 80 chars |
| `username` | string | no | min 3 chars, max 30 chars, pattern `^[a-zA-Z0-9_.]+$` |
| `headline` | string \| null | no | max 100 chars |
| `bio` | string \| null | no | max 500 chars |
| `avatarUrl` | string (uri) \| null | no | max 2048 chars |
| `coverUrl` | string (uri) \| null | no | max 2048 chars |
| `memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` | no | Current roles: researcher, innovator, professional, learner. Legacy (existing accounts only): expert, investor, student |
| `country` | string | no | pattern `^[A-Z]{2}$` |
| `dateOfBirth` | string (date) | no |  |
| `openToCollaborate` | boolean | no |  |
| `location` | string \| null | no | e.g. "Lugbe, Abuja, Nigeria" · max 120 chars |
| `phone` | string \| null | no | Optional, e.g. +234 803 000 0000 · pattern `^\+?[0-9 ()-]{7,20}$` |

**Response 200**

Returns [Me](#me)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /me/

<a id="delete-me-"></a>**Delete my account (30-day grace period)**

- **Access:** Signed in (Bearer token)

Signs out everywhere and schedules permanent deletion in 30 days. Signing in before then cancels it. Accounts with a password must confirm it.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `password` | string | no | max 128 chars |
| `confirm` | `DELETE` | **yes** |  |
| `reason` | string | no | max 500 chars |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PATCH /me/onboarding

<a id="patch-me-onboarding"></a>**Finish onboarding in one call (legacy)**

- **Access:** Signed in (Bearer token)

Earlier single-step flow, kept for existing clients. The current flow is PUT /me/role (Select Role + role form) then PUT /me/interests; use GET /me/onboarding to know the next step. `dateOfBirth` and `country` are now optional.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` | **yes** | Current roles: researcher, innovator, professional, learner. Legacy (existing accounts only): expert, investor, student |
| `dateOfBirth` | string (date) | no |  |
| `country` | string | no | pattern `^[A-Z]{2}$` |
| `topicIds` | string (uuid)[] | **yes** | min 1 items, max 20 items |
| `username` | string | no | min 3 chars, max 30 chars, pattern `^[a-zA-Z0-9_.]+$` |

**Response 200**

Returns [Me](#me)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /me/onboarding

<a id="get-me-onboarding"></a>**Onboarding progress (where to send the member after sign-in)**

- **Access:** Signed in (Bearer token)

`nextStep`: `select_role` → Select Role + role form (PUT /me/role), `interests` → "One more thing!" (PUT /me/interests), `done` → the app.

**Response 200**

Returns [OnboardingStatus](#onboardingstatus)

**Errors to handle:** `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PUT /me/role

<a id="put-me-role"></a>**Submit my role and its verification form (Select Role → Researcher / Innovator / Professional / Learner)**

- **Access:** Signed in (Bearer token)

Onboarding step 1, and Settings → "Change my role" / "Change this email". Body: `{ memberRole, details }`; `details` depends on the role: **researcher**: `institutionalEmail` or `orcidId` (at least one), `researchProjectLink`, `researchEvidence`. **innovator**: `ventureName`, `description`, `developmentStage` (open | ongoing | closed), `evidenceLink`, `evidenceFileIds`, `otherCueFileIds` (upload with purpose `verification`). **professional**: `organizationName`, `professionalTitle`, `profileLink`, `workEmail`. **learner**: `institution`, `courseOfStudy`, `studentEmail`, `level`.  **Automatic verification (no admin queue).** The answers are checked on submit (usually 1–6 s: placeholder/gibberish text, ORCID checksum + ORCID record + name match, email domain exists and is not disposable or a personal Gmail/Yahoo address, links open and are not 404 or parked, the same ORCID/email not used by another account). Pass → saved with `verificationStatus: verified` (verified badge) and `verification.decidedBy: auto`. Fail → `422 VERIFICATION_FAILED`, nothing is saved, and `error.fields` maps `details.<field>` to what to fix (show it under that input). Schema problems (missing or badly formatted fields) are still `400 VALIDATION_FAILED`. Completes onboarding when interests are already chosen; admins are notified of every new member.

**Request body** (JSON)

*When `memberRole: "researcher"`:*

| Field | Type | Required | Notes |
|---|---|---|---|
| `memberRole` | `"researcher"` | **yes** |  |
| `details` | [ResearcherDetails](#researcherdetails) | **yes** |  |

*When `memberRole: "innovator"`:*

| Field | Type | Required | Notes |
|---|---|---|---|
| `memberRole` | `"innovator"` | **yes** |  |
| `details` | [InnovatorDetails](#innovatordetails) | **yes** |  |

*When `memberRole: "professional"`:*

| Field | Type | Required | Notes |
|---|---|---|---|
| `memberRole` | `"professional"` | **yes** |  |
| `details` | [ProfessionalDetails](#professionaldetails) | **yes** |  |

*When `memberRole: "learner"`:*

| Field | Type | Required | Notes |
|---|---|---|---|
| `memberRole` | `"learner"` | **yes** |  |
| `details` | [LearnerDetails](#learnerdetails) | **yes** |  |

**Response 200**

Returns [Me](#me)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `422 VERIFICATION_FAILED` (Automatic verification failed), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /me/blocked-users

<a id="get-me-blocked-users"></a>**People I blocked**

- **Access:** Signed in (Bearer token)

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | object[] |  |
| `data[].id` | string (uuid) |  |
| `data[].fullName` | string |  |
| `data[].username` | string \| null |  |
| `data[].avatarUrl` | string \| null |  |
| `data[].headline` | string \| null |  |
| `data[].memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null |  |
| `data[].verified` | boolean | Role verified by an admin (show the verified badge) |
| `data[].blockedAt` | string |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /me/email

<a id="post-me-email"></a>**Change my email: step 1, send a code to the new address**

- **Access:** Signed in (Bearer token)

Profile → Email Address. Accounts with a password must confirm it. Then call POST /me/email/verify with the code.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `newEmail` | string (email) | **yes** | Email address (case-insensitive) · max 254 chars |
| `password` | string | no | max 128 chars |

**Response 202**

| Field | Type | Notes |
|---|---|---|
| `email` | string |  |
| `codeExpiresIn` | number |  |
| `resendAvailableIn` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /me/email/verify

<a id="post-me-email-verify"></a>**Change my email: step 2, confirm the code**

- **Access:** Signed in (Bearer token)

Switches the sign-in email, emails the old address, and records "changed email" in the account logs.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `newEmail` | string (email) | **yes** | Email address (case-insensitive) · max 254 chars |
| `code` | string | **yes** | 6-digit code sent by email · pattern `^\d{6}$` |

**Response 200**

Returns [Me](#me)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /me/username-available

<a id="get-me-username-available"></a>**Check if a username is free**

- **Access:** Signed in (Bearer token)

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `username` | string | **yes** | min 3 chars, max 30 chars, pattern `^[a-zA-Z0-9_.]+$` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `available` | boolean |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PUT /me/interests

<a id="put-me-interests"></a>**Replace my interest topics (onboarding step 2: "One more thing!")**

- **Access:** Signed in (Bearer token)

Finishes onboarding (and sends the welcome email) when a role has already been submitted. Also used from Settings to change interests.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `topicIds` | string (uuid)[] | **yes** | min 1 items, max 20 items |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Topic](#topic)[] |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /me/settings

<a id="get-me-settings"></a>**My settings (theme, privacy, visibility, notifications)**

- **Access:** Signed in (Bearer token)

**Response 200**

Returns [Settings](#settings)

**Errors to handle:** `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PATCH /me/settings

<a id="patch-me-settings"></a>**Update my settings**

- **Access:** Signed in (Bearer token)

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `theme` | `light` \| `dark` \| `system` | no |  |
| `language` | string | no |  |
| `profileVisibility` | `public` \| `members` \| `private` | no |  |
| `messagePermission` | `everyone` \| `following` \| `none` | no |  |
| `showOnlineStatus` | boolean | no |  |
| `notificationPrefs` | map<string, object> | no |  |

**Response 200**

Returns [Settings](#settings)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

## Users

Profiles, follows, blocking, suggestions

### GET /users/suggested

<a id="get-users-suggested"></a>**People to follow ("Suggested Community")**

- **Access:** Signed in (Bearer token)

Ranks people who share your interests and are not followed yet, then by follower count.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `limit` | integer | no | ≥ 1, ≤ 30, default `10` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | object[] |  |
| `data[].id` | string (uuid) |  |
| `data[].fullName` | string |  |
| `data[].username` | string \| null |  |
| `data[].avatarUrl` | string \| null |  |
| `data[].headline` | string \| null |  |
| `data[].memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null |  |
| `data[].verified` | boolean | Role verified by an admin (show the verified badge) |
| `data[].followerCount` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /users/by-username/{username}

<a id="get-users-by-username-username-"></a>**Public profile by username**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `username` | string | **yes** | min 1 chars, max 30 chars |

**Response 200**

Returns [Profile](#profile)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /users/{id}

<a id="get-users-id-"></a>**Public profile by id ("View Profile")**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [Profile](#profile)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /users/{id}/block

<a id="post-users-id-block"></a>**Block a member**

- **Access:** Signed in (Bearer token)

Post sheet → "Block (user)". Unfollows both ways, cancels pending collaboration requests, and from then on neither of you sees the other's posts or comments, and you cannot follow, message or send collaboration requests to each other. Your blocked list: GET /me/blocked-users.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /users/{id}/block

<a id="delete-users-id-block"></a>**Unblock a member**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /users/{id}/follow

<a id="post-users-id-follow"></a>**Follow a user**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /users/{id}/follow

<a id="delete-users-id-follow"></a>**Unfollow a user**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /users/{id}/followers

<a id="get-users-id-followers"></a>**People who follow this user**

- **Access:** Signed in (Bearer token)

People you blocked, or who blocked you, are left out.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |
| `q` | string | no | max 80 chars |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | object[] |  |
| `data[].id` | string (uuid) |  |
| `data[].fullName` | string |  |
| `data[].username` | string \| null |  |
| `data[].avatarUrl` | string \| null |  |
| `data[].headline` | string \| null |  |
| `data[].memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null |  |
| `data[].verified` | boolean | Role verified by an admin (show the verified badge) |
| `data[].followedAt` | string |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /users/{id}/following

<a id="get-users-id-following"></a>**People this user follows**

- **Access:** Signed in (Bearer token)

People you blocked, or who blocked you, are left out.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |
| `q` | string | no | max 80 chars |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | object[] |  |
| `data[].id` | string (uuid) |  |
| `data[].fullName` | string |  |
| `data[].username` | string \| null |  |
| `data[].avatarUrl` | string \| null |  |
| `data[].headline` | string \| null |  |
| `data[].memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null |  |
| `data[].verified` | boolean | Role verified by an admin (show the verified badge) |
| `data[].followedAt` | string |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /users/lookup

<a id="get-users-lookup"></a>**Look up many users by id (for mentions, avatars)**

- **Access:** Signed in (Bearer token)

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `ids` | string | **yes** | Comma-separated UUIDs, max 50 |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [UserSummary](#usersummary)[] |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

## Topics

Interest topics used for onboarding and tags

### GET /topics

<a id="get-topics"></a>**All interest topics**

- **Access:** Public (a token is optional; some fields are personalised when sent)

Feed customization ("One more thing!"), forum Focus Topics, "Search in Topics" and "Sort topics". `description` is the line under each topic name.

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | object[] |  |
| `data[].id` | string (uuid) |  |
| `data[].slug` | string |  |
| `data[].name` | string |  |
| `data[].description` | string |  |

**Errors to handle:** `429 RATE_LIMITED`, `503 MAINTENANCE`

---

## Uploads

Direct-to-storage uploads (Supabase Storage)

### POST /uploads/presign

<a id="post-uploads-presign"></a>**Step 1: get a signed URL to upload a file directly to storage**

- **Access:** Signed in (Bearer token)

Upload the file with `PUT uploadUrl` (body = file bytes, header `Content-Type`). Then call `POST /uploads/{mediaId}/complete`. Use the returned `mediaId` in posts, messages and workspace items; for avatar/cover use `publicUrl`.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `purpose` | `avatar` \| `cover` \| `post` \| `message` \| `research` \| `prototype` \| `contract` \| `project` \| `forum` \| `event` \| `highlight` \| `comment` \| `verification` \| `featured` | **yes** | Where the file will be used. comment: images/files on comments · verification: onboarding evidence (private, PDF/PNG/JPEG, 10 MB) · featured: featured-innovation gallery · post now also accepts documents (paperclip) |
| `mimeType` | string | **yes** | max 120 chars |
| `sizeBytes` | integer | **yes** | ≤ 9007199254740991 |
| `fileName` | string | no | max 200 chars |
| `width` | integer | no | ≤ 9007199254740991 |
| `height` | integer | no | ≤ 9007199254740991 |
| `durationSeconds` | integer | no | ≤ 600 |

**Response 201**

| Field | Type | Notes |
|---|---|---|
| `mediaId` | string (uuid) |  |
| `uploadUrl` | string |  |
| `token` | string |  |
| `publicUrl` | string \| null | Final URL for public files (avatar, cover, post images) |
| `expiresIn` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /uploads/{id}/complete

<a id="post-uploads-id-complete"></a>**Step 2: confirm the upload finished**

- **Access:** Signed in (Bearer token)

Checks the object exists in storage and marks the media ready so it can be attached.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [Media](#media)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /uploads/{id}

<a id="delete-uploads-id-"></a>**Delete an upload I own**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

## Feed & Posts

Feed, posts, views, likes, shares, Not interested, comments with attachments

### GET /feed

<a id="get-feed"></a>**Home feed**

- **Access:** Signed in (Bearer token)

`for-you`: everything you can see, weighted to people you follow, forums you joined and your interests. `following`: only people you follow (and you). `forums`: posts in forums you joined. Newest first. Posts marked "Not interested", posts by blocked people and posts from forums I muted are left out.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |
| `tab` | `for-you` \| `following` \| `forums` | no | default `"for-you"` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Post](#post)[] |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /posts

<a id="post-posts"></a>**Create a post**

- **Access:** Signed in, **onboarding complete**, not restricted

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `body` | string | no | max 5000 chars, default `""` |
| `mediaIds` | string (uuid)[] | no | max 10 items, default `[]` |
| `topicIds` | string (uuid)[] | no | max 5 items, default `[]` |
| `audience` | `everyone` \| `followers` \| `forum` \| `project` | no | Composer dropdown: "Everyone" → everyone, "Following" → followers (only people who follow you see it) · default `"everyone"` |
| `forumId` | string (uuid) | no |  |
| `projectId` | string (uuid) | no |  |

**Response 201**

Returns [Post](#post)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 ONBOARDING_REQUIRED`, `403 FORBIDDEN` (account restricted), `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /posts/{id}

<a id="get-posts-id-"></a>**Get a post (Post view)**

- **Access:** Signed in (Bearer token)

Opening a post counts one view per member (`viewCount`).

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [Post](#post)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PATCH /posts/{id}

<a id="patch-posts-id-"></a>**Edit my post**

- **Access:** Signed in, **onboarding complete**, not restricted

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `body` | string | no | max 5000 chars |
| `topicIds` | string (uuid)[] | no | max 5 items |

**Response 200**

Returns [Post](#post)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 ONBOARDING_REQUIRED`, `403 FORBIDDEN` (account restricted), `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /posts/{id}

<a id="delete-posts-id-"></a>**Delete my post**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /posts/{id}/not-interested

<a id="post-posts-id-not-interested"></a>**"Not interested": hide a post from my feeds**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /posts/{id}/not-interested

<a id="delete-posts-id-not-interested"></a>**Undo "Not interested"**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /posts/{id}/like

<a id="post-posts-id-like"></a>**Like a post**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `liked` | boolean |  |
| `likeCount` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /posts/{id}/like

<a id="delete-posts-id-like"></a>**Unlike a post**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `liked` | boolean |  |
| `likeCount` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /posts/{id}/share

<a id="post-posts-id-share"></a>**Record a share and get the share link**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `shareUrl` | string |  |
| `shareCount` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /users/{id}/posts

<a id="get-users-id-posts"></a>**A user's posts (profile Posts tab)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Post](#post)[] |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /posts/{id}/comments

<a id="get-posts-id-comments"></a>**Top-level comments on a post**

- **Access:** Signed in (Bearer token)

Each comment has `replyCount`; load replies with GET /comments/{id}/replies.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |
| `sort` | `latest` \| `popular` \| `top` \| `newest` \| `oldest` | no | Sort comments: latest (newest first) or popular (most liked). top/newest/oldest still work · default `"top"` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Comment](#comment)[] |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /posts/{id}/comments

<a id="post-posts-id-comments"></a>**Comment on a post, or reply to a comment**

- **Access:** Signed in, **onboarding complete**, not restricted

Text, attachments, or both. Attach images or files: upload with POST /uploads/presign (purpose `comment`), then pass `mediaIds`. Comments from people you blocked (or who blocked you) are not shown.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `body` | string | no | max 2000 chars, default `""` |
| `parentId` | string (uuid) | no |  |
| `mediaIds` | string (uuid)[] | no | Up to 4 images/files (purpose `comment`) · max 4 items, default `[]` |

**Response 201**

Returns [Comment](#comment)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 ONBOARDING_REQUIRED`, `403 FORBIDDEN` (account restricted), `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /comments/{id}/replies

<a id="get-comments-id-replies"></a>**Replies to a comment (oldest first)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Comment](#comment)[] |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PATCH /comments/{id}

<a id="patch-comments-id-"></a>**Edit my comment**

- **Access:** Signed in, **onboarding complete**, not restricted

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `body` | string | **yes** | min 1 chars, max 2000 chars |

**Response 200**

Returns [Comment](#comment)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 ONBOARDING_REQUIRED`, `403 FORBIDDEN` (account restricted), `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /comments/{id}

<a id="delete-comments-id-"></a>**Delete a comment (mine, or on my post)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /comments/{id}/like

<a id="post-comments-id-like"></a>**Like a comment**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `liked` | boolean |  |
| `likeCount` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /comments/{id}/like

<a id="delete-comments-id-like"></a>**Unlike a comment**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `liked` | boolean |  |
| `likeCount` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

## Search

Search (posts, people, events, highlights, topics, forums, projects) and trending

### GET /search

<a id="get-search"></a>**Search posts, people, events, highlights, topics, forums and projects**

- **Access:** Signed in (Bearer token)

Search results tabs: Posts (`type=posts`), People (`people`), Events (`events`), Highlights (`highlights`), and a topic tab such as "Agriculture" (`type=posts&topicId=…`). `type=all` returns up to `limit` of each kind (use it for the search dropdown, whose "Search in Topics" list is `topics`). Trigram (`ILIKE`) matching, indexed. People you blocked or who blocked you are left out. The query is saved to recent searches.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `q` | string | **yes** | min 2 chars, max 80 chars |
| `type` | `all` \| `people` \| `posts` \| `forums` \| `projects` \| `events` \| `highlights` \| `topics` | no | default `"all"` |
| `topicId` | string (uuid) | no | Only posts tagged with this topic (topic tab) |
| `limit` | integer | no | ≥ 1, ≤ 30, default `5` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `people` | object[] |  |
| `people[].id` | string (uuid) |  |
| `people[].fullName` | string |  |
| `people[].username` | string \| null |  |
| `people[].avatarUrl` | string \| null |  |
| `people[].headline` | string \| null |  |
| `people[].memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null |  |
| `people[].verified` | boolean | Role verified by an admin (show the verified badge) |
| `people[].followerCount` | number |  |
| `posts` | [Post](#post)[] |  |
| `forums` | object[] |  |
| `forums[].id` | string (uuid) |  |
| `forums[].name` | string |  |
| `forums[].slug` | string |  |
| `forums[].about` | string |  |
| `forums[].coverUrl` | string \| null |  |
| `forums[].memberCount` | number |  |
| `projects` | object[] |  |
| `projects[].id` | string (uuid) |  |
| `projects[].title` | string |  |
| `projects[].slug` | string |  |
| `projects[].pitch` | string |  |
| `projects[].coverUrl` | string \| null |  |
| `projects[].status` | string |  |
| `projects[].memberCount` | number |  |
| `events` | [Event](#event)[] |  |
| `highlights` | [Highlight](#highlight)[] |  |
| `topics` | object[] |  |
| `topics[].id` | string (uuid) |  |
| `topics[].slug` | string |  |
| `topics[].name` | string |  |
| `topics[].description` | string |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /search/recent

<a id="get-search-recent"></a>**My recent searches**

- **Access:** Signed in (Bearer token)

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | string[] |  |

**Errors to handle:** `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /search/recent

<a id="delete-search-recent"></a>**Clear my recent searches**

- **Access:** Signed in (Bearer token)

**Response 204** — no body

**Errors to handle:** `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /trending/topics

<a id="get-trending-topics"></a>**Trending topics (most-used in posts over the last 7 days)**

- **Access:** Signed in (Bearer token)

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `limit` | integer | no | ≥ 1, ≤ 20, default `8` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | object[] |  |
| `data[].id` | string (uuid) |  |
| `data[].slug` | string |  |
| `data[].name` | string |  |
| `data[].postCount` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /trending/forums

<a id="get-trending-forums"></a>**Trending forums (most active in the last 7 days)**

- **Access:** Signed in (Bearer token)

Right sidebar. "Trending in Forums": no filter. "Trending in Agriculture topics": pass `topic=agriculture` (slug) or `topicId`. `postCount` is the "34 Posts" label; `recentPosts` is the last 7 days.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `limit` | integer | no | ≥ 1, ≤ 20, default `5` |
| `topicId` | string (uuid) | no |  |
| `topic` | string | no | Topic slug, e.g. agriculture · max 60 chars |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `topic` | object \| null |  |
| `data` | object[] |  |
| `data[].id` | string (uuid) |  |
| `data[].name` | string |  |
| `data[].slug` | string |  |
| `data[].about` | string |  |
| `data[].coverUrl` | string \| null |  |
| `data[].memberCount` | number |  |
| `data[].postCount` | number |  |
| `data[].recentPosts` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

## Forums

Forums, membership and forum posts

### GET /forums/

<a id="get-forums-"></a>**Browse forums**

- **Access:** Signed in (Bearer token)

Tabs: For You → `for-you` (public forums on your interest topics; all public forums if none match), Joined → `joined`, My Forums → `mine` (forums you own). `discover`: public forums you have not joined.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |
| `tab` | `for-you` \| `discover` \| `joined` \| `mine` | no | default `"discover"` |
| `q` | string | no | max 80 chars |
| `topicId` | string (uuid) | no |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Forum](#forum)[] |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /forums/

<a id="post-forums-"></a>**Create a forum**

- **Access:** Signed in (Bearer token)

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | **yes** | min 3 chars, max 80 chars |
| `about` | string | no | max 1000 chars, default `""` |
| `coverUrl` | string (uri) \| null | no | max 2048 chars |
| `visibility` | `public` \| `private` | no | default `"public"` |
| `topicIds` | string (uuid)[] | no | max 5 items, default `[]` |

**Response 201**

Returns [Forum](#forum)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /forums/{id}/mute

<a id="post-forums-id-mute"></a>**"Mute notifications & messages" for a forum I joined**

- **Access:** Signed in (Bearer token)

Muted forums stay readable but their posts are left out of my home feed. Send `{ "muted": false }` to unmute.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

*When variant 1:*

| Field | Type | Required | Notes |
|---|---|---|---|
| `muted` | boolean | no | default `true` |

**Response 200**

Returns [Forum](#forum)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /forums/{id}

<a id="get-forums-id-"></a>**Forum details**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [Forum](#forum)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PATCH /forums/{id}

<a id="patch-forums-id-"></a>**Edit a forum (owner, moderator)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | min 3 chars, max 80 chars |
| `about` | string | no | max 1000 chars |
| `coverUrl` | string (uri) \| null | no | max 2048 chars |
| `visibility` | `public` \| `private` | no |  |
| `topicIds` | string (uuid)[] | no | max 5 items |

**Response 200**

Returns [Forum](#forum)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /forums/{id}

<a id="delete-forums-id-"></a>**Delete a forum (owner)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /forums/{id}/join

<a id="post-forums-id-join"></a>**Join a public forum**

- **Access:** Signed in, **onboarding complete**, not restricted

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [Forum](#forum)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 ONBOARDING_REQUIRED`, `403 FORBIDDEN` (account restricted), `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /forums/{id}/join

<a id="delete-forums-id-join"></a>**Leave a forum**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /forums/{id}/members

<a id="get-forums-id-members"></a>**Forum members**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | object[] |  |
| `data[].id` | string (uuid) |  |
| `data[].fullName` | string |  |
| `data[].username` | string \| null |  |
| `data[].avatarUrl` | string \| null |  |
| `data[].headline` | string \| null |  |
| `data[].memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null |  |
| `data[].verified` | boolean | Role verified by an admin (show the verified badge) |
| `data[].role` | `owner` \| `moderator` \| `member` |  |
| `data[].joinedAt` | string |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /forums/{id}/members

<a id="post-forums-id-members"></a>**Add a member or set a role (owner, moderator)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | string (uuid) | **yes** |  |
| `role` | `moderator` \| `member` | no | default `"member"` |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /forums/{id}/members/{userId}

<a id="delete-forums-id-members-userid-"></a>**Remove a member (owner, moderator)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `userId` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /forums/{id}/posts

<a id="get-forums-id-posts"></a>**Posts in a forum**

- **Access:** Signed in (Bearer token)

Sort posts by: Latest (`latest`), Popular (`popular`, most likes + comments), My posts (`mine`), My replies (`my_replies`: posts I commented on).

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |
| `sort` | `latest` \| `popular` \| `mine` \| `my_replies` | no | default `"latest"` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Post](#post)[] |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

## Projects

Projects, members and join requests

### GET /projects

<a id="get-projects"></a>**Browse projects**

- **Access:** Signed in (Bearer token)

Tabs: Projects → `all` (every public project plus yours), My Projects → `mine` (projects you own) or `joined` (projects you are in). `discover`: public projects you are not in.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |
| `tab` | `all` \| `discover` \| `joined` \| `mine` | no | default `"discover"` |
| `q` | string | no | max 80 chars |
| `status` | `open` \| `ongoing` \| `completed` \| `archived` | no |  |
| `topicId` | string (uuid) | no |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [ProjectCard](#projectcard)[] |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /projects

<a id="post-projects"></a>**Create a project**

- **Access:** Signed in, **onboarding complete**, not restricted

Creates the project, makes you the owner and opens the project group chat.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | **yes** | min 3 chars, max 120 chars |
| `pitch` | string | no | max 500 chars, default `""` |
| `problem` | string | no | max 5000 chars, default `""` |
| `solution` | string | no | max 5000 chars, default `""` |
| `coverUrl` | string (uri) \| null | no | max 2048 chars |
| `videoUrl` | string (uri) \| null | no | max 2048 chars |
| `visibility` | `public` \| `private` | no | default `"public"` |
| `topicIds` | string (uuid)[] | no | max 5 items, default `[]` |

**Response 201**

Returns [Project](#project)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 ONBOARDING_REQUIRED`, `403 FORBIDDEN` (account restricted), `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /users/{id}/projects

<a id="get-users-id-projects"></a>**A user's projects (profile Projects tab)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [ProjectCard](#projectcard)[] |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /projects/{id}

<a id="get-projects-id-"></a>**Project overview**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [Project](#project)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PATCH /projects/{id}

<a id="patch-projects-id-"></a>**Edit a project (owner, admin)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | no | min 3 chars, max 120 chars |
| `pitch` | string | no | max 500 chars |
| `problem` | string | no | max 5000 chars |
| `solution` | string | no | max 5000 chars |
| `coverUrl` | string (uri) \| null | no | max 2048 chars |
| `videoUrl` | string (uri) \| null | no | max 2048 chars |
| `visibility` | `public` \| `private` | no |  |
| `topicIds` | string (uuid)[] | no | max 5 items |
| `status` | `open` \| `ongoing` \| `completed` \| `archived` | no |  |

**Response 200**

Returns [Project](#project)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /projects/{id}

<a id="delete-projects-id-"></a>**Delete a project (owner)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /projects/{id}/members

<a id="get-projects-id-members"></a>**Project members**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [ProjectMember](#projectmember)[] |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PATCH /projects/{id}/members/{userId}

<a id="patch-projects-id-members-userid-"></a>**Change a member's role or title (owner, admin)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `userId` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `role` | `admin` \| `contributor` \| `viewer` | no |  |
| `title` | string \| null | no | max 60 chars |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /projects/{id}/members/{userId}

<a id="delete-projects-id-members-userid-"></a>**Remove a member (owner, admin) or leave (yourself)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `userId` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /projects/{id}/transfer-ownership

<a id="post-projects-id-transfer-ownership"></a>**Transfer ownership to another member (owner)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /projects/{id}/join-requests

<a id="post-projects-id-join-requests"></a>**Ask to join a project**

- **Access:** Signed in, **onboarding complete**, not restricted

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `message` | string | no | max 500 chars |

**Response 201**

Returns [JoinRequest](#joinrequest)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 ONBOARDING_REQUIRED`, `403 FORBIDDEN` (account restricted), `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /projects/{id}/join-requests

<a id="get-projects-id-join-requests"></a>**Join requests (owner, admin)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `status` | `pending` \| `accepted` \| `declined` | no | default `"pending"` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [JoinRequest](#joinrequest)[] |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /projects/{id}/join-requests/mine

<a id="delete-projects-id-join-requests-mine"></a>**Cancel my pending request**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /projects/{id}/join-requests/{requestId}/accept

<a id="post-projects-id-join-requests-requestid-accept"></a>**Accept a join request (owner, admin)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `requestId` | string (uuid) | **yes** |  |

**Request body** (JSON)

*When variant 1:*

| Field | Type | Required | Notes |
|---|---|---|---|
| `role` | `contributor` \| `viewer` | no | default `"contributor"` |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /projects/{id}/join-requests/{requestId}/decline

<a id="post-projects-id-join-requests-requestid-decline"></a>**Decline a join request (owner, admin)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `requestId` | string (uuid) | **yes** |  |

**Request body** (JSON)

*When variant 1:*



**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

## Workspace

Research, prototypes, versions, evaluations, contracts, tasks, ledger

### GET /projects/{id}/research

<a id="get-projects-id-research"></a>**Research documents**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [ResearchDoc](#researchdoc)[] |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /projects/{id}/research

<a id="post-projects-id-research"></a>**Add research: write in-app or upload a file (contributor+)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

*When variant 1:*

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | `written` | **yes** |  |
| `title` | string | **yes** | min 2 chars, max 200 chars |
| `content` | any | **yes** |  |

*When variant 2:*

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | `uploaded` | **yes** |  |
| `title` | string | **yes** | min 2 chars, max 200 chars |
| `mediaId` | string (uuid) | **yes** |  |

**Response 201**

Returns [ResearchDoc](#researchdoc)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /projects/{id}/research/{docId}

<a id="get-projects-id-research-docid-"></a>**A research document**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `docId` | string (uuid) | **yes** |  |

**Response 200**

Returns [ResearchDoc](#researchdoc)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PATCH /projects/{id}/research/{docId}

<a id="patch-projects-id-research-docid-"></a>**Edit a research document (author or admin)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `docId` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | no | min 2 chars, max 200 chars |
| `content` | any | no |  |

**Response 200**

Returns [ResearchDoc](#researchdoc)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /projects/{id}/research/{docId}

<a id="delete-projects-id-research-docid-"></a>**Delete a research document (author or admin)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `docId` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /projects/{id}/prototypes

<a id="get-projects-id-prototypes"></a>**Prototypes**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Prototype](#prototype)[] |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /projects/{id}/prototypes

<a id="post-projects-id-prototypes"></a>**Create a prototype (contributor+)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | **yes** | min 2 chars, max 120 chars |
| `description` | string | no | max 2000 chars, default `""` |
| `coverUrl` | string (uri) \| null | no | max 2048 chars |

**Response 201**

Returns [Prototype](#prototype)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /projects/{id}/prototypes/{prototypeId}

<a id="get-projects-id-prototypes-prototypeid-"></a>**A prototype with its versions (newest first)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `prototypeId` | string (uuid) | **yes** |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) |  |
| `projectId` | string (uuid) |  |
| `name` | string |  |
| `description` | string |  |
| `coverUrl` | string \| null |  |
| `versionCount` | number |  |
| `latestVersionLabel` | string \| null |  |
| `createdBy` | [UserSummary](#usersummary) |  |
| `createdAt` | string |  |
| `updatedAt` | string |  |
| `versions` | [PrototypeVersion](#prototypeversion)[] |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PATCH /projects/{id}/prototypes/{prototypeId}

<a id="patch-projects-id-prototypes-prototypeid-"></a>**Edit a prototype (contributor+)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `prototypeId` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | no | min 2 chars, max 120 chars |
| `description` | string | no | max 2000 chars |
| `coverUrl` | string (uri) \| null | no | max 2048 chars |

**Response 200**

Returns [Prototype](#prototype)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /projects/{id}/prototypes/{prototypeId}

<a id="delete-projects-id-prototypes-prototypeid-"></a>**Delete a prototype (admin)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `prototypeId` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /projects/{id}/prototypes/{prototypeId}/versions

<a id="post-projects-id-prototypes-prototypeid-versions"></a>**Upload a new prototype version (contributor+)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `prototypeId` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `versionLabel` | string | **yes** | e.g. v2.1 · min 1 chars, max 30 chars |
| `notes` | string | no | max 5000 chars, default `""` |
| `mediaIds` | string (uuid)[] | **yes** | min 1 items, max 20 items |

**Response 201**

Returns [PrototypeVersion](#prototypeversion)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /projects/{id}/workspace-comments

<a id="get-projects-id-workspace-comments"></a>**Comments on a research doc or prototype version**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `targetType` | `research_doc` \| `prototype_version` | **yes** |  |
| `targetId` | string (uuid) | **yes** |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [WorkspaceComment](#workspacecomment)[] |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /projects/{id}/workspace-comments

<a id="post-projects-id-workspace-comments"></a>**Comment on a research doc or prototype version (any member)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `targetType` | `research_doc` \| `prototype_version` | **yes** |  |
| `targetId` | string (uuid) | **yes** |  |
| `body` | string | **yes** | min 1 chars, max 3000 chars |
| `parentId` | string (uuid) | no |  |

**Response 201**

Returns [WorkspaceComment](#workspacecomment)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /projects/{id}/workspace-comments/{commentId}

<a id="delete-projects-id-workspace-comments-commentid-"></a>**Delete my workspace comment (or any, as admin)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `commentId` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /projects/{id}/evaluations

<a id="get-projects-id-evaluations"></a>**Expert evaluations with averages**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `summary` | object |  |
| `summary.count` | number |  |
| `summary.feasibility` | number \| null |  |
| `summary.sustainability` | number \| null |  |
| `summary.novelty` | number \| null |  |
| `data` | [Evaluation](#evaluation)[] |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /projects/{id}/evaluations

<a id="post-projects-id-evaluations"></a>**Submit an expert evaluation (verified researchers and professionals)**

- **Access:** Signed in (Bearer token)

Scores 1–5 for feasibility, sustainability and novelty, plus written feedback. Optionally tied to a research doc or prototype version.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `feasibility` | integer | **yes** | ≥ 1, ≤ 5 |
| `sustainability` | integer | **yes** | ≥ 1, ≤ 5 |
| `novelty` | integer | **yes** | ≥ 1, ≤ 5 |
| `feedback` | string | **yes** | min 10 chars, max 5000 chars |
| `researchDocId` | string (uuid) | no |  |
| `prototypeVersionId` | string (uuid) | no |  |

**Response 201**

Returns [Evaluation](#evaluation)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PATCH /projects/{id}/evaluations/{evaluationId}

<a id="patch-projects-id-evaluations-evaluationid-"></a>**Edit my evaluation**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `evaluationId` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `feasibility` | integer | no | ≥ 1, ≤ 5 |
| `sustainability` | integer | no | ≥ 1, ≤ 5 |
| `novelty` | integer | no | ≥ 1, ≤ 5 |
| `feedback` | string | no | min 10 chars, max 5000 chars |
| `researchDocId` | string (uuid) | no |  |
| `prototypeVersionId` | string (uuid) | no |  |

**Response 200**

Returns [Evaluation](#evaluation)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /projects/{id}/evaluations/{evaluationId}

<a id="delete-projects-id-evaluations-evaluationid-"></a>**Delete my evaluation**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `evaluationId` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /projects/{id}/contracts

<a id="get-projects-id-contracts"></a>**Contracts (file links are signed, valid 1 hour)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Contract](#contract)[] |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /projects/{id}/contracts

<a id="post-projects-id-contracts"></a>**Upload a contract (admin)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | **yes** | min 2 chars, max 200 chars |
| `description` | string | no | max 2000 chars, default `""` |
| `mediaId` | string (uuid) | **yes** |  |

**Response 201**

Returns [Contract](#contract)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PATCH /projects/{id}/contracts/{contractId}

<a id="patch-projects-id-contracts-contractid-"></a>**Update a contract (admin)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `contractId` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | no | min 2 chars, max 200 chars |
| `description` | string | no | max 2000 chars |
| `status` | `draft` \| `sent` \| `signed` \| `void` | no |  |

**Response 200**

Returns [Contract](#contract)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /projects/{id}/contracts/{contractId}

<a id="delete-projects-id-contracts-contractid-"></a>**Delete a contract (admin)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `contractId` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /projects/{id}/tasks

<a id="get-projects-id-tasks"></a>**Tasks**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `status` | `todo` \| `done` | no |  |
| `assignee` | `me` \| `anyone` | no | default `"anyone"` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Task](#task)[] |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /projects/{id}/tasks

<a id="post-projects-id-tasks"></a>**Create a task (contributor+)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | **yes** | min 2 chars, max 200 chars |
| `description` | string | no | max 3000 chars, default `""` |
| `dueDate` | string (date) \| null | no |  |
| `assigneeId` | string (uuid) \| null | no |  |

**Response 201**

Returns [Task](#task)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PATCH /projects/{id}/tasks/{taskId}

<a id="patch-projects-id-tasks-taskid-"></a>**Update a task or mark it done (contributor+)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `taskId` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | no | min 2 chars, max 200 chars |
| `description` | string | no | max 3000 chars |
| `dueDate` | string (date) \| null | no |  |
| `assigneeId` | string (uuid) \| null | no |  |
| `status` | `todo` \| `done` | no |  |

**Response 200**

Returns [Task](#task)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /projects/{id}/tasks/{taskId}

<a id="delete-projects-id-tasks-taskid-"></a>**Delete a task (creator or admin)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `taskId` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /projects/{id}/ledger

<a id="get-projects-id-ledger"></a>**Project activity ledger (newest first)**

- **Access:** Signed in (Bearer token)

Live updates: subscribe to the Supabase Realtime private channel `project:<id>`, event `ledger:new`.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |
| `type` | string | no |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [LedgerEntry](#ledgerentry)[] |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /projects/{id}/notification-settings

<a id="get-projects-id-notification-settings"></a>**My notification settings for this project**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [ProjectNotificationSettings](#projectnotificationsettings)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PUT /projects/{id}/notification-settings

<a id="put-projects-id-notification-settings"></a>**Update my notification settings for this project**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

Schema: [ProjectNotificationSettings](#projectnotificationsettings)

| Field | Type | Required | Notes |
|---|---|---|---|
| `chat` | boolean | no |  |
| `tasks` | boolean | no |  |
| `research` | boolean | no |  |
| `prototypes` | boolean | no |  |
| `evaluations` | boolean | no |  |
| `members` | boolean | no |  |

**Response 200**

Returns [ProjectNotificationSettings](#projectnotificationsettings)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

## Chat

Direct and project conversations, online status, search in chat

### GET /conversations

<a id="get-conversations"></a>**My conversations (most recent first)**

- **Access:** Signed in (Bearer token)

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |
| `filter` | `all` \| `direct` \| `project` \| `unread` | no | default `"all"` |
| `q` | string | no | max 80 chars |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Conversation](#conversation)[] |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /conversations/unread-count

<a id="get-conversations-unread-count"></a>**Total unread messages (badge)**

- **Access:** Signed in (Bearer token)

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `count` | number |  |

**Errors to handle:** `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /conversations/direct

<a id="post-conversations-direct"></a>**Open (or create) a direct conversation with a user**

- **Access:** Signed in, **onboarding complete**, not restricted

Respects the other user's message permission setting (everyone, people they follow, nobody).

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | string (uuid) | **yes** |  |

**Response 200**

Returns [Conversation](#conversation)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 ONBOARDING_REQUIRED`, `403 FORBIDDEN` (account restricted), `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /conversations/{id}

<a id="get-conversations-id-"></a>**Conversation details with members**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) |  |
| `kind` | `direct` \| `project` |  |
| `title` | string |  |
| `avatarUrl` | string \| null |  |
| `otherUser` | [UserSummary](#usersummary) \| null |  |
| `otherUserProfile` | object \| null | Direct chats: the profile card at the top of the conversation (followers, collaborations, online) |
| `project` | object \| null |  |
| `lastMessagePreview` | string \| null |  |
| `lastMessageAt` | string \| null |  |
| `unreadCount` | number |  |
| `mutedUntil` | string \| null |  |
| `members` | [UserSummary](#usersummary)[] |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /conversations/{id}

<a id="delete-conversations-id-"></a>**"Delete chat history": clear the messages and remove the chat from my list**

- **Access:** Signed in (Bearer token)

For me only. The chat comes back if a new message arrives. To leave a project chat, leave the project (DELETE /projects/{id}/members/{myId}).

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /conversations/{id}/messages

<a id="get-conversations-id-messages"></a>**Messages (newest first; page backwards with the cursor)**

- **Access:** Signed in (Bearer token)

Live updates: subscribe to the Supabase Realtime private channel `conversation:<id>` (events `message:new`, `message:updated`, `message:deleted`, `read`).

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 100, default `30` |
| `q` | string | no | "Search in Chat": only messages containing this text · min 1 chars, max 80 chars |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Message](#message)[] |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /conversations/{id}/messages

<a id="post-conversations-id-messages"></a>**Send a message**

- **Access:** Signed in, **onboarding complete**, not restricted

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `body` | string | no | max 4000 chars |
| `mediaIds` | string (uuid)[] | no | max 10 items, default `[]` |
| `replyToId` | string (uuid) | no |  |
| `clientId` | string | no | Echoed in the realtime event so the sender can reconcile its optimistic message · max 64 chars |

**Response 201**

Returns [Message](#message)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 ONBOARDING_REQUIRED`, `403 FORBIDDEN` (account restricted), `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /conversations/{id}/messages

<a id="delete-conversations-id-messages"></a>**"Clear conversation history": clear messages for me only (the chat stays in my list)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PATCH /messages/{id}

<a id="patch-messages-id-"></a>**Edit my message (within 15 minutes)**

- **Access:** Signed in, **onboarding complete**, not restricted

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `body` | string | **yes** | min 1 chars, max 4000 chars |

**Response 200**

Returns [Message](#message)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 ONBOARDING_REQUIRED`, `403 FORBIDDEN` (account restricted), `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /messages/{id}

<a id="delete-messages-id-"></a>**Delete my message for everyone**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /conversations/{id}/read

<a id="post-conversations-id-read"></a>**Mark the conversation as read**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

*When variant 1:*

| Field | Type | Required | Notes |
|---|---|---|---|
| `messageId` | string (uuid) | no |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /conversations/{id}/mute

<a id="post-conversations-id-mute"></a>**Mute or unmute notifications for a conversation**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `until` | string (date-time) \| null | **yes** | null to unmute; far-future date for "always" |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

## Collaboration

Collaboration requests between members (Chats → Collaboration requests)

### POST /collaboration-requests

<a id="post-collaboration-requests"></a>**Ask someone to collaborate**

- **Access:** Signed in, **onboarding complete**, not restricted

From a profile ("Open to Collaborations"). Add `projectId` to invite them into one of your projects (you must be its owner or admin). One pending request per pair. Errors: `REQUEST_PENDING`, `ALREADY_MEMBER`, `FORBIDDEN` (blocked).

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `recipientId` | string (uuid) | **yes** |  |
| `message` | string | no | "I would like to collab with you on a project that…" · max 500 chars |
| `projectId` | string (uuid) | no |  |

**Response 201**

Returns [CollaborationRequest](#collaborationrequest)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 ONBOARDING_REQUIRED`, `403 FORBIDDEN` (account restricted), `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /collaboration-requests

<a id="get-collaboration-requests"></a>**My collaboration requests (Chats → Sort by: Collaboration requests)**

- **Access:** Signed in (Bearer token)

`box=received` (default) for the requests list with Decline / View request; `box=sent` for requests I sent.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |
| `box` | `received` \| `sent` | no | default `"received"` |
| `status` | `pending` \| `all` | no | default `"pending"` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [CollaborationRequest](#collaborationrequest)[] |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /collaboration-requests/pending-count

<a id="get-collaboration-requests-pending-count"></a>**Pending requests I received (badge)**

- **Access:** Signed in (Bearer token)

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `count` | number |  |

**Errors to handle:** `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /collaboration-requests/{id}

<a id="get-collaboration-requests-id-"></a>**A collaboration request ("View request")**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [CollaborationRequest](#collaborationrequest)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /collaboration-requests/{id}

<a id="delete-collaboration-requests-id-"></a>**Cancel a request I sent**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /collaboration-requests/{id}/accept

<a id="post-collaboration-requests-id-accept"></a>**Accept Request**

- **Access:** Signed in (Bearer token)

Opens the direct chat with the sender (with a "now collaborating" message) and returns its `conversationId`. A project invite also adds you to that project as a contributor.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [CollaborationRequest](#collaborationrequest)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /collaboration-requests/{id}/decline

<a id="post-collaboration-requests-id-decline"></a>**Decline a request**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [CollaborationRequest](#collaborationrequest)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

## Explore

Suggested for you, events, featured innovations, community highlights

### GET /events

<a id="get-events"></a>**Events**

- **Access:** Signed in (Bearer token)

Explore → Events: Upcoming Events → `upcoming` (soonest first), Concluded → `concluded` (same as `past`, most recent first), `going` (events I RSVP’d to). `q` searches title, venue and organizer. Event view: GET /events/{id}; the Register button opens `registrationUrl`.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `when` | `upcoming` \| `concluded` \| `past` \| `going` | no | default `"upcoming"` |
| `category` | `hackathon` \| `workshop` \| `bootcamp` \| `networking_fair` \| `meetup` \| `conference` \| `webinar` \| `other` | no | Dashboard event types: hackathon, workshop, bootcamp, networking_fair (Networking / showcase fair) |
| `q` | string | no | max 80 chars |
| `from` | string (date-time) | no | Calendar range start |
| `to` | string (date-time) | no | Calendar range end |
| `limit` | integer | no | ≥ 1, ≤ 100, default `20` |
| `offset` | integer | no | ≥ 0, ≤ 9007199254740991, default `0` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Event](#event)[] |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /events/{id}

<a id="get-events-id-"></a>**Event details**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [Event](#event)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### PUT /events/{id}/rsvp

<a id="put-events-id-rsvp"></a>**RSVP to an event (going / interested)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | `going` \| `interested` | **yes** |  |

**Response 200**

Returns [Event](#event)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /events/{id}/rsvp

<a id="delete-events-id-rsvp"></a>**Remove my RSVP**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /featured

<a id="get-featured"></a>**Featured innovations (curated by admins)**

- **Access:** Signed in (Bearer token)

Explore → Featured Innovation. "Sort topics" → `topicIds` (comma-separated; items on any of them). "Reset" → omit it.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `topicIds` | string | no |  |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [FeaturedInnovation](#featuredinnovation)[] |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /featured/{id}

<a id="get-featured-id-"></a>**Featured innovation details (Featured View)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [FeaturedInnovation](#featuredinnovation)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /highlights

<a id="get-highlights"></a>**Community highlights**

- **Access:** Signed in (Bearer token)

Explore → Community Highlights (albums, newest first). "More like this" on an album: `exclude={id}` (add `eventId` for albums of the same event). `q` searches titles and captions.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |
| `q` | string | no | max 80 chars |
| `eventId` | string (uuid) | no |  |
| `exclude` | string (uuid) | no |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Highlight](#highlight)[] |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /highlights/{id}

<a id="get-highlights-id-"></a>**A highlight album (expand image view)**

- **Access:** Signed in (Bearer token)

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [Highlight](#highlight)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `404 NOT_FOUND`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /explore/suggested

<a id="get-explore-suggested"></a>**Explore → "Suggested for you"**

- **Access:** Signed in (Bearer token)

Picked from your interest topics: public projects and forums you are not in, people to follow, and the next upcoming events. Falls back to the most popular when nothing matches.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `limit` | integer | no | ≥ 1, ≤ 20, default `6` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `projects` | [ProjectCard](#projectcard)[] |  |
| `forums` | [Forum](#forum)[] |  |
| `people` | object[] |  |
| `people[].id` | string (uuid) |  |
| `people[].fullName` | string |  |
| `people[].username` | string \| null |  |
| `people[].avatarUrl` | string \| null |  |
| `people[].headline` | string \| null |  |
| `people[].memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null |  |
| `people[].verified` | boolean | Role verified by an admin (show the verified badge) |
| `people[].followerCount` | number |  |
| `events` | [Event](#event)[] |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

## Notifications

In-app notifications and push tokens

### GET /notifications

<a id="get-notifications"></a>**List my notifications**

- **Access:** Signed in (Bearer token)

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `cursor` | string (uuid) | no | Opaque cursor from the previous page (`nextCursor`) |
| `limit` | integer | no | ≥ 1, ≤ 50, default `20` |
| `filter` | `all` \| `unread` | no | default `"all"` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Notification](#notification)[] |  |
| `nextCursor` | string (uuid) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### GET /notifications/unread-count

<a id="get-notifications-unread-count"></a>**Unread count for the sidebar badge**

- **Access:** Signed in (Bearer token)

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `count` | number |  |

**Errors to handle:** `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /notifications/read

<a id="post-notifications-read"></a>**Mark notifications as read**

- **Access:** Signed in (Bearer token)

**Request body** (JSON)

*When variant 1:*

| Field | Type | Required | Notes |
|---|---|---|---|
| `ids` | string (uuid)[] | **yes** | min 1 items, max 100 items |

*When variant 2:*

| Field | Type | Required | Notes |
|---|---|---|---|
| `all` | `true` | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### POST /push-tokens

<a id="post-push-tokens"></a>**Register an Expo push token for this device**

- **Access:** Signed in (Bearer token)

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `token` | string | **yes** | min 10 chars, max 300 chars |
| `platform` | `ios` \| `android` \| `web` | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

### DELETE /push-tokens

<a id="delete-push-tokens"></a>**Remove a push token (on logout)**

- **Access:** Signed in (Bearer token)

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `token` | string | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

## Reports

Report content or users

### POST /reports

<a id="post-reports"></a>**Report a post, comment, forum, project, message or user**

- **Access:** Signed in (Bearer token)

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `targetType` | `post` \| `comment` \| `forum` \| `project` \| `user` \| `message` | **yes** |  |
| `targetId` | string (uuid) | **yes** |  |
| `reason` | `spam` \| `scam` \| `harassment` \| `insults` \| `hate` \| `misinformation` \| `nudity` \| `violence` \| `intellectual_property` \| `other` | **yes** | Report Post options → value: Spam or misleading content → spam · Harassment or bullying → harassment · Hate or abusive content → hate · Intellectual property violation → intellectual_property · Violence or harmful content → violence · False or misleading information → misinformation · Scam or fraudulent activity → scam |
| `details` | string | no | max 1000 chars |

**Response 201**

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) |  |
| `message` | string |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `429 RATE_LIMITED`, `503 MAINTENANCE`

---

## Admin

Dashboard, moderation, role verifications (automatic decisions, overrides, re-check), users, content, events, broadcasts, settings, logs (moderator+)

### GET /admin/stats/users

<a id="get-admin-stats-users"></a>**Users page KPI cards: Total, Active, New, Blocked**

- **Access:** Staff: **moderator** or above

active = members who signed in or used the app in the range; blocked = accounts blocked in the range. `totals` are current counts.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `range` | `7d` \| `30d` \| `90d` \| `12m` | no | Reporting window; changePct compares it with the window before it · default `"30d"` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `range` | `7d` \| `30d` \| `90d` \| `12m` | Reporting window; changePct compares it with the window before it · default `"30d"` |
| `total` | [Kpi](#kpi) |  |
| `active` | [Kpi](#kpi) |  |
| `new` | [Kpi](#kpi) |  |
| `blocked` | [Kpi](#kpi) |  |
| `totals` | object |  |
| `totals.active` | number |  |
| `totals.flagged` | number |  |
| `totals.restricted` | number |  |
| `totals.suspended` | number |  |
| `totals.blocked` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### GET /admin/stats/forums

<a id="get-admin-stats-forums"></a>**Forums page KPI cards: Total, Active, Restricted, Flagged**

- **Access:** Staff: **moderator** or above

active = forums with posts in the range; restricted / flagged = forums restricted / warned in the range. `totals` are current counts by moderation status.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `range` | `7d` \| `30d` \| `90d` \| `12m` | no | Reporting window; changePct compares it with the window before it · default `"30d"` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `range` | `7d` \| `30d` \| `90d` \| `12m` | Reporting window; changePct compares it with the window before it · default `"30d"` |
| `total` | [Kpi](#kpi) |  |
| `active` | [Kpi](#kpi) |  |
| `restricted` | [Kpi](#kpi) |  |
| `flagged` | [Kpi](#kpi) |  |
| `totals` | object |  |
| `totals.active` | number |  |
| `totals.flagged` | number |  |
| `totals.restricted` | number |  |
| `totals.suspended` | number |  |
| `totals.removed` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### GET /admin/stats/projects

<a id="get-admin-stats-projects"></a>**Projects page KPI cards (Total, Active, Completed, New) and Project distribution donut**

- **Access:** Staff: **moderator** or above

active = projects with workspace activity in the range; completed = projects marked completed in the range; new = created in the range. Distribution slices do not overlap: completed, then featured, then inactive (archived, suspended, or no activity in 30 days), then in development.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `range` | `7d` \| `30d` \| `90d` \| `12m` | no | Reporting window; changePct compares it with the window before it · default `"30d"` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `range` | `7d` \| `30d` \| `90d` \| `12m` | Reporting window; changePct compares it with the window before it · default `"30d"` |
| `total` | [Kpi](#kpi) |  |
| `active` | [Kpi](#kpi) |  |
| `completed` | [Kpi](#kpi) |  |
| `new` | [Kpi](#kpi) |  |
| `distribution` | object |  |
| `distribution.featured` | object |  |
| `distribution.inDevelopment` | object |  |
| `distribution.inactive` | object |  |
| `distribution.completed` | object |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### GET /admin/stats/events

<a id="get-admin-stats-events"></a>**Events page KPI cards: Total, Active, Concluded, Upcoming**

- **Access:** Staff: **moderator** or above

Published events. Each card compares the count now with the count at the start of the range.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `range` | `7d` \| `30d` \| `90d` \| `12m` | no | Reporting window; changePct compares it with the window before it · default `"30d"` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `range` | `7d` \| `30d` \| `90d` \| `12m` | Reporting window; changePct compares it with the window before it · default `"30d"` |
| `total` | [Kpi](#kpi) |  |
| `active` | [Kpi](#kpi) |  |
| `concluded` | [Kpi](#kpi) |  |
| `upcoming` | [Kpi](#kpi) |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### GET /admin/settings

<a id="get-admin-settings"></a>**Platform settings**

- **Access:** Staff: **moderator** or above

**Response 200**

Returns [PlatformSettings](#platformsettings)

**Errors to handle:** `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### PATCH /admin/settings

<a id="patch-admin-settings"></a>**Update platform settings (admin)**

- **Access:** Staff: **admin** or above

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `imageOptimization` | boolean | no |  |

**Response 200**

Returns [PlatformSettings](#platformsettings)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### GET /admin/maintenance

<a id="get-admin-maintenance"></a>**Maintenance windows**

- **Access:** Staff: **moderator** or above

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | ≥ 1, ≤ 9007199254740991, default `1` |
| `pageSize` | integer | no | ≥ 1, ≤ 100, default `15` |
| `state` | `upcoming` \| `past` \| `all` | no | upcoming = scheduled or active · default `"all"` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [MaintenanceWindow](#maintenancewindow)[] |  |
| `page` | number |  |
| `pageSize` | number |  |
| `total` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### POST /admin/maintenance

<a id="post-admin-maintenance"></a>**Schedule maintenance (admin)**

- **Access:** Staff: **admin** or above

Settings → Maintenance → Schedule maintenance. Emails `message` to every member ahead of time (`notifyUsers`, default true). GET /app-config exposes the window to the apps for a banner, and with `disableAccess` the API returns `503 MAINTENANCE` to members while it runs.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `message` | string | **yes** | "Message users": emailed to every member · min 3 chars, max 2000 chars |
| `startsAt` | string (date-time) | **yes** | Start date |
| `endsAt` | string (date-time) | **yes** | End date (estimate) |
| `disableAccess` | boolean | no | "Disable CommUniti during maintenance period?" Members get 503 MAINTENANCE while it runs; staff keep access · default `false` |
| `notifyUsers` | boolean | no | default `true` |

**Response 201**

Returns [MaintenanceWindow](#maintenancewindow)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### PATCH /admin/maintenance/{id}

<a id="patch-admin-maintenance-id-"></a>**Edit a maintenance window (admin)**

- **Access:** Staff: **admin** or above

Use it to extend the end date or turn access back on early. Members are not emailed again.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `message` | string | no | "Message users": emailed to every member · min 3 chars, max 2000 chars |
| `startsAt` | string (date-time) | no | Start date |
| `endsAt` | string (date-time) | no | End date (estimate) |
| `disableAccess` | boolean | no |  |

**Response 200**

Returns [MaintenanceWindow](#maintenancewindow)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### DELETE /admin/maintenance/{id}

<a id="delete-admin-maintenance-id-"></a>**Cancel a maintenance window (admin)**

- **Access:** Staff: **admin** or above

Ends it immediately if it is running.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### GET /admin/verifications

<a id="get-admin-verifications"></a>**Role verifications (automatic decisions and overrides)**

- **Access:** Staff: **moderator** or above

Forms submitted from onboarding or Settings, newest first. Forms are verified automatically on submit, so `status` defaults to `all`; `pending` only holds forms from before automatic verification (the daily job clears them). `decidedBy` filters automatic vs admin decisions, `maxTrust` lists low-evidence verifications worth a look, `q` matches name or email.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | ≥ 1, ≤ 9007199254740991, default `1` |
| `pageSize` | integer | no | ≥ 1, ≤ 100, default `15` |
| `status` | `pending` \| `verified` \| `rejected` \| `all` | no | default `"all"` |
| `memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` | no | Current roles: researcher, innovator, professional, learner. Legacy (existing accounts only): expert, investor, student |
| `decidedBy` | `auto` \| `admin` | no |  |
| `maxTrust` | integer | no | Only verifications with trustScore at or below this · ≥ 0, ≤ 100 |
| `q` | string | no | max 100 chars |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [AdminVerification](#adminverification)[] |  |
| `page` | number |  |
| `pageSize` | number |  |
| `total` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### GET /admin/verifications/{userId}

<a id="get-admin-verifications-userid-"></a>**A member's verification form, evidence and automatic checks**

- **Access:** Staff: **moderator** or above

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `userId` | string (uuid) | **yes** |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` | Current roles: researcher, innovator, professional, learner. Legacy (existing accounts only): expert, investor, student |
| `status` | `unverified` \| `pending` \| `verified` \| `rejected` | Role verification: unverified (no role form), verified (passed automatic verification or approved by an admin), rejected (refused or revoked by an admin; resubmit with PUT /me/role), pending (legacy: submitted before automatic verification, cleared by the daily job) |
| `details` | [VerificationDetails](#verificationdetails) |  |
| `files` | [Media](#media)[] | Uploaded evidence (signed links, valid 1 hour) |
| `submittedAt` | string |  |
| `reviewedAt` | string \| null | When the current decision was made |
| `reviewNote` | string \| null | Why it was rejected, when rejected |
| `decidedBy` | `auto` \| `admin` \| null | `auto`: automatic verification on submit · `admin`: an admin decided |
| `user` | object |  |
| `user.id` | string (uuid) |  |
| `user.fullName` | string |  |
| `user.username` | string \| null |  |
| `user.avatarUrl` | string \| null |  |
| `user.headline` | string \| null |  |
| `user.memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null |  |
| `user.verified` | boolean | Role verified by an admin (show the verified badge) |
| `user.email` | string |  |
| `trustScore` | number \| null |  |
| `autoChecks` | [AutoVerification](#autoverification) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### POST /admin/verifications/{userId}/recheck

<a id="post-admin-verifications-userid-recheck"></a>**Re-run automatic verification on a stored form**

- **Access:** Staff: **moderator** or above

Useful after a lookup was inconclusive (a site or ORCID was down) or for forms from before automatic verification. The member is notified only when the status changes.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `userId` | string (uuid) | **yes** |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` | Current roles: researcher, innovator, professional, learner. Legacy (existing accounts only): expert, investor, student |
| `status` | `unverified` \| `pending` \| `verified` \| `rejected` | Role verification: unverified (no role form), verified (passed automatic verification or approved by an admin), rejected (refused or revoked by an admin; resubmit with PUT /me/role), pending (legacy: submitted before automatic verification, cleared by the daily job) |
| `details` | [VerificationDetails](#verificationdetails) |  |
| `files` | [Media](#media)[] | Uploaded evidence (signed links, valid 1 hour) |
| `submittedAt` | string |  |
| `reviewedAt` | string \| null | When the current decision was made |
| `reviewNote` | string \| null | Why it was rejected, when rejected |
| `decidedBy` | `auto` \| `admin` \| null | `auto`: automatic verification on submit · `admin`: an admin decided |
| `trustScore` | number \| null |  |
| `autoChecks` | [AutoVerification](#autoverification) \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### POST /admin/verifications/{userId}/approve

<a id="post-admin-verifications-userid-approve"></a>**Approve a role verification (override: member gets the verified badge)**

- **Access:** Staff: **moderator** or above

Overrides the automatic decision: approve a rejected form, or reject (revoke) a verified one. Returns 409 when the form already has that status. The member is emailed and notified in-app. Rejected members can fix their details and submit again (PUT /me/role).

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `userId` | string (uuid) | **yes** |  |

**Request body** (JSON)

*When variant 1:*

| Field | Type | Required | Notes |
|---|---|---|---|
| `note` | string | no | max 1000 chars |

**Response 200**

Returns [Verification](#verification)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### POST /admin/verifications/{userId}/reject

<a id="post-admin-verifications-userid-reject"></a>**Reject or revoke a role verification (override)**

- **Access:** Staff: **moderator** or above

Overrides the automatic decision: approve a rejected form, or reject (revoke) a verified one. Returns 409 when the form already has that status. The member is emailed and notified in-app. Rejected members can fix their details and submit again (PUT /me/role).

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `userId` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `note` | string | **yes** | min 3 chars, max 1000 chars |

**Response 200**

Returns [Verification](#verification)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### GET /admin/stats/overview

<a id="get-admin-stats-overview"></a>**KPI cards: users, activity, content, moderation**

- **Access:** Staff: **moderator** or above

Overview page. `cards` are the four KPI cards (Total Users, Active Events, Active Forums, Active Projects) for the chosen `range`, each with `changePct` against the previous window. The flat fields are kept for existing clients.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `range` | `7d` \| `30d` \| `90d` \| `12m` | no | Reporting window; changePct compares it with the window before it · default `"30d"` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `range` | `7d` \| `30d` \| `90d` \| `12m` | Reporting window; changePct compares it with the window before it · default `"30d"` |
| `cards` | object |  |
| `cards.totalUsers` | [Kpi](#kpi) |  |
| `cards.activeEvents` | [Kpi](#kpi) |  |
| `cards.activeForums` | [Kpi](#kpi) |  |
| `cards.activeProjects` | [Kpi](#kpi) |  |
| `totalUsers` | number |  |
| `newUsers7d` | number |  |
| `newUsersPrev7d` | number |  |
| `activeUsers30d` | number |  |
| `totalPosts` | number |  |
| `posts7d` | number |  |
| `totalProjects` | number |  |
| `totalForums` | number |  |
| `pendingReports` | number |  |
| `suspendedUsers` | number |  |
| `blockedUsers` | number |  |
| `pendingVerifications` | number | Role forms still waiting from before automatic verification (cleared by the daily job). Normally 0 |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### GET /admin/stats/user-activity

<a id="get-admin-stats-user-activity"></a>**Activity over time (User Activity, Forum Activity charts)**

- **Access:** Staff: **moderator** or above

One series per chart: `signups` (Users per day), `forumPosts` (Forum Activity), `forumsCreated`, `projectsCreated`, `posts`. `range` is an alias of `period`.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `period` | `7d` \| `30d` \| `90d` \| `12m` | no | default `"30d"` |
| `range` | `7d` \| `30d` \| `90d` \| `12m` | no |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `bucket` | `day` \| `month` |  |
| `data` | object[] |  |
| `data[].date` | string |  |
| `data[].signups` | number |  |
| `data[].posts` | number |  |
| `data[].forumPosts` | number |  |
| `data[].forumsCreated` | number |  |
| `data[].projectsCreated` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### GET /admin/users

<a id="get-admin-users"></a>**Users table (search, filter, paginate)**

- **Access:** Staff: **moderator** or above

`q` matches name, email, username or the short user id.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | ≥ 1, ≤ 9007199254740991, default `1` |
| `pageSize` | integer | no | ≥ 1, ≤ 100, default `15` |
| `q` | string | no | max 100 chars |
| `status` | `active` \| `flagged` \| `restricted` \| `suspended` \| `blocked` | no |  |
| `role` | `member` \| `moderator` \| `admin` \| `super_admin` | no |  |
| `memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` | no | Current roles: researcher, innovator, professional, learner. Legacy (existing accounts only): expert, investor, student |
| `verificationStatus` | `unverified` \| `pending` \| `verified` \| `rejected` | no |  |
| `sort` | `newest` \| `oldest` \| `most_reported` | no | default `"newest"` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [AdminUser](#adminuser)[] |  |
| `page` | number |  |
| `pageSize` | number |  |
| `total` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### GET /admin/users/{id}

<a id="get-admin-users-id-"></a>**User details panel with report history and moderation history**

- **Access:** Staff: **moderator** or above

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `id` | string (uuid) |  |
| `fullName` | string |  |
| `username` | string \| null |  |
| `avatarUrl` | string \| null |  |
| `headline` | string \| null |  |
| `memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null |  |
| `verified` | boolean | Role verified by an admin (show the verified badge) |
| `shortId` | string | User Id column: last 8 hex characters of id |
| `verificationStatus` | `unverified` \| `pending` \| `verified` \| `rejected` | Role verification (review in /admin/verifications) |
| `email` | string |  |
| `emailVerified` | boolean |  |
| `platformRole` | `member` \| `moderator` \| `admin` \| `super_admin` |  |
| `status` | `active` \| `flagged` \| `restricted` \| `suspended` \| `blocked` |  |
| `statusReason` | string \| null |  |
| `statusUntil` | string \| null |  |
| `country` | string \| null |  |
| `postCount` | number |  |
| `followerCount` | number |  |
| `reportCount` | number |  |
| `lastLoginAt` | string \| null |  |
| `createdAt` | string |  |
| `bio` | string \| null |  |
| `location` | string \| null |  |
| `phone` | string \| null |  |
| `institutionalEmail` | string \| null | Expert verification |
| `researchLink` | string \| null | Expert verification |
| `researchEvidence` | string \| null | Expert verification ("Evidence of research") |
| `reportHistory` | object |  |
| `reportHistory.previousReports` | number |  |
| `reportHistory.previousWarnings` | number |  |
| `reportHistory.accountStatus` | `active` \| `flagged` \| `restricted` \| `suspended` \| `blocked` |  |
| `verification` | [Verification](#verification) \| null | The role form (all roles), with evidence files |
| `history` | object[] |  |
| `history[].id` | string (uuid) |  |
| `history[].action` | string |  |
| `history[].note` | string \| null |  |
| `history[].actor` | [UserSummary](#usersummary) \| null |  |
| `history[].expiresAt` | string \| null |  |
| `history[].createdAt` | string |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### GET /admin/users/{id}/logs

<a id="get-admin-users-id-logs"></a>**A user's account logs (admin)**

- **Access:** Staff: **admin** or above

Users → user → Account logs: sign-ins, sign-outs, email and password changes, and moderation on the account. `from`/`to` drive "Filter by date".

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | ≥ 1, ≤ 9007199254740991, default `1` |
| `pageSize` | integer | no | ≥ 1, ≤ 100, default `15` |
| `from` | string (date) | no | Filter by date: first day (inclusive), YYYY-MM-DD |
| `to` | string (date) | no | Filter by date: last day (inclusive), YYYY-MM-DD |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | object[] |  |
| `data[].id` | string (uuid) |  |
| `data[].action` | string | Raw action key, e.g. auth.login |
| `data[].label` | string | Action column, e.g. "Logged in" |
| `data[].details` | string | Details column, e.g. "changed email to jemima@inoov.com" |
| `data[].ip` | string \| null |  |
| `data[].location` | string \| null | Location column (from the edge, when available) |
| `data[].actor` | [UserSummary](#usersummary) \| null | Who did it: the user, or the moderator for moderation actions |
| `data[].createdAt` | string |  |
| `page` | number |  |
| `pageSize` | number |  |
| `total` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### POST /admin/users/{id}/status

<a id="post-admin-users-id-status"></a>**Warn, restrict, suspend, block or reinstate a user**

- **Access:** Staff: **moderator** or above

Suspend and block sign the user out everywhere. The user is emailed. Only admins can block.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `action` | `warn` \| `restrict` \| `suspend` \| `block` \| `reinstate` | **yes** |  |
| `reason` | string | no | max 1000 chars |
| `durationDays` | integer | no | For suspend/restrict; omit for indefinite · ≥ 1, ≤ 365 |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `status` | `active` \| `flagged` \| `restricted` \| `suspended` \| `blocked` |  |
| `until` | string \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### PATCH /admin/users/{id}/role

<a id="patch-admin-users-id-role"></a>**Change platform role (super admin)**

- **Access:** Staff: **super_admin** or above

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `platformRole` | `member` \| `moderator` \| `admin` \| `super_admin` | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### GET /admin/reports

<a id="get-admin-reports"></a>**Moderation queue**

- **Access:** Staff: **moderator** or above

Tabs: `status=all|pending|reviewed|dismissed` (default pending). The Users, Forums and Projects pages each show their own queue: `targetType=user|post|comment` / `forum` / `project` (comma-separated lists are allowed, e.g. `targetType=user,post,comment`). `q` searches the reported person, forum name, project title or report number.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | ≥ 1, ≤ 9007199254740991, default `1` |
| `pageSize` | integer | no | ≥ 1, ≤ 100, default `15` |
| `status` | `all` \| `pending` \| `reviewed` \| `dismissed` | no | default `"pending"` |
| `targetType` | string | no | post \| comment \| forum \| project \| user \| message, or a comma-separated list |
| `reason` | `spam` \| `scam` \| `harassment` \| `insults` \| `hate` \| `misinformation` \| `nudity` \| `violence` \| `intellectual_property` \| `other` | no | Report Post options → value: Spam or misleading content → spam · Harassment or bullying → harassment · Hate or abusive content → hate · Intellectual property violation → intellectual_property · Violence or harmful content → violence · False or misleading information → misinformation · Scam or fraudulent activity → scam |
| `q` | string | no | max 100 chars |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [AdminReport](#adminreport)[] |  |
| `page` | number |  |
| `pageSize` | number |  |
| `total` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### GET /admin/reports/{id}

<a id="get-admin-reports-id-"></a>**Review Report panel: reported content, details and history**

- **Access:** Staff: **moderator** or above

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [AdminReportDetail](#adminreportdetail)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### POST /admin/reports/{id}/action

<a id="post-admin-reports-id-action"></a>**Resolve a report**

- **Access:** Staff: **moderator** or above

`dismiss` closes it. `remove_content` hides the item (for a forum or project this is **Delete Forum / Delete Project**). `warn` / `restrict` / `suspend` / `block` act on the content owner by default. For forum and project reports, `warn`, `restrict` and `suspend` act on the forum/project itself (Send warning, Suspend Forum); pass `applyTo: "owner"` to act on its owner instead. `block` always blocks the owner (admins only). Add `removeContent: true` to also hide the item. Other pending reports on the same item are resolved too.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `action` | `dismiss` \| `remove_content` \| `warn` \| `restrict` \| `suspend` \| `block` | **yes** |  |
| `applyTo` | `target` \| `owner` | no | Forum/project reports only. Default: target |
| `removeContent` | boolean | no | default `false` |
| `note` | string | no | The reason typed in the confirmation modal · max 1000 chars |
| `durationDays` | integer | no | ≥ 1, ≤ 365 |

**Response 200**

Returns [AdminReportDetail](#adminreportdetail)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### POST /admin/content/{type}/{id}/remove

<a id="post-admin-content-type-id-remove"></a>**Remove content (hide from members)**

- **Access:** Staff: **moderator** or above

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `type` | `post` \| `comment` \| `forum` \| `project` | **yes** |  |
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

*When variant 1:*

| Field | Type | Required | Notes |
|---|---|---|---|
| `note` | string | no | max 1000 chars |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### POST /admin/content/{type}/{id}/restore

<a id="post-admin-content-type-id-restore"></a>**Restore removed content**

- **Access:** Staff: **moderator** or above

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `type` | `post` \| `comment` \| `forum` \| `project` | **yes** |  |
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

*When variant 1:*

| Field | Type | Required | Notes |
|---|---|---|---|
| `note` | string | no | max 1000 chars |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### GET /admin/content/posts

<a id="get-admin-content-posts"></a>**Posts table**

- **Access:** Staff: **moderator** or above

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | ≥ 1, ≤ 9007199254740991, default `1` |
| `pageSize` | integer | no | ≥ 1, ≤ 100, default `15` |
| `q` | string | no | max 100 chars |
| `state` | `live` \| `removed` \| `all` | no | default `"all"` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | object[] |  |
| `data[].id` | string (uuid) |  |
| `data[].body` | string |  |
| `data[].author` | [UserSummary](#usersummary) |  |
| `data[].likeCount` | number |  |
| `data[].commentCount` | number |  |
| `data[].removedAt` | string \| null |  |
| `data[].createdAt` | string |  |
| `page` | number |  |
| `pageSize` | number |  |
| `total` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### GET /admin/forums

<a id="get-admin-forums"></a>**All Forums table**

- **Access:** Staff: **moderator** or above

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | ≥ 1, ≤ 9007199254740991, default `1` |
| `pageSize` | integer | no | ≥ 1, ≤ 100, default `15` |
| `q` | string | no | max 100 chars |
| `status` | `active` \| `flagged` \| `restricted` \| `suspended` \| `removed` | no | `removed` = deleted by moderators |
| `sort` | `newest` \| `oldest` \| `most_members` \| `most_reported` | no | default `"newest"` |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | object[] |  |
| `data[].id` | string (uuid) |  |
| `data[].shortId` | string | Forum Id / Project Id column |
| `data[].name` | string |  |
| `data[].coverUrl` | string \| null |  |
| `data[].owner` | [UserSummary](#usersummary) |  |
| `data[].memberCount` | number |  |
| `data[].reportCount` | number |  |
| `data[].visibility` | string |  |
| `data[].moderationStatus` | `active` \| `flagged` \| `restricted` \| `suspended` | Status pill: active, flagged (warned), restricted, suspended |
| `data[].moderationReason` | string \| null |  |
| `data[].moderationUntil` | string \| null |  |
| `data[].removedAt` | string \| null | Set when deleted by a moderator (or while suspended) |
| `data[].createdAt` | string |  |
| `page` | number |  |
| `pageSize` | number |  |
| `total` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### GET /admin/projects

<a id="get-admin-projects"></a>**All projects table**

- **Access:** Staff: **moderator** or above

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | ≥ 1, ≤ 9007199254740991, default `1` |
| `pageSize` | integer | no | ≥ 1, ≤ 100, default `15` |
| `q` | string | no | max 100 chars |
| `status` | `active` \| `flagged` \| `restricted` \| `suspended` \| `removed` | no | `removed` = deleted by moderators |
| `sort` | `newest` \| `oldest` \| `most_members` \| `most_reported` | no | default `"newest"` |
| `projectStatus` | `open` \| `ongoing` \| `completed` \| `archived` | no |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | object[] |  |
| `data[].id` | string (uuid) |  |
| `data[].shortId` | string | Forum Id / Project Id column |
| `data[].name` | string |  |
| `data[].coverUrl` | string \| null |  |
| `data[].owner` | [UserSummary](#usersummary) |  |
| `data[].memberCount` | number |  |
| `data[].reportCount` | number |  |
| `data[].visibility` | string |  |
| `data[].moderationStatus` | `active` \| `flagged` \| `restricted` \| `suspended` | Status pill: active, flagged (warned), restricted, suspended |
| `data[].moderationReason` | string \| null |  |
| `data[].moderationUntil` | string \| null |  |
| `data[].removedAt` | string \| null | Set when deleted by a moderator (or while suspended) |
| `data[].createdAt` | string |  |
| `data[].status` | string | Project lifecycle: open, ongoing, completed, archived |
| `data[].featuredAt` | string \| null |  |
| `page` | number |  |
| `pageSize` | number |  |
| `total` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### POST /admin/forums/{id}/status

<a id="post-admin-forums-id-status"></a>**Warn, restrict, suspend or reinstate a forum**

- **Access:** Staff: **moderator** or above

warn → flagged (owner emailed and notified). restrict → no new members or posts. suspend → hidden from members until reinstated or `durationDays` pass. To delete use POST /admin/content/forum/{id}/remove.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `action` | `warn` \| `restrict` \| `suspend` \| `reinstate` | **yes** |  |
| `reason` | string | no | max 1000 chars |
| `durationDays` | integer | no | For suspend/restrict; omit for indefinite · ≥ 1, ≤ 365 |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `status` | `active` \| `flagged` \| `restricted` \| `suspended` |  |
| `until` | string \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### POST /admin/projects/{id}/status

<a id="post-admin-projects-id-status"></a>**Warn, restrict, suspend or reinstate a project**

- **Access:** Staff: **moderator** or above

warn → flagged (owner emailed and notified). restrict → no new join requests. suspend → hidden from members until reinstated or `durationDays` pass. To delete use POST /admin/content/project/{id}/remove.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `action` | `warn` \| `restrict` \| `suspend` \| `reinstate` | **yes** |  |
| `reason` | string | no | max 1000 chars |
| `durationDays` | integer | no | For suspend/restrict; omit for indefinite · ≥ 1, ≤ 365 |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `status` | `active` \| `flagged` \| `restricted` \| `suspended` |  |
| `until` | string \| null |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### GET /admin/events

<a id="get-admin-events"></a>**All events (including drafts)**

- **Access:** Staff: **moderator** or above

Events page sections: `when=upcoming` (soonest first), `when=active` (running now), `when=concluded` (latest first). `q` searches title, venue and organizer; also used by the "Use an existing event" picker in Add Highlights.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | ≥ 1, ≤ 9007199254740991, default `1` |
| `pageSize` | integer | no | ≥ 1, ≤ 100, default `15` |
| `status` | `draft` \| `published` \| `cancelled` | no |  |
| `when` | `upcoming` \| `active` \| `concluded` | no |  |
| `category` | `hackathon` \| `workshop` \| `bootcamp` \| `networking_fair` \| `meetup` \| `conference` \| `webinar` \| `other` | no | Dashboard event types: hackathon, workshop, bootcamp, networking_fair (Networking / showcase fair) |
| `q` | string | no | max 100 chars |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Event](#event)[] |  |
| `page` | number |  |
| `pageSize` | number |  |
| `total` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### POST /admin/events

<a id="post-admin-events"></a>**Create an event (admin)**

- **Access:** Staff: **admin** or above

Add Event form → fields: cover (upload with purpose `event`, pass `coverUrl`), title, category, date range (`startsAt`/`endsAt`), location (`venue`, optional), registration link (`registrationUrl`, required), about (`description`), organized by (`organizerName`, optional `organizerLogoUrl` / `organizerTagline`). Send `status: "published"` to show it to members.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | **yes** | min 3 chars, max 160 chars |
| `category` | `hackathon` \| `workshop` \| `bootcamp` \| `networking_fair` \| `meetup` \| `conference` \| `webinar` \| `other` | no | Dashboard event types: hackathon, workshop, bootcamp, networking_fair (Networking / showcase fair) · default `"other"` |
| `summary` | string | no | max 300 chars, default `""` |
| `description` | string | no | max 10000 chars, default `""` |
| `coverUrl` | string (uri) \| null | no | max 2048 chars |
| `startsAt` | string (date-time) | **yes** |  |
| `endsAt` | string (date-time) | **yes** |  |
| `timezone` | string | no | max 60 chars, default `"Africa/Lagos"` |
| `venue` | string \| null | no | max 200 chars |
| `city` | string \| null | no | max 100 chars |
| `country` | string \| null | no | max 2 chars |
| `isOnline` | boolean | no | default `false` |
| `meetingUrl` | string (uri) \| null | no | max 2048 chars |
| `registrationUrl` | string (uri) | **yes** | Required: the Register button opens it · max 2048 chars |
| `organizerName` | string \| null | no | "Organized by", e.g. Innovation Hub · max 120 chars |
| `organizerLogoUrl` | string (uri) \| null | no | Upload with purpose `event`, then pass the publicUrl · max 2048 chars |
| `organizerTagline` | string \| null | no | Line under the organizer name, e.g. Creative Media · max 120 chars |
| `capacity` | integer \| null | no | ≤ 9007199254740991 |
| `status` | `draft` \| `published` \| `cancelled` | no | default `"draft"` |

**Response 201**

Returns [Event](#event)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### GET /admin/events/{id}

<a id="get-admin-events-id-"></a>**Event view (including drafts)**

- **Access:** Staff: **moderator** or above

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [Event](#event)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### PATCH /admin/events/{id}

<a id="patch-admin-events-id-"></a>**Edit an event (admin)**

- **Access:** Staff: **admin** or above

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | no | min 3 chars, max 160 chars |
| `category` | `hackathon` \| `workshop` \| `bootcamp` \| `networking_fair` \| `meetup` \| `conference` \| `webinar` \| `other` | no | Dashboard event types: hackathon, workshop, bootcamp, networking_fair (Networking / showcase fair) |
| `summary` | string | no | max 300 chars |
| `description` | string | no | max 10000 chars |
| `coverUrl` | string (uri) \| null | no | max 2048 chars |
| `startsAt` | string (date-time) | no |  |
| `endsAt` | string (date-time) | no |  |
| `timezone` | string | no | max 60 chars |
| `venue` | string \| null | no | max 200 chars |
| `city` | string \| null | no | max 100 chars |
| `country` | string \| null | no | max 2 chars |
| `isOnline` | boolean | no |  |
| `meetingUrl` | string (uri) \| null | no | max 2048 chars |
| `registrationUrl` | string (uri) \| null | no | max 2048 chars |
| `organizerName` | string \| null | no | "Organized by", e.g. Innovation Hub · max 120 chars |
| `organizerLogoUrl` | string (uri) \| null | no | Upload with purpose `event`, then pass the publicUrl · max 2048 chars |
| `organizerTagline` | string \| null | no | Line under the organizer name, e.g. Creative Media · max 120 chars |
| `capacity` | integer \| null | no | ≤ 9007199254740991 |
| `status` | `draft` \| `published` \| `cancelled` | no |  |

**Response 200**

Returns [Event](#event)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### DELETE /admin/events/{id}

<a id="delete-admin-events-id-"></a>**Delete an event (admin)**

- **Access:** Staff: **admin** or above

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### GET /admin/featured

<a id="get-admin-featured"></a>**Featured innovations (including unpublished)**

- **Access:** Staff: **moderator** or above

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [FeaturedInnovation](#featuredinnovation)[] |  |

**Errors to handle:** `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### POST /admin/featured

<a id="post-admin-featured"></a>**Create a featured innovation (admin)**

- **Access:** Staff: **admin** or above

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | **yes** | min 3 chars, max 160 chars |
| `summary` | string | no | max 500 chars, default `""` |
| `body` | string | no | max 10000 chars, default `""` |
| `coverUrl` | string (uri) \| null | no | max 2048 chars |
| `projectId` | string (uuid) \| null | no |  |
| `position` | integer | no | ≥ 0, ≤ 9007199254740991, default `0` |
| `topicIds` | string (uuid)[] | no | Topics for the members' "Sort topics" filter · max 5 items, default `[]` |
| `mediaIds` | string (uuid)[] | no | Gallery images (upload with purpose `featured`), in order · max 12 items, default `[]` |
| `publish` | boolean | no | default `false` |

**Response 201**

Returns [FeaturedInnovation](#featuredinnovation)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### PATCH /admin/featured/{id}

<a id="patch-admin-featured-id-"></a>**Edit or publish a featured innovation (admin)**

- **Access:** Staff: **admin** or above

Sending `topicIds` or `mediaIds` replaces them.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | no | min 3 chars, max 160 chars |
| `summary` | string | no | max 500 chars |
| `body` | string | no | max 10000 chars |
| `coverUrl` | string (uri) \| null | no | max 2048 chars |
| `projectId` | string (uuid) \| null | no |  |
| `position` | integer | no | ≥ 0, ≤ 9007199254740991 |
| `topicIds` | string (uuid)[] | no | max 5 items |
| `mediaIds` | string (uuid)[] | no | max 12 items |
| `publish` | boolean | no |  |

**Response 200**

Returns [FeaturedInnovation](#featuredinnovation)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### DELETE /admin/featured/{id}

<a id="delete-admin-featured-id-"></a>**Delete a featured innovation (admin)**

- **Access:** Staff: **admin** or above

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### GET /admin/highlights

<a id="get-admin-highlights"></a>**Highlights (including unpublished)**

- **Access:** Staff: **moderator** or above

Albums, newest first. `q` searches titles; `eventId` lists the albums of one event ("More like this").

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | ≥ 1, ≤ 9007199254740991, default `1` |
| `pageSize` | integer | no | ≥ 1, ≤ 100, default `15` |
| `q` | string | no | max 100 chars |
| `eventId` | string (uuid) | no |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Highlight](#highlight)[] |  |
| `page` | number |  |
| `pageSize` | number |  |
| `total` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### POST /admin/highlights

<a id="post-admin-highlights"></a>**Create a highlight (admin)**

- **Access:** Staff: **admin** or above

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | no | Title / Name. Optional when `eventId` is given (the event title is used) · min 3 chars, max 160 chars |
| `eventId` | string (uuid) \| null | no | "Use an existing event": any event, including past ones (GET /admin/events?q=) |
| `caption` | string | no | max 2000 chars, default `""` |
| `mediaIds` | string (uuid)[] | **yes** | Images (upload with purpose `highlight`) · min 1 items, max 20 items |
| `publish` | boolean | no | default `true` |

**Response 201**

Returns [Highlight](#highlight)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### GET /admin/highlights/{id}

<a id="get-admin-highlights-id-"></a>**Highlight view**

- **Access:** Staff: **moderator** or above

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [Highlight](#highlight)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### PATCH /admin/highlights/{id}

<a id="patch-admin-highlights-id-"></a>**Edit or publish a highlight (admin)**

- **Access:** Staff: **admin** or above

Sending `mediaIds` replaces the album's images, in that order.

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | no | Title / Name. Optional when `eventId` is given (the event title is used) · min 3 chars, max 160 chars |
| `eventId` | string (uuid) \| null | no | "Use an existing event": any event, including past ones (GET /admin/events?q=) |
| `caption` | string | no | max 2000 chars |
| `mediaIds` | string (uuid)[] | no | Images (upload with purpose `highlight`) · min 1 items, max 20 items |
| `publish` | boolean | no |  |

**Response 200**

Returns [Highlight](#highlight)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### DELETE /admin/highlights/{id}

<a id="delete-admin-highlights-id-"></a>**Delete a highlight (admin)**

- **Access:** Staff: **admin** or above

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 204** — no body

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### GET /admin/broadcasts

<a id="get-admin-broadcasts"></a>**Sent broadcasts (history)**

- **Access:** Staff: **moderator** or above

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | ≥ 1, ≤ 9007199254740991, default `1` |
| `pageSize` | integer | no | ≥ 1, ≤ 100, default `15` |
| `kind` | `announcement` \| `maintenance` | no |  |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | [Broadcast](#broadcast)[] |  |
| `page` | number |  |
| `pageSize` | number |  |
| `total` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### POST /admin/broadcasts

<a id="post-admin-broadcasts"></a>**Send a notification email to all members or a segment (admin)**

- **Access:** Staff: **admin** or above

Notifications page → Send notification. Members are alerted **by email** (`channels.email`, default true); set `channels.inApp: true` to also add it to their in-app notifications. Large audiences are emailed in batches: the response comes back after about 20 seconds at most with `status: "sending"` if emails are still queued. Continue with POST /admin/broadcasts/{id}/resume (or let the daily cron finish it). Members who turned off broadcast emails (`notificationPrefs.broadcast.email = false`), unverified and blocked accounts are skipped.

**Request body** (JSON)

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | **yes** | min 3 chars, max 120 chars |
| `body` | string | **yes** | min 1 chars, max 5000 chars |
| `audience` | object | no | default `{"platform":"all"}` |
| `audience.platform` | `all` \| `users` \| `forums` \| `projects` | no | Platform dropdown: All (Users, Forums, Projects), Users, Forums or Projects · default `"all"` |
| `audience.ids` | string (uuid)[] | no | Forum / Projects dropdown or the "IDs (optional)" field: user ids (platform users), or forum/project ids whose members receive it. Omit for everyone on that platform · max 500 items |
| `audience.memberRoles` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student`[] | no |  |
| `audience.countries` | string[] | no |  |
| `channels` | object | no | default `{"email":true,"inApp":false}` |
| `channels.email` | boolean | no | default `true` |
| `channels.inApp` | boolean | no | default `false` |

**Response 201**

Returns [Broadcast](#broadcast)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

### GET /admin/broadcasts/{id}

<a id="get-admin-broadcasts-id-"></a>**Broadcast details and delivery progress**

- **Access:** Staff: **moderator** or above

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [Broadcast](#broadcast)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### POST /admin/broadcasts/{id}/resume

<a id="post-admin-broadcasts-id-resume"></a>**Continue sending a broadcast that is still "sending" (admin)**

- **Access:** Staff: **admin** or above

**Path parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |

**Response 200**

Returns [Broadcast](#broadcast)

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `404 NOT_FOUND`, `429 RATE_LIMITED`

---

### GET /admin/audit-logs

<a id="get-admin-audit-logs"></a>**Admin logs (admin)**

- **Access:** Staff: **admin** or above

Logs page and the Overview "Admin logs" card. `label` is the Action column, `details` the Log Message column. `q` searches action, message and actor name.

**Query parameters**

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no | ≥ 1, ≤ 9007199254740991, default `1` |
| `pageSize` | integer | no | ≥ 1, ≤ 100, default `15` |
| `from` | string (date) | no | Filter by date: first day (inclusive), YYYY-MM-DD |
| `to` | string (date) | no | Filter by date: last day (inclusive), YYYY-MM-DD |
| `action` | string | no | Prefix, e.g. "auth." or "user.suspend" · max 80 chars |
| `actorId` | string (uuid) | no |  |
| `entityId` | string (uuid) | no |  |
| `q` | string | no | max 100 chars |

**Response 200**

| Field | Type | Notes |
|---|---|---|
| `data` | object[] |  |
| `data[].id` | string (uuid) |  |
| `data[].action` | string |  |
| `data[].label` | string |  |
| `data[].details` | string |  |
| `data[].entityType` | string |  |
| `data[].entityId` | string \| null |  |
| `data[].message` | string \| null |  |
| `data[].actor` | [UserSummary](#usersummary) \| null |  |
| `data[].ip` | string \| null |  |
| `data[].location` | string \| null |  |
| `data[].before` | any |  |
| `data[].after` | any |  |
| `data[].createdAt` | string |  |
| `page` | number |  |
| `pageSize` | number |  |
| `total` | number |  |

**Errors to handle:** `400 VALIDATION_FAILED` (see `error.fields`), `401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`, `403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`, `403 FORBIDDEN` (role too low), `429 RATE_LIMITED`

---

## Schemas

### Accepted

| Field | Type | Required | Notes |
|---|---|---|---|
| `message` | string | **yes** |  |

### AdminReport

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `number` | number | **yes** | Short number for "Report #2341" |
| `targetType` | `post` \| `comment` \| `forum` \| `project` \| `user` \| `message` | **yes** |  |
| `targetId` | string (uuid) | **yes** |  |
| `targetName` | string \| null | **yes** | Name / Title column: forum name, project title, or the reported person |
| `reason` | `spam` \| `scam` \| `harassment` \| `insults` \| `hate` \| `misinformation` \| `nudity` \| `violence` \| `intellectual_property` \| `other` | **yes** | Report Post options → value: Spam or misleading content → spam · Harassment or bullying → harassment · Hate or abusive content → hate · Intellectual property violation → intellectual_property · Violence or harmful content → violence · False or misleading information → misinformation · Scam or fraudulent activity → scam |
| `details` | string \| null | **yes** |  |
| `status` | `pending` \| `reviewed` \| `dismissed` | **yes** |  |
| `outcome` | `dismissed` \| `content_removed` \| `warned` \| `restricted` \| `suspended` \| `blocked` \| null | **yes** |  |
| `reportsCount` | number | **yes** | All reports on the same item (Report Details → Reports count) |
| `reporter` | [UserSummary](#usersummary) \| null | **yes** |  |
| `targetUser` | [UserSummary](#usersummary) \| null | **yes** |  |
| `preview` | string \| null | **yes** | Short excerpt of the reported content |
| `resolution` | string \| null | **yes** |  |
| `reviewedAt` | string \| null | **yes** |  |
| `createdAt` | string | **yes** |  |

### AdminReportDetail

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `number` | number | **yes** | Short number for "Report #2341" |
| `targetType` | `post` \| `comment` \| `forum` \| `project` \| `user` \| `message` | **yes** |  |
| `targetId` | string (uuid) | **yes** |  |
| `targetName` | string \| null | **yes** | Name / Title column: forum name, project title, or the reported person |
| `reason` | `spam` \| `scam` \| `harassment` \| `insults` \| `hate` \| `misinformation` \| `nudity` \| `violence` \| `intellectual_property` \| `other` | **yes** | Report Post options → value: Spam or misleading content → spam · Harassment or bullying → harassment · Hate or abusive content → hate · Intellectual property violation → intellectual_property · Violence or harmful content → violence · False or misleading information → misinformation · Scam or fraudulent activity → scam |
| `details` | string \| null | **yes** |  |
| `status` | `pending` \| `reviewed` \| `dismissed` | **yes** |  |
| `outcome` | `dismissed` \| `content_removed` \| `warned` \| `restricted` \| `suspended` \| `blocked` \| null | **yes** |  |
| `reportsCount` | number | **yes** | All reports on the same item (Report Details → Reports count) |
| `reporter` | [UserSummary](#usersummary) \| null | **yes** |  |
| `targetUser` | [UserSummary](#usersummary) \| null | **yes** |  |
| `preview` | string \| null | **yes** | Short excerpt of the reported content |
| `resolution` | string \| null | **yes** |  |
| `reviewedAt` | string \| null | **yes** |  |
| `createdAt` | string | **yes** |  |
| `content` | [ReportedContent](#reportedcontent) | **yes** |  |
| `history` | [ReportHistory](#reporthistory) | **yes** |  |

### AdminUser

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `fullName` | string | **yes** |  |
| `username` | string \| null | **yes** |  |
| `avatarUrl` | string \| null | **yes** |  |
| `headline` | string \| null | **yes** |  |
| `memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null | **yes** |  |
| `verified` | boolean | **yes** | Role verified by an admin (show the verified badge) |
| `shortId` | string | **yes** | User Id column: last 8 hex characters of id |
| `verificationStatus` | `unverified` \| `pending` \| `verified` \| `rejected` | **yes** | Role verification (review in /admin/verifications) |
| `email` | string | **yes** |  |
| `emailVerified` | boolean | **yes** |  |
| `platformRole` | `member` \| `moderator` \| `admin` \| `super_admin` | **yes** |  |
| `status` | `active` \| `flagged` \| `restricted` \| `suspended` \| `blocked` | **yes** |  |
| `statusReason` | string \| null | **yes** |  |
| `statusUntil` | string \| null | **yes** |  |
| `country` | string \| null | **yes** |  |
| `postCount` | number | **yes** |  |
| `followerCount` | number | **yes** |  |
| `reportCount` | number | **yes** |  |
| `lastLoginAt` | string \| null | **yes** |  |
| `createdAt` | string | **yes** |  |

### AdminVerification

| Field | Type | Required | Notes |
|---|---|---|---|
| `user` | object | **yes** |  |
| `user.id` | string (uuid) | **yes** |  |
| `user.fullName` | string | **yes** |  |
| `user.username` | string \| null | **yes** |  |
| `user.avatarUrl` | string \| null | **yes** |  |
| `user.headline` | string \| null | **yes** |  |
| `user.memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null | **yes** |  |
| `user.verified` | boolean | **yes** | Role verified by an admin (show the verified badge) |
| `user.email` | string | **yes** |  |
| `memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` | **yes** | Current roles: researcher, innovator, professional, learner. Legacy (existing accounts only): expert, investor, student |
| `status` | `unverified` \| `pending` \| `verified` \| `rejected` | **yes** | Role verification: unverified (no role form), verified (passed automatic verification or approved by an admin), rejected (refused or revoked by an admin; resubmit with PUT /me/role), pending (legacy: submitted before automatic verification, cleared by the daily job) |
| `details` | [VerificationDetails](#verificationdetails) | **yes** |  |
| `submittedAt` | string | **yes** |  |
| `reviewedAt` | string \| null | **yes** |  |
| `reviewNote` | string \| null | **yes** |  |
| `decidedBy` | `auto` \| `admin` \| null | **yes** |  |
| `trustScore` | number \| null | **yes** | 0–100 evidence score from automatic verification; low scores are worth a look |
| `flags` | string[] | **yes** | Checks that raised a warning, e.g. email_matches_org, link_mentions, independent_evidence |

### AppConfig

| Field | Type | Required | Notes |
|---|---|---|---|
| `imageOptimization` | boolean | **yes** | Admin Settings → Image Optimization: prefetch images ahead of time |
| `maintenance` | object \| null | **yes** | The running or next scheduled maintenance window |

### AuthUser

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `email` | string | **yes** |  |
| `emailVerified` | boolean | **yes** |  |
| `fullName` | string | **yes** |  |
| `username` | string \| null | **yes** |  |
| `avatarUrl` | string \| null | **yes** |  |
| `headline` | string \| null | **yes** |  |
| `memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null | **yes** |  |
| `verificationStatus` | `unverified` \| `pending` \| `verified` \| `rejected` | **yes** | Role verification: unverified (no role form), verified (passed automatic verification or approved by an admin), rejected (refused or revoked by an admin; resubmit with PUT /me/role), pending (legacy: submitted before automatic verification, cleared by the daily job) |
| `platformRole` | `member` \| `moderator` \| `admin` \| `super_admin` | **yes** |  |
| `status` | `active` \| `flagged` \| `restricted` \| `suspended` \| `blocked` | **yes** |  |
| `onboardingComplete` | boolean | **yes** |  |
| `hasPassword` | boolean | **yes** |  |
| `googleLinked` | boolean | **yes** |  |
| `createdAt` | string | **yes** |  |

### AutoVerification

| Field | Type | Required | Notes |
|---|---|---|---|
| `decision` | `verified` \| `rejected` | **yes** |  |
| `score` | number | **yes** |  |
| `summary` | string | **yes** |  |
| `networkChecks` | boolean | **yes** |  |
| `checkedAt` | string | **yes** |  |
| `durationMs` | number | **yes** |  |
| `checks` | [VerificationCheck](#verificationcheck)[] | **yes** |  |

### Broadcast

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `kind` | `announcement` \| `maintenance` | **yes** |  |
| `title` | string | **yes** |  |
| `body` | string | **yes** |  |
| `audience` | object | **yes** |  |
| `audience.platform` | string | no |  |
| `audience.ids` | string[] | no |  |
| `audience.memberRoles` | string[] | no |  |
| `audience.countries` | string[] | no |  |
| `channels` | object | **yes** |  |
| `channels.email` | boolean | **yes** |  |
| `channels.inApp` | boolean | **yes** |  |
| `status` | `sending` \| `sent` \| `failed` | **yes** | sending = emails still going out (resume with POST /admin/broadcasts/{id}/resume) |
| `recipientCount` | number | **yes** |  |
| `deliveredCount` | number | **yes** |  |
| `failedCount` | number | **yes** |  |
| `sentBy` | [UserSummary](#usersummary) \| null | **yes** |  |
| `sentAt` | string \| null | **yes** |  |
| `createdAt` | string | **yes** |  |

### CollaborationRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `direction` | `received` \| `sent` | **yes** |  |
| `sender` | [UserSummary](#usersummary) | **yes** |  |
| `recipient` | [UserSummary](#usersummary) | **yes** |  |
| `project` | object \| null | **yes** | Set when the sender invites you into their project |
| `message` | string \| null | **yes** |  |
| `status` | `pending` \| `accepted` \| `declined` \| `cancelled` | **yes** |  |
| `conversationId` | string (uuid) \| null | **yes** | Direct chat opened when the request was accepted |
| `createdAt` | string | **yes** |  |
| `decidedAt` | string \| null | **yes** |  |

### Comment

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `postId` | string (uuid) | **yes** |  |
| `parentId` | string (uuid) \| null | **yes** |  |
| `author` | [UserSummary](#usersummary) | **yes** |  |
| `body` | string | **yes** |  |
| `likeCount` | number | **yes** |  |
| `replyCount` | number | **yes** |  |
| `media` | [Media](#media)[] | **yes** | Images / files attached to the comment |
| `likedByMe` | boolean | **yes** |  |
| `isMine` | boolean | **yes** |  |
| `isDeleted` | boolean | **yes** |  |
| `editedAt` | string \| null | **yes** |  |
| `createdAt` | string | **yes** |  |

### Contract

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `title` | string | **yes** |  |
| `description` | string | **yes** |  |
| `status` | `draft` \| `sent` \| `signed` \| `void` | **yes** |  |
| `file` | [Media](#media) \| null | **yes** |  |
| `uploadedBy` | [UserSummary](#usersummary) | **yes** |  |
| `signedAt` | string \| null | **yes** |  |
| `createdAt` | string | **yes** |  |

### Conversation

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `kind` | `direct` \| `project` | **yes** |  |
| `title` | string | **yes** |  |
| `avatarUrl` | string \| null | **yes** |  |
| `otherUser` | [UserSummary](#usersummary) \| null | **yes** |  |
| `otherUserProfile` | object \| null | **yes** | Direct chats: the profile card at the top of the conversation (followers, collaborations, online) |
| `project` | object \| null | **yes** |  |
| `lastMessagePreview` | string \| null | **yes** |  |
| `lastMessageAt` | string \| null | **yes** |  |
| `unreadCount` | number | **yes** |  |
| `mutedUntil` | string \| null | **yes** |  |

### Evaluation

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `expert` | [UserSummary](#usersummary) | **yes** |  |
| `researchDocId` | string (uuid) \| null | **yes** |  |
| `prototypeVersionId` | string (uuid) \| null | **yes** |  |
| `feasibility` | number | **yes** |  |
| `sustainability` | number | **yes** |  |
| `novelty` | number | **yes** |  |
| `feedback` | string | **yes** |  |
| `createdAt` | string | **yes** |  |
| `updatedAt` | string | **yes** |  |

### Event

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `title` | string | **yes** |  |
| `category` | `hackathon` \| `workshop` \| `bootcamp` \| `networking_fair` \| `meetup` \| `conference` \| `webinar` \| `other` | **yes** | Dashboard event types: hackathon, workshop, bootcamp, networking_fair (Networking / showcase fair) |
| `summary` | string | **yes** |  |
| `description` | string | **yes** |  |
| `coverUrl` | string \| null | **yes** |  |
| `startsAt` | string | **yes** |  |
| `endsAt` | string | **yes** |  |
| `timezone` | string | **yes** |  |
| `venue` | string \| null | **yes** |  |
| `city` | string \| null | **yes** |  |
| `country` | string \| null | **yes** |  |
| `isOnline` | boolean | **yes** |  |
| `meetingUrl` | string \| null | **yes** |  |
| `registrationUrl` | string \| null | **yes** |  |
| `organizerName` | string \| null | **yes** |  |
| `organizerLogoUrl` | string \| null | **yes** |  |
| `organizerTagline` | string \| null | **yes** |  |
| `capacity` | number \| null | **yes** |  |
| `status` | `draft` \| `published` \| `cancelled` | **yes** |  |
| `goingCount` | number | **yes** |  |
| `interestedCount` | number | **yes** |  |
| `myRsvp` | `going` \| `interested` \| null | **yes** |  |
| `createdAt` | string | **yes** |  |

### FeaturedInnovation

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `title` | string | **yes** |  |
| `summary` | string | **yes** |  |
| `body` | string | **yes** |  |
| `coverUrl` | string \| null | **yes** |  |
| `projectId` | string (uuid) \| null | **yes** |  |
| `position` | number | **yes** |  |
| `topics` | [Topic](#topic)[] | **yes** | Used by "Sort topics" |
| `media` | [Media](#media)[] | **yes** | Image gallery (thumbnail strip on Featured View) |
| `shareUrl` | string | **yes** | Share button |
| `publishedAt` | string \| null | **yes** |  |
| `createdAt` | string | **yes** |  |

### Forum

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `name` | string | **yes** |  |
| `slug` | string | **yes** |  |
| `about` | string | **yes** |  |
| `coverUrl` | string \| null | **yes** |  |
| `visibility` | `public` \| `private` | **yes** |  |
| `memberCount` | number | **yes** |  |
| `postCount` | number | **yes** |  |
| `topics` | [Topic](#topic)[] | **yes** | "Focus" tags |
| `owner` | [UserSummary](#usersummary) | **yes** |  |
| `memberAvatars` | [UserSummary](#usersummary)[] | **yes** | First 4 members for the avatar stack ("122 members" = memberCount) |
| `isMember` | boolean | **yes** |  |
| `isMuted` | boolean | **yes** | "Mute notifications & messages" is on: this forum's posts are left out of my home feed |
| `myRole` | `owner` \| `moderator` \| `member` \| null | **yes** |  |
| `createdAt` | string | **yes** | "Created March 22nd 2024" |

### Highlight

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `title` | string | **yes** |  |
| `caption` | string | **yes** |  |
| `event` | object \| null | **yes** | The past event this album belongs to |
| `media` | [Media](#media)[] | **yes** |  |
| `publishedAt` | string \| null | **yes** |  |
| `createdAt` | string | **yes** |  |
| `createdBy` | [UserSummary](#usersummary) \| null | **yes** |  |

### InnovatorDetails

| Field | Type | Required | Notes |
|---|---|---|---|
| `ventureName` | string | **yes** | Project / venture name · min 2 chars, max 120 chars |
| `description` | string | no | Short description · max 2000 chars |
| `developmentStage` | `open` \| `ongoing` \| `closed` | **yes** | Stage of development: Open, Ongoing or Closed |
| `evidenceLink` | string (uri) | no | Evidence of work: link to an article, pitch deck or publication · max 500 chars |
| `evidenceFileIds` | string (uuid)[] | **yes** | Evidence of work: uploaded files (purpose `verification`; PDF, PNG, JPEG) · max 5 items, default `[]` |
| `otherCueFileIds` | string (uuid)[] | **yes** | Other cues: hackathons, boot-camps, patents, awards… (purpose `verification`) · max 10 items, default `[]` |

### JoinRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `user` | [UserSummary](#usersummary) | **yes** |  |
| `message` | string \| null | **yes** |  |
| `status` | `pending` \| `accepted` \| `declined` \| `cancelled` | **yes** |  |
| `createdAt` | string | **yes** |  |
| `decidedAt` | string \| null | **yes** |  |

### Kpi

| Field | Type | Required | Notes |
|---|---|---|---|
| `value` | number | **yes** |  |
| `previous` | number | **yes** | Same measure for the previous window (or at the start of this window, for totals) |
| `changePct` | number \| null | **yes** | Signed % change; drives the green/red trend arrow. null = no baseline |

### LearnerDetails

| Field | Type | Required | Notes |
|---|---|---|---|
| `studentEmail` | any | no |  |
| `institution` | string | **yes** | School / institution · min 2 chars, max 160 chars |
| `courseOfStudy` | string | **yes** | min 2 chars, max 160 chars |
| `level` | string | no | Level / year, e.g. 200 · max 40 chars |

### LedgerEntry

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `type` | string | **yes** |  |
| `summary` | string | **yes** |  |
| `actor` | [UserSummary](#usersummary) \| null | **yes** |  |
| `refType` | string \| null | **yes** |  |
| `refId` | string \| null | **yes** |  |
| `data` | map<string, any> | **yes** |  |
| `createdAt` | string | **yes** |  |

### MaintenanceWindow

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `message` | string | **yes** |  |
| `startsAt` | string | **yes** |  |
| `endsAt` | string | **yes** |  |
| `disableAccess` | boolean | **yes** |  |
| `state` | `scheduled` \| `active` \| `completed` \| `cancelled` | **yes** |  |
| `broadcastId` | string (uuid) \| null | **yes** | The email sent to members, if any (GET /admin/broadcasts/{id} for delivery progress) |
| `createdBy` | [UserSummary](#usersummary) \| null | **yes** |  |
| `cancelledAt` | string \| null | **yes** |  |
| `createdAt` | string | **yes** |  |

### Me

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `email` | string | **yes** |  |
| `emailVerified` | boolean | **yes** |  |
| `fullName` | string | **yes** |  |
| `username` | string \| null | **yes** |  |
| `avatarUrl` | string \| null | **yes** |  |
| `headline` | string \| null | **yes** |  |
| `memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null | **yes** |  |
| `verificationStatus` | `unverified` \| `pending` \| `verified` \| `rejected` | **yes** | Role verification: unverified (no role form), verified (passed automatic verification or approved by an admin), rejected (refused or revoked by an admin; resubmit with PUT /me/role), pending (legacy: submitted before automatic verification, cleared by the daily job) |
| `platformRole` | `member` \| `moderator` \| `admin` \| `super_admin` | **yes** |  |
| `status` | `active` \| `flagged` \| `restricted` \| `suspended` \| `blocked` | **yes** |  |
| `onboardingComplete` | boolean | **yes** |  |
| `hasPassword` | boolean | **yes** |  |
| `googleLinked` | boolean | **yes** |  |
| `createdAt` | string | **yes** |  |
| `bio` | string \| null | **yes** |  |
| `coverUrl` | string \| null | **yes** |  |
| `dateOfBirth` | string \| null | **yes** |  |
| `country` | string \| null | **yes** |  |
| `location` | string \| null | **yes** |  |
| `phone` | string \| null | **yes** |  |
| `institutionalEmail` | string \| null | **yes** |  |
| `researchLink` | string \| null | **yes** |  |
| `researchEvidence` | string \| null | **yes** |  |
| `openToCollaborate` | boolean | **yes** |  |
| `followerCount` | number | **yes** |  |
| `followingCount` | number | **yes** |  |
| `postCount` | number | **yes** |  |
| `collaborationCount` | number | **yes** |  |
| `interests` | [Topic](#topic)[] | **yes** |  |
| `verification` | [Verification](#verification) \| null | **yes** | My role form and its review status (Settings → Account Preferences) |
| `deletionScheduledFor` | string \| null | **yes** |  |

### Media

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `kind` | `image` \| `video` \| `document` \| `audio` | **yes** |  |
| `url` | string \| null | **yes** |  |
| `mimeType` | string | **yes** |  |
| `sizeBytes` | number | **yes** |  |
| `originalName` | string \| null | **yes** |  |
| `width` | number \| null | **yes** |  |
| `height` | number \| null | **yes** |  |
| `durationSeconds` | number \| null | **yes** |  |

### Message

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `conversationId` | string (uuid) | **yes** |  |
| `sender` | [UserSummary](#usersummary) \| null | **yes** |  |
| `kind` | `text` \| `image` \| `file` \| `voice` \| `system` | **yes** |  |
| `body` | string \| null | **yes** |  |
| `media` | [Media](#media)[] | **yes** |  |
| `replyTo` | object \| null | **yes** |  |
| `isMine` | boolean | **yes** |  |
| `isDeleted` | boolean | **yes** |  |
| `editedAt` | string \| null | **yes** |  |
| `createdAt` | string | **yes** |  |

### Notification

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `type` | string | **yes** |  |
| `actor` | [UserSummary](#usersummary) \| null | **yes** |  |
| `targetType` | string \| null | **yes** |  |
| `targetId` | string \| null | **yes** |  |
| `title` | string | **yes** |  |
| `body` | string | **yes** |  |
| `data` | map<string, any> | **yes** |  |
| `read` | boolean | **yes** |  |
| `createdAt` | string | **yes** |  |

### OnboardingStatus

| Field | Type | Required | Notes |
|---|---|---|---|
| `complete` | boolean | **yes** |  |
| `nextStep` | `select_role` \| `interests` \| `done` | **yes** | Where to send the member: Select Role, One more thing! (topics), or the app |
| `emailVerified` | boolean | **yes** |  |
| `roleSubmitted` | boolean | **yes** |  |
| `interestsSelected` | boolean | **yes** |  |
| `memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null | **yes** |  |
| `verificationStatus` | `unverified` \| `pending` \| `verified` \| `rejected` | **yes** | Role verification: unverified (no role form), verified (passed automatic verification or approved by an admin), rejected (refused or revoked by an admin; resubmit with PUT /me/role), pending (legacy: submitted before automatic verification, cleared by the daily job) |

### PlatformSettings

| Field | Type | Required | Notes |
|---|---|---|---|
| `imageOptimization` | boolean | **yes** | Prefetch images ahead of time in the apps |
| `updatedBy` | [UserSummary](#usersummary) \| null | **yes** |  |
| `updatedAt` | string | **yes** |  |

### Post

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `author` | [UserSummary](#usersummary) | **yes** |  |
| `body` | string | **yes** |  |
| `audience` | `everyone` \| `followers` \| `forum` \| `project` | **yes** |  |
| `forum` | object \| null | **yes** |  |
| `projectId` | string (uuid) \| null | **yes** |  |
| `media` | [Media](#media)[] | **yes** |  |
| `topics` | [Topic](#topic)[] | **yes** |  |
| `likeCount` | number | **yes** |  |
| `commentCount` | number | **yes** |  |
| `shareCount` | number | **yes** |  |
| `viewCount` | number | **yes** | "400,000 Views": distinct members who opened the post |
| `likedByMe` | boolean | **yes** |  |
| `isMine` | boolean | **yes** | Show the "user post" sheet (Share, Delete Post) instead of the "posts" sheet |
| `followingAuthor` | boolean | **yes** | Hide the Follow button on Post view when true (or when isMine) |
| `shareUrl` | string | **yes** |  |
| `editedAt` | string \| null | **yes** |  |
| `createdAt` | string | **yes** |  |

### ProfessionalDetails

| Field | Type | Required | Notes |
|---|---|---|---|
| `organizationName` | string | **yes** | min 2 chars, max 160 chars |
| `profileLink` | string (uri) | no | LinkedIn or professional profile link · max 500 chars |
| `professionalTitle` | string | **yes** | e.g. Machinist. Also used as your profile headline if you have none · min 2 chars, max 100 chars |
| `workEmail` | any | no | Work or institutional email |

### Profile

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `fullName` | string | **yes** |  |
| `username` | string \| null | **yes** |  |
| `avatarUrl` | string \| null | **yes** |  |
| `headline` | string \| null | **yes** |  |
| `memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null | **yes** |  |
| `verified` | boolean | **yes** | Role verified by an admin (show the verified badge) |
| `bio` | string \| null | **yes** |  |
| `coverUrl` | string \| null | **yes** |  |
| `country` | string \| null | **yes** |  |
| `location` | string \| null | **yes** |  |
| `openToCollaborate` | boolean | **yes** | "Open to Collaborations" button |
| `followerCount` | number | **yes** |  |
| `followingCount` | number | **yes** |  |
| `postCount` | number | **yes** |  |
| `collaborationCount` | number | **yes** |  |
| `isFollowing` | boolean | **yes** |  |
| `followsYou` | boolean | **yes** |  |
| `isMe` | boolean | **yes** |  |
| `isPrivate` | boolean | **yes** | True when details are hidden by the profile visibility setting |
| `blockedByMe` | boolean | **yes** | You blocked this person: show Unblock instead of Follow / Message |
| `collaborationRequest` | object \| null | **yes** | A pending collaboration request between you and this person, if any |
| `joinedAt` | string | **yes** |  |

### Project

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `title` | string | **yes** |  |
| `slug` | string | **yes** |  |
| `pitch` | string | **yes** |  |
| `coverUrl` | string \| null | **yes** |  |
| `status` | `open` \| `ongoing` \| `completed` \| `archived` | **yes** |  |
| `visibility` | `public` \| `private` | **yes** |  |
| `memberCount` | number | **yes** |  |
| `topics` | [Topic](#topic)[] | **yes** |  |
| `owner` | [UserSummary](#usersummary) | **yes** | "By Dr Joseph Feranmi" |
| `memberAvatars` | [UserSummary](#usersummary)[] | **yes** | First 4 members for the avatar stack ("12 members" = memberCount) |
| `myRole` | `owner` \| `admin` \| `contributor` \| `viewer` \| null | **yes** |  |
| `createdAt` | string | **yes** |  |
| `problem` | string | **yes** |  |
| `solution` | string | **yes** |  |
| `videoUrl` | string \| null | **yes** |  |
| `memberPreview` | [UserSummary](#usersummary)[] | **yes** |  |
| `joinRequestStatus` | `pending` \| `accepted` \| `declined` \| `cancelled` \| null | **yes** |  |
| `conversationId` | string (uuid) \| null | **yes** | Project group chat (members only) |
| `updatedAt` | string | **yes** |  |

### ProjectCard

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `title` | string | **yes** |  |
| `slug` | string | **yes** |  |
| `pitch` | string | **yes** |  |
| `coverUrl` | string \| null | **yes** |  |
| `status` | `open` \| `ongoing` \| `completed` \| `archived` | **yes** |  |
| `visibility` | `public` \| `private` | **yes** |  |
| `memberCount` | number | **yes** |  |
| `topics` | [Topic](#topic)[] | **yes** |  |
| `owner` | [UserSummary](#usersummary) | **yes** | "By Dr Joseph Feranmi" |
| `memberAvatars` | [UserSummary](#usersummary)[] | **yes** | First 4 members for the avatar stack ("12 members" = memberCount) |
| `myRole` | `owner` \| `admin` \| `contributor` \| `viewer` \| null | **yes** |  |
| `createdAt` | string | **yes** |  |

### ProjectMember

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `fullName` | string | **yes** |  |
| `username` | string \| null | **yes** |  |
| `avatarUrl` | string \| null | **yes** |  |
| `headline` | string \| null | **yes** |  |
| `memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null | **yes** |  |
| `verified` | boolean | **yes** | Role verified by an admin (show the verified badge) |
| `role` | `owner` \| `admin` \| `contributor` \| `viewer` | **yes** |  |
| `title` | string \| null | **yes** |  |
| `joinedAt` | string | **yes** |  |

### ProjectNotificationSettings

| Field | Type | Required | Notes |
|---|---|---|---|
| `chat` | boolean | no |  |
| `tasks` | boolean | no |  |
| `research` | boolean | no |  |
| `prototypes` | boolean | no |  |
| `evaluations` | boolean | no |  |
| `members` | boolean | no |  |

### Prototype

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `projectId` | string (uuid) | **yes** |  |
| `name` | string | **yes** |  |
| `description` | string | **yes** |  |
| `coverUrl` | string \| null | **yes** |  |
| `versionCount` | number | **yes** |  |
| `latestVersionLabel` | string \| null | **yes** |  |
| `createdBy` | [UserSummary](#usersummary) | **yes** |  |
| `createdAt` | string | **yes** |  |
| `updatedAt` | string | **yes** |  |

### PrototypeVersion

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `versionLabel` | string | **yes** |  |
| `notes` | string | **yes** |  |
| `media` | [Media](#media)[] | **yes** |  |
| `uploadedBy` | [UserSummary](#usersummary) | **yes** |  |
| `commentCount` | number | **yes** |  |
| `createdAt` | string | **yes** |  |

### ReportHistory

| Field | Type | Required | Notes |
|---|---|---|---|
| `previousReports` | number | **yes** |  |
| `previousWarnings` | number | **yes** |  |
| `accountStatus` | string | **yes** | The person's account status, or the forum/project moderation status |

### ReportedContent

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `post` \| `comment` \| `forum` \| `project` \| `user` \| `message` | **yes** |  |
| `id` | string (uuid) | **yes** |  |
| `title` | string \| null | **yes** | Forum name or project title |
| `body` | string \| null | **yes** | Post/comment/message text, forum "About", project pitch, or user bio |
| `author` | [UserSummary](#usersummary) \| null | **yes** | Post/comment author, message sender, forum/project owner, or the reported user |
| `coverUrl` | string \| null | **yes** |  |
| `media` | [Media](#media)[] | **yes** |  |
| `topics` | [Topic](#topic)[] | **yes** | Forum/project "Focus" tags |
| `memberCount` | number \| null | **yes** |  |
| `members` | [UserSummary](#usersummary)[] | **yes** | Up to 5 members for the avatar stack |
| `likeCount` | number \| null | **yes** |  |
| `commentCount` | number \| null | **yes** |  |
| `status` | string \| null | **yes** | Forum/project moderation status |
| `removed` | boolean | **yes** |  |
| `createdAt` | string \| null | **yes** |  |

### ResearchDoc

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `projectId` | string (uuid) | **yes** |  |
| `title` | string | **yes** |  |
| `kind` | `written` \| `uploaded` | **yes** |  |
| `content` | any \| null | **yes** | Rich-text JSON (TipTap/ProseMirror) for written docs |
| `file` | [Media](#media) \| null | **yes** |  |
| `author` | [UserSummary](#usersummary) | **yes** |  |
| `commentCount` | number | **yes** |  |
| `createdAt` | string | **yes** |  |
| `updatedAt` | string | **yes** |  |

### ResearcherDetails

| Field | Type | Required | Notes |
|---|---|---|---|
| `institutionalEmail` | any | no | Identity verification: institutional email, e.g. name@university.edu.ng |
| `orcidId` | string | no | Identity verification: ORCID iD (recommended), e.g. 0000-0006-0000-0004 · pattern `^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$` |
| `researchProjectLink` | string (uri) | no | Research background: research project link · max 500 chars |
| `researchEvidence` | string | no | Research background: evidence of research (brief description) · max 2000 chars |

### Session

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `client` | `web` \| `admin` \| `ios` \| `android` \| `unknown` | **yes** |  |
| `userAgent` | string \| null | **yes** |  |
| `ip` | string \| null | **yes** |  |
| `createdAt` | string | **yes** |  |
| `lastUsedAt` | string \| null | **yes** |  |
| `current` | boolean | **yes** |  |

### Settings

| Field | Type | Required | Notes |
|---|---|---|---|
| `theme` | `light` \| `dark` \| `system` | **yes** |  |
| `language` | string | **yes** |  |
| `profileVisibility` | `public` \| `members` \| `private` | **yes** |  |
| `messagePermission` | `everyone` \| `following` \| `none` | **yes** |  |
| `showOnlineStatus` | boolean | **yes** |  |
| `notificationPrefs` | map<string, object> | **yes** |  |

### Task

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `title` | string | **yes** |  |
| `description` | string | **yes** |  |
| `status` | `todo` \| `done` | **yes** |  |
| `dueDate` | string \| null | **yes** |  |
| `assignee` | [UserSummary](#usersummary) \| null | **yes** |  |
| `createdBy` | [UserSummary](#usersummary) | **yes** |  |
| `completedAt` | string \| null | **yes** |  |
| `createdAt` | string | **yes** |  |

### TokenResponse

| Field | Type | Required | Notes |
|---|---|---|---|
| `accessToken` | string | **yes** | JWT, send as `Authorization: Bearer <token>` |
| `accessTokenExpiresIn` | number | **yes** | Seconds until the access token expires |
| `refreshToken` | string \| null | **yes** | Returned only to mobile clients (`X-Client: ios\|android`). Web clients receive an httpOnly cookie instead. `null` means keep the one you have. |
| `user` | [AuthUser](#authuser) | **yes** |  |
| `isNewUser` | boolean | no |  |

### Topic

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `slug` | string | **yes** |  |
| `name` | string | **yes** |  |

### UserSummary

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `fullName` | string | **yes** |  |
| `username` | string \| null | **yes** |  |
| `avatarUrl` | string \| null | **yes** |  |
| `headline` | string \| null | **yes** |  |
| `memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` \| null | **yes** |  |
| `verified` | boolean | **yes** | Role verified by an admin (show the verified badge) |

### Verification

| Field | Type | Required | Notes |
|---|---|---|---|
| `memberRole` | `researcher` \| `innovator` \| `professional` \| `learner` \| `expert` \| `investor` \| `student` | **yes** | Current roles: researcher, innovator, professional, learner. Legacy (existing accounts only): expert, investor, student |
| `status` | `unverified` \| `pending` \| `verified` \| `rejected` | **yes** | Role verification: unverified (no role form), verified (passed automatic verification or approved by an admin), rejected (refused or revoked by an admin; resubmit with PUT /me/role), pending (legacy: submitted before automatic verification, cleared by the daily job) |
| `details` | [VerificationDetails](#verificationdetails) | **yes** |  |
| `files` | [Media](#media)[] | **yes** | Uploaded evidence (signed links, valid 1 hour) |
| `submittedAt` | string | **yes** |  |
| `reviewedAt` | string \| null | **yes** | When the current decision was made |
| `reviewNote` | string \| null | **yes** | Why it was rejected, when rejected |
| `decidedBy` | `auto` \| `admin` \| null | **yes** | `auto`: automatic verification on submit · `admin`: an admin decided |

### VerificationCheck

| Field | Type | Required | Notes |
|---|---|---|---|
| `field` | string | **yes** | Form field the check is about, or `form` |
| `check` | string | **yes** | e.g. orcid_record, email_dns, link_reachable, text_quality |
| `outcome` | `pass` \| `warn` \| `fail` \| `skipped` | **yes** | skipped = could not be checked right now (never rejects) |
| `message` | string | **yes** |  |
| `points` | number | **yes** |  |

### VerificationDetails

| Field | Type | Required | Notes |
|---|---|---|---|
| `institutionalEmail` | string | no |  |
| `orcidId` | string | no |  |
| `researchProjectLink` | string | no |  |
| `researchEvidence` | string | no |  |
| `ventureName` | string | no |  |
| `description` | string | no |  |
| `developmentStage` | `open` \| `ongoing` \| `closed` | no |  |
| `evidenceLink` | string | no |  |
| `evidenceFileIds` | string[] | no |  |
| `otherCueFileIds` | string[] | no |  |
| `organizationName` | string | no |  |
| `profileLink` | string | no |  |
| `professionalTitle` | string | no |  |
| `workEmail` | string | no |  |
| `studentEmail` | string | no |  |
| `institution` | string | no |  |
| `courseOfStudy` | string | no |  |
| `level` | string | no |  |

### VerificationPending

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | **yes** |  |
| `verificationRequired` | `true` | **yes** |  |
| `codeExpiresIn` | number | **yes** | Seconds until the code expires |
| `resendAvailableIn` | number | **yes** | Seconds until a new code can be requested |

### WorkspaceComment

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string (uuid) | **yes** |  |
| `targetType` | `research_doc` \| `prototype_version` | **yes** |  |
| `targetId` | string (uuid) | **yes** |  |
| `parentId` | string (uuid) \| null | **yes** |  |
| `body` | string | **yes** |  |
| `author` | [UserSummary](#usersummary) | **yes** |  |
| `createdAt` | string | **yes** |  |
