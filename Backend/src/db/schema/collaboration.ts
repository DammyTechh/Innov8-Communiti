import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { conversations } from './chat.js';
import { createdAt, pk, ts } from './_helpers.js';
import { joinRequestStatus } from './enums.js';
import { projects } from './projects.js';
import { users } from './users.js';

/**
 * Member-to-member collaboration requests (Chats → Collaboration requests).
 * With `projectId`, the sender invites the recipient into that project.
 */
export const collaborationRequests = pgTable(
  'collaboration_requests',
  {
    id: pk(),
    senderId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recipientId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid().references(() => projects.id, { onDelete: 'cascade' }),
    message: text(),
    status: joinRequestStatus().notNull().default('pending'),
    conversationId: uuid().references(() => conversations.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    decidedAt: ts(),
  },
  (t) => [
    index('collaboration_requests_recipient_idx').on(t.recipientId, t.status, t.id),
    index('collaboration_requests_sender_idx').on(t.senderId, t.status, t.id),
    uniqueIndex('collaboration_requests_one_pending').on(t.senderId, t.recipientId).where(sql`${t.status} = 'pending'`),
    check('collaboration_requests_not_self', sql`${t.senderId} <> ${t.recipientId}`),
  ],
);
