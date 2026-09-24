import { and, asc, desc, eq, gte, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { eventRsvps, events, featuredItems, highlights } from '../../db/schema/index.js';
import { Errors } from '../../lib/errors.js';
import { cursorPageSchema, cursorQuery, toCursorPage } from '../../lib/pagination.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, idParam, noContent } from '../_shared/dto.js';
import { eventCategory, eventDto, featuredDto, highlightDto } from './explore.schemas.js';
import { eventsOut, highlightsOut } from './explore.service.js';

const tags = ['Explore'];
const published = and(eq(events.status, 'published'), isNull(events.deletedAt));

export const exploreRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/events', {
    schema: {
      tags,
      summary: 'Events',
      description: '`upcoming` (soonest first), `past` (most recent first), or `going` (events I RSVP’d to).',
      security: auth,
      querystring: z.object({
        when: z.enum(['upcoming', 'past', 'going']).default('upcoming'),
        category: eventCategory.optional(),
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
      const now = new Date().toISOString();
      const rows = await db
        .select()
        .from(events)
        .where(
          and(
            published,
            q.when === 'upcoming' ? gte(events.endsAt, now) : q.when === 'past' ? lt(events.endsAt, now) : undefined,
            q.when === 'going' ? sql`exists (select 1 from ${eventRsvps} r where r.event_id = ${events.id} and r.user_id = ${me.id})` : undefined,
            q.category ? eq(events.category, q.category) : undefined,
            q.from ? gte(events.startsAt, q.from) : undefined,
            q.to ? lte(events.startsAt, q.to) : undefined,
          ),
        )
        .orderBy(q.when === 'past' ? desc(events.startsAt) : asc(events.startsAt))
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

  app.get('/featured', {
    schema: { tags, summary: 'Featured innovations (curated by admins)', security: auth, response: { 200: z.object({ data: z.array(featuredDto) }) } },
    handler: async () => ({
      data: await db
        .select()
        .from(featuredItems)
        .where(and(isNotNull(featuredItems.publishedAt), lte(featuredItems.publishedAt, new Date().toISOString()), isNull(featuredItems.deletedAt)))
        .orderBy(asc(featuredItems.position), desc(featuredItems.publishedAt))
        .limit(20),
    }),
  });

  app.get('/featured/:id', {
    schema: { tags, summary: 'Featured innovation details', security: auth, params: idParam, response: { 200: featuredDto } },
    handler: async (req) => {
      const [f] = await db.select().from(featuredItems).where(and(eq(featuredItems.id, req.params.id), isNotNull(featuredItems.publishedAt), isNull(featuredItems.deletedAt)));
      if (!f) throw Errors.notFound('Featured innovation');
      return f;
    },
  });

  app.get('/highlights', {
    schema: { tags, summary: 'Community highlights', security: auth, querystring: cursorQuery, response: { 200: cursorPageSchema(highlightDto) } },
    handler: async (req) => {
      const rows = await db
        .select()
        .from(highlights)
        .where(and(isNotNull(highlights.publishedAt), isNull(highlights.deletedAt), req.query.cursor ? lt(highlights.id, req.query.cursor) : undefined))
        .orderBy(desc(highlights.id))
        .limit(req.query.limit + 1);
      const page = toCursorPage(rows, req.query.limit);
      return { ...page, data: await highlightsOut(page.data) };
    },
  });
};
