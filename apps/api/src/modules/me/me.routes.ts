import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { topics, userInterests, userSettings, users } from '../../db/schema/index.js';
import { audit } from '../../lib/audit.js';
import { Errors } from '../../lib/errors.js';
import { sendMailSafe, templates } from '../../lib/mailer/index.js';
import { verifyPassword } from '../../lib/password.js';
import { currentUser } from '../../plugins/auth.js';
import { toAuthUser } from '../auth/auth.service.js';
import { authUserDto } from '../auth/auth.schemas.js';
import { clearRefreshCookie, revokeAllSessions } from '../auth/session.service.js';
import { auth, memberRoleEnum, noContent, topicDto } from '../_shared/dto.js';

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
    openToCollaborate: z.boolean(),
    followerCount: z.number(),
    followingCount: z.number(),
    postCount: z.number(),
    collaborationCount: z.number(),
    interests: z.array(topicDto),
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
  return { ...toAuthUser(u), ...u, interests };
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
      summary: 'Finish onboarding: role, date of birth, country, interests',
      description: 'Figma: "Setup your account" + "One more thing!". Sets `onboardingComplete: true` and sends the welcome email.',
      security: auth,
      body: z.object({
        memberRole: memberRoleEnum,
        dateOfBirth: dob,
        country,
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
          dateOfBirth: b.dateOfBirth,
          country: b.country,
          ...(b.username ? { username: b.username } : {}),
          onboardingCompletedAt: before?.onboarded ?? new Date().toISOString(),
        })
        .where(eq(users.id, me.id));
      if (before && !before.onboarded) await sendMailSafe(before.email, templates.welcome({ name: before.fullName.split(' ')[0]! }));
      return loadMe(me.id);
    },
  });

  app.patch('/', {
    schema: {
      tags,
      summary: 'Edit profile',
      description: 'Avatar and cover: upload with POST /uploads/presign (purpose avatar|cover), then pass the returned public URL.',
      security: auth,
      body: z
        .object({
          fullName: z.string().trim().min(2).max(80),
          username,
          headline: z.string().trim().max(100).nullable(),
          bio: z.string().trim().max(500).nullable(),
          avatarUrl: z.url().nullable(),
          coverUrl: z.url().nullable(),
          memberRole: memberRoleEnum,
          country,
          dateOfBirth: dob,
          openToCollaborate: z.boolean(),
        })
        .partial(),
      response: { 200: meDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      if (req.body.username) await assertUsernameFree(req.body.username, me.id);
      if (Object.keys(req.body).length) await db.update(users).set(req.body).where(eq(users.id, me.id));
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
      summary: 'Replace my interest topics',
      security: auth,
      body: z.object({ topicIds: z.array(z.uuid()).min(1).max(20) }),
      response: { 200: z.object({ data: z.array(topicDto) }) },
    },
    handler: async (req) => {
      await setInterests(currentUser(req).id, req.body.topicIds);
      return { data: (await loadMe(currentUser(req).id)).interests };
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
      clearRefreshCookie(reply);
      return reply.status(204).send(null);
    },
  });
};

export const topicRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/topics', {
    schema: { tags: ['Topics'], summary: 'All interest topics', response: { 200: z.object({ data: z.array(topicDto) }) } },
    handler: async (_req, reply) => {
      reply.header('cache-control', 'public, max-age=300');
      return { data: await db.select({ id: topics.id, slug: topics.slug, name: topics.name }).from(topics).orderBy(topics.sortOrder) };
    },
  });
};
