import { httpUrl } from '../../lib/url.js';
import { and, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { topics, userBlocks, userInterests, userSettings, users } from '../../db/schema/index.js';
import { email as emailSchema, otpCode, personName } from '../auth/auth.schemas.js';
import { consumeOtp, issueOtp, OTP_TTL_SECONDS } from '../auth/otp.service.js';
import { audit } from '../../lib/audit.js';
import { Errors } from '../../lib/errors.js';
import { sendMail, sendMailSafe, templates } from '../../lib/mailer/index.js';
import { verifyPassword } from '../../lib/password.js';
import { currentUser } from '../../plugins/auth.js';
import { toAuthUser } from '../auth/auth.service.js';
import { authUserDto } from '../auth/auth.schemas.js';
import { clearRefreshCookie, revokeAllSessions } from '../auth/session.service.js';
import { auth, memberRoleEnum, noContent, topicDto, userSummary } from '../_shared/dto.js';
import { cursorPageSchema, cursorQuery } from '../../lib/pagination.js';
import { userSummaryCols } from '../_shared/users.js';
import { completeOnboardingIfReady, loadVerification, notifyAdminsOfMember, onboardingDto, onboardingStatus, roleBody, submitRole, verificationDto } from './verification.js';

const tags = ['Me'];
const username = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(30)
  .regex(/^[a-zA-Z0-9_.]+$/, 'Use letters, numbers, dots and underscores only');
const country = z.string().regex(/^[A-Z]{2}$/, 'Use a 2-letter ISO country code, e.g. NG');
const dob = z.iso.date().refine((d) => {
  const age = (Date.now() - new Date(d).getTime()) / (365.25 * 86_400_000);
  return age >= 13 && age <= 120;
}, 'You must be at least 13 years old');

const meDto = authUserDto
  .extend({
    bio: z.string().nullable(),
    coverUrl: z.string().nullable(),
    dateOfBirth: z.string().nullable(),
    country: z.string().nullable(),
    location: z.string().nullable(),
    phone: z.string().nullable(),
    institutionalEmail: z.string().nullable(),
    researchLink: z.string().nullable(),
    researchEvidence: z.string().nullable(),
    openToCollaborate: z.boolean(),
    followerCount: z.number(),
    followingCount: z.number(),
    postCount: z.number(),
    collaborationCount: z.number(),
    interests: z.array(topicDto),
    verification: verificationDto.nullable().describe('My role form and its review status (Settings → Account Preferences)'),
    deletionScheduledFor: z.string().nullable(),
  })
  .meta({ id: 'Me' });

const settingsDto = z
  .object({
    theme: z.enum(['light', 'dark', 'system']),
    language: z.string(),
    profileVisibility: z.enum(['public', 'members', 'private']),
    messagePermission: z.enum(['everyone', 'following', 'none']),
    showOnlineStatus: z.boolean(),
    notificationPrefs: z.record(z.string(), z.object({ inApp: z.boolean(), push: z.boolean(), email: z.boolean() })),
  })
  .meta({ id: 'Settings' });

async function loadMe(userId: string) {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) throw Errors.notFound('User');
  const interests = await db
    .select({ id: topics.id, slug: topics.slug, name: topics.name })
    .from(userInterests)
    .innerJoin(topics, eq(topics.id, userInterests.topicId))
    .where(eq(userInterests.userId, userId))
    .orderBy(topics.sortOrder);
  return { ...toAuthUser(u), ...u, interests, verification: await loadVerification(userId) };
}

async function assertUsernameFree(name: string, userId: string) {
  const [taken] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(sql`lower(${users.username}) = lower(${name})`, ne(users.id, userId)))
    .limit(1);
  if (taken) throw Errors.conflict('This username is taken', 'USERNAME_TAKEN');
}

async function setInterests(userId: string, topicIds: string[]) {
  const found = await db.select({ id: topics.id }).from(topics).where(inArray(topics.id, topicIds));
  if (found.length !== new Set(topicIds).size) throw Errors.validation('One or more topics do not exist', { topicIds: 'Unknown topic' });
  await db.transaction(async (tx) => {
    await tx.delete(userInterests).where(eq(userInterests.userId, userId));
    await tx.insert(userInterests).values(topicIds.map((topicId) => ({ userId, topicId })));
  });
}

export const meRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/', {
    schema: { tags, summary: 'Current user with profile, counts and interests', security: auth, response: { 200: meDto } },
    handler: async (req) => loadMe(currentUser(req).id),
  });

  app.patch('/onboarding', {
    schema: {
      tags,
      summary: 'Finish onboarding in one call (legacy)',
      description:
        'Earlier single-step flow, kept for existing clients. The current flow is PUT /me/role (Select Role + role form) then PUT /me/interests; use GET /me/onboarding to know the next step. `dateOfBirth` and `country` are now optional.',
      security: auth,
      body: z.object({
        memberRole: memberRoleEnum,
        dateOfBirth: dob.optional(),
        country: country.optional(),
        topicIds: z.array(z.uuid()).min(1, 'Pick at least one topic').max(20),
        username: username.optional(),
      }),
      response: { 200: meDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const b = req.body;
      if (b.username) await assertUsernameFree(b.username, me.id);
      await setInterests(me.id, b.topicIds);
      const [before] = await db.select({ onboarded: users.onboardingCompletedAt, email: users.email, fullName: users.fullName }).from(users).where(eq(users.id, me.id));
      await db
        .update(users)
        .set({
          memberRole: b.memberRole,
          ...(b.dateOfBirth ? { dateOfBirth: b.dateOfBirth } : {}),
          ...(b.country ? { country: b.country } : {}),
          ...(b.username ? { username: b.username } : {}),
          onboardingCompletedAt: before?.onboarded ?? new Date().toISOString(),
        })
        .where(eq(users.id, me.id));
      if (before && !before.onboarded) {
        await sendMailSafe(before.email, templates.welcome({ name: before.fullName.split(' ')[0]! }));
        await notifyAdminsOfMember(me.id, 'onboarded');
      }
      return loadMe(me.id);
    },
  });

  app.patch('/', {
    schema: {
      tags,
      summary: 'Edit profile',
      description: [
        'Edit Profile: profile name (`fullName`), profession (`headline`), avatar (upload with POST /uploads/presign, purpose `avatar`, then pass `avatarUrl`). Settings: `location`, `phone`.',
        'Changing role here clears verification (`verificationStatus: unverified`); to change role with its form ("Change my role"), use PUT /me/role. Institutional email and research details are changed through PUT /me/role too, which sends them for review again.',
      ].join(' '),
      security: auth,
      body: z
        .object({
          fullName: personName,
          username,
          headline: z.string().trim().max(100).nullable(),
          bio: z.string().trim().max(500).nullable(),
          avatarUrl: httpUrl().nullable(),
          coverUrl: httpUrl().nullable(),
          memberRole: memberRoleEnum,
          country,
          dateOfBirth: dob,
          openToCollaborate: z.boolean(),
          location: z.string().trim().max(120).nullable().describe('e.g. "Lugbe, Abuja, Nigeria"'),
          phone: z
            .string()
            .trim()
            .regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number')
            .nullable()
            .describe('Optional, e.g. +234 803 000 0000'),
        })
        .partial(),
      response: { 200: meDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      if (req.body.username) await assertUsernameFree(req.body.username, me.id);
      const [current] = await db.select({ memberRole: users.memberRole }).from(users).where(eq(users.id, me.id));
      const roleChanged = req.body.memberRole !== undefined && req.body.memberRole !== current?.memberRole;
      if (Object.keys(req.body).length) await db.update(users).set({ ...req.body, ...(roleChanged ? { verificationStatus: 'unverified' as const } : {}) }).where(eq(users.id, me.id));
      return loadMe(me.id);
    },
  });

  app.get('/onboarding', {
    schema: {
      tags,
      summary: 'Onboarding progress (where to send the member after sign-in)',
      description: '`nextStep`: `select_role` → Select Role + role form (PUT /me/role), `interests` → "One more thing!" (PUT /me/interests), `done` → the app.',
      security: auth,
      response: { 200: onboardingDto },
    },
    handler: async (req) => onboardingStatus(currentUser(req).id),
  });

  app.put('/role', {
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    schema: {
      tags,
      summary: 'Submit my role and its verification form (Select Role → Researcher / Innovator / Professional / Learner)',
      description: [
        'Onboarding step 1, and Settings → "Change my role" / "Change this email". Body: `{ memberRole, details }`; `details` depends on the role:',
        '**researcher**: `institutionalEmail` or `orcidId` (at least one), `researchProjectLink`, `researchEvidence`.',
        '**innovator**: `ventureName`, `description`, `developmentStage` (open | ongoing | closed), `evidenceLink`, `evidenceFileIds`, `otherCueFileIds` (upload with purpose `verification`).',
        '**professional**: `organizationName`, `professionalTitle`, `profileLink`, `workEmail`.',
        '**learner**: `institution`, `courseOfStudy`, `studentEmail`, `level`.',
        '\n\n**Automatic verification (no admin queue).** The answers are checked on submit (usually 1–6 s: placeholder/gibberish text, ORCID checksum + ORCID record + name match, email domain exists and is not disposable or a personal Gmail/Yahoo address, links open and are not 404 or parked, the same ORCID/email not used by another account).',
        'Pass → saved with `verificationStatus: verified` (verified badge) and `verification.decidedBy: auto`.',
        'Fail → `422 VERIFICATION_FAILED`, nothing is saved, and `error.fields` maps `details.<field>` to what to fix (show it under that input). Schema problems (missing or badly formatted fields) are still `400 VALIDATION_FAILED`.',
        'Completes onboarding when interests are already chosen; admins are notified of every new member.',
      ].join(' '),
      security: auth,
      body: roleBody,
      response: { 200: meDto, 422: z.object({ error: z.object({ code: z.literal('VERIFICATION_FAILED'), message: z.string(), fields: z.record(z.string(), z.string()), requestId: z.string() }) }).describe('Automatic verification failed') },
    },
    handler: async (req) => {
      const me = currentUser(req);
      await submitRole(req, me.id, req.body);
      return loadMe(me.id);
    },
  });

  app.get('/blocked-users', {
    schema: { tags, summary: 'People I blocked', security: auth, querystring: cursorQuery, response: { 200: cursorPageSchema(userSummary.extend({ blockedAt: z.string() })) } },
    handler: async (req) => {
      const me = currentUser(req);
      const { cursor, limit } = req.query;
      const rows = await db
        .select({ ...userSummaryCols, blockedAt: userBlocks.createdAt })
        .from(userBlocks)
        .innerJoin(users, eq(users.id, userBlocks.blockedId))
        .where(and(eq(userBlocks.blockerId, me.id), cursor ? lt(userBlocks.blockedId, cursor) : undefined))
        .orderBy(desc(userBlocks.blockedId))
        .limit(limit + 1);
      const data = rows.slice(0, limit);
      return { data, nextCursor: rows.length > limit ? data[data.length - 1]!.id : null };
    },
  });

  app.post('/email', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      tags,
      summary: 'Change my email: step 1, send a code to the new address',
      description: 'Profile → Email Address. Accounts with a password must confirm it. Then call POST /me/email/verify with the code.',
      security: auth,
      body: z.object({ newEmail: emailSchema, password: z.string().max(128).optional() }),
      response: { 202: z.object({ email: z.string(), codeExpiresIn: z.number(), resendAvailableIn: z.number() }) },
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const [u] = await db.select().from(users).where(eq(users.id, me.id));
      if (!u) throw Errors.notFound('User');
      if (u.email === req.body.newEmail) throw Errors.validation('This is already your email', { newEmail: 'Same as current email' });
      if (u.passwordHash && !(req.body.password && (await verifyPassword(u.passwordHash, req.body.password)))) {
        throw Errors.validation('Your password is incorrect', { password: 'Incorrect password' });
      }
      const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, req.body.newEmail)).limit(1);
      if (taken) throw Errors.conflict('An account with this email already exists', 'EMAIL_TAKEN');
      const otp = await issueOtp(req.body.newEmail, 'email_change', me.id);
      await sendMail(req.body.newEmail, templates.emailChangeCode({ name: u.fullName.split(' ')[0]!, code: otp.code, minutes: OTP_TTL_SECONDS / 60 }));
      return reply.status(202).send({ email: req.body.newEmail, codeExpiresIn: otp.expiresIn, resendAvailableIn: otp.resendAvailableIn });
    },
  });

  app.post('/email/verify', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    schema: {
      tags,
      summary: 'Change my email: step 2, confirm the code',
      description: 'Switches the sign-in email, emails the old address, and records "changed email" in the account logs.',
      security: auth,
      body: z.object({ newEmail: emailSchema, code: otpCode }),
      response: { 200: meDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const otp = await consumeOtp(req.body.newEmail, 'email_change', req.body.code);
      // A code is bound to the account that requested it.
      if (otp.userId !== me.id) throw Errors.badRequest('This code has expired. Request a new one.', 'OTP_EXPIRED');
      const [u] = await db.select().from(users).where(eq(users.id, me.id));
      if (!u) throw Errors.notFound('User');
      const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, req.body.newEmail)).limit(1);
      if (taken) throw Errors.conflict('An account with this email already exists', 'EMAIL_TAKEN');
      await db.update(users).set({ email: req.body.newEmail, emailVerifiedAt: new Date().toISOString() }).where(eq(users.id, me.id));
      await audit({ actorId: me.id, action: 'user.email_changed', entityType: 'user', entityId: me.id, before: { email: u.email }, after: { email: req.body.newEmail } }, req);
      await sendMailSafe(u.email, templates.emailChanged({ name: u.fullName.split(' ')[0]!, newEmail: req.body.newEmail, when: new Date().toUTCString() }));
      return loadMe(me.id);
    },
  });

  app.get('/username-available', {
    schema: {
      tags,
      summary: 'Check if a username is free',
      security: auth,
      querystring: z.object({ username }),
      response: { 200: z.object({ available: z.boolean() }) },
    },
    handler: async (req) => {
      try {
        await assertUsernameFree(req.query.username, currentUser(req).id);
        return { available: true };
      } catch {
        return { available: false };
      }
    },
  });

  app.put('/interests', {
    schema: {
      tags,
      summary: 'Replace my interest topics (onboarding step 2: "One more thing!")',
      description: 'Finishes onboarding (and sends the welcome email) when a role has already been submitted. Also used from Settings to change interests.',
      security: auth,
      body: z.object({ topicIds: z.array(z.uuid()).min(1).max(20) }),
      response: { 200: z.object({ data: z.array(topicDto) }) },
    },
    handler: async (req) => {
      const me = currentUser(req);
      await setInterests(me.id, req.body.topicIds);
      await completeOnboardingIfReady(me.id);
      return { data: (await loadMe(me.id)).interests };
    },
  });

  app.get('/settings', {
    schema: { tags, summary: 'My settings (theme, privacy, visibility, notifications)', security: auth, response: { 200: settingsDto } },
    handler: async (req) => {
      const me = currentUser(req);
      const [s] = await db.insert(userSettings).values({ userId: me.id }).onConflictDoNothing().returning();
      return s ?? (await db.select().from(userSettings).where(eq(userSettings.userId, me.id)))[0]!;
    },
  });

  app.patch('/settings', {
    schema: { tags, summary: 'Update my settings', security: auth, body: settingsDto.partial(), response: { 200: settingsDto } },
    handler: async (req) => {
      const me = currentUser(req);
      const { notificationPrefs, ...rest } = req.body;
      // notificationPrefs is merged per type, so sending one type never wipes the others.
      const set = { ...rest, ...(notificationPrefs ? { notificationPrefs: sql`${userSettings.notificationPrefs} || ${JSON.stringify(notificationPrefs)}::jsonb` } : {}) };
      const [s] = await db
        .insert(userSettings)
        .values({ userId: me.id, ...rest, notificationPrefs: notificationPrefs ?? {} })
        .onConflictDoUpdate({ target: userSettings.userId, set })
        .returning();
      return s!;
    },
  });

  app.delete('/', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    schema: {
      tags,
      summary: 'Delete my account (30-day grace period)',
      description: 'Signs out everywhere and schedules permanent deletion in 30 days. Signing in before then cancels it. Accounts with a password must confirm it.',
      security: auth,
      body: z.object({ password: z.string().max(128).optional(), confirm: z.literal('DELETE'), reason: z.string().max(500).optional() }),
      response: noContent,
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const [u] = await db.select().from(users).where(eq(users.id, me.id));
      if (!u) throw Errors.notFound('User');
      if (u.passwordHash && !(req.body.password && (await verifyPassword(u.passwordHash, req.body.password)))) {
        throw Errors.validation('Your password is incorrect', { password: 'Incorrect password' });
      }
      const when = new Date(Date.now() + 30 * 86_400_000);
      await db.update(users).set({ deletionScheduledFor: when.toISOString() }).where(eq(users.id, me.id));
      await revokeAllSessions(me.id, 'account_deletion');
      await audit({ actorId: me.id, action: 'user.deletion_scheduled', entityType: 'user', entityId: me.id, message: req.body.reason }, req);
      await sendMailSafe(u.email, templates.accountDeletionScheduled({ name: u.fullName.split(' ')[0]!, date: when.toDateString() }));
      clearRefreshCookie(req, reply);
      return reply.status(204).send(null);
    },
  });
};

export const topicRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/topics', {
    schema: {
      tags: ['Topics'],
      summary: 'All interest topics',
      description: 'Feed customization ("One more thing!"), forum Focus Topics, "Search in Topics" and "Sort topics". `description` is the line under each topic name.',
      response: { 200: z.object({ data: z.array(topicDto.extend({ description: z.string() })) }) },
    },
    handler: async (_req, reply) => {
      reply.header('cache-control', 'public, max-age=300');
      return { data: await db.select({ id: topics.id, slug: topics.slug, name: topics.name, description: topics.description }).from(topics).orderBy(topics.sortOrder) };
    },
  });
};
