import { and, desc, eq, gt, ilike, isNull, ne, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { contains } from '../../lib/like.js';
import { forums, posts, postTopics, projects, searchHistory, topics, users } from '../../db/schema/index.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, noContent, userSummary } from '../_shared/dto.js';
import { userSummaryCols } from '../_shared/users.js';
import { visiblePostsFor } from '../posts/posts.access.js';
import { postDto } from '../posts/posts.schemas.js';
import { hydratePosts } from '../posts/posts.service.js';

const tags = ['Search'];

const forumHit = z.object({ id: z.uuid(), name: z.string(), slug: z.string(), about: z.string(), coverUrl: z.string().nullable(), memberCount: z.number() });
const projectHit = z.object({ id: z.uuid(), title: z.string(), slug: z.string(), pitch: z.string(), coverUrl: z.string().nullable(), status: z.string(), memberCount: z.number() });

export const searchRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/search', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags,
      summary: 'Search people, posts, forums and projects',
      description: 'Trigram (`ILIKE`) matching, indexed. `type=all` returns up to `limit` of each kind. The query is saved to recent searches.',
      security: auth,
      querystring: z.object({
        q: z.string().trim().min(2, 'Type at least 2 characters').max(80),
        type: z.enum(['all', 'people', 'posts', 'forums', 'projects']).default('all'),
        limit: z.coerce.number().int().min(1).max(30).default(5),
      }),
      response: {
        200: z.object({
          people: z.array(userSummary.extend({ followerCount: z.number() })),
          posts: z.array(postDto),
          forums: z.array(forumHit),
          projects: z.array(projectHit),
        }),
      },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const { q, type, limit } = req.query;
      const like = contains(q);
      const want = (t: string) => type === 'all' || type === t;

      const [people, postRows, forumRows, projectRows] = await Promise.all([
        want('people')
          ? db
              .select({ ...userSummaryCols, followerCount: users.followerCount })
              .from(users)
              .where(and(isNull(users.deletedAt), ne(users.status, 'blocked'), sql`(coalesce(${users.fullName},'') || ' ' || coalesce(${users.username},'') || ' ' || coalesce(${users.headline},'')) ilike ${like}`))
              .orderBy(desc(users.followerCount))
              .limit(limit)
          : [],
        want('posts')
          ? db
              .select({ id: posts.id, body: posts.body, audience: posts.audience, forumId: posts.forumId, projectId: posts.projectId, likeCount: posts.likeCount, commentCount: posts.commentCount, shareCount: posts.shareCount, editedAt: posts.editedAt, createdAt: posts.createdAt, author: userSummaryCols })
              .from(posts)
              .innerJoin(users, eq(users.id, posts.authorId))
              .where(and(visiblePostsFor(me.id), ilike(posts.body, like)))
              .orderBy(desc(posts.id))
              .limit(limit)
          : [],
        want('forums')
          ? db
              .select({ id: forums.id, name: forums.name, slug: forums.slug, about: forums.about, coverUrl: forums.coverUrl, memberCount: forums.memberCount })
              .from(forums)
              .where(and(isNull(forums.deletedAt), isNull(forums.removedAt), eq(forums.visibility, 'public'), sql`(${forums.name} || ' ' || ${forums.about}) ilike ${like}`))
              .orderBy(desc(forums.memberCount))
              .limit(limit)
          : [],
        want('projects')
          ? db
              .select({ id: projects.id, title: projects.title, slug: projects.slug, pitch: projects.pitch, coverUrl: projects.coverUrl, status: projects.status, memberCount: projects.memberCount })
              .from(projects)
              .where(and(isNull(projects.deletedAt), isNull(projects.removedAt), eq(projects.visibility, 'public'), sql`(${projects.title} || ' ' || ${projects.pitch}) ilike ${like}`))
              .orderBy(desc(projects.memberCount))
              .limit(limit)
          : [],
      ]);

      await db.insert(searchHistory).values({ userId: me.id, query: q });
      return { people, posts: await hydratePosts(postRows, me.id), forums: forumRows, projects: projectRows };
    },
  });

  app.get('/search/recent', {
    schema: { tags, summary: 'My recent searches', security: auth, response: { 200: z.object({ data: z.array(z.string()) }) } },
    handler: async (req) => {
      const rows = await db.execute<{ query: string }>(sql`
        select query from (
          select distinct on (lower(query)) query, created_at from ${searchHistory}
          where user_id = ${currentUser(req).id} order by lower(query), created_at desc
        ) s order by created_at desc limit 10`);
      return { data: [...rows].map((r) => r.query) };
    },
  });

  app.delete('/search/recent', {
    schema: { tags, summary: 'Clear my recent searches', security: auth, response: noContent },
    handler: async (req, reply) => {
      await db.delete(searchHistory).where(eq(searchHistory.userId, currentUser(req).id));
      return reply.status(204).send(null);
    },
  });

  app.get('/trending/topics', {
    schema: {
      tags,
      summary: 'Trending topics (most-used in posts over the last 7 days)',
      security: auth,
      querystring: z.object({ limit: z.coerce.number().int().min(1).max(20).default(8) }),
      response: { 200: z.object({ data: z.array(z.object({ id: z.uuid(), slug: z.string(), name: z.string(), postCount: z.number() })) }) },
    },
    handler: async (req) => {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const data = await db
        .select({ id: topics.id, slug: topics.slug, name: topics.name, postCount: sql<number>`count(${posts.id})::int` })
        .from(topics)
        .leftJoin(postTopics, eq(postTopics.topicId, topics.id))
        .leftJoin(posts, and(eq(posts.id, postTopics.postId), gt(posts.createdAt, weekAgo), isNull(posts.deletedAt)))
        .groupBy(topics.id)
        .orderBy(desc(sql`count(${posts.id})`), topics.sortOrder)
        .limit(req.query.limit);
      return { data };
    },
  });

  app.get('/trending/forums', {
    schema: {
      tags,
      summary: 'Trending forums (most active in the last 7 days)',
      security: auth,
      querystring: z.object({ limit: z.coerce.number().int().min(1).max(20).default(5) }),
      response: { 200: z.object({ data: z.array(forumHit.extend({ recentPosts: z.number() })) }) },
    },
    handler: async (req) => {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const data = await db
        .select({ id: forums.id, name: forums.name, slug: forums.slug, about: forums.about, coverUrl: forums.coverUrl, memberCount: forums.memberCount, recentPosts: sql<number>`count(${posts.id})::int` })
        .from(forums)
        .leftJoin(posts, and(eq(posts.forumId, forums.id), gt(posts.createdAt, weekAgo), isNull(posts.deletedAt)))
        .where(and(isNull(forums.deletedAt), isNull(forums.removedAt), eq(forums.visibility, 'public')))
        .groupBy(forums.id)
        .orderBy(desc(sql`count(${posts.id})`), desc(forums.memberCount))
        .limit(req.query.limit);
      return { data };
    },
  });
};

