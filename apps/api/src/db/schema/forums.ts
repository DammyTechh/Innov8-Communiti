import { index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, timestamps, ts } from './_helpers.js';
import { forumRole, visibility } from './enums.js';
import { topics, users } from './users.js';

export const forums = pgTable(
  'forums',
  {
    id: pk(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text().notNull(),
    slug: text().notNull(),
    about: text().notNull().default(''),
    coverUrl: text(),
    visibility: visibility().notNull().default('public'),
    memberCount: integer().notNull().default(0),
    postCount: integer().notNull().default(0),
    removedAt: ts(),
    deletedAt: ts(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('forums_slug_key').on(t.slug), index('forums_member_count_idx').on(t.memberCount)],
);

export const forumTopics = pgTable(
  'forum_topics',
  {
    forumId: uuid()
      .notNull()
      .references(() => forums.id, { onDelete: 'cascade' }),
    topicId: uuid()
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.forumId, t.topicId] })],
);

export const forumMembers = pgTable(
  'forum_members',
  {
    forumId: uuid()
      .notNull()
      .references(() => forums.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: forumRole().notNull().default('member'),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.forumId, t.userId] }), index('forum_members_user_idx').on(t.userId)],
);
