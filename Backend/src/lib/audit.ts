import type { FastifyRequest } from 'fastify';
import { db, type DbOrTx } from '../db/client.js';
import { auditLogs } from '../db/schema/index.js';

export interface AuditInput {
  actorId: string | null;
  action: string; // e.g. "user.status_changed", "auth.login_failed"
  entityType: string;
  entityId?: string | null;
  message?: string;
  before?: unknown;
  after?: unknown;
}

export async function audit(input: AuditInput, req?: FastifyRequest, tx: DbOrTx = db) {
  await tx.insert(auditLogs).values({
    actorId: input.actorId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    message: input.message ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    ip: req?.ip ?? null,
    userAgent: req?.headers['user-agent']?.slice(0, 500) ?? null,
  });
}
