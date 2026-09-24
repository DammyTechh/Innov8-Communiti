import { and, desc, eq, inArray, isNull, lt, ne, notInArray, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { follows, userInterests, userSettings, users } from '../../db/schema/index.js';
import { Errors } from '../../lib/errors.js';
import { contains } from '../../lib/like.js';
import { cursorPageSchema, cursorQuery } from '../../lib/pagination.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, idParam, noContent, userSummary } from '../_shared/dto.js';
import { userSummaryCols } from '../_shared/users.js';
import { notify } from '../notifications/notifications.service.js';

const tags = ['Users'];

const profileDto = userSummary
  .extend({
    bio: z.string().nullable(),
    coverUrl: z.string().nullable(),
    country: z.string().nullable(),
    openToCollaborate: z.boolean(),
    followerCount: z.number(),
    followingCount: z.number(),
    postCount: z.number(),
    collaborationCount: z.number(),
    isFollowing: z.boolean(),
    followsYou: z.boolean(),
    isMe: z.boolean(),
    isPrivate: z.boolean().describe('True when details are hidden by the profile visibility setting'),
    joinedAt: z.string(),
  })
  .meta({ id: 'Profile' });

const activeUser = and(isNull(users.deletedAt), ne(users.status, 'blocked'));

async function relation(viewerId: string, otherId: string) {
  const rows = await db
    .select({ followerId: follows.followerId })
    .from(follows)
    .where(
      sql`((${follows.followerId} = ${viewerId} and ${follows.followingId} = ${otherId}) or (${follows.followerId} = ${otherId} and ${follows.followingId} = ${viewerId}))`,
    );
  return { isFollowing: rows.some((r) => r.followerId === viewerId), followsYou: rows.some((r) => r.followerId === otherId) };
}

/** Follows are kept in a separate table with denormalised counters on users. */
async function follow(followerId: string, followingId: string) {
  if (followerId === followingId) throw Errors.badRequest('You cannot follow yourself');
  const [target] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, followingId), activeUser));
  if (!target) throw Errors.notFound('User');
  const created = await db.transaction(async (tx) => {
    const [row] = await tx.insert(follows).values({ followerId, followingId }).onConflictDoNothing().returning();
    if (!row) return false;
    await tx.update(users).set({ followingCount: sql`${users.followingCount} + 1` }).where(eq(users.id, followerId));
    await tx.update(users).set({ followerCount: sql`${users.followerCount} + 1` }).where(eq(users.id, followingId));
    return true;
  });
  if (created) {
    const [me] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, followerId));
    await notify([followingId], { type: 'follow', actorId: followerId, targetType: 'user', targetId: followerId, title: `${me?.fullName} started following you` });
  }
}

async function unfollow(followerId: string, followingId: string) {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(follows).where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId))).returning();
    if (!row) return;
    await tx.update(users).set({ followingCount: sql`greatest(${users.followingCount} - 1, 0)` }).where(eq(users.id, followerId));
    await tx.update(users).set({ followerCount: sql`greatest(${users.followerCount} - 1, 0)` }).where(eq(users.id, followingId));
  });
}

export const userRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/suggested', {
    schema: {
      tags,
      summary: 'People to follow ("Suggested Community")',
      description: 'Ranks people who share your interests and are not followed yet, then by follower count.',
      security: auth,
      querystring: z.object({ limit: z.coerce.number().int().min(1).max(30).default(10) }),
      response: { 200: z.object({ data: z.array(userSummary.extend({ followerCount: z.number() })) }) },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const followed = db.select({ id: follows.followingId }).from(follows).where(eq(follows.followerId, me.id));
      const myTopics = db.select({ id: userInterests.topicId }).from(userInterests).where(eq(userInterests.userId, me.id));
      const shared = sql<number>`(select count(*) from ${userInterests} ui where ui.user_id = ${users.id} and ui.topic_id in (${myTopics}))`;
      const data = await db
        .select({ ...userSummaryCols, followerCount: users.followerCount })
        .from(users)
        .where(and(activeUser, ne(users.id, me.id), notInArray(users.id, followed), sql`${users.onboardingCompletedAt} is not null`))
        .orderBy(desc(shared), desc(users.followerCount))
        .limit(req.query.limit);
      return { data };
    },
  });

  app.get('/by-username/:username', {
    schema: {
      tags,
      summary: 'Public profile by username',
      security: auth,
      params: z.object({ username: z.string().min(1).max(30) }),
      response: { 200: profileDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const [u] = await db
        .select({ user: users, visibility: userSettings.profileVisibility })
        .from(users)
        .leftJoin(userSettings, eq(userSettings.userId, users.id))
        .where(and(sql`lower(${users.username}) = lower(${req.params.username})`, activeUser))
        .limit(1);
      if (!u) throw Errors.notFound('User');
      const rel = await relation(me.id, u.user.id);
      const isMe = u.user.id === me.id;
      const hidden = !isMe && u.visibility === 'private' && !rel.isFollowing;
      const p = u.user;
      return {
        id: p.id,
        fullName: p.fullName,
        username: p.username,
        avatarUrl: p.avatarUrl,
        headline: p.headline,
        memberRole: p.memberRole,
        bio: hidden ? null : p.bio,
        coverUrl: p.coverUrl,
        country: hidden ? null : p.country,
        openToCollaborate: p.openToCollaborate,
        followerCount: p.followerCount,
        followingCount: p.followingCount,
        postCount: p.postCount,
        collaborationCount: p.collaborationCount,
        ...rel,
        isMe,
        isPrivate: hidden,
        joinedAt: p.createdAt,
      };
    },
  });

  app.post('/:id/follow', {
    schema: { tags, summary: 'Follow a user', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      await follow(currentUser(req).id, req.params.id);
      return reply.status(204).send(null);
    },
  });

  app.delete('/:id/follow', {
    schema: { tags, summary: 'Unfollow a user', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      await unfollow(currentUser(req).id, req.params.id);
      return reply.status(204).send(null);
    },
  });

  for (const direction of ['followers', 'following'] as const) {
    app.get(`/:id/${direction}`, {
      schema: {
        tags,
        summary: direction === 'followers' ? 'People who follow this user' : 'People this user follows',
        security: auth,
        params: idParam,
        querystring: cursorQuery.extend({ q: z.string().max(80).optional() }),
        response: { 200: cursorPageSchema(userSummary.extend({ followedAt: z.string() })) },
      },
      handler: async (req) => {
        const { limit, cursor, q } = req.query;
        const self = direction === 'followers' ? follows.followingId : follows.followerId;
        const other = direction === 'followers' ? follows.followerId : follows.followingId;
        // cursor = the other user's id; follows has no id column, so order by (createdAt, other) and filter on it
        const rows = await db
          .select({ ...userSummaryCols, followedAt: follows.createdAt })
          .from(follows)
          .innerJoin(users, eq(users.id, other))
          .where(
            and(
              eq(self, req.params.id),
              activeUser,
              q ? sql`${users.fullName} ilike ${contains(q)}` : undefined,
              cursor ? lt(other, cursor) : undefined,
            ),
          )
          .orderBy(desc(other))
          .limit(limit + 1);
        const hasMore = rows.length > limit;
        const data = rows.slice(0, limit);
        return { data, nextCursor: hasMore ? data[data.length - 1]!.id : null };
      },
    });
  }

  app.get('/lookup', {
    schema: {
      tags,
      summary: 'Look up many users by id (for mentions, avatars)',
      security: auth,
      querystring: z.object({ ids: z.string().describe('Comma-separated UUIDs, max 50') }),
      response: { 200: z.object({ data: z.array(userSummary) }) },
    },
    handler: async (req) => {
      const ids = req.query.ids.split(',').map((s) => s.trim()).filter((s) => z.uuid().safeParse(s).success).slice(0, 50);
      if (!ids.length) return { data: [] };
      return { data: await db.select(userSummaryCols).from(users).where(and(inArray(users.id, ids), activeUser)) };
    },
  });
};

