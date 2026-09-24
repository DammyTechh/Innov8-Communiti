import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { db } from '../../db/client.js';
import { comments, forums, moderationActions, posts, projects, users } from '../../db/schema/index.js';
import { audit } from '../../lib/audit.js';
import { Errors } from '../../lib/errors.js';
import { sendMailSafe, templates } from '../../lib/mailer/index.js';
import { broadcast } from '../../lib/realtime.js';
import { type AuthUser, hasRole } from '../../plugins/auth.js';
import { revokeAllSessions } from '../auth/session.service.js';
import { notify } from '../notifications/notifications.service.js';

export type UserAction = 'warn' | 'restrict' | 'suspend' | 'block' | 'reinstate';
export type ContentType = 'post' | 'comment' | 'forum' | 'project';

const roleRank = { member: 0, moderator: 1, admin: 2, super_admin: 3 } as const;

/** Applies a status action to a user: DB, sessions, email, in-app notice, moderation log, audit. */
export async function applyUserAction(
  req: FastifyRequest,
  actor: AuthUser,
  userId: string,
  action: UserAction,
  opts: { reason?: string; durationDays?: number; reportId?: string },
) {
  const [target] = await db.select().from(users).where(eq(users.id, userId));
  if (!target || target.deletedAt) throw Errors.notFound('User');
  if (target.id === actor.id) throw Errors.badRequest('You cannot moderate your own account');
  if (roleRank[target.platformRole] >= roleRank[actor.platformRole]) throw Errors.forbidden('You cannot moderate someone with an equal or higher role');
  if (action === 'block' && !hasRole(actor, 'admin')) throw Errors.forbidden('Only admins can block accounts');

  const until = opts.durationDays ? new Date(Date.now() + opts.durationDays * 86_400_000).toISOString() : null;
  const status = { warn: target.status === 'active' ? 'flagged' : target.status, restrict: 'restricted', suspend: 'suspended', block: 'blocked', reinstate: 'active' }[action] as typeof target.status;

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ status, statusReason: action === 'reinstate' ? null : (opts.reason ?? null), statusUntil: action === 'suspend' || action === 'restrict' ? until : null })
      .where(eq(users.id, userId));
    if (action === 'suspend' || action === 'block') await revokeAllSessions(userId, `moderation_${action}`, undefined, tx);
    await tx.insert(moderationActions).values({ actorId: actor.id, reportId: opts.reportId ?? null, targetUserId: userId, targetType: 'user', targetId: userId, action, note: opts.reason ?? null, expiresAt: until });
    await audit({ actorId: actor.id, action: `user.${action}`, entityType: 'user', entityId: userId, message: opts.reason, before: { status: target.status }, after: { status, until } }, req, tx);
  });

  const name = target.fullName.split(' ')[0]!;
  if (action === 'warn') {
    await sendMailSafe(target.email, templates.warning({ name, note: opts.reason ?? 'Please review our community guidelines.' }));
    await notify([userId], { type: 'moderation', title: 'Community guidelines warning', body: opts.reason ?? '' });
  } else {
    await sendMailSafe(target.email, templates.accountStatus({ name, status: status === 'active' ? 'active again' : status, reason: opts.reason, until: until ? new Date(until).toUTCString() : null }));
    await broadcast([{ topic: `user:${userId}`, event: 'account:status', payload: { status, until } }]);
  }
  return { status, until };
}

const contentTable = { post: posts, comment: comments, forum: forums, project: projects } as const;

export async function setContentRemoved(req: FastifyRequest, actor: AuthUser, type: ContentType, id: string, removed: boolean, opts: { note?: string; reportId?: string } = {}) {
  const table = contentTable[type];
  const [row] = await db
    .update(table)
    .set({ removedAt: removed ? new Date().toISOString() : null })
    .where(eq(table.id, id))
    .returning();
  if (!row) throw Errors.notFound('Content');
  const ownerId = 'authorId' in row ? row.authorId : row.ownerId;
  await db.insert(moderationActions).values({ actorId: actor.id, reportId: opts.reportId ?? null, targetUserId: ownerId, targetType: type, targetId: id, action: removed ? 'remove_content' : 'restore_content', note: opts.note ?? null });
  await audit({ actorId: actor.id, action: `${type}.${removed ? 'removed' : 'restored'}`, entityType: type, entityId: id, message: opts.note }, req);
  if (removed) await notify([ownerId], { type: 'moderation', targetType: type, targetId: id, title: `Your ${type} was removed for breaking community guidelines`, body: opts.note ?? '' });
}
