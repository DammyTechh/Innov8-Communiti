import { boolean, index, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, timestamps, ts } from './_helpers.js';
import { eventCategory, eventStatus, rsvpStatus } from './enums.js';
import { media } from './content.js';
import { projects } from './projects.js';
import { users } from './users.js';

export const events = pgTable(
  'events',
  {
    id: pk(),
    createdById: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: text().notNull(),
    category: eventCategory().notNull().default('other'),
    summary: text().notNull().default(''),
    description: text().notNull().default(''),
    coverUrl: text(),
    startsAt: ts().notNull(),
    endsAt: ts().notNull(),
    timezone: text().notNull().default('Africa/Lagos'),
    venue: text(),
    city: text(),
    country: text(),
    isOnline: boolean().notNull().default(false),
    meetingUrl: text(),
    registrationUrl: text(),
    capacity: integer(),
    status: eventStatus().notNull().default('draft'),
    goingCount: integer().notNull().default(0),
    interestedCount: integer().notNull().default(0),
    deletedAt: ts(),
    ...timestamps(),
  },
  (t) => [index('events_starts_at_idx').on(t.status, t.startsAt)],
);

export const eventRsvps = pgTable(
  'event_rsvps',
  {
    eventId: uuid()
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: rsvpStatus().notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] }), index('event_rsvps_user_idx').on(t.userId)],
);

export const featuredItems = pgTable(
  'featured_items',
  {
    id: pk(),
    createdById: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    projectId: uuid().references(() => projects.id, { onDelete: 'set null' }),
    title: text().notNull(),
    summary: text().notNull().default(''),
    body: text().notNull().default(''),
    coverUrl: text(),
    position: integer().notNull().default(0),
    publishedAt: ts(),
    deletedAt: ts(),
    ...timestamps(),
  },
  (t) => [index('featured_items_published_idx').on(t.publishedAt)],
);

export const highlights = pgTable(
  'highlights',
  {
    id: pk(),
    createdById: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    title: text().notNull(),
    caption: text().notNull().default(''),
    publishedAt: ts(),
    deletedAt: ts(),
    ...timestamps(),
  },
  (t) => [index('highlights_published_idx').on(t.publishedAt)],
);

export const highlightMedia = pgTable(
  'highlight_media',
  {
    highlightId: uuid()
      .notNull()
      .references(() => highlights.id, { onDelete: 'cascade' }),
    mediaId: uuid()
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    position: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.highlightId, t.mediaId] })],
);
