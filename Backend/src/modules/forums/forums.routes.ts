import { and, desc, eq, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { patchOf } from '../../lib/zod.js';
import { db } from '../../db/client.js';
import { forumMembers, forums, forumTopics, posts, topics, users } from '../../db/schema/index.js';
import { Errors } from '../../lib/errors.js';
import { contains } from '../../lib/like.js';
import { cursorPageSchema, cursorQuery, toCursorPage } from '../../lib/pagination.js';
import { uniqueSlug } from '../../lib/slug.js';
import { currentUser, hasRole } from '../../plugins/auth.js';
import { auth, idParam, noContent, topicDto, userSummary } from '../_shared/dto.js';
import { userSummaryCols } from '../_shared/users.js';
import { postDto } from '../posts/posts.schemas.js';
import { listPosts } from '../posts/posts.service.js';

const tags = ['Forums'];

const forumDto = z
  .object({
    id: z.uuid(),
    name: z.string(),
    slug: z.string(),
    about: z.string(),
    coverUrl: z.string().nullable(),
    visibility: z.enum(['public', 'private']),
    memberCount: z.number(),
    postCount: z.number(),
    topics: z.array(topicDto),
    owner: userSummary,
    isMember: z.boolean(),
    myRole: z.enum(['owner', 'moderator', 'member']).nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'Forum' });

const forumBody = z.object({
  name: z.string().trim().min(3).max(80),
  about: z.string().trim().max(1000).default(''),
  coverUrl: z.url().nullable().optional(),
  visibility: z.enum(['public', 'private']).default('public'),
  topicIds: z.array(z.uuid()).max(5).default([]),
});

const live = and(isNull(forums.deletedAt), isNull(forums.removedAt));

async function hydrate(rows: (typeof forums.$inferSelect)[], viewerId: string) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [topicRows, memberships, owners] = await Promise.all([
    db.select({ forumId: forumTopics.forumId, id: topics.id, slug: topics.slug, name: topics.name }).from(forumTopics).innerJoin(topics, eq(topics.id, forumTopics.topicId)).where(inArray(forumTopics.forumId, ids)),
    db.select().from(forumMembers).where(and(inArray(forumMembers.forumId, ids), eq(forumMembers.userId, viewerId))),
    db.select(userSummaryCols).from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.ownerId))])),
  ]);
  return rows.map((f) => {
    const m = memberships.find((x) => x.forumId === f.id);
    return {
      ...f,
      topics: topicRows.filter((t) => t.forumId === f.id).map(({ forumId: _f, ...t }) => t),
      owner: owners.find((o) => o.id === f.ownerId)!,
      isMember: Boolean(m),
      myRole: m?.role ?? null,
    };
  });
}

async function loadForum(id: string, viewerId: string) {
  const [f] = await db.select().from(forums).where(and(eq(forums.id, id), live));
  if (!f) throw Errors.notFound('Forum');
  return (await hydrate([f], viewerId))[0]!;
}

async function requireForumRole(forumId: string, userId: string, roles: ('owner' | 'moderator')[]) {
  const [m] = await db.select().from(forumMembers).where(and(eq(forumMembers.forumId, forumId), eq(forumMembers.userId, userId)));
  if (!m || !(roles as string[]).includes(m.role)) throw Errors.forbidden('Only forum owners and moderators can do this');
}

async function addMember(forumId: string, userId: string, role: 'owner' | 'moderator' | 'member' = 'member') {
  await db.transaction(async (tx) => {
    const [r] = await tx.insert(forumMembers).values({ forumId, userId, role }).onConflictDoNothing().returning();
    if (r) await tx.update(forums).set({ memberCount: sql`${forums.memberCount} + 1` }).where(eq(forums.id, forumId));
  });
}

async function removeMember(forumId: string, userId: string) {
  await db.transaction(async (tx) => {
    const [r] = await tx.delete(forumMembers).where(and(eq(forumMembers.forumId, forumId), eq(forumMembers.userId, userId))).returning();
    if (r) await tx.update(forums).set({ memberCount: sql`greatest(${forums.memberCount} - 1, 0)` }).where(eq(forums.id, forumId));
  });
}

export const forumRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/', {
    schema: {
      tags,
      summary: 'Browse forums',
      description: '`discover`: public forums you have not joined. `joined`: forums you are in. `mine`: forums you own.',
      security: auth,
      querystring: cursorQuery.extend({
        tab: z.enum(['discover', 'joined', 'mine']).default('discover'),
        q: z.string().trim().max(80).optional(),
        topicId: z.uuid().optional(),
      }),
      response: { 200: cursorPageSchema(forumDto) },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const { tab, q, topicId, cursor, limit } = req.query;
      const joined = sql`(select ${forumMembers.forumId} from ${forumMembers} where ${forumMembers.userId} = ${me.id})`;
      const tabWhere =
        tab === 'joined' ? sql`${forums.id} in ${joined}` : tab === 'mine' ? eq(forums.ownerId, me.id) : and(eq(forums.visibility, 'public'), sql`${forums.id} not in ${joined}`);
      const rows = await db
        .select()
        .from(forums)
        .where(
          and(
            live,
            tabWhere,
            q ? or(ilike(forums.name, contains(q)), ilike(forums.about, contains(q))) : undefined,
            topicId ? sql`exists (select 1 from ${forumTopics} ft where ft.forum_id = ${forums.id} and ft.topic_id = ${topicId})` : undefined,
            cursor ? lt(forums.id, cursor) : undefined,
          ),
        )
        .orderBy(desc(forums.id))
        .limit(limit + 1);
      const page = toCursorPage(rows, limit);
      return { ...page, data: await hydrate(page.data, me.id) };
    },
  });

  app.post('/', {
    preHandler: [app.requireMember],
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    schema: { tags, summary: 'Create a forum', security: auth, body: forumBody, response: { 201: forumDto } },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const { topicIds, ...b } = req.body;
      const [f] = await db.insert(forums).values({ ...b, coverUrl: b.coverUrl ?? null, ownerId: me.id, slug: uniqueSlug(b.name) }).returning();
      if (topicIds.length) await db.insert(forumTopics).values([...new Set(topicIds)].map((topicId) => ({ forumId: f!.id, topicId })));
      await addMember(f!.id, me.id, 'owner');
      return reply.status(201).send(await loadForum(f!.id, me.id));
    },
  });

  app.get('/:id', {
    schema: { tags, summary: 'Forum details', security: auth, params: idParam, response: { 200: forumDto } },
    handler: async (req) => {
      const f = await loadForum(req.params.id, currentUser(req).id);
      if (f.visibility === 'private' && !f.isMember && !hasRole(req.user, 'moderator')) throw Errors.notFound('Forum');
      return f;
    },
  });

  app.patch('/:id', {
    schema: { tags, summary: 'Edit a forum (owner, moderator)', security: auth, params: idParam, body: patchOf(forumBody), response: { 200: forumDto } },
    handler: async (req) => {
      const me = currentUser(req);
      await requireForumRole(req.params.id, me.id, ['owner', 'moderator']);
      const { topicIds, ...b } = req.body;
      if (Object.keys(b).length) await db.update(forums).set(b).where(eq(forums.id, req.params.id));
      if (topicIds) {
        await db.delete(forumTopics).where(eq(forumTopics.forumId, req.params.id));
        if (topicIds.length) await db.insert(forumTopics).values([...new Set(topicIds)].map((topicId) => ({ forumId: req.params.id, topicId })));
      }
      return loadForum(req.params.id, me.id);
    },
  });

  app.delete('/:id', {
    schema: { tags, summary: 'Delete a forum (owner)', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      await requireForumRole(req.params.id, currentUser(req).id, ['owner']);
      await db.update(forums).set({ deletedAt: new Date().toISOString() }).where(eq(forums.id, req.params.id));
      return reply.status(204).send(null);
    },
  });

  app.post('/:id/join', {
    preHandler: [app.requireMember],
    schema: { tags, summary: 'Join a public forum', security: auth, params: idParam, response: { 200: forumDto } },
    handler: async (req) => {
      const me = currentUser(req);
      const f = await loadForum(req.params.id, me.id);
      if (f.visibility === 'private') throw Errors.forbidden('This forum is invite-only');
      await addMember(f.id, me.id);
      return loadForum(f.id, me.id);
    },
  });

  app.delete('/:id/join', {
    schema: { tags, summary: 'Leave a forum', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const f = await loadForum(req.params.id, me.id);
      if (f.myRole === 'owner') throw Errors.badRequest('Owners cannot leave. Transfer ownership or delete the forum.');
      await removeMember(f.id, me.id);
      return reply.status(204).send(null);
    },
  });

  app.get('/:id/members', {
    schema: {
      tags,
      summary: 'Forum members',
      security: auth,
      params: idParam,
      querystring: cursorQuery,
      response: { 200: cursorPageSchema(userSummary.extend({ role: z.enum(['owner', 'moderator', 'member']), joinedAt: z.string() })) },
    },
    handler: async (req) => {
      const { cursor, limit } = req.query;
      const rows = await db
        .select({ ...userSummaryCols, role: forumMembers.role, joinedAt: forumMembers.joinedAt })
        .from(forumMembers)
        .innerJoin(users, eq(users.id, forumMembers.userId))
        .where(and(eq(forumMembers.forumId, req.params.id), cursor ? lt(users.id, cursor) : undefined))
        .orderBy(desc(users.id))
        .limit(limit + 1);
      return toCursorPage(rows, limit);
    },
  });

  app.post('/:id/members', {
    schema: {
      tags,
      summary: 'Add a member or set a role (owner, moderator)',
      security: auth,
      params: idParam,
      body: z.object({ userId: z.uuid(), role: z.enum(['moderator', 'member']).default('member') }),
      response: noContent,
    },
    handler: async (req, reply) => {
      await requireForumRole(req.params.id, currentUser(req).id, ['owner', 'moderator']);
      await addMember(req.params.id, req.body.userId, req.body.role);
      await db.update(forumMembers).set({ role: req.body.role }).where(and(eq(forumMembers.forumId, req.params.id), eq(forumMembers.userId, req.body.userId)));
      return reply.status(204).send(null);
    },
  });

  app.delete('/:id/members/:userId', {
    schema: { tags, summary: 'Remove a member (owner, moderator)', security: auth, params: z.object({ id: z.uuid(), userId: z.uuid() }), response: noContent },
    handler: async (req, reply) => {
      await requireForumRole(req.params.id, currentUser(req).id, ['owner', 'moderator']);
      const [target] = await db.select().from(forumMembers).where(and(eq(forumMembers.forumId, req.params.id), eq(forumMembers.userId, req.params.userId)));
      if (target?.role === 'owner') throw Errors.forbidden('The owner cannot be removed');
      await removeMember(req.params.id, req.params.userId);
      return reply.status(204).send(null);
    },
  });

  app.get('/:id/posts', {
    schema: { tags, summary: 'Posts in a forum', security: auth, params: idParam, querystring: cursorQuery, response: { 200: cursorPageSchema(postDto) } },
    handler: async (req) => listPosts(currentUser(req).id, eq(posts.forumId, req.params.id), req.query.cursor, req.query.limit),
  });
};
