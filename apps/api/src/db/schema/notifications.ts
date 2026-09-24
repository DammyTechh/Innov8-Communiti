import { index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, ts } from './_helpers.js';
import { pushPlatform } from './enums.js';
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

export const broadcasts = pgTable('broadcasts', {
  id: pk(),
  sentById: uuid()
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  title: text().notNull(),
  body: text().notNull(),
  audience: jsonb().$type<{ memberRoles?: string[]; countries?: string[] }>().notNull().default({}),
  recipientCount: integer().notNull().default(0),
  sentAt: ts(),
  createdAt: createdAt(),
});
