import { and, eq, gte, inArray, isNotNull, isNull, lt, or } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { comments, eventRsvps, events, forums, otpCodes, posts, projects, sessions, users } from '../../db/schema/index.js';
import { safeEqual } from '../../lib/crypto.js';
import { Errors } from '../../lib/errors.js';
import { templates } from '../../lib/mailer/index.js';
import { emailUsers } from '../notifications/notifications.service.js';

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

/**
 * Accounts past the 30-day grace period are anonymised rather than hard-deleted:
 * forums/projects they own and conversations stay intact for other members,
 * while every piece of personal data is removed.
 */
async function purgeDeletedAccounts() {
  const due = await db.select({ id: users.id }).from(users).where(and(isNotNull(users.deletionScheduledFor), lt(users.deletionScheduledFor, new Date().toISOString()), isNull(users.deletedAt)));
  const now = new Date().toISOString();
  for (const { id } of due) {
    await db.transaction(async (tx) => {
      await tx.update(posts).set({ deletedAt: now }).where(and(eq(posts.authorId, id), isNull(posts.deletedAt)));
      await tx.update(comments).set({ deletedAt: now }).where(and(eq(comments.authorId, id), isNull(comments.deletedAt)));
      await tx.update(projects).set({ deletedAt: now }).where(and(eq(projects.ownerId, id), isNull(projects.deletedAt)));
      await tx.update(forums).set({ deletedAt: now }).where(and(eq(forums.ownerId, id), isNull(forums.deletedAt)));
      await tx.delete(sessions).where(eq(sessions.userId, id));
      await tx
        .update(users)
        .set({
          email: `deleted-${id}@deleted.invalid`,
          fullName: 'Deleted user',
          username: null,
          passwordHash: null,
          googleId: null,
          avatarUrl: null,
          coverUrl: null,
          headline: null,
          bio: null,
          dateOfBirth: null,
          country: null,
          deletedAt: now,
          deletionScheduledFor: null,
        })
        .where(eq(users.id, id));
    });
  }
  return due.length;
}

/** Runs daily, so each event falls in exactly one 24–48h window and gets one reminder. */
async function sendEventReminders() {
  const from = new Date(Date.now() + 24 * 3600_000).toISOString();
  const to = new Date(Date.now() + 48 * 3600_000).toISOString();
  const upcoming = await db.select().from(events).where(and(eq(events.status, 'published'), isNull(events.deletedAt), gte(events.startsAt, from), lt(events.startsAt, to)));
  let sent = 0;
  for (const e of upcoming) {
    const going = await db.select({ userId: eventRsvps.userId }).from(eventRsvps).where(and(eq(eventRsvps.eventId, e.id), eq(eventRsvps.status, 'going')));
    const where = e.isOnline ? 'Online' : [e.venue, e.city].filter(Boolean).join(', ') || 'See event page';
    const when = new Date(e.startsAt).toLocaleString('en-GB', { timeZone: e.timezone, dateStyle: 'full', timeStyle: 'short' });
    await emailUsers(going.map((g) => g.userId), 'event_reminder', (u) => templates.eventReminder({ name: u.firstName, event: e.title, when, where, eventId: e.id }));
    sent += going.length;
  }
  return sent;
}

export const cronRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/cron/cleanup', {
    config: { rateLimit: false },
    schema: {
      hide: true,
      headers: z.object({ authorization: z.string().optional() }),
      response: { 200: z.object({ otps: z.number(), sessions: z.number(), reinstated: z.number(), accountsPurged: z.number(), eventReminders: z.number() }) },
    },
    handler: async (req) => {
      // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
      const expected = `Bearer ${env.CRON_SECRET}`;
      if (!env.CRON_SECRET || !safeEqual(req.headers.authorization ?? '', expected)) throw Errors.unauthenticated('Invalid cron secret');

      const otps = await db.delete(otpCodes).where(lt(otpCodes.createdAt, daysAgo(1))).returning({ id: otpCodes.id });
      const expired = await db
        .delete(sessions)
        .where(or(lt(sessions.expiresAt, new Date().toISOString()), and(isNotNull(sessions.revokedAt), lt(sessions.revokedAt, daysAgo(30)))))
        .returning({ id: sessions.id });
      const reinstated = await db
        .update(users)
        .set({ status: 'active', statusUntil: null, statusReason: null })
        .where(and(inArray(users.status, ['suspended', 'restricted']), isNotNull(users.statusUntil), lt(users.statusUntil, new Date().toISOString())))
        .returning({ id: users.id });
      const accountsPurged = await purgeDeletedAccounts();
      const eventReminders = await sendEventReminders();
      req.log.info({ otps: otps.length, sessions: expired.length, reinstated: reinstated.length, accountsPurged, eventReminders }, 'cron cleanup done');
      return { otps: otps.length, sessions: expired.length, reinstated: reinstated.length, accountsPurged, eventReminders };
    },
  });
};

