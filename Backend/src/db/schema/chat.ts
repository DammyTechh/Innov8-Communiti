import { type AnyPgColumn, index, integer, pgTable, primaryKey, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, timestamps, ts } from './_helpers.js';
import { conversationKind, messageKind } from './enums.js';
import { media } from './content.js';
import { projects } from './projects.js';
import { users } from './users.js';

export const conversations = pgTable(
  'conversations',
  {
    id: pk(),
    kind: conversationKind().notNull(),
    projectId: uuid().references(() => projects.id, { onDelete: 'cascade' }),
    /** For direct chats: "<smallerUserId>:<largerUserId>" so a pair only ever has one conversation. */
    directKey: text(),
    lastMessageAt: ts(),
    lastMessagePreview: text(),
    lastMessageSenderId: uuid().references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('conversations_direct_key').on(t.directKey),
    uniqueIndex('conversations_project_key').on(t.projectId),
    index('conversations_last_message_idx').on(t.lastMessageAt),
  ],
);

export const conversationMembers = pgTable(
  'conversation_members',
  {
    conversationId: uuid()
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    lastReadMessageId: uuid(),
    lastReadAt: ts(),
    unreadCount: integer().notNull().default(0),
    mutedUntil: ts(),
    clearedAt: ts(),
    joinedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index('conversation_members_user_idx').on(t.userId)],
);

export const messages = pgTable(
  'messages',
  {
    id: pk(),
    conversationId: uuid()
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderId: uuid().references(() => users.id, { onDelete: 'set null' }),
    kind: messageKind().notNull().default('text'),
    body: text(),
    replyToId: uuid().references((): AnyPgColumn => messages.id, { onDelete: 'set null' }),
    editedAt: ts(),
    deletedAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [index('messages_conversation_idx').on(t.conversationId, t.id)],
);

export const messageMedia = pgTable(
  'message_media',
  {
    messageId: uuid()
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    mediaId: uuid()
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    position: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.mediaId] })],
);
