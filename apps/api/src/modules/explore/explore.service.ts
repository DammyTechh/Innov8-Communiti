import { and, eq, inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { eventRsvps, events, highlightMedia, highlights } from '../../db/schema/index.js';
import { attachmentsFor } from '../_shared/media.js';
import { loadUserSummaries } from '../_shared/users.js';

export async function eventsOut(rows: (typeof events.$inferSelect)[], viewerId: string) {
  const ids = rows.map((r) => r.id);
  const rsvps = ids.length ? await db.select().from(eventRsvps).where(and(inArray(eventRsvps.eventId, ids), eq(eventRsvps.userId, viewerId))) : [];
  return rows.map((e) => ({ ...e, myRsvp: rsvps.find((r) => r.eventId === e.id)?.status ?? null }));
}

export async function highlightsOut(rows: (typeof highlights.$inferSelect)[]) {
  const [media, people] = await Promise.all([
    attachmentsFor(highlightMedia, { parent: highlightMedia.highlightId, media: highlightMedia.mediaId, position: highlightMedia.position }, rows.map((r) => r.id)),
    loadUserSummaries(rows.map((r) => r.createdById)),
  ]);
  return rows.map((h) => ({ ...h, media: media.get(h.id) ?? [], createdBy: people.get(h.createdById) ?? null }));
}
