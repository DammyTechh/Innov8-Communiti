import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, type DbOrTx } from '../../db/client.js';
import { conversationMembers, conversations, ledgerEntries, projectMembers, projects, users } from '../../db/schema/index.js';
import { Errors } from '../../lib/errors.js';
import { broadcast } from '../../lib/realtime.js';
import type { AuthUser } from '../../plugins/auth.js';
import { hasRole } from '../../plugins/auth.js';

export type ProjectRole = 'owner' | 'admin' | 'contributor' | 'viewer';
const rank: Record<ProjectRole, number> = { viewer: 0, contributor: 1, admin: 2, owner: 3 };

/**
 * Loads a live project and the viewer's membership.
 * `min` enforces a minimum project role. Non-members may only view public projects.
 * Platform moderators can view everything (read-only).
 */
export async function projectAccess(projectId: string, user: AuthUser, min?: ProjectRole) {
  const [row] = await db
    .select({ project: projects, role: projectMembers.role })
    .from(projects)
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, user.id)))
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  if (!row || (row.project.removedAt && !hasRole(user, 'moderator'))) throw Errors.notFound('Project');
  const role = row.role;
  if (!role && row.project.visibility === 'private' && !hasRole(user, 'moderator')) throw Errors.notFound('Project');
  if (min && (!role || rank[role] < rank[min])) {
    throw Errors.forbidden(min === 'contributor' ? 'Only project members can do this' : 'Only project owners and admins can do this');
  }
  return { project: row.project, role };
}

/** Workspace tabs are members-only. */
export async function requireProjectMember(projectId: string, user: AuthUser, min: ProjectRole = 'viewer') {
  const access = await projectAccess(projectId, user);
  if (!access.role && !hasRole(user, 'moderator')) throw Errors.forbidden('Join this project to see its workspace');
  if (access.role && rank[access.role] < rank[min]) throw Errors.forbidden('Your project role does not allow this');
  if (!access.role && min !== 'viewer') throw Errors.forbidden('Your project role does not allow this');
  return access;
}

/** Adds a member to the project and its group chat; keeps counters in sync. */
export async function addProjectMember(tx: DbOrTx, projectId: string, userId: string, role: ProjectRole) {
  const [m] = await tx.insert(projectMembers).values({ projectId, userId, role }).onConflictDoNothing().returning();
  if (!m) return false;
  await tx.update(projects).set({ memberCount: sql`${projects.memberCount} + 1` }).where(eq(projects.id, projectId));
  await tx.update(users).set({ collaborationCount: sql`${users.collaborationCount} + 1` }).where(eq(users.id, userId));
  const [conv] = await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.projectId, projectId));
  if (conv) await tx.insert(conversationMembers).values({ conversationId: conv.id, userId }).onConflictDoNothing();
  return true;
}

export async function removeProjectMember(tx: DbOrTx, projectId: string, userId: string) {
  const [m] = await tx.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))).returning();
  if (!m) return false;
  await tx.update(projects).set({ memberCount: sql`greatest(${projects.memberCount} - 1, 0)` }).where(eq(projects.id, projectId));
  await tx.update(users).set({ collaborationCount: sql`greatest(${users.collaborationCount} - 1, 0)` }).where(eq(users.id, userId));
  const [conv] = await tx.select({ id: conversations.id }).from(conversations).where(eq(conversations.projectId, projectId));
  if (conv) await tx.delete(conversationMembers).where(and(eq(conversationMembers.conversationId, conv.id), eq(conversationMembers.userId, userId)));
  return true;
}

type LedgerType = (typeof ledgerEntries.$inferInsert)['type'];

/** Appends to the project's activity ledger and pushes it to `project:<id>` subscribers. */
export async function addLedger(
  tx: DbOrTx,
  e: { projectId: string; actorId: string | null; type: LedgerType; summary: string; refType?: string; refId?: string; data?: Record<string, unknown> },
) {
  const [row] = await tx
    .insert(ledgerEntries)
    .values({ projectId: e.projectId, actorId: e.actorId, type: e.type, summary: e.summary, refType: e.refType ?? null, refId: e.refId ?? null, data: e.data ?? {} })
    .returning();
  void broadcast([{ topic: `project:${e.projectId}`, event: 'ledger:new', payload: row }]);
  return row!;
}
