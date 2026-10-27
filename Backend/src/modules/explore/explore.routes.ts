import { and, asc, desc, eq, gte, isNotNull, isNull, lt, lte, ne, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { eventRsvps, events, featuredItems, featuredTopics, follows, forumMembers, forums, forumTopics, highlights, projectMembers, projects, projectTopics, userInterests, users } from '../../db/schema/index.js';
import { contains } from '../../lib/like.js';
import { Errors } from '../../lib/errors.js';
import { cursorPageSchema, cursorQuery, toCursorPage } from '../../lib/pagination.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, idParam, noContent, userSummary } from '../_shared/dto.js';
import { notBlocked } from '../_shared/blocks.js';
import { userSummaryCols } from '../_shared/users.js';
import { forumDto, hydrate as hydrateForums } from '../forums/forums.routes.js';
import { cards as projectCards, projectCard as projectCardDto } from '../projects/projects.routes.js';
import { eventCategory, eventDto, featuredDto, highlightDto } from './explore.schemas.js';
import { eventsOut, featuredOut, highlightsOut } from './explore.service.js';

const tags = ['Explore'];
const published = and(eq(events.status, 'published'), isNull(events.deletedAt));

export const exploreRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/events', {
    schema: {
      tags,
      summary: 'Events',
      description:
        'Explore → Events: Upcoming Events → `upcoming` (soonest first), Concluded → `concluded` (same as `past`, most recent first), `going` (events I RSVP’d to). `q` searches title, venue and organizer. Event view: GET /events/{id}; the Register button opens `registrationUrl`.',
      security: auth,
      querystring: z.object({
        when: z.enum(['upcoming', 'concluded', 'past', 'going']).default('upcoming'),
        category: eventCategory.optional(),
        q: z.string().trim().max(80).optional(),
        from: z.iso.datetime({ offset: true }).optional().describe('Calendar range start'),
        to: z.iso.datetime({ offset: true }).optional().describe('Calendar range end'),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      response: { 200: z.object({ data: z.array(eventDto) }) },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const q = req.query;
      const when = q.when === 'concluded' ? 'past' : q.when;
      const now = new Date().toISOString();
      const rows = await db
        .select()
        .from(events)
        .where(
          and(
            published,
            when === 'upcoming' ? gte(events.endsAt, now) : when === 'past' ? lt(events.endsAt, now) : undefined,
            q.q ? sql`(${events.title} || ' ' || ${events.summary} || ' ' || coalesce(${events.venue}, '') || ' ' || coalesce(${events.organizerName}, '')) ilike ${contains(q.q)}` : undefined,
            when === 'going' ? sql`exists (select 1 from ${eventRsvps} r where r.event_id = ${events.id} and r.user_id = ${me.id})` : undefined,
            q.category ? eq(events.category, q.category) : undefined,
            q.from ? gte(events.startsAt, q.from) : undefined,
            q.to ? lte(events.startsAt, q.to) : undefined,
          ),
        )
        .orderBy(when === 'past' ? desc(events.startsAt) : asc(events.startsAt))
        .limit(q.limit)
        .offset(q.offset);
      return { data: await eventsOut(rows, me.id) };
    },
  });

  app.get('/events/:id', {
    schema: { tags, summary: 'Event details', security: auth, params: idParam, response: { 200: eventDto } },
    handler: async (req) => {
      const [e] = await db.select().from(events).where(and(eq(events.id, req.params.id), published));
      if (!e) throw Errors.notFound('Event');
      return (await eventsOut([e], currentUser(req).id))[0]!;
    },
  });

  app.put('/events/:id/rsvp', {
    schema: {
      tags,
      summary: 'RSVP to an event (going / interested)',
      security: auth,
      params: idParam,
      body: z.object({ status: z.enum(['going', 'interested']) }),
      response: { 200: eventDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const [e] = await db.select().from(events).where(and(eq(events.id, req.params.id), published));
      if (!e) throw Errors.notFound('Event');
      if (new Date(e.endsAt) < new Date()) throw Errors.badRequest('This event has ended');
      await db.transaction(async (tx) => {
        const [prev] = await tx.select().from(eventRsvps).where(and(eq(eventRsvps.eventId, e.id), eq(eventRsvps.userId, me.id)));
        if (prev?.status === req.body.status) return;
        if (req.body.status === 'going' && e.capacity && e.goingCount >= e.capacity) throw Errors.conflict('This event is full');
        await tx.insert(eventRsvps).values({ eventId: e.id, userId: me.id, status: req.body.status }).onConflictDoUpdate({ target: [eventRsvps.eventId, eventRsvps.userId], set: { status: req.body.status } });
        const inc = (s: 'going' | 'interested', by: number) => (s === 'going' ? { goingCount: sql`greatest(${events.goingCount} + ${by}, 0)` } : { interestedCount: sql`greatest(${events.interestedCount} + ${by}, 0)` });
        if (prev) await tx.update(events).set(inc(prev.status, -1)).where(eq(events.id, e.id));
        await tx.update(events).set(inc(req.body.status, 1)).where(eq(events.id, e.id));
      });
      const [u] = await db.select().from(events).where(eq(events.id, e.id));
      return (await eventsOut([u!], me.id))[0]!;
    },
  });

  app.delete('/events/:id/rsvp', {
    schema: { tags, summary: 'Remove my RSVP', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      const me = currentUser(req);
      await db.transaction(async (tx) => {
        const [r] = await tx.delete(eventRsvps).where(and(eq(eventRsvps.eventId, req.params.id), eq(eventRsvps.userId, me.id))).returning();
        if (!r) return;
        await tx
          .update(events)
          .set(r.status === 'going' ? { goingCount: sql`greatest(${events.goingCount} - 1, 0)` } : { interestedCount: sql`greatest(${events.interestedCount} - 1, 0)` })
          .where(eq(events.id, req.params.id));
      });
      return reply.status(204).send(null);
    },
  });

  const publishedFeatured = () => and(isNotNull(featuredItems.publishedAt), lte(featuredItems.publishedAt, new Date().toISOString()), isNull(featuredItems.deletedAt));

  app.get('/featured', {
    schema: {
      tags,
      summary: 'Featured innovations (curated by admins)',
      description: 'Explore → Featured Innovation. "Sort topics" → `topicIds` (comma-separated; items on any of them). "Reset" → omit it.',
      security: auth,
      querystring: z.object({
        topicIds: z
          .string()
          .optional()
          .transform((v, ctx) => {
            if (!v) return undefined;
            const ids = v.split(',').map((x) => x.trim()).filter(Boolean);
            if (ids.some((id) => !z.uuid().safeParse(id).success)) ctx.addIssue({ code: 'custom', message: 'topicIds must be comma-separated UUIDs' });
            return ids;
          }),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      }),
      response: { 200: z.object({ data: z.array(featuredDto) }) },
    },
    handler: async (req) => {
      const ids = req.query.topicIds;
      const rows = await db
        .select()
        .from(featuredItems)
        .where(and(publishedFeatured(), ids?.length ? sql`exists (select 1 from ${featuredTopics} ft where ft.featured_id = ${featuredItems.id} and ft.topic_id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}))` : undefined))
        .orderBy(asc(featuredItems.position), desc(featuredItems.publishedAt))
        .limit(req.query.limit);
      return { data: await featuredOut(rows) };
    },
  });

  app.get('/featured/:id', {
    schema: { tags, summary: 'Featured innovation details (Featured View)', security: auth, params: idParam, response: { 200: featuredDto } },
    handler: async (req) => {
      const [f] = await db.select().from(featuredItems).where(and(eq(featuredItems.id, req.params.id), publishedFeatured()));
      if (!f) throw Errors.notFound('Featured innovation');
      return (await featuredOut([f]))[0]!;
    },
  });

  app.get('/highlights', {
    schema: {
      tags,
      summary: 'Community highlights',
      description: 'Explore → Community Highlights (albums, newest first). "More like this" on an album: `exclude={id}` (add `eventId` for albums of the same event). `q` searches titles and captions.',
      security: auth,
      querystring: cursorQuery.extend({ q: z.string().trim().max(80).optional(), eventId: z.uuid().optional(), exclude: z.uuid().optional() }),
      response: { 200: cursorPageSchema(highlightDto) },
    },
    handler: async (req) => {
      const q = req.query;
      const rows = await db
        .select()
        .from(highlights)
        .where(
          and(
            isNotNull(highlights.publishedAt),
            isNull(highlights.deletedAt),
            q.q ? sql`(${highlights.title} || ' ' || ${highlights.caption}) ilike ${contains(q.q)}` : undefined,
            q.eventId ? eq(highlights.eventId, q.eventId) : undefined,
            q.exclude ? ne(highlights.id, q.exclude) : undefined,
            q.cursor ? lt(highlights.id, q.cursor) : undefined,
          ),
        )
        .orderBy(desc(highlights.id))
        .limit(q.limit + 1);
      const page = toCursorPage(rows, q.limit);
      return { ...page, data: await highlightsOut(page.data) };
    },
  });

  app.get('/highlights/:id', {
    schema: { tags, summary: 'A highlight album (expand image view)', security: auth, params: idParam, response: { 200: highlightDto } },
    handler: async (req) => {
      const [h] = await db.select().from(highlights).where(and(eq(highlights.id, req.params.id), isNotNull(highlights.publishedAt), isNull(highlights.deletedAt)));
      if (!h) throw Errors.notFound('Highlight');
      return (await highlightsOut([h]))[0]!;
    },
  });

  app.get('/explore/suggested', {
    schema: {
      tags,
      summary: 'Explore → "Suggested for you"',
      description: 'Picked from your interest topics: public projects and forums you are not in, people to follow, and the next upcoming events. Falls back to the most popular when nothing matches.',
      security: auth,
      querystring: z.object({ limit: z.coerce.number().int().min(1).max(20).default(6) }),
      response: {
        200: z.object({
          projects: z.array(projectCardDto),
          forums: z.array(forumDto),
          people: z.array(userSummary.extend({ followerCount: z.number() })),
          events: z.array(eventDto),
        }),
      },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const limit = req.query.limit;
      const interests = sql`(select ${userInterests.topicId} from ${userInterests} where ${userInterests.userId} = ${me.id})`;
      const myProjects = sql`(select ${projectMembers.projectId} from ${projectMembers} where ${projectMembers.userId} = ${me.id})`;
      const myForums = sql`(select ${forumMembers.forumId} from ${forumMembers} where ${forumMembers.userId} = ${me.id})`;
      const followed = sql`(select ${follows.followingId} from ${follows} where ${follows.followerId} = ${me.id})`;
      const projectMatch = sql<number>`(select count(*) from ${projectTopics} pt where pt.project_id = ${projects}.id and pt.topic_id in ${interests})`;
      const forumMatch = sql<number>`(select count(*) from ${forumTopics} ft where ft.forum_id = ${forums}.id and ft.topic_id in ${interests})`;
      const personMatch = sql<number>`(select count(*) from ${userInterests} ui where ui.user_id = ${users}.id and ui.topic_id in ${interests})`;
      const [projectRows, forumRows, people, eventRows] = await Promise.all([
        db
          .select()
          .from(projects)
          .where(and(isNull(projects.deletedAt), isNull(projects.removedAt), eq(projects.visibility, 'public'), sql`${projects.id} not in ${myProjects}`, notBlocked(me.id, sql`${projects}.owner_id`)))
          .orderBy(desc(projectMatch), desc(projects.memberCount), desc(projects.id))
          .limit(limit),
        db
          .select()
          .from(forums)
          .where(and(isNull(forums.deletedAt), isNull(forums.removedAt), eq(forums.visibility, 'public'), sql`${forums.id} not in ${myForums}`))
          .orderBy(desc(forumMatch), desc(forums.memberCount), desc(forums.id))
          .limit(limit),
        db
          .select({ ...userSummaryCols, followerCount: users.followerCount })
          .from(users)
          .where(
            and(
              isNull(users.deletedAt),
              ne(users.status, 'blocked'),
              ne(users.id, me.id),
              isNotNull(users.onboardingCompletedAt),
              sql`${users.id} not in ${followed}`,
              notBlocked(me.id, sql`${users}.id`),
            ),
          )
          .orderBy(desc(personMatch), desc(users.followerCount))
          .limit(limit),
        db
          .select()
          .from(events)
          .where(and(published, gte(events.endsAt, new Date().toISOString())))
          .orderBy(asc(events.startsAt))
          .limit(Math.min(limit, 5)),
      ]);
      const [projectOut, forumOut, eventOut] = await Promise.all([projectCards(projectRows, me.id), hydrateForums(forumRows, me.id), eventsOut(eventRows, me.id)]);
      return { projects: projectOut, forums: forumOut, people, events: eventOut };
    },
  });
};
