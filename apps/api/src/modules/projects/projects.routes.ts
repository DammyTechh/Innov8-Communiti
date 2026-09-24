import { and, desc, eq, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { patchOf } from '../../lib/zod.js';
import { db } from '../../db/client.js';
import { conversations, projectJoinRequests, projectMembers, projects, projectTopics, topics, users } from '../../db/schema/index.js';
import { Errors } from '../../lib/errors.js';
import { contains } from '../../lib/like.js';
import { templates } from '../../lib/mailer/index.js';
import { cursorPageSchema, cursorQuery, toCursorPage } from '../../lib/pagination.js';
import { uniqueSlug } from '../../lib/slug.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, idParam, noContent, topicDto, userSummary } from '../_shared/dto.js';
import { userSummaryCols } from '../_shared/users.js';
import { emailUsers, notify } from '../notifications/notifications.service.js';
import { addLedger, addProjectMember, projectAccess, removeProjectMember } from './projects.access.js';

const tags = ['Projects'];
const roleEnum = z.enum(['owner', 'admin', 'contributor', 'viewer']);
const statusEnum = z.enum(['open', 'ongoing', 'completed', 'archived']);

const projectCard = z
  .object({
    id: z.uuid(),
    title: z.string(),
    slug: z.string(),
    pitch: z.string(),
    coverUrl: z.string().nullable(),
    status: statusEnum,
    visibility: z.enum(['public', 'private']),
    memberCount: z.number(),
    topics: z.array(topicDto),
    owner: userSummary,
    myRole: roleEnum.nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'ProjectCard' });

const projectDto = projectCard
  .extend({
    problem: z.string(),
    solution: z.string(),
    videoUrl: z.string().nullable(),
    memberPreview: z.array(userSummary),
    joinRequestStatus: z.enum(['pending', 'accepted', 'declined', 'cancelled']).nullable(),
    conversationId: z.uuid().nullable().describe('Project group chat (members only)'),
    updatedAt: z.string(),
  })
  .meta({ id: 'Project' });

const memberDto = userSummary.extend({ role: roleEnum, title: z.string().nullable(), joinedAt: z.string() }).meta({ id: 'ProjectMember' });

const joinRequestDto = z
  .object({ id: z.uuid(), user: userSummary, message: z.string().nullable(), status: z.enum(['pending', 'accepted', 'declined', 'cancelled']), createdAt: z.string(), decidedAt: z.string().nullable() })
  .meta({ id: 'JoinRequest' });

const projectBody = z.object({
  title: z.string().trim().min(3).max(120),
  pitch: z.string().trim().max(500).default(''),
  problem: z.string().trim().max(5000).default(''),
  solution: z.string().trim().max(5000).default(''),
  coverUrl: z.url().nullable().optional(),
  videoUrl: z.url().nullable().optional(),
  visibility: z.enum(['public', 'private']).default('public'),
  topicIds: z.array(z.uuid()).max(5).default([]),
});

async function cards(rows: (typeof projects.$inferSelect)[], viewerId: string) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [topicRows, mine, owners] = await Promise.all([
    db.select({ projectId: projectTopics.projectId, id: topics.id, slug: topics.slug, name: topics.name }).from(projectTopics).innerJoin(topics, eq(topics.id, projectTopics.topicId)).where(inArray(projectTopics.projectId, ids)),
    db.select().from(projectMembers).where(and(inArray(projectMembers.projectId, ids), eq(projectMembers.userId, viewerId))),
    db.select(userSummaryCols).from(users).where(inArray(users.id, [...new Set(rows.map((r) => r.ownerId))])),
  ]);
  return rows.map((p) => ({
    ...p,
    topics: topicRows.filter((t) => t.projectId === p.id).map(({ projectId: _p, ...t }) => t),
    owner: owners.find((o) => o.id === p.ownerId)!,
    myRole: mine.find((m) => m.projectId === p.id)?.role ?? null,
  }));
}

async function loadProject(projectId: string, viewer: Parameters<typeof projectAccess>[1]) {
  const { project, role } = await projectAccess(projectId, viewer);
  const [card] = await cards([project], viewer.id);
  const [preview, [request], [conv]] = await Promise.all([
    db.select(userSummaryCols).from(projectMembers).innerJoin(users, eq(users.id, projectMembers.userId)).where(eq(projectMembers.projectId, projectId)).orderBy(projectMembers.joinedAt).limit(5),
    db.select({ status: projectJoinRequests.status }).from(projectJoinRequests).where(and(eq(projectJoinRequests.projectId, projectId), eq(projectJoinRequests.userId, viewer.id))).orderBy(desc(projectJoinRequests.id)).limit(1),
    db.select({ id: conversations.id }).from(conversations).where(eq(conversations.projectId, projectId)),
  ]);
  return { ...card!, memberPreview: preview, joinRequestStatus: request?.status ?? null, conversationId: role ? (conv?.id ?? null) : null };
}

async function staffIds(projectId: string) {
  const rows = await db.select({ userId: projectMembers.userId }).from(projectMembers).where(and(eq(projectMembers.projectId, projectId), inArray(projectMembers.role, ['owner', 'admin'])));
  return rows.map((r) => r.userId);
}

export const projectRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/projects', {
    schema: {
      tags,
      summary: 'Browse projects',
      description: '`discover`: public projects you are not in. `joined`: projects you are a member of. `mine`: projects you own.',
      security: auth,
      querystring: cursorQuery.extend({
        tab: z.enum(['discover', 'joined', 'mine']).default('discover'),
        q: z.string().trim().max(80).optional(),
        status: statusEnum.optional(),
        topicId: z.uuid().optional(),
      }),
      response: { 200: cursorPageSchema(projectCard) },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const { tab, q, status, topicId, cursor, limit } = req.query;
      const mine = sql`(select ${projectMembers.projectId} from ${projectMembers} where ${projectMembers.userId} = ${me.id})`;
      const tabWhere =
        tab === 'joined' ? sql`${projects.id} in ${mine}` : tab === 'mine' ? eq(projects.ownerId, me.id) : and(eq(projects.visibility, 'public'), sql`${projects.id} not in ${mine}`);
      const rows = await db
        .select()
        .from(projects)
        .where(
          and(
            isNull(projects.deletedAt),
            isNull(projects.removedAt),
            tabWhere,
            status ? eq(projects.status, status) : undefined,
            q ? or(ilike(projects.title, contains(q)), ilike(projects.pitch, contains(q))) : undefined,
            topicId ? sql`exists (select 1 from ${projectTopics} pt where pt.project_id = ${projects.id} and pt.topic_id = ${topicId})` : undefined,
            cursor ? lt(projects.id, cursor) : undefined,
          ),
        )
        .orderBy(desc(projects.id))
        .limit(limit + 1);
      const page = toCursorPage(rows, limit);
      return { ...page, data: await cards(page.data, me.id) };
    },
  });

  app.get('/users/:id/projects', {
    schema: { tags, summary: "A user's projects (profile Projects tab)", security: auth, params: idParam, querystring: cursorQuery, response: { 200: cursorPageSchema(projectCard) } },
    handler: async (req) => {
      const me = currentUser(req);
      const theirs = sql`(select ${projectMembers.projectId} from ${projectMembers} where ${projectMembers.userId} = ${req.params.id})`;
      const rows = await db
        .select()
        .from(projects)
        .where(
          and(
            isNull(projects.deletedAt),
            isNull(projects.removedAt),
            sql`${projects.id} in ${theirs}`,
            req.params.id === me.id ? undefined : eq(projects.visibility, 'public'),
            req.query.cursor ? lt(projects.id, req.query.cursor) : undefined,
          ),
        )
        .orderBy(desc(projects.id))
        .limit(req.query.limit + 1);
      const page = toCursorPage(rows, req.query.limit);
      return { ...page, data: await cards(page.data, me.id) };
    },
  });

  app.post('/projects', {
    preHandler: [app.requireMember],
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    schema: {
      tags,
      summary: 'Create a project',
      description: 'Creates the project, makes you the owner and opens the project group chat.',
      security: auth,
      body: projectBody,
      response: { 201: projectDto },
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const { topicIds, ...b } = req.body;
      const id = await db.transaction(async (tx) => {
        const [p] = await tx.insert(projects).values({ ...b, coverUrl: b.coverUrl ?? null, videoUrl: b.videoUrl ?? null, ownerId: me.id, slug: uniqueSlug(b.title) }).returning();
        if (topicIds.length) await tx.insert(projectTopics).values([...new Set(topicIds)].map((topicId) => ({ projectId: p!.id, topicId })));
        await tx.insert(conversations).values({ kind: 'project', projectId: p!.id });
        await addProjectMember(tx, p!.id, me.id, 'owner');
        await addLedger(tx, { projectId: p!.id, actorId: me.id, type: 'project_created', summary: 'Project created' });
        return p!.id;
      });
      return reply.status(201).send(await loadProject(id, me));
    },
  });

  app.get('/projects/:id', {
    schema: { tags, summary: 'Project overview', security: auth, params: idParam, response: { 200: projectDto } },
    handler: async (req) => loadProject(req.params.id, currentUser(req)),
  });

  app.patch('/projects/:id', {
    schema: {
      tags,
      summary: 'Edit a project (owner, admin)',
      security: auth,
      params: idParam,
      body: patchOf(projectBody).extend({ status: statusEnum.optional() }),
      response: { 200: projectDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      await projectAccess(req.params.id, me, 'admin');
      const { topicIds, ...b } = req.body;
      await db.transaction(async (tx) => {
        if (Object.keys(b).length) await tx.update(projects).set(b).where(eq(projects.id, req.params.id));
        if (topicIds) {
          await tx.delete(projectTopics).where(eq(projectTopics.projectId, req.params.id));
          if (topicIds.length) await tx.insert(projectTopics).values([...new Set(topicIds)].map((topicId) => ({ projectId: req.params.id, topicId })));
        }
        await addLedger(tx, { projectId: req.params.id, actorId: me.id, type: 'project_updated', summary: b.status ? `Status changed to ${b.status}` : 'Project details updated', data: { fields: Object.keys(req.body) } });
      });
      return loadProject(req.params.id, me);
    },
  });

  app.delete('/projects/:id', {
    schema: { tags, summary: 'Delete a project (owner)', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      await projectAccess(req.params.id, currentUser(req), 'owner');
      await db.update(projects).set({ deletedAt: new Date().toISOString() }).where(eq(projects.id, req.params.id));
      return reply.status(204).send(null);
    },
  });

  // ── Members ──────────────────────────────────────────────────────────────

  app.get('/projects/:id/members', {
    schema: { tags, summary: 'Project members', security: auth, params: idParam, response: { 200: z.object({ data: z.array(memberDto) }) } },
    handler: async (req) => {
      await projectAccess(req.params.id, currentUser(req));
      const data = await db
        .select({ ...userSummaryCols, role: projectMembers.role, title: projectMembers.title, joinedAt: projectMembers.joinedAt })
        .from(projectMembers)
        .innerJoin(users, eq(users.id, projectMembers.userId))
        .where(eq(projectMembers.projectId, req.params.id))
        .orderBy(sql`case ${projectMembers.role} when 'owner' then 0 when 'admin' then 1 when 'contributor' then 2 else 3 end`, projectMembers.joinedAt);
      return { data };
    },
  });

  app.patch('/projects/:id/members/:userId', {
    schema: {
      tags,
      summary: "Change a member's role or title (owner, admin)",
      security: auth,
      params: z.object({ id: z.uuid(), userId: z.uuid() }),
      body: z.object({ role: z.enum(['admin', 'contributor', 'viewer']).optional(), title: z.string().trim().max(60).nullable().optional() }),
      response: noContent,
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const { role } = await projectAccess(req.params.id, me, 'admin');
      const [target] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, req.params.id), eq(projectMembers.userId, req.params.userId)));
      if (!target) throw Errors.notFound('Member');
      if (target.role === 'owner') throw Errors.forbidden("The owner's role cannot be changed");
      if (req.body.role === 'admin' && role !== 'owner') throw Errors.forbidden('Only the owner can make admins');
      await db.update(projectMembers).set(req.body).where(and(eq(projectMembers.projectId, req.params.id), eq(projectMembers.userId, req.params.userId)));
      return reply.status(204).send(null);
    },
  });

  app.delete('/projects/:id/members/:userId', {
    schema: {
      tags,
      summary: 'Remove a member (owner, admin) or leave (yourself)',
      security: auth,
      params: z.object({ id: z.uuid(), userId: z.uuid() }),
      response: noContent,
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const leaving = req.params.userId === me.id;
      const { role } = await projectAccess(req.params.id, me, leaving ? 'viewer' : 'admin');
      if (leaving && role === 'owner') throw Errors.badRequest('Owners cannot leave. Transfer ownership or delete the project.');
      const [target] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, req.params.id), eq(projectMembers.userId, req.params.userId)));
      if (!target) throw Errors.notFound('Member');
      if (target.role === 'owner') throw Errors.forbidden('The owner cannot be removed');
      if (target.role === 'admin' && role !== 'owner' && !leaving) throw Errors.forbidden('Only the owner can remove admins');
      const [u] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, req.params.userId));
      await db.transaction(async (tx) => {
        await removeProjectMember(tx, req.params.id, req.params.userId);
        await addLedger(tx, { projectId: req.params.id, actorId: me.id, type: 'member_left', summary: leaving ? `${u?.fullName} left the project` : `${u?.fullName} was removed`, refType: 'user', refId: req.params.userId });
      });
      return reply.status(204).send(null);
    },
  });

  app.post('/projects/:id/transfer-ownership', {
    schema: { tags, summary: 'Transfer ownership to another member (owner)', security: auth, params: idParam, body: z.object({ userId: z.uuid() }), response: noContent },
    handler: async (req, reply) => {
      const me = currentUser(req);
      await projectAccess(req.params.id, me, 'owner');
      const [target] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, req.params.id), eq(projectMembers.userId, req.body.userId)));
      if (!target || target.userId === me.id) throw Errors.badRequest('Choose another project member');
      await db.transaction(async (tx) => {
        await tx.update(projectMembers).set({ role: 'owner' }).where(and(eq(projectMembers.projectId, req.params.id), eq(projectMembers.userId, req.body.userId)));
        await tx.update(projectMembers).set({ role: 'admin' }).where(and(eq(projectMembers.projectId, req.params.id), eq(projectMembers.userId, me.id)));
        await tx.update(projects).set({ ownerId: req.body.userId }).where(eq(projects.id, req.params.id));
        await addLedger(tx, { projectId: req.params.id, actorId: me.id, type: 'project_updated', summary: 'Ownership transferred', refType: 'user', refId: req.body.userId });
      });
      return reply.status(204).send(null);
    },
  });

  // ── Join requests ────────────────────────────────────────────────────────

  app.post('/projects/:id/join-requests', {
    preHandler: [app.requireMember],
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    schema: {
      tags,
      summary: 'Ask to join a project',
      security: auth,
      params: idParam,
      body: z.object({ message: z.string().trim().max(500).optional() }),
      response: { 201: joinRequestDto },
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const { project, role } = await projectAccess(req.params.id, me);
      if (role) throw Errors.conflict('You are already a member', 'ALREADY_MEMBER');
      if (project.status === 'completed' || project.status === 'archived') throw Errors.badRequest('This project is not accepting new members');
      const [r] = await db.insert(projectJoinRequests).values({ projectId: project.id, userId: me.id, message: req.body.message ?? null }).onConflictDoNothing().returning();
      if (!r) throw Errors.conflict('Your request is already pending', 'REQUEST_PENDING');
      const [u] = await db.select(userSummaryCols).from(users).where(eq(users.id, me.id));
      const staff = await staffIds(project.id);
      await emailUsers(staff, 'project_join_request', (to) => templates.projectJoinRequest({ name: to.firstName, requester: u!.fullName, project: project.title, message: req.body.message, projectId: project.id }));
      await notify(staff, { type: 'project_join_request', actorId: me.id, targetType: 'project', targetId: project.id, title: `${u!.fullName} wants to join ${project.title}`, body: req.body.message ?? '' });
      return reply.status(201).send({ ...r, user: u! });
    },
  });

  app.delete('/projects/:id/join-requests/mine', {
    schema: { tags, summary: 'Cancel my pending request', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      await db
        .update(projectJoinRequests)
        .set({ status: 'cancelled', decidedAt: new Date().toISOString() })
        .where(and(eq(projectJoinRequests.projectId, req.params.id), eq(projectJoinRequests.userId, currentUser(req).id), eq(projectJoinRequests.status, 'pending')));
      return reply.status(204).send(null);
    },
  });

  app.get('/projects/:id/join-requests', {
    schema: {
      tags,
      summary: 'Join requests (owner, admin)',
      security: auth,
      params: idParam,
      querystring: z.object({ status: z.enum(['pending', 'accepted', 'declined']).default('pending') }),
      response: { 200: z.object({ data: z.array(joinRequestDto) }) },
    },
    handler: async (req) => {
      await projectAccess(req.params.id, currentUser(req), 'admin');
      const rows = await db
        .select({ id: projectJoinRequests.id, message: projectJoinRequests.message, status: projectJoinRequests.status, createdAt: projectJoinRequests.createdAt, decidedAt: projectJoinRequests.decidedAt, user: userSummaryCols })
        .from(projectJoinRequests)
        .innerJoin(users, eq(users.id, projectJoinRequests.userId))
        .where(and(eq(projectJoinRequests.projectId, req.params.id), eq(projectJoinRequests.status, req.query.status)))
        .orderBy(desc(projectJoinRequests.id));
      return { data: rows };
    },
  });

  for (const decision of ['accept', 'decline'] as const) {
    app.post(`/projects/:id/join-requests/:requestId/${decision}`, {
      schema: {
        tags,
        summary: decision === 'accept' ? 'Accept a join request (owner, admin)' : 'Decline a join request (owner, admin)',
        security: auth,
        params: z.object({ id: z.uuid(), requestId: z.uuid() }),
        body: decision === 'accept' ? z.object({ role: z.enum(['contributor', 'viewer']).default('contributor') }).nullish() : z.object({}).nullish(),
        response: noContent,
      },
      handler: async (req, reply) => {
        const me = currentUser(req);
        const { project } = await projectAccess(req.params.id, me, 'admin');
        const [r] = await db.select().from(projectJoinRequests).where(and(eq(projectJoinRequests.id, req.params.requestId), eq(projectJoinRequests.projectId, project.id)));
        if (!r || r.status !== 'pending') throw Errors.notFound('Pending request');
        const [u] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, r.userId));
        await db.transaction(async (tx) => {
          await tx.update(projectJoinRequests).set({ status: decision === 'accept' ? 'accepted' : 'declined', decidedById: me.id, decidedAt: new Date().toISOString() }).where(eq(projectJoinRequests.id, r.id));
          if (decision === 'accept') {
            const role = (req.body as { role?: 'contributor' | 'viewer' } | null)?.role ?? 'contributor';
            await addProjectMember(tx, project.id, r.userId, role);
            await addLedger(tx, { projectId: project.id, actorId: me.id, type: 'member_joined', summary: `${u?.fullName} joined the project`, refType: 'user', refId: r.userId });
          }
        });
        await emailUsers([r.userId], decision === 'accept' ? 'project_join_accepted' : 'project_join_declined', (to) =>
          templates.projectJoinDecision({ name: to.firstName, project: project.title, accepted: decision === 'accept', projectId: project.id }),
        );
        await notify([r.userId], {
          type: decision === 'accept' ? 'project_join_accepted' : 'project_join_declined',
          actorId: me.id,
          targetType: 'project',
          targetId: project.id,
          title: decision === 'accept' ? `You're now a member of ${project.title}` : `Your request to join ${project.title} was declined`,
        });
        return reply.status(204).send(null);
      },
    });
  }
};

