import { boolean, check, index, integer, jsonb, pgTable, primaryKey, smallint, text, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAt, pk, timestamps, ts } from './_helpers.js';
import { broadcastStatus, deliveryStatus, pushPlatform } from './enums.js';
import { users } from './users.js';

export const notifications = pgTable(
  'notifications',
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text().notNull(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    targetType: text(),
    targetId: uuid(),
    title: text().notNull(),
    body: text().notNull().default(''),
    data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    readAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.id), index('notifications_unread_idx').on(t.userId, t.readAt)],
);

export const pushTokens = pgTable(
  'push_tokens',
  {
    id: pk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text().notNull().unique(),
    platform: pushPlatform().notNull(),
    lastUsedAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [index('push_tokens_user_idx').on(t.userId)],
);

export interface BroadcastAudience {
  /** all = every member · users / forums / projects = narrow by `ids` (members of those forums or projects). */
  platform?: 'all' | 'users' | 'forums' | 'projects';
  ids?: string[];
  memberRoles?: string[];
  countries?: string[];
}

export const broadcasts = pgTable('broadcasts', {
  id: pk(),
  sentById: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  /** announcement (Notifications page) or maintenance (Settings → Maintenance). */
  kind: text().notNull().default('announcement'),
  title: text().notNull(),
  body: text().notNull(),
  audience: jsonb().$type<BroadcastAudience>().notNull().default({}),
  channels: jsonb().$type<{ email: boolean; inApp: boolean }>().notNull().default({ email: false, inApp: true }),
  /** Extra template data (maintenance: from, to, disableAccess). */
  data: jsonb().$type<Record<string, unknown>>().notNull().default({}),
  status: broadcastStatus().notNull().default('sent'),
  recipientCount: integer().notNull().default(0),
  deliveredCount: integer().notNull().default(0),
  failedCount: integer().notNull().default(0),
  sentAt: ts(),
  createdAt: createdAt(),
});

/** One row per email recipient of a broadcast, so large sends can resume across requests. */
export const broadcastDeliveries = pgTable(
  'broadcast_deliveries',
  {
    broadcastId: uuid()
      .notNull()
      .references(() => broadcasts.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text().notNull(),
    firstName: text().notNull(),
    status: deliveryStatus().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    /** Set while a request is sending this email, so two senders never pick the same row. */
    claimedAt: ts(),
    error: text(),
    sentAt: ts(),
  },
  (t) => [primaryKey({ columns: [t.broadcastId, t.userId] }), index('broadcast_deliveries_pending_idx').on(t.status, t.broadcastId)],
);

/** Single-row table (id = 1) with dashboard-wide switches. */
export const platformSettings = pgTable(
  'platform_settings',
  {
    id: smallint().primaryKey().default(1),
    imageOptimization: boolean().notNull().default(true),
    updatedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [check('platform_settings_singleton', sql`${t.id} = 1`)],
);

export const maintenanceWindows = pgTable(
  'maintenance_windows',
  {
    id: pk(),
    message: text().notNull(),
    startsAt: ts().notNull(),
    endsAt: ts().notNull(),
    /** When true, members get 503 MAINTENANCE between startsAt and endsAt. Staff keep access. */
    disableAccess: boolean().notNull().default(false),
    broadcastId: uuid().references(() => broadcasts.id, { onDelete: 'set null' }),
    createdById: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    cancelledAt: ts(),
    ...timestamps(),
  },
  (t) => [index('maintenance_windows_time_idx').on(t.startsAt, t.endsAt), check('maintenance_windows_order', sql`${t.endsAt} > ${t.startsAt}`)],
);
