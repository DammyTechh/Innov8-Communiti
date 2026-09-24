import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { patchOf } from '../../lib/zod.js';
import { db } from '../../db/client.js';
import {
  contracts,
  evaluations,
  ledgerEntries,
  projectMembers,
  prototypes,
  prototypeVersionMedia,
  prototypeVersions,
  researchDocs,
  tasks,
  users,
  workspaceComments,
} from '../../db/schema/index.js';
import { Errors } from '../../lib/errors.js';
import { templates } from '../../lib/mailer/index.js';
import { cursorPageSchema, cursorQuery, toCursorPage } from '../../lib/pagination.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, noContent } from '../_shared/dto.js';
import { assertOwnedReadyMedia, attachmentsFor, loadMedia } from '../_shared/media.js';
import { loadUserSummaries } from '../_shared/users.js';
import { emailUsers, notify } from '../notifications/notifications.service.js';
import { addLedger, requireProjectMember } from '../projects/projects.access.js';
import * as S from './workspace.schemas.js';

const tags = ['Workspace'];
const pid = z.object({ id: z.uuid() });
const pidAnd = <K extends string>(key: K) => z.object({ id: z.uuid(), [key]: z.uuid() } as { id: z.ZodUUID } & Record<K, z.ZodUUID>);

async function memberIds(projectId: string, roles?: ('owner' | 'admin' | 'contributor' | 'viewer')[]) {
  const rows = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), roles ? inArray(projectMembers.role, roles) : undefined));
  return rows.map((r) => r.userId);
}

/** Respects the per-project notification toggles in project_members.notificationPrefs. */
async function notifyMembers(projectId: string, pref: string, input: Parameters<typeof notify>[1], roles?: Parameters<typeof memberIds>[1]) {
  const rows = await db
    .select({ userId: projectMembers.userId, prefs: projectMembers.notificationPrefs })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), roles ? inArray(projectMembers.role, roles) : undefined));
  await notify(rows.filter((r) => r.prefs?.[pref] !== false).map((r) => r.userId), input);
}

export const workspaceRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  // ── Research ─────────────────────────────────────────────────────────────

  async function researchOut(rows: (typeof researchDocs.$inferSelect)[]) {
    const [people, files] = await Promise.all([loadUserSummaries(rows.map((r) => r.authorId)), loadMedia(rows.map((r) => r.mediaId).filter(Boolean) as string[])]);
    return rows.map((r) => ({ ...r, author: people.get(r.authorId)!, file: r.mediaId ? (files.get(r.mediaId) ?? null) : null }));
  }

  app.get('/projects/:id/research', {
    schema: { tags, summary: 'Research documents', security: auth, params: pid, querystring: cursorQuery, response: { 200: cursorPageSchema(S.researchDto) } },
    handler: async (req) => {
      await requireProjectMember(req.params.id, currentUser(req));
      const rows = await db
        .select()
        .from(researchDocs)
        .where(and(eq(researchDocs.projectId, req.params.id), isNull(researchDocs.deletedAt), req.query.cursor ? lt(researchDocs.id, req.query.cursor) : undefined))
        .orderBy(desc(researchDocs.id))
        .limit(req.query.limit + 1);
      const page = toCursorPage(rows, req.query.limit);
      return { ...page, data: await researchOut(page.data) };
    },
  });

  app.post('/projects/:id/research', {
    schema: {
      tags,
      summary: 'Add research: write in-app or upload a file (contributor+)',
      security: auth,
      params: pid,
      body: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('written'), title: z.string().trim().min(2).max(200), content: z.unknown() }),
        z.object({ kind: z.literal('uploaded'), title: z.string().trim().min(2).max(200), mediaId: z.uuid() }),
      ]),
      response: { 201: S.researchDto },
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      await requireProjectMember(req.params.id, me, 'contributor');
      const b = req.body;
      if (b.kind === 'uploaded') await assertOwnedReadyMedia(me.id, [b.mediaId], db, ['document', 'image']);
      const row = await db.transaction(async (tx) => {
        const [r] = await tx
          .insert(researchDocs)
          .values({ projectId: req.params.id, authorId: me.id, title: b.title, kind: b.kind, content: b.kind === 'written' ? (b.content ?? null) : null, mediaId: b.kind === 'uploaded' ? b.mediaId : null })
          .returning();
        await addLedger(tx, { projectId: req.params.id, actorId: me.id, type: 'research_doc', summary: `Added research "${b.title}"`, refType: 'research_doc', refId: r!.id });
        return r!;
      });
      return reply.status(201).send((await researchOut([row]))[0]!);
    },
  });

  app.get('/projects/:id/research/:docId', {
    schema: { tags, summary: 'A research document', security: auth, params: pidAnd('docId'), response: { 200: S.researchDto } },
    handler: async (req) => {
      await requireProjectMember(req.params.id, currentUser(req));
      const [r] = await db.select().from(researchDocs).where(and(eq(researchDocs.id, req.params.docId), eq(researchDocs.projectId, req.params.id), isNull(researchDocs.deletedAt)));
      if (!r) throw Errors.notFound('Research document');
      return (await researchOut([r]))[0]!;
    },
  });

  app.patch('/projects/:id/research/:docId', {
    schema: {
      tags,
      summary: 'Edit a research document (author or admin)',
      security: auth,
      params: pidAnd('docId'),
      body: z.object({ title: z.string().trim().min(2).max(200).optional(), content: z.unknown().optional() }),
      response: { 200: S.researchDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const { role } = await requireProjectMember(req.params.id, me, 'contributor');
      const [r] = await db.select().from(researchDocs).where(and(eq(researchDocs.id, req.params.docId), eq(researchDocs.projectId, req.params.id), isNull(researchDocs.deletedAt)));
      if (!r) throw Errors.notFound('Research document');
      if (r.authorId !== me.id && role !== 'owner' && role !== 'admin') throw Errors.forbidden();
      const [u] = await db.update(researchDocs).set(req.body).where(eq(researchDocs.id, r.id)).returning();
      return (await researchOut([u!]))[0]!;
    },
  });

  app.delete('/projects/:id/research/:docId', {
    schema: { tags, summary: 'Delete a research document (author or admin)', security: auth, params: pidAnd('docId'), response: noContent },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const { role } = await requireProjectMember(req.params.id, me, 'contributor');
      const [r] = await db.select().from(researchDocs).where(and(eq(researchDocs.id, req.params.docId), eq(researchDocs.projectId, req.params.id)));
      if (!r) throw Errors.notFound('Research document');
      if (r.authorId !== me.id && role !== 'owner' && role !== 'admin') throw Errors.forbidden();
      await db.update(researchDocs).set({ deletedAt: new Date().toISOString() }).where(eq(researchDocs.id, r.id));
      return reply.status(204).send(null);
    },
  });

  // ── Prototypes & versions ────────────────────────────────────────────────

  async function prototypeOut(rows: (typeof prototypes.$inferSelect)[]) {
    const people = await loadUserSummaries(rows.map((r) => r.createdById));
    return rows.map((r) => ({ ...r, createdBy: people.get(r.createdById)! }));
  }

  app.get('/projects/:id/prototypes', {
    schema: { tags, summary: 'Prototypes', security: auth, params: pid, response: { 200: z.object({ data: z.array(S.prototypeDto) }) } },
    handler: async (req) => {
      await requireProjectMember(req.params.id, currentUser(req));
      const rows = await db.select().from(prototypes).where(and(eq(prototypes.projectId, req.params.id), isNull(prototypes.deletedAt))).orderBy(desc(prototypes.updatedAt));
      return { data: await prototypeOut(rows) };
    },
  });

  app.post('/projects/:id/prototypes', {
    schema: {
      tags,
      summary: 'Create a prototype (contributor+)',
      security: auth,
      params: pid,
      body: z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(2000).default(''), coverUrl: z.url().nullable().optional() }),
      response: { 201: S.prototypeDto },
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      await requireProjectMember(req.params.id, me, 'contributor');
      const row = await db.transaction(async (tx) => {
        const [p] = await tx.insert(prototypes).values({ ...req.body, coverUrl: req.body.coverUrl ?? null, projectId: req.params.id, createdById: me.id }).returning();
        await addLedger(tx, { projectId: req.params.id, actorId: me.id, type: 'prototype_created', summary: `Created prototype "${p!.name}"`, refType: 'prototype', refId: p!.id });
        return p!;
      });
      return reply.status(201).send((await prototypeOut([row]))[0]!);
    },
  });

  app.get('/projects/:id/prototypes/:prototypeId', {
    schema: {
      tags,
      summary: 'A prototype with its versions (newest first)',
      security: auth,
      params: pidAnd('prototypeId'),
      response: { 200: S.prototypeDto.extend({ versions: z.array(S.versionDto) }) },
    },
    handler: async (req) => {
      await requireProjectMember(req.params.id, currentUser(req));
      const [p] = await db.select().from(prototypes).where(and(eq(prototypes.id, req.params.prototypeId), eq(prototypes.projectId, req.params.id), isNull(prototypes.deletedAt)));
      if (!p) throw Errors.notFound('Prototype');
      const versions = await db.select().from(prototypeVersions).where(and(eq(prototypeVersions.prototypeId, p.id), isNull(prototypeVersions.deletedAt))).orderBy(desc(prototypeVersions.id));
      const [media, people] = await Promise.all([
        attachmentsFor(prototypeVersionMedia, { parent: prototypeVersionMedia.versionId, media: prototypeVersionMedia.mediaId, position: prototypeVersionMedia.position }, versions.map((v) => v.id)),
        loadUserSummaries(versions.map((v) => v.uploadedById)),
      ]);
      return { ...(await prototypeOut([p]))[0]!, versions: versions.map((v) => ({ ...v, media: media.get(v.id) ?? [], uploadedBy: people.get(v.uploadedById)! })) };
    },
  });

  app.patch('/projects/:id/prototypes/:prototypeId', {
    schema: {
      tags,
      summary: 'Edit a prototype (contributor+)',
      security: auth,
      params: pidAnd('prototypeId'),
      body: z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().max(2000), coverUrl: z.url().nullable() }).partial(),
      response: { 200: S.prototypeDto },
    },
    handler: async (req) => {
      await requireProjectMember(req.params.id, currentUser(req), 'contributor');
      const [p] = await db.update(prototypes).set(req.body).where(and(eq(prototypes.id, req.params.prototypeId), eq(prototypes.projectId, req.params.id), isNull(prototypes.deletedAt))).returning();
      if (!p) throw Errors.notFound('Prototype');
      return (await prototypeOut([p]))[0]!;
    },
  });

  app.delete('/projects/:id/prototypes/:prototypeId', {
    schema: { tags, summary: 'Delete a prototype (admin)', security: auth, params: pidAnd('prototypeId'), response: noContent },
    handler: async (req, reply) => {
      await requireProjectMember(req.params.id, currentUser(req), 'admin');
      await db.update(prototypes).set({ deletedAt: new Date().toISOString() }).where(and(eq(prototypes.id, req.params.prototypeId), eq(prototypes.projectId, req.params.id)));
      return reply.status(204).send(null);
    },
  });

  app.post('/projects/:id/prototypes/:prototypeId/versions', {
    schema: {
      tags,
      summary: 'Upload a new prototype version (contributor+)',
      security: auth,
      params: pidAnd('prototypeId'),
      body: z.object({ versionLabel: z.string().trim().min(1).max(30).describe('e.g. v2.1'), notes: z.string().trim().max(5000).default(''), mediaIds: z.array(z.uuid()).min(1).max(20) }),
      response: { 201: S.versionDto },
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      await requireProjectMember(req.params.id, me, 'contributor');
      const [p] = await db.select().from(prototypes).where(and(eq(prototypes.id, req.params.prototypeId), eq(prototypes.projectId, req.params.id), isNull(prototypes.deletedAt)));
      if (!p) throw Errors.notFound('Prototype');
      const v = await db.transaction(async (tx) => {
        await assertOwnedReadyMedia(me.id, req.body.mediaIds, tx);
        const [row] = await tx.insert(prototypeVersions).values({ prototypeId: p.id, uploadedById: me.id, versionLabel: req.body.versionLabel, notes: req.body.notes }).returning();
        await tx.insert(prototypeVersionMedia).values(req.body.mediaIds.map((mediaId, position) => ({ versionId: row!.id, mediaId, position })));
        await tx.update(prototypes).set({ versionCount: sql`${prototypes.versionCount} + 1`, latestVersionLabel: req.body.versionLabel }).where(eq(prototypes.id, p.id));
        await addLedger(tx, { projectId: req.params.id, actorId: me.id, type: 'prototype_updated', summary: `Uploaded ${req.body.versionLabel} of "${p.name}"`, refType: 'prototype_version', refId: row!.id });
        return row!;
      });
      await notifyMembers(req.params.id, 'prototypes', { type: 'prototype_version', actorId: me.id, targetType: 'prototype', targetId: p.id, title: `New version ${v.versionLabel} of ${p.name}`, data: { projectId: req.params.id } });
      const [media, people] = await Promise.all([
        attachmentsFor(prototypeVersionMedia, { parent: prototypeVersionMedia.versionId, media: prototypeVersionMedia.mediaId, position: prototypeVersionMedia.position }, [v.id]),
        loadUserSummaries([me.id]),
      ]);
      return reply.status(201).send({ ...v, media: media.get(v.id) ?? [], uploadedBy: people.get(me.id)! });
    },
  });

  // ── Comments on research docs & prototype versions ───────────────────────

  const commentTarget = z.object({ targetType: z.enum(['research_doc', 'prototype_version']), targetId: z.uuid() });

  async function assertTarget(projectId: string, targetType: 'research_doc' | 'prototype_version', targetId: string) {
    const found =
      targetType === 'research_doc'
        ? await db.select({ id: researchDocs.id }).from(researchDocs).where(and(eq(researchDocs.id, targetId), eq(researchDocs.projectId, projectId)))
        : await db.select({ id: prototypeVersions.id }).from(prototypeVersions).innerJoin(prototypes, eq(prototypes.id, prototypeVersions.prototypeId)).where(and(eq(prototypeVersions.id, targetId), eq(prototypes.projectId, projectId)));
    if (!found.length) throw Errors.notFound('Comment target');
  }

  app.get('/projects/:id/workspace-comments', {
    schema: { tags, summary: 'Comments on a research doc or prototype version', security: auth, params: pid, querystring: commentTarget, response: { 200: z.object({ data: z.array(S.workspaceCommentDto) }) } },
    handler: async (req) => {
      await requireProjectMember(req.params.id, currentUser(req));
      const rows = await db
        .select()
        .from(workspaceComments)
        .where(and(eq(workspaceComments.projectId, req.params.id), eq(workspaceComments.targetType, req.query.targetType), eq(workspaceComments.targetId, req.query.targetId), isNull(workspaceComments.deletedAt)))
        .orderBy(workspaceComments.id);
      const people = await loadUserSummaries(rows.map((r) => r.authorId));
      return { data: rows.map((r) => ({ ...r, author: people.get(r.authorId)! })) };
    },
  });

  app.post('/projects/:id/workspace-comments', {
    schema: {
      tags,
      summary: 'Comment on a research doc or prototype version (any member)',
      security: auth,
      params: pid,
      body: commentTarget.extend({ body: z.string().trim().min(1).max(3000), parentId: z.uuid().optional() }),
      response: { 201: S.workspaceCommentDto },
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      await requireProjectMember(req.params.id, me);
      const b = req.body;
      await assertTarget(req.params.id, b.targetType, b.targetId);
      const [c] = await db.transaction(async (tx) => {
        const rows = await tx.insert(workspaceComments).values({ projectId: req.params.id, targetType: b.targetType, targetId: b.targetId, parentId: b.parentId ?? null, authorId: me.id, body: b.body }).returning();
        if (b.targetType === 'research_doc') await tx.update(researchDocs).set({ commentCount: sql`${researchDocs.commentCount} + 1` }).where(eq(researchDocs.id, b.targetId));
        else await tx.update(prototypeVersions).set({ commentCount: sql`${prototypeVersions.commentCount} + 1` }).where(eq(prototypeVersions.id, b.targetId));
        return rows;
      });
      if (b.targetType === 'research_doc') {
        const [doc] = await db.select({ authorId: researchDocs.authorId, title: researchDocs.title }).from(researchDocs).where(eq(researchDocs.id, b.targetId));
        if (doc) await notify([doc.authorId], { type: 'research_comment', actorId: me.id, targetType: 'research_doc', targetId: b.targetId, title: `New comment on "${doc.title}"`, body: b.body.slice(0, 120), data: { projectId: req.params.id } });
      }
      const people = await loadUserSummaries([me.id]);
      return reply.status(201).send({ ...c!, author: people.get(me.id)! });
    },
  });

  app.delete('/projects/:id/workspace-comments/:commentId', {
    schema: { tags, summary: 'Delete my workspace comment (or any, as admin)', security: auth, params: pidAnd('commentId'), response: noContent },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const { role } = await requireProjectMember(req.params.id, me);
      const [c] = await db.select().from(workspaceComments).where(and(eq(workspaceComments.id, req.params.commentId), eq(workspaceComments.projectId, req.params.id), isNull(workspaceComments.deletedAt)));
      if (!c) throw Errors.notFound('Comment');
      if (c.authorId !== me.id && role !== 'owner' && role !== 'admin') throw Errors.forbidden();
      await db.update(workspaceComments).set({ deletedAt: new Date().toISOString() }).where(eq(workspaceComments.id, c.id));
      return reply.status(204).send(null);
    },
  });

  // ── Expert evaluations ───────────────────────────────────────────────────

  app.get('/projects/:id/evaluations', {
    schema: {
      tags,
      summary: 'Expert evaluations with averages',
      security: auth,
      params: pid,
      response: {
        200: z.object({
          summary: z.object({ count: z.number(), feasibility: z.number().nullable(), sustainability: z.number().nullable(), novelty: z.number().nullable() }),
          data: z.array(S.evaluationDto),
        }),
      },
    },
    handler: async (req) => {
      await requireProjectMember(req.params.id, currentUser(req));
      const rows = await db.select().from(evaluations).where(and(eq(evaluations.projectId, req.params.id), isNull(evaluations.deletedAt))).orderBy(desc(evaluations.id));
      const people = await loadUserSummaries(rows.map((r) => r.expertId));
      const avg = (k: 'feasibility' | 'sustainability' | 'novelty') => (rows.length ? Math.round((rows.reduce((s, r) => s + r[k], 0) / rows.length) * 10) / 10 : null);
      return {
        summary: { count: rows.length, feasibility: avg('feasibility'), sustainability: avg('sustainability'), novelty: avg('novelty') },
        data: rows.map((r) => ({ ...r, expert: people.get(r.expertId)! })),
      };
    },
  });

  app.post('/projects/:id/evaluations', {
    schema: {
      tags,
      summary: 'Submit an expert evaluation (members with the Expert role)',
      description: 'Scores 1–5 for feasibility, sustainability and novelty, plus written feedback. Optionally tied to a research doc or prototype version.',
      security: auth,
      params: pid,
      body: S.evaluationBody,
      response: { 201: S.evaluationDto },
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      await requireProjectMember(req.params.id, me);
      const [u] = await db.select({ memberRole: users.memberRole, fullName: users.fullName }).from(users).where(eq(users.id, me.id));
      if (u?.memberRole !== 'expert') throw Errors.forbidden('Only experts can submit evaluations');
      if (req.body.researchDocId) await assertTarget(req.params.id, 'research_doc', req.body.researchDocId);
      if (req.body.prototypeVersionId) await assertTarget(req.params.id, 'prototype_version', req.body.prototypeVersionId);
      const row = await db.transaction(async (tx) => {
        const [e] = await tx.insert(evaluations).values({ ...req.body, projectId: req.params.id, expertId: me.id }).returning();
        await addLedger(tx, { projectId: req.params.id, actorId: me.id, type: 'expert_review', summary: `${u.fullName} submitted an expert review`, refType: 'evaluation', refId: e!.id });
        return e!;
      });
      const { project: proj } = await requireProjectMember(req.params.id, me);
      await emailUsers(await memberIds(req.params.id, ['owner', 'admin']), 'expert_evaluation', (to) => templates.expertEvaluation({ name: to.firstName, expert: u.fullName, project: proj.title, projectId: req.params.id }));
      await notifyMembers(req.params.id, 'evaluations', { type: 'expert_evaluation', actorId: me.id, targetType: 'project', targetId: req.params.id, title: `${u.fullName} reviewed your project` }, ['owner', 'admin']);
      const people = await loadUserSummaries([me.id]);
      return reply.status(201).send({ ...row, expert: people.get(me.id)! });
    },
  });

  app.patch('/projects/:id/evaluations/:evaluationId', {
    schema: { tags, summary: 'Edit my evaluation', security: auth, params: pidAnd('evaluationId'), body: S.evaluationBody.partial(), response: { 200: S.evaluationDto } },
    handler: async (req) => {
      const me = currentUser(req);
      const [e] = await db.update(evaluations).set(req.body).where(and(eq(evaluations.id, req.params.evaluationId), eq(evaluations.projectId, req.params.id), eq(evaluations.expertId, me.id), isNull(evaluations.deletedAt))).returning();
      if (!e) throw Errors.notFound('Evaluation');
      const people = await loadUserSummaries([me.id]);
      return { ...e, expert: people.get(me.id)! };
    },
  });

  app.delete('/projects/:id/evaluations/:evaluationId', {
    schema: { tags, summary: 'Delete my evaluation', security: auth, params: pidAnd('evaluationId'), response: noContent },
    handler: async (req, reply) => {
      await db.update(evaluations).set({ deletedAt: new Date().toISOString() }).where(and(eq(evaluations.id, req.params.evaluationId), eq(evaluations.projectId, req.params.id), eq(evaluations.expertId, currentUser(req).id)));
      return reply.status(204).send(null);
    },
  });

  // ── Contracts ────────────────────────────────────────────────────────────

  async function contractOut(rows: (typeof contracts.$inferSelect)[]) {
    const [people, files] = await Promise.all([loadUserSummaries(rows.map((r) => r.uploadedById)), loadMedia(rows.map((r) => r.mediaId))]);
    return rows.map((r) => ({ ...r, uploadedBy: people.get(r.uploadedById)!, file: files.get(r.mediaId) ?? null }));
  }

  app.get('/projects/:id/contracts', {
    schema: { tags, summary: 'Contracts (file links are signed, valid 1 hour)', security: auth, params: pid, response: { 200: z.object({ data: z.array(S.contractDto) }) } },
    handler: async (req) => {
      await requireProjectMember(req.params.id, currentUser(req));
      const rows = await db.select().from(contracts).where(and(eq(contracts.projectId, req.params.id), isNull(contracts.deletedAt))).orderBy(desc(contracts.id));
      return { data: await contractOut(rows) };
    },
  });

  app.post('/projects/:id/contracts', {
    schema: {
      tags,
      summary: 'Upload a contract (admin)',
      security: auth,
      params: pid,
      body: z.object({ title: z.string().trim().min(2).max(200), description: z.string().trim().max(2000).default(''), mediaId: z.uuid() }),
      response: { 201: S.contractDto },
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      await requireProjectMember(req.params.id, me, 'admin');
      await assertOwnedReadyMedia(me.id, [req.body.mediaId], db, ['document']);
      const row = await db.transaction(async (tx) => {
        const [c] = await tx.insert(contracts).values({ ...req.body, projectId: req.params.id, uploadedById: me.id }).returning();
        await addLedger(tx, { projectId: req.params.id, actorId: me.id, type: 'contract_added', summary: `Added contract "${c!.title}"`, refType: 'contract', refId: c!.id });
        return c!;
      });
      return reply.status(201).send((await contractOut([row]))[0]!);
    },
  });

  app.patch('/projects/:id/contracts/:contractId', {
    schema: {
      tags,
      summary: 'Update a contract (admin)',
      security: auth,
      params: pidAnd('contractId'),
      body: z.object({ title: z.string().trim().min(2).max(200), description: z.string().trim().max(2000), status: z.enum(['draft', 'sent', 'signed', 'void']) }).partial(),
      response: { 200: S.contractDto },
    },
    handler: async (req) => {
      await requireProjectMember(req.params.id, currentUser(req), 'admin');
      const patch = { ...req.body, ...(req.body.status === 'signed' ? { signedAt: new Date().toISOString() } : {}) };
      const [c] = await db.update(contracts).set(patch).where(and(eq(contracts.id, req.params.contractId), eq(contracts.projectId, req.params.id), isNull(contracts.deletedAt))).returning();
      if (!c) throw Errors.notFound('Contract');
      return (await contractOut([c]))[0]!;
    },
  });

  app.delete('/projects/:id/contracts/:contractId', {
    schema: { tags, summary: 'Delete a contract (admin)', security: auth, params: pidAnd('contractId'), response: noContent },
    handler: async (req, reply) => {
      await requireProjectMember(req.params.id, currentUser(req), 'admin');
      await db.update(contracts).set({ deletedAt: new Date().toISOString() }).where(and(eq(contracts.id, req.params.contractId), eq(contracts.projectId, req.params.id)));
      return reply.status(204).send(null);
    },
  });

  // ── Tasks ────────────────────────────────────────────────────────────────

  async function taskOut(rows: (typeof tasks.$inferSelect)[]) {
    const people = await loadUserSummaries(rows.flatMap((r) => [r.createdById, r.assigneeId]));
    return rows.map((r) => ({ ...r, createdBy: people.get(r.createdById)!, assignee: r.assigneeId ? (people.get(r.assigneeId) ?? null) : null }));
  }

  async function assertAssignee(projectId: string, userId: string | null | undefined) {
    if (!userId) return;
    if (!(await memberIds(projectId)).includes(userId)) throw Errors.validation('The assignee must be a project member', { assigneeId: 'Not a member' });
  }

  app.get('/projects/:id/tasks', {
    schema: {
      tags,
      summary: 'Tasks',
      security: auth,
      params: pid,
      querystring: z.object({ status: z.enum(['todo', 'done']).optional(), assignee: z.enum(['me', 'anyone']).default('anyone') }),
      response: { 200: z.object({ data: z.array(S.taskDto) }) },
    },
    handler: async (req) => {
      const me = currentUser(req);
      await requireProjectMember(req.params.id, me);
      const rows = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.projectId, req.params.id), isNull(tasks.deletedAt), req.query.status ? eq(tasks.status, req.query.status) : undefined, req.query.assignee === 'me' ? eq(tasks.assigneeId, me.id) : undefined))
        .orderBy(sql`${tasks.status} = 'done'`, sql`${tasks.dueDate} asc nulls last`, desc(tasks.id));
      return { data: await taskOut(rows) };
    },
  });

  const taskBody = z.object({
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(3000).default(''),
    dueDate: z.iso.date().nullable().optional(),
    assigneeId: z.uuid().nullable().optional(),
  });

  app.post('/projects/:id/tasks', {
    schema: { tags, summary: 'Create a task (contributor+)', security: auth, params: pid, body: taskBody, response: { 201: S.taskDto } },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const { project } = await requireProjectMember(req.params.id, me, 'contributor');
      await assertAssignee(req.params.id, req.body.assigneeId);
      const row = await db.transaction(async (tx) => {
        const [t] = await tx.insert(tasks).values({ ...req.body, dueDate: req.body.dueDate ?? null, assigneeId: req.body.assigneeId ?? null, projectId: req.params.id, createdById: me.id }).returning();
        await addLedger(tx, { projectId: req.params.id, actorId: me.id, type: 'task_created', summary: `Created task "${t!.title}"`, refType: 'task', refId: t!.id });
        return t!;
      });
      if (row.assigneeId) await emailUsers([row.assigneeId], 'task_assigned', (to) => templates.taskAssigned({ name: to.firstName, task: row.title, project: project.title, due: row.dueDate, projectId: req.params.id }));
      if (row.assigneeId) await notify([row.assigneeId], { type: 'task_assigned', actorId: me.id, targetType: 'task', targetId: row.id, title: `New task in ${project.title}: ${row.title}`, data: { projectId: req.params.id } });
      return reply.status(201).send((await taskOut([row]))[0]!);
    },
  });

  app.patch('/projects/:id/tasks/:taskId', {
    schema: {
      tags,
      summary: 'Update a task or mark it done (contributor+)',
      security: auth,
      params: pidAnd('taskId'),
      body: patchOf(taskBody).extend({ status: z.enum(['todo', 'done']).optional() }),
      response: { 200: S.taskDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const { project } = await requireProjectMember(req.params.id, me, 'contributor');
      const [t] = await db.select().from(tasks).where(and(eq(tasks.id, req.params.taskId), eq(tasks.projectId, req.params.id), isNull(tasks.deletedAt)));
      if (!t) throw Errors.notFound('Task');
      await assertAssignee(req.params.id, req.body.assigneeId);
      const completing = req.body.status === 'done' && t.status !== 'done';
      const reopening = req.body.status === 'todo' && t.status === 'done';
      const row = await db.transaction(async (tx) => {
        const [u] = await tx
          .update(tasks)
          .set({
            ...req.body,
            ...(completing ? { completedAt: new Date().toISOString(), completedById: me.id } : {}),
            ...(reopening ? { completedAt: null, completedById: null } : {}),
          })
          .where(eq(tasks.id, t.id))
          .returning();
        if (completing) await addLedger(tx, { projectId: req.params.id, actorId: me.id, type: 'task_completed', summary: `Completed "${t.title}"`, refType: 'task', refId: t.id });
        return u!;
      });
      if (completing) await notify([t.createdById], { type: 'task_completed', actorId: me.id, targetType: 'task', targetId: t.id, title: `Task done in ${project.title}: ${t.title}`, data: { projectId: req.params.id } });
      if (req.body.assigneeId && req.body.assigneeId !== t.assigneeId) {
        await emailUsers([req.body.assigneeId], 'task_assigned', (to) => templates.taskAssigned({ name: to.firstName, task: row.title, project: project.title, due: row.dueDate, projectId: req.params.id }));
        await notify([req.body.assigneeId], { type: 'task_assigned', actorId: me.id, targetType: 'task', targetId: t.id, title: `New task in ${project.title}: ${row.title}`, data: { projectId: req.params.id } });
      }
      return (await taskOut([row]))[0]!;
    },
  });

  app.delete('/projects/:id/tasks/:taskId', {
    schema: { tags, summary: 'Delete a task (creator or admin)', security: auth, params: pidAnd('taskId'), response: noContent },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const { role } = await requireProjectMember(req.params.id, me, 'contributor');
      const [t] = await db.select().from(tasks).where(and(eq(tasks.id, req.params.taskId), eq(tasks.projectId, req.params.id)));
      if (!t) throw Errors.notFound('Task');
      if (t.createdById !== me.id && role !== 'owner' && role !== 'admin') throw Errors.forbidden();
      await db.update(tasks).set({ deletedAt: new Date().toISOString() }).where(eq(tasks.id, t.id));
      return reply.status(204).send(null);
    },
  });

  // ── Ledger & notification settings ───────────────────────────────────────

  app.get('/projects/:id/ledger', {
    schema: {
      tags,
      summary: 'Project activity ledger (newest first)',
      description: 'Live updates: subscribe to the Supabase Realtime private channel `project:<id>`, event `ledger:new`.',
      security: auth,
      params: pid,
      querystring: cursorQuery.extend({ type: z.string().optional() }),
      response: { 200: cursorPageSchema(S.ledgerDto) },
    },
    handler: async (req) => {
      await requireProjectMember(req.params.id, currentUser(req));
      const rows = await db
        .select()
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.projectId, req.params.id), req.query.type ? sql`${ledgerEntries.type}::text = ${req.query.type}` : undefined, req.query.cursor ? lt(ledgerEntries.id, req.query.cursor) : undefined))
        .orderBy(desc(ledgerEntries.id))
        .limit(req.query.limit + 1);
      const page = toCursorPage(rows, req.query.limit);
      const people = await loadUserSummaries(page.data.map((r) => r.actorId));
      return { ...page, data: page.data.map((r) => ({ ...r, actor: r.actorId ? (people.get(r.actorId) ?? null) : null })) };
    },
  });

  const projectPrefs = z
    .object({ chat: z.boolean(), tasks: z.boolean(), research: z.boolean(), prototypes: z.boolean(), evaluations: z.boolean(), members: z.boolean() })
    .partial()
    .meta({ id: 'ProjectNotificationSettings' });

  app.get('/projects/:id/notification-settings', {
    schema: { tags, summary: 'My notification settings for this project', security: auth, params: pid, response: { 200: projectPrefs } },
    handler: async (req) => {
      const me = currentUser(req);
      await requireProjectMember(req.params.id, me);
      const [m] = await db.select({ prefs: projectMembers.notificationPrefs }).from(projectMembers).where(and(eq(projectMembers.projectId, req.params.id), eq(projectMembers.userId, me.id)));
      return { chat: true, tasks: true, research: true, prototypes: true, evaluations: true, members: true, ...(m?.prefs ?? {}) };
    },
  });

  app.put('/projects/:id/notification-settings', {
    schema: { tags, summary: 'Update my notification settings for this project', security: auth, params: pid, body: projectPrefs, response: { 200: projectPrefs } },
    handler: async (req) => {
      const me = currentUser(req);
      await requireProjectMember(req.params.id, me);
      const [m] = await db
        .update(projectMembers)
        .set({ notificationPrefs: sql`${projectMembers.notificationPrefs} || ${JSON.stringify(req.body)}::jsonb` })
        .where(and(eq(projectMembers.projectId, req.params.id), eq(projectMembers.userId, me.id)))
        .returning({ prefs: projectMembers.notificationPrefs });
      return { chat: true, tasks: true, research: true, prototypes: true, evaluations: true, members: true, ...(m?.prefs ?? {}) };
    },
  });
};
