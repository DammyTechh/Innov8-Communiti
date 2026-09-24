import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { comments, forums, messages, posts, projects, reports, users } from '../../db/schema/index.js';
import { Errors } from '../../lib/errors.js';
import { currentUser } from '../../plugins/auth.js';
import { auth } from '../_shared/dto.js';

export const reportTargetEnum = z.enum(['post', 'comment', 'forum', 'project', 'user', 'message']);
export const reportReasonEnum = z.enum(['spam', 'scam', 'harassment', 'insults', 'hate', 'misinformation', 'nudity', 'violence', 'other']);

/** Resolves the owner of reported content so moderators can act on the person, not just the item. */
export async function ownerOf(targetType: z.infer<typeof reportTargetEnum>, targetId: string): Promise<string | null> {
  const pick = async (q: Promise<{ owner: string | null }[]>) => (await q)[0]?.owner ?? null;
  switch (targetType) {
    case 'post':
      return pick(db.select({ owner: posts.authorId }).from(posts).where(eq(posts.id, targetId)));
    case 'comment':
      return pick(db.select({ owner: comments.authorId }).from(comments).where(eq(comments.id, targetId)));
    case 'forum':
      return pick(db.select({ owner: forums.ownerId }).from(forums).where(eq(forums.id, targetId)));
    case 'project':
      return pick(db.select({ owner: projects.ownerId }).from(projects).where(eq(projects.id, targetId)));
    case 'message':
      return pick(db.select({ owner: messages.senderId }).from(messages).where(eq(messages.id, targetId)));
    case 'user':
      return pick(db.select({ owner: users.id }).from(users).where(eq(users.id, targetId)));
  }
}

export const reportRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.post('/reports', {
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    schema: {
      tags: ['Reports'],
      summary: 'Report a post, comment, forum, project, message or user',
      security: auth,
      body: z.object({ targetType: reportTargetEnum, targetId: z.uuid(), reason: reportReasonEnum, details: z.string().trim().max(1000).optional() }),
      response: { 201: z.object({ id: z.uuid(), message: z.string() }) },
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const b = req.body;
      const owner = await ownerOf(b.targetType, b.targetId);
      if (!owner) throw Errors.notFound('Reported item');
      if (owner === me.id) throw Errors.badRequest('You cannot report your own content');
      const [dupe] = await db
        .select({ id: reports.id })
        .from(reports)
        .where(and(eq(reports.reporterId, me.id), eq(reports.targetType, b.targetType), eq(reports.targetId, b.targetId), eq(reports.status, 'pending')));
      const id =
        dupe?.id ??
        (await db.insert(reports).values({ reporterId: me.id, targetType: b.targetType, targetId: b.targetId, targetUserId: owner, reason: b.reason, details: b.details ?? null }).returning({ id: reports.id }))[0]!.id;
      return reply.status(201).send({ id, message: 'Thanks. Our moderation team will review this.' });
    },
  });
};
