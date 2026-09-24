import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { pushTokens } from '../../db/schema/index.js';
import { cursorPageSchema, cursorQuery, toCursorPage } from '../../lib/pagination.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, noContent, userSummary } from '../_shared/dto.js';
import { loadUserSummaries } from '../_shared/users.js';
import { listNotifications, markRead, unreadCount } from './notifications.service.js';

const tags = ['Notifications'];

const notificationDto = z
  .object({
    id: z.uuid(),
    type: z.string(),
    actor: userSummary.nullable(),
    targetType: z.string().nullable(),
    targetId: z.string().nullable(),
    title: z.string(),
    body: z.string(),
    data: z.record(z.string(), z.unknown()),
    read: z.boolean(),
    createdAt: z.string(),
  })
  .meta({ id: 'Notification' });

export const notificationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/notifications', {
    schema: {
      tags,
      summary: 'List my notifications',
      security: auth,
      querystring: cursorQuery.extend({ filter: z.enum(['all', 'unread']).default('all') }),
      response: { 200: cursorPageSchema(notificationDto) },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const page = toCursorPage(await listNotifications(me.id, req.query.filter, req.query.cursor, req.query.limit), req.query.limit);
      const actors = await loadUserSummaries(page.data.map((n) => n.actorId));
      return {
        nextCursor: page.nextCursor,
        data: page.data.map((n) => ({ ...n, actor: n.actorId ? (actors.get(n.actorId) ?? null) : null, read: Boolean(n.readAt) })),
      };
    },
  });

  app.get('/notifications/unread-count', {
    schema: { tags, summary: 'Unread count for the sidebar badge', security: auth, response: { 200: z.object({ count: z.number() }) } },
    handler: async (req) => ({ count: await unreadCount(currentUser(req).id) }),
  });

  app.post('/notifications/read', {
    schema: {
      tags,
      summary: 'Mark notifications as read',
      security: auth,
      body: z.union([z.object({ ids: z.array(z.uuid()).min(1).max(100) }), z.object({ all: z.literal(true) })]),
      response: noContent,
    },
    handler: async (req, reply) => {
      await markRead(currentUser(req).id, 'all' in req.body ? 'all' : req.body.ids);
      return reply.status(204).send(null);
    },
  });

  app.post('/push-tokens', {
    schema: {
      tags,
      summary: 'Register an Expo push token for this device',
      security: auth,
      body: z.object({ token: z.string().min(10).max(300), platform: z.enum(['ios', 'android', 'web']) }),
      response: noContent,
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      await db
        .insert(pushTokens)
        .values({ userId: me.id, token: req.body.token, platform: req.body.platform, lastUsedAt: new Date().toISOString() })
        .onConflictDoUpdate({ target: pushTokens.token, set: { userId: me.id, platform: req.body.platform, lastUsedAt: new Date().toISOString() } });
      return reply.status(204).send(null);
    },
  });

  app.delete('/push-tokens', {
    schema: { tags, summary: 'Remove a push token (on logout)', security: auth, body: z.object({ token: z.string() }), response: noContent },
    handler: async (req, reply) => {
      await db.delete(pushTokens).where(and(eq(pushTokens.token, req.body.token), eq(pushTokens.userId, currentUser(req).id)));
      return reply.status(204).send(null);
    },
  });
};
