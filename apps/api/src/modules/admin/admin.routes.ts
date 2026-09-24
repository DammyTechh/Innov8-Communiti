import { and, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { patchOf } from '../../lib/zod.js';
import { db } from '../../db/client.js';
import {
  auditLogs,
  broadcasts,
  comments,
  events,
  featuredItems,
  forums,
  highlightMedia,
  highlights,
  moderationActions,
  notifications,
  posts,
  projects,
  reports,
  sessions,
  users,
} from '../../db/schema/index.js';
import { audit } from '../../lib/audit.js';
import { Errors } from '../../lib/errors.js';
import { contains, escapeLike } from '../../lib/like.js';
import { offsetPageSchema, pageQuery } from '../../lib/pagination.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, idParam, noContent, userSummary } from '../_shared/dto.js';
import { assertOwnedReadyMedia } from '../_shared/media.js';
import { loadUserSummaries, userSummaryCols } from '../_shared/users.js';
import { eventBody, eventDto, eventFields, featuredDto, highlightDto } from '../explore/explore.schemas.js';
import { eventsOut, highlightsOut } from '../explore/explore.service.js';
import { reportReasonEnum, reportTargetEnum } from '../reports/reports.routes.js';
import { applyUserAction, setContentRemoved } from './admin.moderation.js';

const tags = ['Admin'];
const statusEnum = z.enum(['active', 'flagged', 'restricted', 'suspended', 'blocked']);
const roleEnum = z.enum(['member', 'moderator', 'admin', 'super_admin']);
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

async function paged<T>(q: { page: number; pageSize: number }, table: PgTable, where: SQL | undefined, rows: (limit: number, offset: number) => Promise<T[]>) {
  const [[total], data] = await Promise.all([db.select({ n: count() }).from(table).where(where), rows(q.pageSize, (q.page - 1) * q.pageSize)]);
  return { data, page: q.page, pageSize: q.pageSize, total: total?.n ?? 0 };
}

const adminUserDto = userSummary
  .extend({
    email: z.string(),
    emailVerified: z.boolean(),
    platformRole: roleEnum,
    status: statusEnum,
    statusReason: z.string().nullable(),
    statusUntil: z.string().nullable(),
    country: z.string().nullable(),
    postCount: z.number(),
    followerCount: z.number(),
    reportCount: z.number(),
    lastLoginAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'AdminUser' });

const reportDto = z
  .object({
    id: z.uuid(),
    targetType: reportTargetEnum,
    targetId: z.uuid(),
    reason: reportReasonEnum,
    details: z.string().nullable(),
    status: z.enum(['pending', 'reviewed', 'dismissed']),
    reporter: userSummary.nullable(),
    targetUser: userSummary.nullable(),
    preview: z.string().nullable().describe('Short excerpt of the reported content'),
    resolution: z.string().nullable(),
    reviewedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'AdminReport' });

async function previews(rows: { targetType: string; targetId: string }[]) {
  const by = (t: string) => rows.filter((r) => r.targetType === t).map((r) => r.targetId);
  const out = new Map<string, string>();
  const add = (list: { id: string; text: string | null }[]) => list.forEach((r) => out.set(r.id, (r.text ?? '').slice(0, 200)));
  const [p, c, f, pr] = [by('post'), by('comment'), by('forum'), by('project')];
  if (p.length) add(await db.select({ id: posts.id, text: posts.body }).from(posts).where(inArray(posts.id, p)));
  if (c.length) add(await db.select({ id: comments.id, text: comments.body }).from(comments).where(inArray(comments.id, c)));
  if (f.length) add(await db.select({ id: forums.id, text: forums.name }).from(forums).where(inArray(forums.id, f)));
  if (pr.length) add(await db.select({ id: projects.id, text: projects.title }).from(projects).where(inArray(projects.id, pr)));
  return out;
}

async function reportsOut(rows: (typeof reports.$inferSelect)[]) {
  const [people, texts] = await Promise.all([loadUserSummaries(rows.flatMap((r) => [r.reporterId, r.targetUserId])), previews(rows)]);
  return rows.map((r) => ({
    ...r,
    reporter: people.get(r.reporterId) ?? null,
    targetUser: r.targetUserId ? (people.get(r.targetUserId) ?? null) : null,
    preview: texts.get(r.targetId) ?? null,
  }));
}

export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);
  app.addHook('preHandler', app.requireRole('moderator'));

  // ── Dashboard ────────────────────────────────────────────────────────────

  app.get('/stats/overview', {
    schema: {
      tags,
      summary: 'KPI cards: users, activity, content, moderation',
      security: auth,
      response: {
        200: z.object({
          totalUsers: z.number(),
          newUsers7d: z.number(),
          newUsersPrev7d: z.number(),
          activeUsers30d: z.number(),
          totalPosts: z.number(),
          posts7d: z.number(),
          totalProjects: z.number(),
          totalForums: z.number(),
          pendingReports: z.number(),
          suspendedUsers: z.number(),
          blockedUsers: z.number(),
        }),
      },
    },
    handler: async () => {
      const n = async (table: PgTable, where?: SQL) => (await db.select({ n: count() }).from(table).where(where))[0]?.n ?? 0;
      const liveUsers = isNull(users.deletedAt);
      const [totalUsers, newUsers7d, newUsersPrev7d, activeUsers30d, totalPosts, posts7d, totalProjects, totalForums, pendingReports, suspendedUsers, blockedUsers] = await Promise.all([
        n(users, liveUsers),
        n(users, and(liveUsers, gte(users.createdAt, daysAgo(7)))),
        n(users, and(liveUsers, gte(users.createdAt, daysAgo(14)), lt(users.createdAt, daysAgo(7)))),
        db.select({ n: sql<number>`count(distinct ${sessions.userId})::int` }).from(sessions).where(gte(sessions.lastUsedAt, daysAgo(30))).then((r) => r[0]?.n ?? 0),
        n(posts, isNull(posts.deletedAt)),
        n(posts, and(isNull(posts.deletedAt), gte(posts.createdAt, daysAgo(7)))),
        n(projects, isNull(projects.deletedAt)),
        n(forums, isNull(forums.deletedAt)),
        n(reports, eq(reports.status, 'pending')),
        n(users, eq(users.status, 'suspended')),
        n(users, eq(users.status, 'blocked')),
      ]);
      return { totalUsers, newUsers7d, newUsersPrev7d, activeUsers30d, totalPosts, posts7d, totalProjects, totalForums, pendingReports, suspendedUsers, blockedUsers };
    },
  });

  app.get('/stats/user-activity', {
    schema: {
      tags,
      summary: 'Sign-ups and posts over time (chart)',
      security: auth,
      querystring: z.object({ period: z.enum(['7d', '30d', '12m']).default('30d') }),
      response: { 200: z.object({ bucket: z.enum(['day', 'month']), data: z.array(z.object({ date: z.string(), signups: z.number(), posts: z.number() })) }) },
    },
    handler: async (req) => {
      const bucket: 'day' | 'month' = req.query.period === '12m' ? 'month' : 'day';
      const span = req.query.period === '7d' ? '6 days' : req.query.period === '30d' ? '29 days' : '11 months';
      const rows = await db.execute<{ date: string; signups: number; posts: number }>(sql`
        with series as (
          select generate_series(date_trunc(${bucket}, now() - ${span}::interval), date_trunc(${bucket}, now()), ('1 ' || ${bucket})::interval) as d
        )
        select to_char(s.d, 'YYYY-MM-DD') as date,
          (select count(*)::int from ${users} u where date_trunc(${bucket}, u.created_at) = s.d and u.deleted_at is null) as signups,
          (select count(*)::int from ${posts} p where date_trunc(${bucket}, p.created_at) = s.d and p.deleted_at is null) as posts
        from series s order by s.d`);
      return { bucket, data: [...rows] };
    },
  });

  // ── Users ────────────────────────────────────────────────────────────────

  const reportCount = sql<number>`(select count(*)::int from ${reports} r where r.target_user_id = ${users.id})`;
  const adminUserCols = {
    ...userSummaryCols,
    email: users.email,
    emailVerified: sql<boolean>`${users.emailVerifiedAt} is not null`,
    platformRole: users.platformRole,
    status: users.status,
    statusReason: users.statusReason,
    statusUntil: users.statusUntil,
    country: users.country,
    postCount: users.postCount,
    followerCount: users.followerCount,
    reportCount,
    lastLoginAt: users.lastLoginAt,
    createdAt: users.createdAt,
  };

  app.get('/users', {
    schema: {
      tags,
      summary: 'Users table (search, filter, paginate)',
      security: auth,
      querystring: pageQuery.extend({ q: z.string().trim().max(100).optional(), status: statusEnum.optional(), role: roleEnum.optional(), sort: z.enum(['newest', 'oldest', 'most_reported']).default('newest') }),
      response: { 200: offsetPageSchema(adminUserDto) },
    },
    handler: async (req) => {
      const q = req.query;
      const where = and(
        isNull(users.deletedAt),
        q.status ? eq(users.status, q.status) : undefined,
        q.role ? eq(users.platformRole, q.role) : undefined,
        q.q ? or(ilike(users.fullName, contains(q.q)), ilike(users.email, contains(q.q)), ilike(users.username, contains(q.q))) : undefined,
      );
      const order = q.sort === 'oldest' ? users.id : q.sort === 'most_reported' ? desc(reportCount) : desc(users.id);
      return paged(q, users, where, (limit, offset) => db.select(adminUserCols).from(users).where(where).orderBy(order).limit(limit).offset(offset));
    },
  });

  app.get('/users/:id', {
    schema: {
      tags,
      summary: 'User details with moderation history',
      security: auth,
      params: idParam,
      response: {
        200: adminUserDto.extend({
          history: z.array(z.object({ id: z.uuid(), action: z.string(), note: z.string().nullable(), actor: userSummary.nullable(), expiresAt: z.string().nullable(), createdAt: z.string() })),
        }),
      },
    },
    handler: async (req) => {
      const [u] = await db.select(adminUserCols).from(users).where(eq(users.id, req.params.id));
      if (!u) throw Errors.notFound('User');
      const history = await db.select().from(moderationActions).where(eq(moderationActions.targetUserId, req.params.id)).orderBy(desc(moderationActions.id)).limit(50);
      const actors = await loadUserSummaries(history.map((h) => h.actorId));
      return { ...u, history: history.map((h) => ({ ...h, actor: actors.get(h.actorId) ?? null })) };
    },
  });

  app.post('/users/:id/status', {
    schema: {
      tags,
      summary: 'Warn, restrict, suspend, block or reinstate a user',
      description: 'Suspend and block sign the user out everywhere. The user is emailed. Only admins can block.',
      security: auth,
      params: idParam,
      body: z.object({
        action: z.enum(['warn', 'restrict', 'suspend', 'block', 'reinstate']),
        reason: z.string().trim().max(1000).optional(),
        durationDays: z.number().int().min(1).max(365).optional().describe('For suspend/restrict; omit for indefinite'),
      }),
      response: { 200: z.object({ status: statusEnum, until: z.string().nullable() }) },
    },
    handler: async (req) => applyUserAction(req, currentUser(req), req.params.id, req.body.action, req.body),
  });

  app.patch('/users/:id/role', {
    preHandler: [app.requireRole('super_admin')],
    schema: { tags, summary: 'Change platform role (super admin)', security: auth, params: idParam, body: z.object({ platformRole: roleEnum }), response: noContent },
    handler: async (req, reply) => {
      const me = currentUser(req);
      if (req.params.id === me.id) throw Errors.badRequest('You cannot change your own role');
      const [before] = await db.select({ role: users.platformRole }).from(users).where(eq(users.id, req.params.id));
      if (!before) throw Errors.notFound('User');
      await db.update(users).set({ platformRole: req.body.platformRole }).where(eq(users.id, req.params.id));
      await audit({ actorId: me.id, action: 'user.role_changed', entityType: 'user', entityId: req.params.id, before: { role: before.role }, after: { role: req.body.platformRole } }, req);
      return reply.status(204).send(null);
    },
  });

  // ── Reports queue ────────────────────────────────────────────────────────

  app.get('/reports', {
    schema: {
      tags,
      summary: 'Moderation queue',
      security: auth,
      querystring: pageQuery.extend({ status: z.enum(['pending', 'reviewed', 'dismissed']).default('pending'), targetType: reportTargetEnum.optional(), reason: reportReasonEnum.optional() }),
      response: { 200: offsetPageSchema(reportDto) },
    },
    handler: async (req) => {
      const q = req.query;
      const where = and(eq(reports.status, q.status), q.targetType ? eq(reports.targetType, q.targetType) : undefined, q.reason ? eq(reports.reason, q.reason) : undefined);
      return paged(q, reports, where, async (limit, offset) => reportsOut(await db.select().from(reports).where(where).orderBy(desc(reports.id)).limit(limit).offset(offset)));
    },
  });

  app.get('/reports/:id', {
    schema: { tags, summary: 'Report details', security: auth, params: idParam, response: { 200: reportDto } },
    handler: async (req) => {
      const [r] = await db.select().from(reports).where(eq(reports.id, req.params.id));
      if (!r) throw Errors.notFound('Report');
      return (await reportsOut([r]))[0]!;
    },
  });

  app.post('/reports/:id/action', {
    schema: {
      tags,
      summary: 'Resolve a report',
      description:
        '`dismiss` closes it. `remove_content` hides the item. `warn` / `suspend` / `block` act on the content owner. Combine with `removeContent: true` to also hide the item. Other pending reports on the same item are resolved too.',
      security: auth,
      params: idParam,
      body: z.object({
        action: z.enum(['dismiss', 'remove_content', 'warn', 'suspend', 'block']),
        removeContent: z.boolean().default(false),
        note: z.string().trim().max(1000).optional(),
        durationDays: z.number().int().min(1).max(365).optional(),
      }),
      response: { 200: reportDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const [r] = await db.select().from(reports).where(eq(reports.id, req.params.id));
      if (!r) throw Errors.notFound('Report');
      if (r.status !== 'pending') throw Errors.conflict('This report has already been resolved');
      const b = req.body;
      const contentType = r.targetType as 'post' | 'comment' | 'forum' | 'project';
      const removable = ['post', 'comment', 'forum', 'project'].includes(r.targetType);

      if (b.action === 'dismiss') {
        await db.insert(moderationActions).values({ actorId: me.id, reportId: r.id, targetUserId: r.targetUserId, targetType: r.targetType, targetId: r.targetId, action: 'dismiss', note: b.note ?? null });
      } else {
        if ((b.action === 'remove_content' || b.removeContent) && removable) await setContentRemoved(req, me, contentType, r.targetId, true, { note: b.note, reportId: r.id });
        if (b.action !== 'remove_content' && r.targetUserId) await applyUserAction(req, me, r.targetUserId, b.action, { reason: b.note, durationDays: b.durationDays, reportId: r.id });
      }
      await db
        .update(reports)
        .set({ status: b.action === 'dismiss' ? 'dismissed' : 'reviewed', reviewedById: me.id, reviewedAt: new Date().toISOString(), resolution: `${b.action}${b.note ? `: ${b.note}` : ''}` })
        .where(and(eq(reports.targetType, r.targetType), eq(reports.targetId, r.targetId), eq(reports.status, 'pending')));
      const [updated] = await db.select().from(reports).where(eq(reports.id, r.id));
      return (await reportsOut([updated!]))[0]!;
    },
  });

  // ── Content moderation ───────────────────────────────────────────────────

  const contentParams = z.object({ type: z.enum(['post', 'comment', 'forum', 'project']), id: z.uuid() });
  for (const op of ['remove', 'restore'] as const) {
    app.post(`/content/:type/:id/${op}`, {
      schema: { tags, summary: op === 'remove' ? 'Remove content (hide from members)' : 'Restore removed content', security: auth, params: contentParams, body: z.object({ note: z.string().max(1000).optional() }).nullish(), response: noContent },
      handler: async (req, reply) => {
        await setContentRemoved(req, currentUser(req), req.params.type, req.params.id, op === 'remove', { note: req.body?.note });
        return reply.status(204).send(null);
      },
    });
  }

  app.get('/content/posts', {
    schema: {
      tags,
      summary: 'Posts table',
      security: auth,
      querystring: pageQuery.extend({ q: z.string().trim().max(100).optional(), state: z.enum(['live', 'removed', 'all']).default('all') }),
      response: { 200: offsetPageSchema(z.object({ id: z.uuid(), body: z.string(), author: userSummary, likeCount: z.number(), commentCount: z.number(), removedAt: z.string().nullable(), createdAt: z.string() })) },
    },
    handler: async (req) => {
      const q = req.query;
      const where = and(isNull(posts.deletedAt), q.state === 'live' ? isNull(posts.removedAt) : q.state === 'removed' ? isNotNull(posts.removedAt) : undefined, q.q ? ilike(posts.body, contains(q.q)) : undefined);
      return paged(q, posts, where, (limit, offset) =>
        db
          .select({ id: posts.id, body: posts.body, likeCount: posts.likeCount, commentCount: posts.commentCount, removedAt: posts.removedAt, createdAt: posts.createdAt, author: userSummaryCols })
          .from(posts)
          .innerJoin(users, eq(users.id, posts.authorId))
          .where(where)
          .orderBy(desc(posts.id))
          .limit(limit)
          .offset(offset),
      );
    },
  });

  const communityRow = z.object({ id: z.uuid(), name: z.string(), owner: userSummary, memberCount: z.number(), visibility: z.string(), removedAt: z.string().nullable(), createdAt: z.string() });

  app.get('/forums', {
    schema: { tags, summary: 'Forums table', security: auth, querystring: pageQuery.extend({ q: z.string().trim().max(100).optional() }), response: { 200: offsetPageSchema(communityRow) } },
    handler: async (req) => {
      const where = and(isNull(forums.deletedAt), req.query.q ? ilike(forums.name, contains(req.query.q)) : undefined);
      return paged(req.query, forums, where, (limit, offset) =>
        db.select({ id: forums.id, name: forums.name, memberCount: forums.memberCount, visibility: forums.visibility, removedAt: forums.removedAt, createdAt: forums.createdAt, owner: userSummaryCols }).from(forums).innerJoin(users, eq(users.id, forums.ownerId)).where(where).orderBy(desc(forums.id)).limit(limit).offset(offset),
      );
    },
  });

  app.get('/projects', {
    schema: {
      tags,
      summary: 'Projects table',
      security: auth,
      querystring: pageQuery.extend({ q: z.string().trim().max(100).optional() }),
      response: { 200: offsetPageSchema(communityRow.extend({ status: z.string(), featuredAt: z.string().nullable() })) },
    },
    handler: async (req) => {
      const where = and(isNull(projects.deletedAt), req.query.q ? ilike(projects.title, contains(req.query.q)) : undefined);
      return paged(req.query, projects, where, (limit, offset) =>
        db
          .select({ id: projects.id, name: projects.title, status: projects.status, featuredAt: projects.featuredAt, memberCount: projects.memberCount, visibility: projects.visibility, removedAt: projects.removedAt, createdAt: projects.createdAt, owner: userSummaryCols })
          .from(projects)
          .innerJoin(users, eq(users.id, projects.ownerId))
          .where(where)
          .orderBy(desc(projects.id))
          .limit(limit)
          .offset(offset),
      );
    },
  });

  // ── Events ───────────────────────────────────────────────────────────────

  app.get('/events', {
    schema: { tags, summary: 'All events (including drafts)', security: auth, querystring: pageQuery.extend({ status: z.enum(['draft', 'published', 'cancelled']).optional() }), response: { 200: offsetPageSchema(eventDto) } },
    handler: async (req) => {
      const where = and(isNull(events.deletedAt), req.query.status ? eq(events.status, req.query.status) : undefined);
      return paged(req.query, events, where, async (limit, offset) => eventsOut(await db.select().from(events).where(where).orderBy(desc(events.startsAt)).limit(limit).offset(offset), currentUser(req).id));
    },
  });

  app.post('/events', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Create an event (admin)', security: auth, body: eventBody, response: { 201: eventDto } },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const [e] = await db.insert(events).values({ ...req.body, createdById: me.id }).returning();
      await audit({ actorId: me.id, action: 'event.created', entityType: 'event', entityId: e!.id }, req);
      return reply.status(201).send((await eventsOut([e!], me.id))[0]!);
    },
  });

  app.patch('/events/:id', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Edit an event (admin)', security: auth, params: idParam, body: patchOf(eventFields), response: { 200: eventDto } },
    handler: async (req) => {
      const patch = req.body;
      if (patch.startsAt && patch.endsAt && new Date(patch.endsAt) <= new Date(patch.startsAt)) {
        throw Errors.validation('End time must be after the start time', { endsAt: 'Must be after startsAt' });
      }
      const [e] = await db.update(events).set(patch).where(and(eq(events.id, req.params.id), isNull(events.deletedAt))).returning();
      if (!e) throw Errors.notFound('Event');
      return (await eventsOut([e], currentUser(req).id))[0]!;
    },
  });

  app.delete('/events/:id', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Delete an event (admin)', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      await db.update(events).set({ deletedAt: new Date().toISOString() }).where(eq(events.id, req.params.id));
      return reply.status(204).send(null);
    },
  });

  // ── Featured innovations ─────────────────────────────────────────────────

  const featuredBody = z.object({
    title: z.string().trim().min(3).max(160),
    summary: z.string().trim().max(500).default(''),
    body: z.string().trim().max(10000).default(''),
    coverUrl: z.url().nullable().optional(),
    projectId: z.uuid().nullable().optional(),
    position: z.number().int().min(0).default(0),
    publish: z.boolean().default(false),
  });

  app.get('/featured', {
    schema: { tags, summary: 'Featured innovations (including unpublished)', security: auth, response: { 200: z.object({ data: z.array(featuredDto) }) } },
    handler: async () => ({ data: await db.select().from(featuredItems).where(isNull(featuredItems.deletedAt)).orderBy(featuredItems.position, desc(featuredItems.id)) }),
  });

  app.post('/featured', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Create a featured innovation (admin)', security: auth, body: featuredBody, response: { 201: featuredDto } },
    handler: async (req, reply) => {
      const { publish, ...b } = req.body;
      const [f] = await db.insert(featuredItems).values({ ...b, coverUrl: b.coverUrl ?? null, projectId: b.projectId ?? null, createdById: currentUser(req).id, publishedAt: publish ? new Date().toISOString() : null }).returning();
      if (b.projectId) await db.update(projects).set({ featuredAt: new Date().toISOString() }).where(eq(projects.id, b.projectId));
      return reply.status(201).send(f!);
    },
  });

  app.patch('/featured/:id', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Edit or publish a featured innovation (admin)', security: auth, params: idParam, body: patchOf(featuredBody), response: { 200: featuredDto } },
    handler: async (req) => {
      const { publish, ...b } = req.body;
      const [f] = await db
        .update(featuredItems)
        .set({ ...b, ...(publish === undefined ? {} : { publishedAt: publish ? new Date().toISOString() : null }) })
        .where(and(eq(featuredItems.id, req.params.id), isNull(featuredItems.deletedAt)))
        .returning();
      if (!f) throw Errors.notFound('Featured innovation');
      return f;
    },
  });

  app.delete('/featured/:id', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Delete a featured innovation (admin)', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      await db.update(featuredItems).set({ deletedAt: new Date().toISOString() }).where(eq(featuredItems.id, req.params.id));
      return reply.status(204).send(null);
    },
  });

  // ── Community highlights ─────────────────────────────────────────────────

  const highlightBody = z.object({ title: z.string().trim().min(3).max(160), caption: z.string().trim().max(2000).default(''), mediaIds: z.array(z.uuid()).min(1).max(20), publish: z.boolean().default(true) });

  app.get('/highlights', {
    schema: { tags, summary: 'Highlights (including unpublished)', security: auth, querystring: pageQuery, response: { 200: offsetPageSchema(highlightDto) } },
    handler: async (req) => paged(req.query, highlights, isNull(highlights.deletedAt), async (limit, offset) => highlightsOut(await db.select().from(highlights).where(isNull(highlights.deletedAt)).orderBy(desc(highlights.id)).limit(limit).offset(offset))),
  });

  app.post('/highlights', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Create a highlight (admin)', security: auth, body: highlightBody, response: { 201: highlightDto } },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const { mediaIds, publish, ...b } = req.body;
      const h = await db.transaction(async (tx) => {
        await assertOwnedReadyMedia(me.id, mediaIds, tx, ['image', 'video']);
        const [row] = await tx.insert(highlights).values({ ...b, createdById: me.id, publishedAt: publish ? new Date().toISOString() : null }).returning();
        await tx.insert(highlightMedia).values(mediaIds.map((mediaId, position) => ({ highlightId: row!.id, mediaId, position })));
        return row!;
      });
      return reply.status(201).send((await highlightsOut([h]))[0]!);
    },
  });

  app.patch('/highlights/:id', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Edit or publish a highlight (admin)', security: auth, params: idParam, body: patchOf(highlightBody.omit({ mediaIds: true })), response: { 200: highlightDto } },
    handler: async (req) => {
      const { publish, ...b } = req.body;
      const [h] = await db
        .update(highlights)
        .set({ ...b, ...(publish === undefined ? {} : { publishedAt: publish ? new Date().toISOString() : null }) })
        .where(and(eq(highlights.id, req.params.id), isNull(highlights.deletedAt)))
        .returning();
      if (!h) throw Errors.notFound('Highlight');
      return (await highlightsOut([h]))[0]!;
    },
  });

  app.delete('/highlights/:id', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Delete a highlight (admin)', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      await db.update(highlights).set({ deletedAt: new Date().toISOString() }).where(eq(highlights.id, req.params.id));
      return reply.status(204).send(null);
    },
  });

  // ── Broadcast notifications ──────────────────────────────────────────────

  const broadcastDto = z.object({ id: z.uuid(), title: z.string(), body: z.string(), audience: z.object({ memberRoles: z.array(z.string()).optional(), countries: z.array(z.string()).optional() }), recipientCount: z.number(), sentBy: userSummary.nullable(), sentAt: z.string().nullable(), createdAt: z.string() });

  app.get('/broadcasts', {
    schema: { tags, summary: 'Sent broadcasts', security: auth, querystring: pageQuery, response: { 200: offsetPageSchema(broadcastDto) } },
    handler: async (req) =>
      paged(req.query, broadcasts, undefined, async (limit, offset) => {
        const rows = await db.select().from(broadcasts).orderBy(desc(broadcasts.id)).limit(limit).offset(offset);
        const people = await loadUserSummaries(rows.map((r) => r.sentById));
        return rows.map((r) => ({ ...r, sentBy: people.get(r.sentById) ?? null }));
      }),
  });

  app.post('/broadcasts', {
    preHandler: [app.requireRole('admin')],
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    schema: {
      tags,
      summary: 'Send an in-app notification to all members or a segment (admin)',
      description: 'Inserted in one SQL statement, so it scales to large audiences inside a serverless request. Members see it in their notifications list.',
      security: auth,
      body: z.object({
        title: z.string().trim().min(3).max(120),
        body: z.string().trim().min(1).max(1000),
        audience: z.object({ memberRoles: z.array(z.enum(['innovator', 'researcher', 'expert', 'investor', 'student'])).optional(), countries: z.array(z.string().length(2)).optional() }).default({}),
      }),
      response: { 201: broadcastDto },
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const { title, body, audience } = req.body;
      const [b] = await db.insert(broadcasts).values({ title, body, audience, sentById: me.id }).returning();
      const filters = [
        sql`u.deleted_at is null`,
        sql`u.status <> 'blocked'`,
        audience.memberRoles?.length ? sql`u.member_role::text in (${sql.join(audience.memberRoles.map((r) => sql`${r}`), sql`, `)})` : undefined,
        audience.countries?.length ? sql`u.country in (${sql.join(audience.countries.map((c) => sql`${c}`), sql`, `)})` : undefined,
      ].filter(Boolean) as SQL[];
      const result = await db.execute(sql`
        insert into ${notifications} (id, user_id, type, title, body, data, target_type, target_id)
        select gen_random_uuid(), u.id, 'broadcast', ${title}, ${body}, ${JSON.stringify({ broadcastId: b!.id })}::jsonb, 'broadcast', ${b!.id}::uuid
        from ${users} u where ${sql.join(filters, sql` and `)}`);
      const [sent] = await db.update(broadcasts).set({ recipientCount: result.count ?? 0, sentAt: new Date().toISOString() }).where(eq(broadcasts.id, b!.id)).returning();
      await audit({ actorId: me.id, action: 'broadcast.sent', entityType: 'broadcast', entityId: b!.id, after: { recipients: result.count } }, req);
      const people = await loadUserSummaries([me.id]);
      return reply.status(201).send({ ...sent!, sentBy: people.get(me.id) ?? null });
    },
  });

  // ── Audit logs ───────────────────────────────────────────────────────────

  app.get('/audit-logs', {
    preHandler: [app.requireRole('admin')],
    schema: {
      tags,
      summary: 'Audit logs (admin)',
      security: auth,
      querystring: pageQuery.extend({ action: z.string().max(80).optional().describe('Prefix, e.g. "auth." or "user.suspend"'), actorId: z.uuid().optional(), entityId: z.uuid().optional() }),
      response: {
        200: offsetPageSchema(z.object({ id: z.uuid(), action: z.string(), entityType: z.string(), entityId: z.string().nullable(), message: z.string().nullable(), actor: userSummary.nullable(), ip: z.string().nullable(), before: z.unknown(), after: z.unknown(), createdAt: z.string() })),
      },
    },
    handler: async (req) => {
      const q = req.query;
      const where = and(q.action ? ilike(auditLogs.action, `${escapeLike(q.action)}%`) : undefined, q.actorId ? eq(auditLogs.actorId, q.actorId) : undefined, q.entityId ? eq(auditLogs.entityId, q.entityId) : undefined);
      return paged(q, auditLogs, where, async (limit, offset) => {
        const rows = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.id)).limit(limit).offset(offset);
        const people = await loadUserSummaries(rows.map((r) => r.actorId));
        return rows.map((r) => ({ ...r, actor: r.actorId ? (people.get(r.actorId) ?? null) : null }));
      });
    },
  });
};
