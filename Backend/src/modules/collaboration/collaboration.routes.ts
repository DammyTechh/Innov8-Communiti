import { and, count, desc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db, type DbOrTx } from '../../db/client.js';
import { collaborationRequests, conversationMembers, conversations, messages, projectMembers, projects, users } from '../../db/schema/index.js';
import { Errors } from '../../lib/errors.js';
import { templates } from '../../lib/mailer/index.js';
import { cursorPageSchema, cursorQuery, toCursorPage } from '../../lib/pagination.js';
import { broadcast } from '../../lib/realtime.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, idParam, noContent, userSummary } from '../_shared/dto.js';
import { assertNotBlocked } from '../_shared/blocks.js';
import { loadUserSummaries } from '../_shared/users.js';
import { emailUsers, notify } from '../notifications/notifications.service.js';
import { addLedger, addProjectMember, projectAccess } from '../projects/projects.access.js';

/**
 * Chats → "Collaboration requests". A member asks another to collaborate, optionally inviting
 * them into one of their projects. Accepting opens (or reuses) the direct chat between them;
 * with a project, the recipient also joins it as a contributor.
 */

const tags = ['Collaboration'];
const statusEnum = z.enum(['pending', 'accepted', 'declined', 'cancelled']);

const requestDto = z
  .object({
    id: z.uuid(),
    direction: z.enum(['received', 'sent']),
    sender: userSummary,
    recipient: userSummary,
    project: z.object({ id: z.uuid(), title: z.string(), coverUrl: z.string().nullable() }).nullable().describe('Set when the sender invites you into their project'),
    message: z.string().nullable(),
    status: statusEnum,
    conversationId: z.uuid().nullable().describe('Direct chat opened when the request was accepted'),
    createdAt: z.string(),
    decidedAt: z.string().nullable(),
  })
  .meta({ id: 'CollaborationRequest' });

type Row = typeof collaborationRequests.$inferSelect;

async function out(rows: Row[], viewerId: string) {
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((x): x is string => Boolean(x)))];
  const [people, projectRows] = await Promise.all([
    loadUserSummaries(rows.flatMap((r) => [r.senderId, r.recipientId])),
    projectIds.length ? db.select({ id: projects.id, title: projects.title, coverUrl: projects.coverUrl }).from(projects).where(inArray(projects.id, projectIds)) : Promise.resolve([]),
  ]);
  return rows
    .filter((r) => people.has(r.senderId) && people.has(r.recipientId))
    .map((r) => ({
      ...r,
      direction: r.recipientId === viewerId ? ('received' as const) : ('sent' as const),
      sender: people.get(r.senderId)!,
      recipient: people.get(r.recipientId)!,
      project: projectRows.find((p) => p.id === r.projectId) ?? null,
    }));
}

async function load(id: string, viewerId: string) {
  const [r] = await db.select().from(collaborationRequests).where(eq(collaborationRequests.id, id));
  if (!r || (r.senderId !== viewerId && r.recipientId !== viewerId)) throw Errors.notFound('Collaboration request');
  return r;
}

/** Finds or creates the direct conversation between two members (no message-permission check: both agreed). */
async function directConversation(tx: DbOrTx, a: string, b: string) {
  const directKey = [a, b].sort().join(':');
  const [c] = await tx.insert(conversations).values({ kind: 'direct', directKey }).onConflictDoNothing().returning();
  const conv = c ?? (await tx.select().from(conversations).where(eq(conversations.directKey, directKey)))[0]!;
  await tx.insert(conversationMembers).values([{ conversationId: conv.id, userId: a }, { conversationId: conv.id, userId: b }]).onConflictDoNothing();
  return conv;
}

export const collaborationRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.post('/collaboration-requests', {
    preHandler: [app.requireMember],
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    schema: {
      tags,
      summary: 'Ask someone to collaborate',
      description:
        'From a profile ("Open to Collaborations"). Add `projectId` to invite them into one of your projects (you must be its owner or admin). One pending request per pair. Errors: `REQUEST_PENDING`, `ALREADY_MEMBER`, `FORBIDDEN` (blocked).',
      security: auth,
      body: z.object({
        recipientId: z.uuid(),
        message: z.string().trim().max(500).optional().describe('"I would like to collab with you on a project that…"'),
        projectId: z.uuid().optional(),
      }),
      response: { 201: requestDto },
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const b = req.body;
      if (b.recipientId === me.id) throw Errors.badRequest('You cannot send a collaboration request to yourself');
      const [recipient] = await db
        .select({ id: users.id, fullName: users.fullName })
        .from(users)
        .where(and(eq(users.id, b.recipientId), isNull(users.deletedAt), ne(users.status, 'blocked')));
      if (!recipient) throw Errors.notFound('User');
      await assertNotBlocked(me.id, b.recipientId, 'This person is not accepting collaboration requests from you');
      let projectTitle: string | null = null;
      if (b.projectId) {
        const { project } = await projectAccess(b.projectId, me, 'admin');
        const [member] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, b.recipientId)));
        if (member) throw Errors.conflict('This person is already a member of the project', 'ALREADY_MEMBER');
        projectTitle = project.title;
      }
      const [reverse] = await db
        .select({ id: collaborationRequests.id })
        .from(collaborationRequests)
        .where(and(eq(collaborationRequests.senderId, b.recipientId), eq(collaborationRequests.recipientId, me.id), eq(collaborationRequests.status, 'pending')));
      if (reverse) throw Errors.conflict(`${recipient.fullName} already sent you a request. Accept it instead.`, 'REQUEST_PENDING');
      const [row] = await db
        .insert(collaborationRequests)
        .values({ senderId: me.id, recipientId: b.recipientId, message: b.message ?? null, projectId: b.projectId ?? null })
        .onConflictDoNothing()
        .returning();
      if (!row) throw Errors.conflict('You already have a pending request with this person', 'REQUEST_PENDING');
      const sender = (await loadUserSummaries([me.id])).get(me.id)!;
      await notify([b.recipientId], {
        type: 'collaboration_request',
        actorId: me.id,
        targetType: 'collaboration_request',
        targetId: row.id,
        title: `${sender.fullName} wants to collaborate with you`,
        body: b.message ?? '',
      });
      await emailUsers([b.recipientId], 'collaboration_request', (to) => templates.collaborationRequest({ name: to.firstName, sender: sender.fullName, message: b.message, project: projectTitle }));
      return reply.status(201).send((await out([row], me.id))[0]!);
    },
  });

  app.get('/collaboration-requests', {
    schema: {
      tags,
      summary: 'My collaboration requests (Chats → Sort by: Collaboration requests)',
      description: '`box=received` (default) for the requests list with Decline / View request; `box=sent` for requests I sent.',
      security: auth,
      querystring: cursorQuery.extend({ box: z.enum(['received', 'sent']).default('received'), status: z.enum(['pending', 'all']).default('pending') }),
      response: { 200: cursorPageSchema(requestDto) },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const { box, status, cursor, limit } = req.query;
      const rows = await db
        .select()
        .from(collaborationRequests)
        .where(
          and(
            box === 'received' ? eq(collaborationRequests.recipientId, me.id) : eq(collaborationRequests.senderId, me.id),
            status === 'pending' ? eq(collaborationRequests.status, 'pending') : undefined,
            cursor ? lt(collaborationRequests.id, cursor) : undefined,
          ),
        )
        .orderBy(desc(collaborationRequests.id))
        .limit(limit + 1);
      const page = toCursorPage(rows, limit);
      return { ...page, data: await out(page.data, me.id) };
    },
  });

  app.get('/collaboration-requests/pending-count', {
    schema: { tags, summary: 'Pending requests I received (badge)', security: auth, response: { 200: z.object({ count: z.number() }) } },
    handler: async (req) => {
      const [r] = await db.select({ n: count() }).from(collaborationRequests).where(and(eq(collaborationRequests.recipientId, currentUser(req).id), eq(collaborationRequests.status, 'pending')));
      return { count: r?.n ?? 0 };
    },
  });

  app.get('/collaboration-requests/:id', {
    schema: { tags, summary: 'A collaboration request ("View request")', security: auth, params: idParam, response: { 200: requestDto } },
    handler: async (req) => {
      const me = currentUser(req);
      return (await out([await load(req.params.id, me.id)], me.id))[0]!;
    },
  });

  app.post('/collaboration-requests/:id/accept', {
    schema: {
      tags,
      summary: 'Accept Request',
      description: 'Opens the direct chat with the sender (with a "now collaborating" message) and returns its `conversationId`. A project invite also adds you to that project as a contributor.',
      security: auth,
      params: idParam,
      response: { 200: requestDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const r = await load(req.params.id, me.id);
      if (r.recipientId !== me.id) throw Errors.forbidden('Only the person who received the request can accept it');
      if (r.status !== 'pending') throw Errors.conflict(`This request was already ${r.status}`);
      await assertNotBlocked(me.id, r.senderId);
      const people = await loadUserSummaries([r.senderId, r.recipientId]);
      const sender = people.get(r.senderId)!;
      const recipient = people.get(r.recipientId)!;
      const result = await db.transaction(async (tx) => {
        let projectTitle: string | null = null;
        if (r.projectId) {
          const [p] = await tx.select({ title: projects.title, deletedAt: projects.deletedAt }).from(projects).where(eq(projects.id, r.projectId));
          if (!p || p.deletedAt) throw Errors.notFound('Project');
          projectTitle = p.title;
          if (await addProjectMember(tx, r.projectId, me.id, 'contributor')) {
            await addLedger(tx, { projectId: r.projectId, actorId: me.id, type: 'member_joined', summary: `${recipient.fullName} joined the project` });
          }
        } else {
          // Counts on both profiles ("23 collaborations"). Project invites are counted when the member joins.
          await tx
            .update(users)
            .set({ collaborationCount: sql`${users.collaborationCount} + 1` })
            .where(inArray(users.id, [r.senderId, r.recipientId]));
        }
        const conv = await directConversation(tx, r.senderId, r.recipientId);
        const body = projectTitle ? `${recipient.fullName} joined ${projectTitle}. You are now collaborating.` : `${sender.fullName} and ${recipient.fullName} are now collaborating.`;
        const [msg] = await tx.insert(messages).values({ conversationId: conv.id, senderId: null, kind: 'system', body }).returning();
        await tx.update(conversations).set({ lastMessageAt: msg!.createdAt, lastMessagePreview: body.slice(0, 120), lastMessageSenderId: null }).where(eq(conversations.id, conv.id));
        await tx.update(conversationMembers).set({ hiddenAt: null }).where(eq(conversationMembers.conversationId, conv.id));
        const [updated] = await tx
          .update(collaborationRequests)
          .set({ status: 'accepted', decidedAt: new Date().toISOString(), conversationId: conv.id })
          .where(eq(collaborationRequests.id, r.id))
          .returning();
        return { updated: updated!, conversationId: conv.id, msg: msg! };
      });
      await broadcast([{ topic: `conversation:${result.conversationId}`, event: 'message:new', payload: { id: result.msg.id, conversationId: result.conversationId, kind: 'system', body: result.msg.body, createdAt: result.msg.createdAt } }]);
      await notify([r.senderId], {
        type: 'collaboration_accepted',
        actorId: me.id,
        targetType: 'conversation',
        targetId: result.conversationId,
        title: `${recipient.fullName} accepted your collaboration request`,
      });
      return (await out([result.updated], me.id))[0]!;
    },
  });

  app.post('/collaboration-requests/:id/decline', {
    schema: { tags, summary: 'Decline a request', security: auth, params: idParam, response: { 200: requestDto } },
    handler: async (req) => {
      const me = currentUser(req);
      const r = await load(req.params.id, me.id);
      if (r.recipientId !== me.id) throw Errors.forbidden('Only the person who received the request can decline it');
      if (r.status !== 'pending') throw Errors.conflict(`This request was already ${r.status}`);
      const [updated] = await db.update(collaborationRequests).set({ status: 'declined', decidedAt: new Date().toISOString() }).where(eq(collaborationRequests.id, r.id)).returning();
      return (await out([updated!], me.id))[0]!;
    },
  });

  app.delete('/collaboration-requests/:id', {
    schema: { tags, summary: 'Cancel a request I sent', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const r = await load(req.params.id, me.id);
      if (r.senderId !== me.id) throw Errors.forbidden('Only the sender can cancel a request');
      if (r.status !== 'pending') throw Errors.conflict(`This request was already ${r.status}`);
      await db.update(collaborationRequests).set({ status: 'cancelled', decidedAt: new Date().toISOString() }).where(eq(collaborationRequests.id, r.id));
      return reply.status(204).send(null);
    },
  });
};
