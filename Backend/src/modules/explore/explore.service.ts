import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { env } from '../../config/env.js';
import { eventRsvps, events, featuredItems, featuredMedia, featuredTopics, highlightMedia, highlights, topics } from '../../db/schema/index.js';
import { attachmentsFor } from '../_shared/media.js';
import { loadUserSummaries } from '../_shared/users.js';

export async function eventsOut(rows: (typeof events.$inferSelect)[], viewerId: string) {
  const ids = rows.map((r) => r.id);
  const rsvps = ids.length ? await db.select().from(eventRsvps).where(and(inArray(eventRsvps.eventId, ids), eq(eventRsvps.userId, viewerId))) : [];
  return rows.map((e) => ({ ...e, myRsvp: rsvps.find((r) => r.eventId === e.id)?.status ?? null }));
}

export async function highlightsOut(rows: (typeof highlights.$inferSelect)[]) {
  const eventIds = [...new Set(rows.map((r) => r.eventId).filter((x): x is string => Boolean(x)))];
  const [media, people, eventRows] = await Promise.all([
    attachmentsFor(highlightMedia, { parent: highlightMedia.highlightId, media: highlightMedia.mediaId, position: highlightMedia.position }, rows.map((r) => r.id)),
    loadUserSummaries(rows.map((r) => r.createdById)),
    eventIds.length
      ? db.select({ id: events.id, title: events.title, category: events.category, startsAt: events.startsAt, endsAt: events.endsAt }).from(events).where(inArray(events.id, eventIds))
      : Promise.resolve([]),
  ]);
  return rows.map((h) => ({
    ...h,
    event: eventRows.find((e) => e.id === h.eventId) ?? null,
    media: media.get(h.id) ?? [],
    createdBy: people.get(h.createdById) ?? null,
  }));
}

export async function featuredOut(rows: (typeof featuredItems.$inferSelect)[]) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [media, topicRows] = await Promise.all([
    attachmentsFor(featuredMedia, { parent: featuredMedia.featuredId, media: featuredMedia.mediaId, position: featuredMedia.position }, ids),
    db
      .select({ featuredId: featuredTopics.featuredId, id: topics.id, slug: topics.slug, name: topics.name })
      .from(featuredTopics)
      .innerJoin(topics, eq(topics.id, featuredTopics.topicId))
      .where(inArray(featuredTopics.featuredId, ids)),
  ]);
  return rows.map((f) => ({
    ...f,
    topics: topicRows.filter((t) => t.featuredId === f.id).map(({ featuredId: _f, ...t }) => t),
    media: media.get(f.id) ?? [],
    shareUrl: `${env.WEB_URL}/explore/featured/${f.id}`,
  }));
}
