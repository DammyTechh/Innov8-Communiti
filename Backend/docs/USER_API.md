# Member app API (web and mobile)

This guide maps every member screen to its endpoints. Start with [`FRONTEND_INTEGRATION.md`](FRONTEND_INTEGRATION.md) (client setup, tokens, errors, onboarding); every field of every endpoint is in [`API_REFERENCE.md`](API_REFERENCE.md), and Swagger is at `/api/docs`. Every path below is under `/api/v1`.

**Conventions**
- Send `Authorization: Bearer <accessToken>` and `X-Client: web | ios | android` on every call.
- Lists return `{ data, nextCursor }`. Pass `?cursor=<nextCursor>` to load the next page.
- Every error is `{ error: { code, message, fields?, requestId } }`. Show `message`, map `fields` to form inputs, and branch on `code`.
- **Badges.** Every person object (`UserSummary`) has `memberRole` and `verified`. Show the role label, plus the verified badge when `verified` is true.
- **Uploads.** Three steps: `POST /uploads/presign { purpose, mimeType, sizeBytes }`, then `PUT` the file bytes to `uploadUrl`, then `POST /uploads/{id}/complete`. After that, pass the `mediaId`. For avatars and covers, pass `publicUrl` instead.

---

## Create account, sign in, reset password

| Screen | Call |
|---|---|
| Create an account (full name, email, location, password, confirm password, terms) | `POST /auth/register { fullName, email, location, password, confirmPassword, acceptTerms: true }` → a 6-digit code is emailed |
| Email verification code | `POST /auth/verify-email { email, code }` → signs in (returns tokens). Resend: `POST /auth/verify-email/resend` |
| Continue with Google | Web: `GET /auth/google?app=web`. Mobile: `POST /auth/google/token { idToken }` |
| Login | `POST /auth/login { email, password }` |
| Reset password (email, then OTP, then new password) | `POST /auth/password/forgot`, then `POST /auth/password/verify-code`, then `POST /auth/password/reset` |

**Sign-up validation.**
- `confirmPassword` must match `password`, or the response is `400` with `fields.confirmPassword`.
- Passwords need 8+ characters, with at least one letter and one number.

**After every sign-in,** call `GET /me/onboarding` and route on `nextStep`:

| `nextStep` | Go to |
|---|---|
| `select_role` | Select Role |
| `interests` | One more thing! (topics) |
| `done` | Home |

## Onboarding

**Select Role, then the role's form, then Submit**

`PUT /me/role { memberRole, details }`. `memberRole` is one of `researcher | innovator | professional | learner`, and `details` depends on the role.

| Role (screen) | `details` fields |
|---|---|
| **Researcher** | `institutionalEmail` **or** `orcidId` (at least one; ORCID as `0000-0000-0000-0000`), `researchProjectLink`, `researchEvidence` |
| **Innovator** | `ventureName` (required), `description`, `developmentStage`: `open \| ongoing \| closed` (required), `evidenceLink`, `evidenceFileIds[]`, `otherCueFileIds[]` |
| **Professional** | `organizationName` (required), `professionalTitle` (required), `profileLink` (LinkedIn), `workEmail` |
| **Learner** | `institution` (required), `courseOfStudy` (required), `studentEmail`, `level` (e.g. "200") |

- **Innovator files** (Evidence of work, Other cues): upload with purpose `verification` (PDF, PNG or JPEG, up to 10 MB, private). Pass the ids in `evidenceFileIds` and `otherCueFileIds`.
- **What happens on submit (automatic verification, no admin queue):**
  - The answers are checked immediately (1–6 s): real text (no placeholders or keyboard mashing), ORCID checksum, ORCID record and name, email domains (not disposable, not a personal Gmail/Yahoo address, exists and receives mail), links (public, open, not 404 or a parked domain, LinkedIn profile shape), and that no other account uses the same ORCID or email.
  - **Pass:** `200`, `verificationStatus: "verified"` and `verification.decidedBy: "auto"`. Show the verified badge.
  - **Fail:** `422 VERIFICATION_FAILED`, nothing saved, and `error.fields["details.<field>"]` says what to fix under each input. Keep the answers in the form and let the member resubmit.
  - Show a "Verifying your details…" state and use a request timeout of at least 20 s.
  - Full details and examples: [`FRONTEND_INTEGRATION.md` §6](FRONTEND_INTEGRATION.md#6-onboarding-with-automatic-verification).
- **Professional headline.** If the profile has no headline yet, `professionalTitle` becomes the headline.
- **Legacy roles.** `expert`, `investor` and `student` can't be chosen any more. Existing accounts keep them.

**Feed customization ("One more thing!")**

| Screen part | Call |
|---|---|
| Topic chips | `GET /topics` → `{ id, slug, name, description }` |
| Go to Communiti | `PUT /me/interests { topicIds: [...] }` (at least 1) |

Saving the topics completes onboarding when a role was already submitted. The member gets the welcome email at that point.

> The older one-call `PATCH /me/onboarding` still works for existing clients. `dateOfBirth` and `country` are now optional there.

## Home

| Screen part | Call |
|---|---|
| For You / Following tabs | `GET /feed?tab=for-you` / `GET /feed?tab=following` |
| Composer (Write Something…, Everyone / Following) | `POST /posts { body, audience: "everyone" \| "followers", mediaIds, topicIds }` |
| Composer: image / camera / paperclip | Upload with purpose `post` (images, video, or documents such as PDFs), then pass `mediaIds` |
| Like / Share | `POST /posts/{id}/like`, `POST /posts/{id}/share` (returns `shareUrl`) |
| Post sheet (someone else's post) | Share; **Not interested** → `POST /posts/{id}/not-interested`; **Block (user)** → `POST /users/{authorId}/block`; **Report post** → `POST /reports` |
| User post sheet (`isMine: true`) | Share; **Delete Post** → `DELETE /posts/{id}` |

**What the feed leaves out:**
- posts marked Not interested (undo with `DELETE /posts/{id}/not-interested`)
- posts by people you blocked, or who blocked you
- posts from forums you muted

**Post view**

| Screen part | Call |
|---|---|
| Post | `GET /posts/{id}` → the date (`createdAt`), "400,000 Views" (`viewCount`, one per member, the author excluded) and Follow button (hidden when `followingAuthor` or `isMine` is true; follow with `POST /users/{id}/follow`) |
| Comments, with Sort by: Latest / Popular | `GET /posts/{id}/comments?sort=latest\|popular`; replies: `GET /comments/{id}/replies` |
| Write a comment, with image / paperclip | `POST /posts/{id}/comments { body, mediaIds, parentId? }`. Upload with purpose `comment` (images or files, up to 4). A comment can be only an attachment |
| Comment menu: Report / Delete Comment | `POST /reports { targetType: "comment" }` / `DELETE /comments/{id}` |

**Report Post.** `POST /reports { targetType: "post", targetId, reason }`. Each option in the design maps to a `reason` value:

| Option | `reason` |
|---|---|
| Spam or misleading content | `spam` |
| Harassment or bullying | `harassment` |
| Hate or abusive content | `hate` |
| Intellectual property violation | `intellectual_property` |
| Violence or harmful content | `violence` |
| False or misleading information | `misinformation` |
| Scam or fraudulent activity | `scam` |

## Search

| Screen part | Call |
|---|---|
| Search box dropdown (Search in Topics, Clear All) | `GET /search?q=...&type=all` (returns every kind; topics include `description`); recent searches: `GET /search/recent`; Clear All: `DELETE /search/recent` |
| Results tabs: Posts / People / Events / Highlights | `GET /search?q=...&type=posts\|people\|events\|highlights&limit=20` |
| A topic tab (e.g. Agriculture) | `GET /search?q=...&type=posts&topicId=<agriculture id>` |

## Right sidebar (every page)

| Card | Call |
|---|---|
| Trending in Forums | `GET /trending/forums` → `postCount` is the "34 Posts" label |
| Trending in Agriculture topics | `GET /trending/forums?topic=agriculture` (or `topicId`) |
| Events | `GET /events?when=upcoming&limit=3` |

## Projects

| Screen part | Call |
|---|---|
| Projects tab | `GET /projects?tab=all` (every public project plus mine) |
| My Projects tab | `GET /projects?tab=mine` (I own), or `tab=joined` (I'm a member) |
| Search | `&q=` |
| Create Project | `POST /projects` |
| View Project | `GET /projects/{id}` and the workspace endpoints |

Each card has:
- cover, title, `status` (the Open pill)
- `owner` ("By Dr Joseph Feranmi")
- `topics`, `pitch`
- `memberAvatars` (first 4) and `memberCount` ("12 members")

## Chats

| Screen part | Call |
|---|---|
| Messages / Projects tabs | `GET /conversations?filter=direct` / `?filter=project`; search: `&q=` |
| Sort by: Collaboration requests | `GET /collaboration-requests?box=received` (badge: `GET /collaboration-requests/pending-count`) |
| View request | `GET /collaboration-requests/{id}` |
| Accept Request / Decline | `POST /collaboration-requests/{id}/accept` / `.../decline` |
| Conversation | `GET /conversations/{id}`, `GET /conversations/{id}/messages`, `POST /conversations/{id}/messages` |
| Online status and profile card | `otherUserProfile { online, lastSeenAt, followerCount, collaborationCount }` on each direct conversation |
| View Profile | `GET /users/{id}` |
| Chat actions: Search in Chat | `GET /conversations/{id}/messages?q=...` |
| Chat actions: Clear conversation history | `DELETE /conversations/{id}/messages` (the chat stays in the list) |
| Chat actions: Delete chat history | `DELETE /conversations/{id}` (clears it and hides it until a new message arrives) |
| Chat actions: Report this project / Leave project | `POST /reports { targetType: "project" }` / `DELETE /projects/{id}/members/{myId}` |
| Voice note / attachment | Upload with purpose `message`, then send `mediaIds` |

**Online status.** `online` is true when the person was active in the last 2 minutes. It is always false if they turned off `showOnlineStatus` in Privacy settings.

**Accepting a collaboration request:**
- opens (or reuses) the direct chat, with a "now collaborating" message, and returns `conversationId`
- adds 1 to both members' `collaborationCount`
- if the request has a `project`, adds the recipient to that project as a contributor

**Sending one.** From a profile, call `POST /collaboration-requests { recipientId, message, projectId? }`.
- `projectId` invites them into one of your projects. You must be its owner or admin.
- A profile's `collaborationRequest` shows a pending request between you.
- The sender cancels with `DELETE /collaboration-requests/{id}`.

## Explore

| Screen part | Call |
|---|---|
| Suggested for you | `GET /explore/suggested` → `{ projects, forums, people, events }` picked from your topics |
| Community Highlights (grid) | `GET /highlights` |
| Expand image / album | `GET /highlights/{id}` |
| More like this | `GET /highlights?exclude={id}` (add `eventId` for the same event) |
| Featured Innovation | `GET /featured` |
| Sort topics, then Apply | `GET /featured?topicIds=<id>,<id>`. Reset: no `topicIds` |
| Featured View (gallery strip, Share) | `GET /featured/{id}` → `media[]`, `topics[]`, `shareUrl` |
| Events: Upcoming / Concluded | `GET /events?when=upcoming` / `GET /events?when=concluded`; search `&q=` |
| Event view (Challenge view) | `GET /events/{id}`. The **Register** button opens `registrationUrl`. Organizer: `organizerName`, `organizerLogoUrl`, `organizerTagline` |

## Profile

| Screen part | Call |
|---|---|
| Profile | `GET /users/{id}`, or `GET /users/by-username/{username}`; my own: `GET /me` |
| Posts / Projects tabs | `GET /users/{id}/posts`, `GET /users/{id}/projects` |
| Edit Profile: image | Upload with purpose `avatar`, then `PATCH /me { avatarUrl }` |
| Edit Profile: Profile name, profession | `PATCH /me { fullName, headline }` |
| Edit Profile: Role | Use `PUT /me/role`, because a new role needs its form |
| Open to Collaborations | `PATCH /me { openToCollaborate: true }` |
| Unblock (when `blockedByMe`) | `DELETE /users/{id}/block` |

**Profile fields:**
- name, `memberRole` (the Expert / Researcher badge), `verified`
- `headline` ("Fishery Engineer"), `bio`, `location`
- `collaborationCount` ("23 collaborations"), `followingCount`, `followerCount`
- `openToCollaborate`, `isFollowing`, `blockedByMe`, `collaborationRequest`

**Blocking (`POST /users/{id}/block`):**
- unfollows both ways and cancels pending collaboration requests
- hides each person's posts and comments from the other
- stops follows, messages and collaboration requests between them
- the blocked person gets `404` when opening the blocker's profile
- your list of blocked people: `GET /me/blocked-users`

## Forums

| Screen part | Call |
|---|---|
| For You / Joined / My Forums | `GET /forums?tab=for-you\|joined\|mine` |
| Forum card | `coverUrl`, `name`, `createdAt` ("Created June 2006"), `topics`, `about` |
| Forum view | `GET /forums/{id}` → `memberAvatars`, `memberCount` ("122 members"), `topics` (Focus), `about`, `createdAt` |
| Join Forum | `POST /forums/{id}/join` |
| Create new Forum | `POST /forums { name, about, coverUrl, topicIds }` (up to 5 focus topics). Upload the header with purpose `forum` |
| Forum posts, with Sort posts by: Latest / Popular / My posts / My replies | `GET /forums/{id}/posts?sort=latest\|popular\|mine\|my_replies` |
| Create Post in the forum | `POST /posts { body, forumId, audience: "forum" }` |
| More: Mute notifications & messages | `POST /forums/{id}/mute { muted: true }` (unmute with `false`). `isMuted` is on the forum. Muted forums' posts are left out of your home feed |
| More: Leave Forum | `DELETE /forums/{id}/join` |

## Settings

| Screen part | Call |
|---|---|
| Account Preferences: Role, Location, Email, Institutional email, Evidence of research | `GET /me` → `memberRole`, `location`, `email`, `verification { status, details, files }` |
| Change my role | `PUT /me/role` with the new role and its form |
| Change this email (institutional) | `PUT /me/role` with the same role and the updated `details` |
| Location | `PATCH /me { location }` |
| Sign-in email | `POST /me/email`, then `POST /me/email/verify` |
| Language / App Theme / Privacy / Visibility | `GET /me/settings`, `PATCH /me/settings { language, theme, profileVisibility, messagePermission, showOnlineStatus, notificationPrefs }` |
| Delete account | `DELETE /me { password, confirm: "DELETE" }` |
| Sign out | `POST /auth/logout` |

**The "Change institutional email" modal:**
- Re-submitting with `PUT /me/role` sends the details for review again, as the modal warns.
- `verificationStatus` goes back to `pending` until an admin approves the new details.

## Notifications

`GET /notifications`, `GET /notifications/unread-count`, and `POST /notifications/read { all: true }`.

New notification types:
- `collaboration_request`
- `collaboration_accepted`
- `verification`

---

## What changed in this update

**New endpoints (23)**
- Onboarding and profile: `GET /me/onboarding`, `PUT /me/role`, `GET /me/blocked-users`
- Profiles and blocking: `GET /users/{id}`, `POST|DELETE /users/{id}/block`
- Posts: `POST|DELETE /posts/{id}/not-interested`
- Collaboration requests: `POST|GET /collaboration-requests`, `GET /collaboration-requests/pending-count`, `GET /collaboration-requests/{id}`, `POST /collaboration-requests/{id}/accept|decline`, `DELETE /collaboration-requests/{id}`
- Chat: `DELETE /conversations/{id}`
- Forums: `POST /forums/{id}/mute`
- Explore: `GET /explore/suggested`, `GET /highlights/{id}`
- Admin verification queue: `GET /admin/verifications`, `GET /admin/verifications/{userId}`, `POST /admin/verifications/{userId}/approve|reject`

**Extended. Additive only: existing fields and parameters still work.**
- `POST /auth/register`: `location`, `confirmPassword`
- Every person (`UserSummary`): `verified`. Auth user and `GET /me`: `verificationStatus`, `verification`
- Posts: `viewCount`, `followingAuthor`; documents allowed. Feed filters (Not interested, blocks, muted forums)
- Comments: `media`, `mediaIds`; `sort=latest|popular`
- Search: `type=events|highlights|topics`, `topicId`; results gain `events`, `highlights`, `topics`
- `/trending/forums`: `topic` / `topicId`, `postCount`
- Projects: `tab=all`, `memberAvatars`
- Forums: `tab=for-you`, `memberAvatars`, `isMuted`; forum posts `sort`
- Chat: `otherUserProfile` (online, followers, collaborations), messages `q`
- Explore:
  - `/events`: `when=concluded`, `q`
  - `/featured`: `topicIds`, plus `topics`, `media` and `shareUrl` on each item (admins set `topicIds` and `mediaIds`)
  - `/highlights`: `q`, `eventId`, `exclude`
- `GET /topics`: `description`. Profiles: `location`, `blockedByMe`, `collaborationRequest`
- Report reason `intellectual_property`. Upload purposes `comment`, `verification`, `featured`

**Behaviour changes to note**
1. **Roles.**
   - Members now pick **researcher, innovator, professional or learner**.
   - `expert`, `investor` and `student` remain valid for existing accounts, but `PUT /me/role` doesn't accept them.
2. **Expert evaluations.** `POST /projects/{id}/evaluations` is allowed for legacy `expert` accounts, and for **verified** researchers and professionals.
3. **`PATCH /me`:**
   - It no longer accepts `institutionalEmail`, `researchLink` or `researchEvidence`. Those go through `PUT /me/role`, so changes are reviewed.
   - Changing `memberRole` here resets `verificationStatus` to `unverified`.
4. **Content from blocked people.** Posts and comments between members who blocked each other are hidden everywhere, and a direct post link returns `404`.

**Database**
- `supabase/migrations/20261028000000_member_experience.sql` upgrades an existing database. It's idempotent and runs after the admin dashboard migration.
- `20260924000000_init.sql` was rebuilt with the same schema, so a fresh database gets everything from the init file.
