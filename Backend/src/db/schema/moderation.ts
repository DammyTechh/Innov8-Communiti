import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, ts } from './_helpers.js';
import { moderationActionType, reportReason, reportStatus, reportTarget } from './enums.js';
import { users } from './users.js';

export const reports = pgTable(
  'reports',
  {
    id: pk(),
    reporterId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    targetType: reportTarget().notNull(),
    targetId: uuid().notNull(),
    /** Owner of the reported content (denormalised for the moderation queue). */
    targetUserId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    reason: reportReason().notNull(),
    details: text(),
    status: reportStatus().notNull().default('pending'),
    reviewedById: uuid().references(() => users.id, { onDelete: 'set null' }),
    reviewedAt: ts(),
    resolution: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index('reports_status_idx').on(t.status, t.id),
    index('reports_target_idx').on(t.targetType, t.targetId),
    index('reports_target_user_idx').on(t.targetUserId),
  ],
);

export const moderationActions = pgTable(
  'moderation_actions',
  {
    id: pk(),
    actorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reportId: uuid().references(() => reports.id, { onDelete: 'set null' }),
    targetUserId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    targetType: reportTarget(),
    targetId: uuid(),
    action: moderationActionType().notNull(),
    note: text(),
    expiresAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [index('moderation_actions_user_idx').on(t.targetUserId)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: pk(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: uuid(),
    message: text(),
    before: jsonb(),
    after: jsonb(),
    ip: text(),
    userAgent: text(),
    createdAt: createdAt(),
  },
  (t) => [index('audit_logs_created_idx').on(t.id), index('audit_logs_actor_idx').on(t.actorId)],
);
