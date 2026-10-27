import { and, desc, eq, gt, ilike, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { contains } from '../../lib/like.js';
import { events, forumTopics, forums, highlights, posts, postTopics, projects, searchHistory, topics, users } from '../../db/schema/index.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, noContent, userSummary } from '../_shared/dto.js';
import { notBlocked } from '../_shared/blocks.js';
import { userSummaryCols } from '../_shared/users.js';
import { eventDto, highlightDto } from '../explore/explore.schemas.js';
import { eventsOut, highlightsOut } from '../explore/explore.service.js';
import { visiblePostsFor } from '../posts/posts.access.js';
import { postDto } from '../posts/posts.schemas.js';
import { hydratePosts } from '../posts/posts.service.js';

const tags = ['Search'];

const forumHit = z.object({ id: z.uuid(), name: z.string(), slug: z.string(), about: z.string(), coverUrl: z.string().nullable(), memberCount: z.number() });
const topicHit = z.object({ id: z.uuid(), slug: z.string(), name: z.string(), description: z.string() });
const projectHit = z.object({ id: z.uuid(), title: z.string(), slug: z.string(), pitch: z.string(), coverUrl: z.string().nullable(), status: z.string(), memberCount: z.number() });

export const searchRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/search', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags,
      summary: 'Search posts, people, events, highlights, topics, forums and projects',
      description: [
        'Search results tabs: Posts (`type=posts`), People (`people`), Events (`events`), Highlights (`highlights`), and a topic tab such as "Agriculture" (`type=posts&topicId=…`).',
        '`type=all` returns up to `limit` of each kind (use it for the search dropdown, whose "Search in Topics" list is `topics`).',
        'Trigram (`ILIKE`) matching, indexed. People you blocked or who blocked you are left out. The query is saved to recent searches.',
      ].join(' '),
      security: auth,
      querystring: z.object({
        q: z.string().trim().min(2, 'Type at least 2 characters').max(80),
        type: z.enum(['all', 'people', 'posts', 'forums', 'projects', 'events', 'highlights', 'topics']).default('all'),
        topicId: z.uuid().optional().describe('Only posts tagged with this topic (topic tab)'),
        limit: z.coerce.number().int().min(1).max(30).default(5),
      }),
      response: {
        200: z.object({
          people: z.array(userSummary.extend({ followerCount: z.number() })),
          posts: z.array(postDto),
          forums: z.array(forumHit),
          projects: z.array(projectHit),
          events: z.array(eventDto),
          highlights: z.array(highlightDto),
          topics: z.array(topicHit),
        }),
      },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const { q, type, limit, topicId } = req.query;
      const like = contains(q);
      const want = (t: string) => type === 'all' || type === t;

      const [people, postRows, forumRows, projectRows, eventRows, highlightRows, topicRows] = await Promise.all([
        want('people')
          ? db
              .select({ ...userSummaryCols, followerCount: users.followerCount })
              .from(users)
              .where(
                and(
                  isNull(users.deletedAt),
                  ne(users.status, 'blocked'),
                  notBlocked(me.id, sql`${users}.id`),
                  sql`(coalesce(${users.fullName},'') || ' ' || coalesce(${users.username},'') || ' ' || coalesce(${users.headline},'')) ilike ${like}`,
                ),
              )
              .orderBy(desc(users.followerCount))
              .limit(limit)
          : [],
        want('posts')
          ? db
              .select({
                id: posts.id,
                body: posts.body,
                audience: posts.audience,
                forumId: posts.forumId,
                projectId: posts.projectId,
                likeCount: posts.likeCount,
                commentCount: posts.commentCount,
                shareCount: posts.shareCount,
                viewCount: posts.viewCount,
                editedAt: posts.editedAt,
                createdAt: posts.createdAt,
                author: userSummaryCols,
              })
              .from(posts)
              .innerJoin(users, eq(users.id, posts.authorId))
              .where(
                and(
                  visiblePostsFor(me.id),
                  ilike(posts.body, like),
                  topicId ? sql`exists (select 1 from ${postTopics} pt where pt.post_id = ${posts.id} and pt.topic_id = ${topicId})` : undefined,
                ),
              )
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
        want('events')
          ? db
              .select()
              .from(events)
              .where(
                and(
                  eq(events.status, 'published'),
                  isNull(events.deletedAt),
                  sql`(${events.title} || ' ' || ${events.summary} || ' ' || coalesce(${events.venue}, '') || ' ' || coalesce(${events.organizerName}, '')) ilike ${like}`,
                ),
              )
              .orderBy(desc(events.startsAt))
              .limit(limit)
          : [],
        want('highlights')
          ? db
              .select()
              .from(highlights)
              .where(and(isNotNull(highlights.publishedAt), isNull(highlights.deletedAt), sql`(${highlights.title} || ' ' || ${highlights.caption}) ilike ${like}`))
              .orderBy(desc(highlights.id))
              .limit(limit)
          : [],
        want('topics')
          ? db
              .select({ id: topics.id, slug: topics.slug, name: topics.name, description: topics.description })
              .from(topics)
              .where(sql`(${topics.name} || ' ' || ${topics.description}) ilike ${like}`)
              .orderBy(topics.sortOrder)
              .limit(limit)
          : [],
      ]);

      await db.insert(searchHistory).values({ userId: me.id, query: q });
      const [postOut, eventOut, highlightOut] = await Promise.all([hydratePosts(postRows, me.id), eventsOut(eventRows, me.id), highlightsOut(highlightRows)]);
      return { people, posts: postOut, forums: forumRows, projects: projectRows, events: eventOut, highlights: highlightOut, topics: topicRows };
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
      description:
        'Right sidebar. "Trending in Forums": no filter. "Trending in Agriculture topics": pass `topic=agriculture` (slug) or `topicId`. `postCount` is the "34 Posts" label; `recentPosts` is the last 7 days.',
      security: auth,
      querystring: z.object({
        limit: z.coerce.number().int().min(1).max(20).default(5),
        topicId: z.uuid().optional(),
        topic: z.string().trim().max(60).optional().describe('Topic slug, e.g. agriculture'),
      }),
      response: { 200: z.object({ topic: z.object({ id: z.uuid(), slug: z.string(), name: z.string() }).nullable(), data: z.array(forumHit.extend({ postCount: z.number(), recentPosts: z.number() })) }) },
    },
    handler: async (req) => {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { topicId, topic: slug } = req.query;
      const [topic] =
        topicId || slug
          ? await db
              .select({ id: topics.id, slug: topics.slug, name: topics.name })
              .from(topics)
              .where(topicId ? eq(topics.id, topicId) : eq(topics.slug, slug!))
          : [];
      if ((topicId || slug) && !topic) return { topic: null, data: [] };
      const data = await db
        .select({
          id: forums.id,
          name: forums.name,
          slug: forums.slug,
          about: forums.about,
          coverUrl: forums.coverUrl,
          memberCount: forums.memberCount,
          postCount: forums.postCount,
          recentPosts: sql<number>`count(${posts.id})::int`,
        })
        .from(forums)
        .leftJoin(posts, and(eq(posts.forumId, forums.id), gt(posts.createdAt, weekAgo), isNull(posts.deletedAt)))
        .where(
          and(
            isNull(forums.deletedAt),
            isNull(forums.removedAt),
            eq(forums.visibility, 'public'),
            topic ? sql`exists (select 1 from ${forumTopics} ft where ft.forum_id = ${forums.id} and ft.topic_id = ${topic.id})` : undefined,
          ),
        )
        .groupBy(forums.id)
        .orderBy(desc(sql`count(${posts.id})`), desc(forums.postCount), desc(forums.memberCount))
        .limit(req.query.limit);
      return { topic: topic ?? null, data };
    },
  });
};

