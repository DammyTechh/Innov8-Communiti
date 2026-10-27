import { and, desc, eq, inArray, isNull, lt, ne, notInArray, sql, type SQL } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { collaborationRequests, follows, userBlocks, userInterests, userSettings, users } from '../../db/schema/index.js';
import { Errors } from '../../lib/errors.js';
import { contains } from '../../lib/like.js';
import { cursorPageSchema, cursorQuery } from '../../lib/pagination.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, idParam, noContent, userSummary } from '../_shared/dto.js';
import { assertNotBlocked, blockState, notBlocked } from '../_shared/blocks.js';
import { userSummaryCols } from '../_shared/users.js';
import { notify } from '../notifications/notifications.service.js';

const tags = ['Users'];

const profileDto = userSummary
  .extend({
    bio: z.string().nullable(),
    coverUrl: z.string().nullable(),
    country: z.string().nullable(),
    location: z.string().nullable(),
    openToCollaborate: z.boolean().describe('"Open to Collaborations" button'),
    followerCount: z.number(),
    followingCount: z.number(),
    postCount: z.number(),
    collaborationCount: z.number(),
    isFollowing: z.boolean(),
    followsYou: z.boolean(),
    isMe: z.boolean(),
    isPrivate: z.boolean().describe('True when details are hidden by the profile visibility setting'),
    blockedByMe: z.boolean().describe('You blocked this person: show Unblock instead of Follow / Message'),
    collaborationRequest: z
      .object({ id: z.uuid(), direction: z.enum(['sent', 'received']), status: z.literal('pending') })
      .nullable()
      .describe('A pending collaboration request between you and this person, if any'),
    joinedAt: z.string(),
  })
  .meta({ id: 'Profile' });

/** Builds the profile card. Returns 404 when the person blocked the viewer. */
async function profileOf(viewerId: string, where: SQL) {
  const [u] = await db
    .select({ user: users, visibility: userSettings.profileVisibility, verified: userSummaryCols.verified })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(and(where, activeUser))
    .limit(1);
  if (!u) throw Errors.notFound('User');
  const isMe = u.user.id === viewerId;
  const blocks = isMe ? { blockedByMe: false, blockedMe: false } : await blockState(viewerId, u.user.id);
  if (blocks.blockedMe) throw Errors.notFound('User');
  const rel = await relation(viewerId, u.user.id);
  const hidden = !isMe && u.visibility === 'private' && !rel.isFollowing;
  const [pending] = isMe
    ? []
    : await db
        .select({ id: collaborationRequests.id, senderId: collaborationRequests.senderId })
        .from(collaborationRequests)
        .where(
          and(
            eq(collaborationRequests.status, 'pending'),
            sql`((${collaborationRequests.senderId} = ${viewerId} and ${collaborationRequests.recipientId} = ${u.user.id}) or (${collaborationRequests.senderId} = ${u.user.id} and ${collaborationRequests.recipientId} = ${viewerId}))`,
          ),
        )
        .limit(1);
  const p = u.user;
  return {
    id: p.id,
    fullName: p.fullName,
    username: p.username,
    avatarUrl: p.avatarUrl,
    headline: p.headline,
    memberRole: p.memberRole,
    verified: u.verified,
    bio: hidden ? null : p.bio,
    coverUrl: p.coverUrl,
    country: hidden ? null : p.country,
    location: hidden ? null : p.location,
    openToCollaborate: p.openToCollaborate,
    followerCount: p.followerCount,
    followingCount: p.followingCount,
    postCount: p.postCount,
    collaborationCount: p.collaborationCount,
    ...rel,
    isMe,
    isPrivate: hidden,
    blockedByMe: blocks.blockedByMe,
    collaborationRequest: pending ? { id: pending.id, direction: pending.senderId === viewerId ? ('sent' as const) : ('received' as const), status: 'pending' as const } : null,
    joinedAt: p.createdAt,
  };
}

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
  await assertNotBlocked(followerId, followingId, 'You cannot follow this person');
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
        .where(and(activeUser, ne(users.id, me.id), notInArray(users.id, followed), sql`${users.onboardingCompletedAt} is not null`, notBlocked(me.id, sql`${users}.id`)))
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
    handler: async (req) => profileOf(currentUser(req).id, sql`lower(${users.username}) = lower(${req.params.username})`),
  });

  app.get('/:id', {
    schema: { tags, summary: 'Public profile by id ("View Profile")', security: auth, params: idParam, response: { 200: profileDto } },
    handler: async (req) => profileOf(currentUser(req).id, eq(users.id, req.params.id)),
  });

  app.post('/:id/block', {
    schema: {
      tags,
      summary: 'Block a member',
      description:
        'Post sheet → "Block (user)". Unfollows both ways, cancels pending collaboration requests, and from then on neither of you sees the other\'s posts or comments, and you cannot follow, message or send collaboration requests to each other. Your blocked list: GET /me/blocked-users.',
      security: auth,
      params: idParam,
      response: noContent,
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const otherId = req.params.id;
      if (otherId === me.id) throw Errors.badRequest('You cannot block yourself');
      const [target] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, otherId), isNull(users.deletedAt)));
      if (!target) throw Errors.notFound('User');
      await db.insert(userBlocks).values({ blockerId: me.id, blockedId: otherId }).onConflictDoNothing();
      await unfollow(me.id, otherId);
      await unfollow(otherId, me.id);
      await db
        .update(collaborationRequests)
        .set({ status: 'cancelled', decidedAt: new Date().toISOString() })
        .where(
          and(
            eq(collaborationRequests.status, 'pending'),
            sql`((${collaborationRequests.senderId} = ${me.id} and ${collaborationRequests.recipientId} = ${otherId}) or (${collaborationRequests.senderId} = ${otherId} and ${collaborationRequests.recipientId} = ${me.id}))`,
          ),
        );
      return reply.status(204).send(null);
    },
  });

  app.delete('/:id/block', {
    schema: { tags, summary: 'Unblock a member', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, currentUser(req).id), eq(userBlocks.blockedId, req.params.id)));
      return reply.status(204).send(null);
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
        description: 'People you blocked, or who blocked you, are left out.',
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
              notBlocked(currentUser(req).id, sql`${users}.id`),
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

