import { and, asc, count, countDistinct, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, like, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { patchOf } from '../../lib/zod.js';
import { db, type DbOrTx } from '../../db/client.js';
import {
  auditLogs,
  broadcasts,
  events,
  featuredItems,
  featuredMedia,
  featuredTopics,
  forums,
  highlightMedia,
  highlights,
  ledgerEntries,
  memberVerifications,
  moderationActions,
  posts,
  projects,
  reports,
  sessions,
  topics,
  users,
} from '../../db/schema/index.js';
import { audit } from '../../lib/audit.js';
import { Errors } from '../../lib/errors.js';
import { contains, escapeLike } from '../../lib/like.js';
import { offsetPageSchema, pageQuery } from '../../lib/pagination.js';
import { kpi, kpiDto, rangeEnum, rangeWindow } from '../../lib/stats.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, idParam, memberRoleEnum, noContent, userSummary } from '../_shared/dto.js';
import { assertOwnedReadyMedia } from '../_shared/media.js';
import { loadUserSummaries, userSummaryCols } from '../_shared/users.js';
import { eventBody, eventCategory, eventDto, eventFields, featuredDto, highlightDto } from '../explore/explore.schemas.js';
import { eventsOut, featuredOut, highlightsOut } from '../explore/explore.service.js';
import { reportReasonEnum, reportTargetEnum } from '../reports/reports.routes.js';
import { createBroadcast, drainBroadcasts } from './admin.broadcast.js';
import { accountLogPrefixes, actionDetails, actionLabel } from './admin.labels.js';
import { applyCommunityAction, applyUserAction, setContentRemoved } from './admin.moderation.js';
import { reportDto, reportedContent, reportedContentDto, reportHistory, reportHistoryDto, reportSearch, reportsOut } from './admin.reports.js';
import { adminSettingsRoutes } from './admin.settings.routes.js';
import { adminStatsRoutes } from './admin.stats.routes.js';
import { adminVerificationRoutes } from './admin.verifications.routes.js';
import { loadVerification, verificationDto } from '../me/verification.js';

const tags = ['Admin'];
const statusEnum = z.enum(['active', 'flagged', 'restricted', 'suspended', 'blocked']);
const roleEnum = z.enum(['member', 'moderator', 'admin', 'super_admin']);
const communityStatusEnum = z.enum(['active', 'flagged', 'restricted', 'suspended']);
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();
/** Short id shown in the dashboard tables ("b2f1e3a4"): the last 8 hex characters of the UUID. */
const shortId = (col: AnyPgColumn) => sql<string>`right(replace(${col}::text, '-', ''), 8)`;
const dateRange = z.object({
  from: z.iso.date().optional().describe('Filter by date: first day (inclusive), YYYY-MM-DD'),
  to: z.iso.date().optional().describe('Filter by date: last day (inclusive), YYYY-MM-DD'),
});
const dayEnd = (d: string) => new Date(new Date(`${d}T00:00:00Z`).getTime() + 86_400_000).toISOString();

async function paged<T>(q: { page: number; pageSize: number }, table: PgTable, where: SQL | undefined, rows: (limit: number, offset: number) => Promise<T[]>) {
  const [[total], data] = await Promise.all([db.select({ n: count() }).from(table).where(where), rows(q.pageSize, (q.page - 1) * q.pageSize)]);
  return { data, page: q.page, pageSize: q.pageSize, total: total?.n ?? 0 };
}

const adminUserDto = userSummary
  .extend({
    shortId: z.string().describe('User Id column: last 8 hex characters of id'),
    verificationStatus: z.enum(['unverified', 'pending', 'verified', 'rejected']).describe('Role verification (review in /admin/verifications)'),
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

export const adminRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);
  app.addHook('preHandler', app.requireRole('moderator'));
  await app.register(adminStatsRoutes); // /stats/users, /stats/forums, /stats/projects, /stats/events
  await app.register(adminSettingsRoutes); // /settings, /maintenance
  await app.register(adminVerificationRoutes); // /verifications

  // ── Dashboard ────────────────────────────────────────────────────────────

  app.get('/stats/overview', {
    schema: {
      tags,
      summary: 'KPI cards: users, activity, content, moderation',
      description:
        'Overview page. `cards` are the four KPI cards (Total Users, Active Events, Active Forums, Active Projects) for the chosen `range`, each with `changePct` against the previous window. The flat fields are kept for existing clients.',
      security: auth,
      querystring: z.object({ range: rangeEnum }),
      response: {
        200: z.object({
          range: rangeEnum,
          cards: z.object({
            totalUsers: kpiDto.describe('All members now vs at the start of the range'),
            activeEvents: kpiDto.describe('Published events running now vs running at the start of the range'),
            activeForums: kpiDto.describe('Forums with at least one post in the range vs the previous range'),
            activeProjects: kpiDto.describe('Projects with workspace activity in the range vs the previous range'),
          }),
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
          pendingVerifications: z.number().describe('Role forms waiting for review (/admin/verifications)'),
        }),
      },
    },
    handler: async (req) => {
      const n = async (table: PgTable, where?: SQL) => (await db.select({ n: count() }).from(table).where(where))[0]?.n ?? 0;
      const w = rangeWindow(req.query.range);
      const runningAt = (t: string) => and(eq(events.status, 'published'), isNull(events.deletedAt), lte(events.startsAt, t), gt(events.endsAt, t));
      const activeForums = async (from: string, to: string) =>
        (await db.select({ n: countDistinct(posts.forumId) }).from(posts).innerJoin(forums, eq(forums.id, posts.forumId)).where(and(isNull(posts.deletedAt), isNull(forums.deletedAt), gte(posts.createdAt, from), lt(posts.createdAt, to))))[0]?.n ?? 0;
      const activeProjects = async (from: string, to: string) =>
        (await db.select({ n: countDistinct(ledgerEntries.projectId) }).from(ledgerEntries).innerJoin(projects, eq(projects.id, ledgerEntries.projectId)).where(and(isNull(projects.deletedAt), gte(ledgerEntries.createdAt, from), lt(ledgerEntries.createdAt, to))))[0]?.n ?? 0;
      const [usersNow, usersBefore, eventsNow, eventsBefore, forumsNow, forumsPrev, projectsNow, projectsPrev] = await Promise.all([
        n(users, isNull(users.deletedAt)),
        n(users, and(isNull(users.deletedAt), lt(users.createdAt, w.from))),
        n(events, runningAt(w.to)),
        n(events, runningAt(w.from)),
        activeForums(w.from, w.to),
        activeForums(w.prevFrom, w.from),
        activeProjects(w.from, w.to),
        activeProjects(w.prevFrom, w.from),
      ]);
      const pendingVerifications = await n(memberVerifications, eq(memberVerifications.status, 'pending'));
      const cards = {
        totalUsers: kpi(usersNow, usersBefore),
        activeEvents: kpi(eventsNow, eventsBefore),
        activeForums: kpi(forumsNow, forumsPrev),
        activeProjects: kpi(projectsNow, projectsPrev),
      };
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
      return { range: req.query.range, cards, totalUsers, newUsers7d, newUsersPrev7d, activeUsers30d, totalPosts, posts7d, totalProjects, totalForums, pendingReports, suspendedUsers, blockedUsers, pendingVerifications };
    },
  });

  app.get('/stats/user-activity', {
    schema: {
      tags,
      summary: 'Activity over time (User Activity, Forum Activity charts)',
      description: 'One series per chart: `signups` (Users per day), `forumPosts` (Forum Activity), `forumsCreated`, `projectsCreated`, `posts`. `range` is an alias of `period`.',
      security: auth,
      querystring: z.object({ period: z.enum(['7d', '30d', '90d', '12m']).default('30d'), range: z.enum(['7d', '30d', '90d', '12m']).optional() }),
      response: {
        200: z.object({
          bucket: z.enum(['day', 'month']),
          data: z.array(z.object({ date: z.string(), signups: z.number(), posts: z.number(), forumPosts: z.number(), forumsCreated: z.number(), projectsCreated: z.number() })),
        }),
      },
    },
    handler: async (req) => {
      const period = req.query.range ?? req.query.period;
      const bucket: 'day' | 'month' = period === '12m' ? 'month' : 'day';
      const span = { '7d': '6 days', '30d': '29 days', '90d': '89 days', '12m': '11 months' }[period];
      const rows = await db.execute<{ date: string; signups: number; posts: number; forumPosts: number; forumsCreated: number; projectsCreated: number }>(sql`
        with series as (
          select generate_series(date_trunc(${bucket}, now() - ${span}::interval), date_trunc(${bucket}, now()), ('1 ' || ${bucket})::interval) as d
        )
        select to_char(s.d, 'YYYY-MM-DD') as date,
          (select count(*)::int from ${users} u where date_trunc(${bucket}, u.created_at) = s.d and u.deleted_at is null) as signups,
          (select count(*)::int from ${posts} p where date_trunc(${bucket}, p.created_at) = s.d and p.deleted_at is null) as posts,
          (select count(*)::int from ${posts} p where date_trunc(${bucket}, p.created_at) = s.d and p.deleted_at is null and p.forum_id is not null) as "forumPosts",
          (select count(*)::int from ${forums} f where date_trunc(${bucket}, f.created_at) = s.d and f.deleted_at is null) as "forumsCreated",
          (select count(*)::int from ${projects} pr where date_trunc(${bucket}, pr.created_at) = s.d and pr.deleted_at is null) as "projectsCreated"
        from series s order by s.d`);
      return { bucket, data: [...rows] };
    },
  });

  // ── Users ────────────────────────────────────────────────────────────────

  // Table-qualified on purpose: Drizzle drops the table name in single-table selects, and an
  // unqualified "id" inside this subquery would resolve to r.id (always 0).
  const reportCount = sql<number>`(select count(*)::int from ${reports} r where r.target_user_id = ${users}.id)`;
  const adminUserCols = {
    ...userSummaryCols,
    shortId: shortId(users.id),
    verificationStatus: users.verificationStatus,
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
      description: '`q` matches name, email, username or the short user id.',
      security: auth,
      querystring: pageQuery.extend({
        q: z.string().trim().max(100).optional(),
        status: statusEnum.optional(),
        role: roleEnum.optional(),
        memberRole: memberRoleEnum.optional(),
        verificationStatus: z.enum(['unverified', 'pending', 'verified', 'rejected']).optional(),
        sort: z.enum(['newest', 'oldest', 'most_reported']).default('newest'),
      }),
      response: { 200: offsetPageSchema(adminUserDto) },
    },
    handler: async (req) => {
      const q = req.query;
      const where = and(
        isNull(users.deletedAt),
        q.status ? eq(users.status, q.status) : undefined,
        q.role ? eq(users.platformRole, q.role) : undefined,
        q.memberRole ? eq(users.memberRole, q.memberRole) : undefined,
        q.verificationStatus ? eq(users.verificationStatus, q.verificationStatus) : undefined,
        q.q
          ? or(ilike(users.fullName, contains(q.q)), ilike(users.email, contains(q.q)), ilike(users.username, contains(q.q)), /^[0-9a-f-]{4,36}$/i.test(q.q) ? sql`replace(${users.id}::text, '-', '') ilike ${contains(q.q.replace(/-/g, ''))}` : undefined)
          : undefined,
      );
      const order = q.sort === 'oldest' ? users.id : q.sort === 'most_reported' ? desc(reportCount) : desc(users.id);
      return paged(q, users, where, (limit, offset) => db.select(adminUserCols).from(users).where(where).orderBy(order).limit(limit).offset(offset));
    },
  });

  app.get('/users/:id', {
    schema: {
      tags,
      summary: 'User details panel with report history and moderation history',
      security: auth,
      params: idParam,
      response: {
        200: adminUserDto.extend({
          bio: z.string().nullable(),
          location: z.string().nullable(),
          phone: z.string().nullable(),
          institutionalEmail: z.string().nullable().describe('Expert verification'),
          researchLink: z.string().nullable().describe('Expert verification'),
          researchEvidence: z.string().nullable().describe('Expert verification ("Evidence of research")'),
          reportHistory: z.object({ previousReports: z.number(), previousWarnings: z.number(), accountStatus: statusEnum }),
          verification: verificationDto.nullable().describe('The role form (all roles), with evidence files'),
          history: z.array(z.object({ id: z.uuid(), action: z.string(), note: z.string().nullable(), actor: userSummary.nullable(), expiresAt: z.string().nullable(), createdAt: z.string() })),
        }),
      },
    },
    handler: async (req) => {
      const [u] = await db
        .select({
          ...adminUserCols,
          bio: users.bio,
          location: users.location,
          phone: users.phone,
          institutionalEmail: users.institutionalEmail,
          researchLink: users.researchLink,
          researchEvidence: users.researchEvidence,
        })
        .from(users)
        .where(eq(users.id, req.params.id));
      if (!u) throw Errors.notFound('User');
      const history = await db.select().from(moderationActions).where(eq(moderationActions.targetUserId, req.params.id)).orderBy(desc(moderationActions.id)).limit(50);
      const actors = await loadUserSummaries(history.map((h) => h.actorId));
      const warnings = history.filter((h) => h.action === 'warn' && h.targetType === 'user').length;
      return {
        ...u,
        reportHistory: { previousReports: u.reportCount, previousWarnings: warnings, accountStatus: u.status },
        verification: await loadVerification(u.id),
        history: history.map((h) => ({ ...h, actor: actors.get(h.actorId) ?? null })),
      };
    },
  });

  app.get('/users/:id/logs', {
    preHandler: [app.requireRole('admin')],
    schema: {
      tags,
      summary: "A user's account logs (admin)",
      description: 'Users → user → Account logs: sign-ins, sign-outs, email and password changes, and moderation on the account. `from`/`to` drive "Filter by date".',
      security: auth,
      params: idParam,
      querystring: pageQuery.merge(dateRange),
      response: {
        200: offsetPageSchema(
          z.object({
            id: z.uuid(),
            action: z.string().describe('Raw action key, e.g. auth.login'),
            label: z.string().describe('Action column, e.g. "Logged in"'),
            details: z.string().describe('Details column, e.g. "changed email to jemima@inoov.com"'),
            ip: z.string().nullable(),
            location: z.string().nullable().describe('Location column (from the edge, when available)'),
            actor: userSummary.nullable().describe('Who did it: the user, or the moderator for moderation actions'),
            createdAt: z.string(),
          }),
        ),
      },
    },
    handler: async (req) => {
      const q = req.query;
      const where = and(
        or(eq(auditLogs.actorId, req.params.id), eq(auditLogs.entityId, req.params.id)),
        or(...accountLogPrefixes.map((p) => like(auditLogs.action, `${p}%`))),
        q.from ? gte(auditLogs.createdAt, `${q.from}T00:00:00Z`) : undefined,
        q.to ? lt(auditLogs.createdAt, dayEnd(q.to)) : undefined,
      );
      return paged(q, auditLogs, where, async (limit, offset) => {
        const rows = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.id)).limit(limit).offset(offset);
        const people = await loadUserSummaries(rows.map((r) => r.actorId));
        return rows.map((r) => ({ ...r, label: actionLabel(r.action), details: actionDetails(r), actor: r.actorId ? (people.get(r.actorId) ?? null) : null }));
      });
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
      description:
        'Tabs: `status=all|pending|reviewed|dismissed` (default pending). The Users, Forums and Projects pages each show their own queue: `targetType=user|post|comment` / `forum` / `project` (comma-separated lists are allowed, e.g. `targetType=user,post,comment`). `q` searches the reported person, forum name, project title or report number.',
      security: auth,
      querystring: pageQuery.extend({
        status: z.enum(['all', 'pending', 'reviewed', 'dismissed']).default('pending'),
        targetType: z
          .string()
          .optional()
          .transform((v, ctx) => {
            if (!v) return undefined;
            const list = v.split(',').map((x) => x.trim());
            const bad = list.find((x) => !reportTargetEnum.options.includes(x as never));
            if (bad) ctx.addIssue({ code: 'custom', message: `Unknown targetType "${bad}"` });
            return list as z.infer<typeof reportTargetEnum>[];
          })
          .describe('post | comment | forum | project | user | message, or a comma-separated list'),
        reason: reportReasonEnum.optional(),
        q: z.string().trim().max(100).optional(),
      }),
      response: { 200: offsetPageSchema(reportDto) },
    },
    handler: async (req) => {
      const q = req.query;
      const where = and(
        q.status === 'all' ? undefined : eq(reports.status, q.status),
        q.targetType?.length ? inArray(reports.targetType, q.targetType) : undefined,
        q.reason ? eq(reports.reason, q.reason) : undefined,
        q.q ? reportSearch(q.q) : undefined,
      );
      return paged(q, reports, where, async (limit, offset) => reportsOut(await db.select().from(reports).where(where).orderBy(desc(reports.id)).limit(limit).offset(offset)));
    },
  });

  const reportDetailDto = reportDto.extend({ content: reportedContentDto, history: reportHistoryDto }).meta({ id: 'AdminReportDetail' });

  app.get('/reports/:id', {
    schema: { tags, summary: 'Review Report panel: reported content, details and history', security: auth, params: idParam, response: { 200: reportDetailDto } },
    handler: async (req) => {
      const [r] = await db.select().from(reports).where(eq(reports.id, req.params.id));
      if (!r) throw Errors.notFound('Report');
      const [[out], content, history] = await Promise.all([reportsOut([r]), reportedContent(r), reportHistory(r)]);
      return { ...out!, content, history };
    },
  });

  app.post('/reports/:id/action', {
    schema: {
      tags,
      summary: 'Resolve a report',
      description: [
        '`dismiss` closes it. `remove_content` hides the item (for a forum or project this is **Delete Forum / Delete Project**).',
        '`warn` / `restrict` / `suspend` / `block` act on the content owner by default. For forum and project reports, `warn`, `restrict` and `suspend` act on the forum/project itself (Send warning, Suspend Forum); pass `applyTo: "owner"` to act on its owner instead. `block` always blocks the owner (admins only).',
        'Add `removeContent: true` to also hide the item. Other pending reports on the same item are resolved too.',
      ].join(' '),
      security: auth,
      params: idParam,
      body: z.object({
        action: z.enum(['dismiss', 'remove_content', 'warn', 'restrict', 'suspend', 'block']),
        applyTo: z.enum(['target', 'owner']).optional().describe('Forum/project reports only. Default: target'),
        removeContent: z.boolean().default(false),
        note: z.string().trim().max(1000).optional().describe('The reason typed in the confirmation modal'),
        durationDays: z.number().int().min(1).max(365).optional(),
      }),
      response: { 200: reportDetailDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const [r] = await db.select().from(reports).where(eq(reports.id, req.params.id));
      if (!r) throw Errors.notFound('Report');
      if (r.status !== 'pending') throw Errors.conflict('This report has already been resolved');
      const b = req.body;
      const contentType = r.targetType as 'post' | 'comment' | 'forum' | 'project';
      const removable = ['post', 'comment', 'forum', 'project'].includes(r.targetType);
      const community = r.targetType === 'forum' || r.targetType === 'project';
      const onTarget = community && b.action !== 'block' && b.applyTo !== 'owner';

      if (b.action === 'dismiss') {
        await db.insert(moderationActions).values({ actorId: me.id, reportId: r.id, targetUserId: r.targetUserId, targetType: r.targetType, targetId: r.targetId, action: 'dismiss', note: b.note ?? null });
      } else {
        if ((b.action === 'remove_content' || b.removeContent) && removable) await setContentRemoved(req, me, contentType, r.targetId, true, { note: b.note, reportId: r.id });
        if (b.action !== 'remove_content') {
          if (onTarget) {
            await applyCommunityAction(req, me, r.targetType as 'forum' | 'project', r.targetId, b.action as 'warn' | 'restrict' | 'suspend', { reason: b.note, durationDays: b.durationDays, reportId: r.id });
          } else if (r.targetUserId) {
            await applyUserAction(req, me, r.targetUserId, b.action, { reason: b.note, durationDays: b.durationDays, reportId: r.id });
          }
        }
      }
      await db
        .update(reports)
        .set({ status: b.action === 'dismiss' ? 'dismissed' : 'reviewed', reviewedById: me.id, reviewedAt: new Date().toISOString(), resolution: `${b.action}${b.note ? `: ${b.note}` : ''}` })
        .where(and(eq(reports.targetType, r.targetType), eq(reports.targetId, r.targetId), eq(reports.status, 'pending')));
      await audit({ actorId: me.id, action: 'report.resolved', entityType: 'report', entityId: r.id, message: `#${r.number} ${b.action}${b.note ? `: ${b.note}` : ''}` }, req);
      const [updated] = await db.select().from(reports).where(eq(reports.id, r.id));
      const [[out], content, history] = await Promise.all([reportsOut([updated!]), reportedContent(updated!), reportHistory(updated!)]);
      return { ...out!, content, history };
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

  const communityRow = z.object({
    id: z.uuid(),
    shortId: z.string().describe('Forum Id / Project Id column'),
    name: z.string(),
    coverUrl: z.string().nullable(),
    owner: userSummary.describe('Creator / Moderator column'),
    memberCount: z.number(),
    reportCount: z.number(),
    visibility: z.string(),
    moderationStatus: communityStatusEnum.describe('Status pill: active, flagged (warned), restricted, suspended'),
    moderationReason: z.string().nullable(),
    moderationUntil: z.string().nullable(),
    removedAt: z.string().nullable().describe('Set when deleted by a moderator (or while suspended)'),
    createdAt: z.string(),
  });
  const communityQuery = pageQuery.extend({
    q: z.string().trim().max(100).optional(),
    status: z.enum(['active', 'flagged', 'restricted', 'suspended', 'removed']).optional().describe('`removed` = deleted by moderators'),
    sort: z.enum(['newest', 'oldest', 'most_members', 'most_reported']).default('newest'),
  });
  const communityReports = (type: 'forum' | 'project', table: typeof forums | typeof projects) =>
    sql<number>`(select count(*)::int from ${reports} r where r.target_type = ${type} and r.target_id = ${table}.id)`;

  const forumReports = communityReports('forum', forums);
  app.get('/forums', {
    schema: { tags, summary: 'All Forums table', security: auth, querystring: communityQuery, response: { 200: offsetPageSchema(communityRow) } },
    handler: async (req) => {
      const q = req.query;
      const where = and(
        isNull(forums.deletedAt),
        q.q ? or(ilike(forums.name, contains(q.q)), sql`replace(${forums.id}::text, '-', '') ilike ${contains(q.q.replace(/-/g, ''))}`) : undefined,
        q.status === 'removed' ? and(isNotNull(forums.removedAt), ne(forums.moderationStatus, 'suspended')) : q.status ? eq(forums.moderationStatus, q.status) : undefined,
      );
      const order = { newest: desc(forums.id), oldest: asc(forums.id), most_members: desc(forums.memberCount), most_reported: desc(forumReports) }[q.sort];
      return paged(q, forums, where, (limit, offset) =>
        db
          .select({
            id: forums.id,
            shortId: shortId(forums.id),
            name: forums.name,
            coverUrl: forums.coverUrl,
            memberCount: forums.memberCount,
            reportCount: forumReports,
            visibility: forums.visibility,
            moderationStatus: forums.moderationStatus,
            moderationReason: forums.moderationReason,
            moderationUntil: forums.moderationUntil,
            removedAt: forums.removedAt,
            createdAt: forums.createdAt,
            owner: userSummaryCols,
          })
          .from(forums)
          .innerJoin(users, eq(users.id, forums.ownerId))
          .where(where)
          .orderBy(order)
          .limit(limit)
          .offset(offset),
      );
    },
  });

  const projectReports = communityReports('project', projects);
  app.get('/projects', {
    schema: {
      tags,
      summary: 'All projects table',
      security: auth,
      querystring: communityQuery.extend({ projectStatus: z.enum(['open', 'ongoing', 'completed', 'archived']).optional() }),
      response: { 200: offsetPageSchema(communityRow.extend({ status: z.string().describe('Project lifecycle: open, ongoing, completed, archived'), featuredAt: z.string().nullable() })) },
    },
    handler: async (req) => {
      const q = req.query;
      const where = and(
        isNull(projects.deletedAt),
        q.q ? or(ilike(projects.title, contains(q.q)), sql`replace(${projects.id}::text, '-', '') ilike ${contains(q.q.replace(/-/g, ''))}`) : undefined,
        q.status === 'removed' ? and(isNotNull(projects.removedAt), ne(projects.moderationStatus, 'suspended')) : q.status ? eq(projects.moderationStatus, q.status) : undefined,
        q.projectStatus ? eq(projects.status, q.projectStatus) : undefined,
      );
      const order = { newest: desc(projects.id), oldest: asc(projects.id), most_members: desc(projects.memberCount), most_reported: desc(projectReports) }[q.sort];
      return paged(q, projects, where, (limit, offset) =>
        db
          .select({
            id: projects.id,
            shortId: shortId(projects.id),
            name: projects.title,
            coverUrl: projects.coverUrl,
            status: projects.status,
            featuredAt: projects.featuredAt,
            memberCount: projects.memberCount,
            reportCount: projectReports,
            visibility: projects.visibility,
            moderationStatus: projects.moderationStatus,
            moderationReason: projects.moderationReason,
            moderationUntil: projects.moderationUntil,
            removedAt: projects.removedAt,
            createdAt: projects.createdAt,
            owner: userSummaryCols,
          })
          .from(projects)
          .innerJoin(users, eq(users.id, projects.ownerId))
          .where(where)
          .orderBy(order)
          .limit(limit)
          .offset(offset),
      );
    },
  });

  for (const type of ['forum', 'project'] as const) {
    app.post(`/${type}s/:id/status`, {
      schema: {
        tags,
        summary: `Warn, restrict, suspend or reinstate a ${type}`,
        description: `warn → flagged (owner emailed and notified). restrict → ${type === 'forum' ? 'no new members or posts' : 'no new join requests'}. suspend → hidden from members until reinstated or \`durationDays\` pass. To delete use POST /admin/content/${type}/{id}/remove.`,
        security: auth,
        params: idParam,
        body: z.object({
          action: z.enum(['warn', 'restrict', 'suspend', 'reinstate']),
          reason: z.string().trim().max(1000).optional(),
          durationDays: z.number().int().min(1).max(365).optional().describe('For suspend/restrict; omit for indefinite'),
        }),
        response: { 200: z.object({ status: communityStatusEnum, until: z.string().nullable() }) },
      },
      handler: async (req) => applyCommunityAction(req, currentUser(req), type, req.params.id, req.body.action, req.body),
    });
  }

  // ── Events ───────────────────────────────────────────────────────────────

  app.get('/events', {
    schema: {
      tags,
      summary: 'All events (including drafts)',
      description:
        'Events page sections: `when=upcoming` (soonest first), `when=active` (running now), `when=concluded` (latest first). `q` searches title, venue and organizer; also used by the "Use an existing event" picker in Add Highlights.',
      security: auth,
      querystring: pageQuery.extend({
        status: z.enum(['draft', 'published', 'cancelled']).optional(),
        when: z.enum(['upcoming', 'active', 'concluded']).optional(),
        category: eventCategory.optional(),
        q: z.string().trim().max(100).optional(),
      }),
      response: { 200: offsetPageSchema(eventDto) },
    },
    handler: async (req) => {
      const q = req.query;
      const now = new Date().toISOString();
      const where = and(
        isNull(events.deletedAt),
        q.status ? eq(events.status, q.status) : undefined,
        q.category ? eq(events.category, q.category) : undefined,
        q.when === 'upcoming' ? gt(events.startsAt, now) : q.when === 'active' ? and(lte(events.startsAt, now), gt(events.endsAt, now)) : q.when === 'concluded' ? lte(events.endsAt, now) : undefined,
        q.q ? or(ilike(events.title, contains(q.q)), ilike(events.venue, contains(q.q)), ilike(events.organizerName, contains(q.q))) : undefined,
      );
      const order = q.when === 'upcoming' || q.when === 'active' ? asc(events.startsAt) : desc(events.startsAt);
      return paged(q, events, where, async (limit, offset) => eventsOut(await db.select().from(events).where(where).orderBy(order).limit(limit).offset(offset), currentUser(req).id));
    },
  });

  app.get('/events/:id', {
    schema: { tags, summary: 'Event view (including drafts)', security: auth, params: idParam, response: { 200: eventDto } },
    handler: async (req) => {
      const [e] = await db.select().from(events).where(and(eq(events.id, req.params.id), isNull(events.deletedAt)));
      if (!e) throw Errors.notFound('Event');
      return (await eventsOut([e], currentUser(req).id))[0]!;
    },
  });

  app.post('/events', {
    preHandler: [app.requireRole('admin')],
    schema: {
      tags,
      summary: 'Create an event (admin)',
      description:
        'Add Event form → fields: cover (upload with purpose `event`, pass `coverUrl`), title, category, date range (`startsAt`/`endsAt`), location (`venue`, optional), registration link (`registrationUrl`, required), about (`description`), organized by (`organizerName`, optional `organizerLogoUrl` / `organizerTagline`). Send `status: "published"` to show it to members.',
      security: auth,
      body: eventBody,
      response: { 201: eventDto },
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const [e] = await db.insert(events).values({ ...req.body, createdById: me.id }).returning();
      await audit({ actorId: me.id, action: 'event.created', entityType: 'event', entityId: e!.id, message: e!.title }, req);
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
      await audit({ actorId: currentUser(req).id, action: 'event.updated', entityType: 'event', entityId: e.id, message: e.title, after: patch }, req);
      return (await eventsOut([e], currentUser(req).id))[0]!;
    },
  });

  app.delete('/events/:id', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Delete an event (admin)', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      const [e] = await db.update(events).set({ deletedAt: new Date().toISOString() }).where(and(eq(events.id, req.params.id), isNull(events.deletedAt))).returning({ title: events.title });
      if (e) await audit({ actorId: currentUser(req).id, action: 'event.deleted', entityType: 'event', entityId: req.params.id, message: e.title }, req);
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
    topicIds: z.array(z.uuid()).max(5).default([]).describe('Topics for the members\' "Sort topics" filter'),
    mediaIds: z.array(z.uuid()).max(12).default([]).describe('Gallery images (upload with purpose `featured`), in order'),
    publish: z.boolean().default(false),
  });

  /** Replaces a featured item's topics and/or gallery inside a transaction. */
  async function setFeaturedLinks(tx: DbOrTx, featuredId: string, actorId: string, topicIds?: string[], mediaIds?: string[]) {
    if (topicIds) {
      const found = topicIds.length ? await tx.select({ id: topics.id }).from(topics).where(inArray(topics.id, topicIds)) : [];
      if (found.length !== new Set(topicIds).size) throw Errors.validation('One or more topics do not exist', { topicIds: 'Unknown topic' });
      await tx.delete(featuredTopics).where(eq(featuredTopics.featuredId, featuredId));
      if (topicIds.length) await tx.insert(featuredTopics).values([...new Set(topicIds)].map((topicId) => ({ featuredId, topicId })));
    }
    if (mediaIds) {
      await assertOwnedReadyMedia(actorId, mediaIds, tx, ['image']);
      await tx.delete(featuredMedia).where(eq(featuredMedia.featuredId, featuredId));
      if (mediaIds.length) await tx.insert(featuredMedia).values(mediaIds.map((mediaId, position) => ({ featuredId, mediaId, position })));
    }
  }

  app.get('/featured', {
    schema: { tags, summary: 'Featured innovations (including unpublished)', security: auth, response: { 200: z.object({ data: z.array(featuredDto) }) } },
    handler: async () => ({ data: await featuredOut(await db.select().from(featuredItems).where(isNull(featuredItems.deletedAt)).orderBy(featuredItems.position, desc(featuredItems.id))) }),
  });

  app.post('/featured', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Create a featured innovation (admin)', security: auth, body: featuredBody, response: { 201: featuredDto } },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const { publish, topicIds, mediaIds, ...b } = req.body;
      const f = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(featuredItems)
          .values({ ...b, coverUrl: b.coverUrl ?? null, projectId: b.projectId ?? null, createdById: me.id, publishedAt: publish ? new Date().toISOString() : null })
          .returning();
        await setFeaturedLinks(tx, row!.id, me.id, topicIds, mediaIds);
        if (b.projectId) await tx.update(projects).set({ featuredAt: new Date().toISOString() }).where(eq(projects.id, b.projectId));
        return row!;
      });
      await audit({ actorId: me.id, action: 'featured.created', entityType: 'featured', entityId: f.id, message: f.title }, req);
      return reply.status(201).send((await featuredOut([f]))[0]!);
    },
  });

  app.patch('/featured/:id', {
    preHandler: [app.requireRole('admin')],
    schema: {
      tags,
      summary: 'Edit or publish a featured innovation (admin)',
      description: 'Sending `topicIds` or `mediaIds` replaces them.',
      security: auth,
      params: idParam,
      body: patchOf(featuredBody),
      response: { 200: featuredDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const { publish, topicIds, mediaIds, ...b } = req.body;
      const f = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(featuredItems)
          .set({ ...b, ...(publish === undefined ? {} : { publishedAt: publish ? new Date().toISOString() : null }), updatedAt: new Date().toISOString() })
          .where(and(eq(featuredItems.id, req.params.id), isNull(featuredItems.deletedAt)))
          .returning();
        if (!row) throw Errors.notFound('Featured innovation');
        await setFeaturedLinks(tx, row.id, me.id, topicIds, mediaIds);
        return row;
      });
      await audit({ actorId: me.id, action: 'featured.updated', entityType: 'featured', entityId: f.id, message: f.title }, req);
      return (await featuredOut([f]))[0]!;
    },
  });

  app.delete('/featured/:id', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Delete a featured innovation (admin)', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      const [f] = await db.update(featuredItems).set({ deletedAt: new Date().toISOString() }).where(and(eq(featuredItems.id, req.params.id), isNull(featuredItems.deletedAt))).returning({ title: featuredItems.title });
      if (f) await audit({ actorId: currentUser(req).id, action: 'featured.deleted', entityType: 'featured', entityId: req.params.id, message: f.title }, req);
      return reply.status(204).send(null);
    },
  });

  // ── Community highlights ─────────────────────────────────────────────────

  const highlightBody = z.object({
    title: z.string().trim().min(3).max(160).optional().describe('Title / Name. Optional when `eventId` is given (the event title is used)'),
    eventId: z.uuid().nullable().optional().describe('"Use an existing event": any event, including past ones (GET /admin/events?q=)'),
    caption: z.string().trim().max(2000).default(''),
    mediaIds: z.array(z.uuid()).min(1).max(20).describe('Images (upload with purpose `highlight`)'),
    publish: z.boolean().default(true),
  });

  async function highlightTitle(title: string | undefined, eventId: string | null | undefined) {
    if (!eventId) {
      if (!title) throw Errors.validation('Enter a title or pick an event', { title: 'Required when no event is selected' });
      return title;
    }
    const [e] = await db.select({ title: events.title }).from(events).where(and(eq(events.id, eventId), isNull(events.deletedAt)));
    if (!e) throw Errors.validation('That event does not exist', { eventId: 'Unknown event' });
    return title ?? e.title;
  }

  app.get('/highlights', {
    schema: {
      tags,
      summary: 'Highlights (including unpublished)',
      description: 'Albums, newest first. `q` searches titles; `eventId` lists the albums of one event ("More like this").',
      security: auth,
      querystring: pageQuery.extend({ q: z.string().trim().max(100).optional(), eventId: z.uuid().optional() }),
      response: { 200: offsetPageSchema(highlightDto) },
    },
    handler: async (req) => {
      const where = and(isNull(highlights.deletedAt), req.query.q ? ilike(highlights.title, contains(req.query.q)) : undefined, req.query.eventId ? eq(highlights.eventId, req.query.eventId) : undefined);
      return paged(req.query, highlights, where, async (limit, offset) => highlightsOut(await db.select().from(highlights).where(where).orderBy(desc(highlights.id)).limit(limit).offset(offset)));
    },
  });

  app.get('/highlights/:id', {
    schema: { tags, summary: 'Highlight view', security: auth, params: idParam, response: { 200: highlightDto } },
    handler: async (req) => {
      const [h] = await db.select().from(highlights).where(and(eq(highlights.id, req.params.id), isNull(highlights.deletedAt)));
      if (!h) throw Errors.notFound('Highlight');
      return (await highlightsOut([h]))[0]!;
    },
  });

  app.post('/highlights', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Create a highlight (admin)', security: auth, body: highlightBody, response: { 201: highlightDto } },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const { mediaIds, publish, title, eventId, ...b } = req.body;
      const name = await highlightTitle(title, eventId);
      const h = await db.transaction(async (tx) => {
        await assertOwnedReadyMedia(me.id, mediaIds, tx, ['image', 'video']);
        const [row] = await tx.insert(highlights).values({ ...b, title: name, eventId: eventId ?? null, createdById: me.id, publishedAt: publish ? new Date().toISOString() : null }).returning();
        await tx.insert(highlightMedia).values(mediaIds.map((mediaId, position) => ({ highlightId: row!.id, mediaId, position })));
        return row!;
      });
      await audit({ actorId: me.id, action: 'highlight.created', entityType: 'highlight', entityId: h.id, message: h.title }, req);
      return reply.status(201).send((await highlightsOut([h]))[0]!);
    },
  });

  app.patch('/highlights/:id', {
    preHandler: [app.requireRole('admin')],
    schema: {
      tags,
      summary: 'Edit or publish a highlight (admin)',
      description: 'Sending `mediaIds` replaces the album\'s images, in that order.',
      security: auth,
      params: idParam,
      body: patchOf(highlightBody),
      response: { 200: highlightDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const { publish, mediaIds, ...b } = req.body;
      if (b.eventId) b.title = await highlightTitle(b.title, b.eventId);
      const h = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(highlights)
          // updatedAt keeps the SET non-empty when only the images change.
          .set({ ...b, ...(publish === undefined ? {} : { publishedAt: publish ? new Date().toISOString() : null }), updatedAt: new Date().toISOString() })
          .where(and(eq(highlights.id, req.params.id), isNull(highlights.deletedAt)))
          .returning();
        if (!row) throw Errors.notFound('Highlight');
        if (mediaIds) {
          await assertOwnedReadyMedia(me.id, mediaIds, tx, ['image', 'video']);
          await tx.delete(highlightMedia).where(eq(highlightMedia.highlightId, row.id));
          await tx.insert(highlightMedia).values(mediaIds.map((mediaId, position) => ({ highlightId: row.id, mediaId, position })));
        }
        return row;
      });
      await audit({ actorId: me.id, action: 'highlight.updated', entityType: 'highlight', entityId: h.id, message: h.title }, req);
      return (await highlightsOut([h]))[0]!;
    },
  });

  app.delete('/highlights/:id', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Delete a highlight (admin)', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      const [h] = await db.update(highlights).set({ deletedAt: new Date().toISOString() }).where(and(eq(highlights.id, req.params.id), isNull(highlights.deletedAt))).returning({ title: highlights.title });
      if (h) await audit({ actorId: currentUser(req).id, action: 'highlight.deleted', entityType: 'highlight', entityId: req.params.id, message: h.title }, req);
      return reply.status(204).send(null);
    },
  });

  // ── Broadcast notifications ──────────────────────────────────────────────

  const audienceDto = z.object({
    platform: z.enum(['all', 'users', 'forums', 'projects']).default('all').describe('Platform dropdown: All (Users, Forums, Projects), Users, Forums or Projects'),
    ids: z
      .array(z.uuid())
      .max(500)
      .optional()
      .describe('Forum / Projects dropdown or the "IDs (optional)" field: user ids (platform users), or forum/project ids whose members receive it. Omit for everyone on that platform'),
    memberRoles: z.array(memberRoleEnum).optional(),
    countries: z.array(z.string().length(2)).optional(),
  });
  const broadcastDto = z
    .object({
      id: z.uuid(),
      kind: z.enum(['announcement', 'maintenance']),
      title: z.string(),
      body: z.string(),
      audience: z.object({ platform: z.string().optional(), ids: z.array(z.string()).optional(), memberRoles: z.array(z.string()).optional(), countries: z.array(z.string()).optional() }),
      channels: z.object({ email: z.boolean(), inApp: z.boolean() }),
      status: z.enum(['sending', 'sent', 'failed']).describe('sending = emails still going out (resume with POST /admin/broadcasts/{id}/resume)'),
      recipientCount: z.number(),
      deliveredCount: z.number(),
      failedCount: z.number(),
      sentBy: userSummary.nullable(),
      sentAt: z.string().nullable(),
      createdAt: z.string(),
    })
    .meta({ id: 'Broadcast' });
  const broadcastOut = async (rows: (typeof broadcasts.$inferSelect)[]) => {
    const people = await loadUserSummaries(rows.map((r) => r.sentById));
    return rows.map((r) => ({ ...r, kind: r.kind as 'announcement' | 'maintenance', sentBy: people.get(r.sentById) ?? null }));
  };

  app.get('/broadcasts', {
    schema: { tags, summary: 'Sent broadcasts (history)', security: auth, querystring: pageQuery.extend({ kind: z.enum(['announcement', 'maintenance']).optional() }), response: { 200: offsetPageSchema(broadcastDto) } },
    handler: async (req) => {
      const where = req.query.kind ? eq(broadcasts.kind, req.query.kind) : undefined;
      return paged(req.query, broadcasts, where, async (limit, offset) => broadcastOut(await db.select().from(broadcasts).where(where).orderBy(desc(broadcasts.id)).limit(limit).offset(offset)));
    },
  });

  app.post('/broadcasts', {
    preHandler: [app.requireRole('admin')],
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
    schema: {
      tags,
      summary: 'Send a notification email to all members or a segment (admin)',
      description: [
        'Notifications page → Send notification. Members are alerted **by email** (`channels.email`, default true); set `channels.inApp: true` to also add it to their in-app notifications.',
        'Large audiences are emailed in batches: the response comes back after about 20 seconds at most with `status: "sending"` if emails are still queued. Continue with POST /admin/broadcasts/{id}/resume (or let the daily cron finish it).',
        'Members who turned off broadcast emails (`notificationPrefs.broadcast.email = false`), unverified and blocked accounts are skipped.',
      ].join(' '),
      security: auth,
      body: z.object({
        title: z.string().trim().min(3).max(120),
        body: z.string().trim().min(1).max(5000),
        audience: audienceDto.default({ platform: 'all' }),
        channels: z.object({ email: z.boolean().default(true), inApp: z.boolean().default(false) }).default({ email: true, inApp: false }),
      }),
      response: { 201: broadcastDto },
    },
    handler: async (req, reply) => {
      const { title, body, audience, channels } = req.body;
      if (!channels.email && !channels.inApp) throw Errors.validation('Choose at least one channel', { channels: 'Email or in-app' });
      if (audience.platform === 'users' && !audience.ids?.length) audience.platform = 'all';
      const id = await createBroadcast(req, currentUser(req), { kind: 'announcement', title, body, audience, channels });
      const [b] = await db.select().from(broadcasts).where(eq(broadcasts.id, id));
      return reply.status(201).send((await broadcastOut([b!]))[0]!);
    },
  });

  app.get('/broadcasts/:id', {
    schema: { tags, summary: 'Broadcast details and delivery progress', security: auth, params: idParam, response: { 200: broadcastDto } },
    handler: async (req) => {
      const [b] = await db.select().from(broadcasts).where(eq(broadcasts.id, req.params.id));
      if (!b) throw Errors.notFound('Broadcast');
      return (await broadcastOut([b]))[0]!;
    },
  });

  app.post('/broadcasts/:id/resume', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Continue sending a broadcast that is still "sending" (admin)', security: auth, params: idParam, response: { 200: broadcastDto } },
    handler: async (req) => {
      const [exists] = await db.select({ id: broadcasts.id }).from(broadcasts).where(eq(broadcasts.id, req.params.id));
      if (!exists) throw Errors.notFound('Broadcast');
      await drainBroadcasts({ broadcastId: req.params.id });
      const [b] = await db.select().from(broadcasts).where(eq(broadcasts.id, req.params.id));
      return (await broadcastOut([b!]))[0]!;
    },
  });

  // ── Audit logs ───────────────────────────────────────────────────────────

  app.get('/audit-logs', {
    preHandler: [app.requireRole('admin')],
    schema: {
      tags,
      summary: 'Admin logs (admin)',
      description: 'Logs page and the Overview "Admin logs" card. `label` is the Action column, `details` the Log Message column. `q` searches action, message and actor name.',
      security: auth,
      querystring: pageQuery.merge(dateRange).extend({
        action: z.string().max(80).optional().describe('Prefix, e.g. "auth." or "user.suspend"'),
        actorId: z.uuid().optional(),
        entityId: z.uuid().optional(),
        q: z.string().trim().max(100).optional(),
      }),
      response: {
        200: offsetPageSchema(
          z.object({
            id: z.uuid(),
            action: z.string(),
            label: z.string(),
            details: z.string(),
            entityType: z.string(),
            entityId: z.string().nullable(),
            message: z.string().nullable(),
            actor: userSummary.nullable(),
            ip: z.string().nullable(),
            location: z.string().nullable(),
            before: z.unknown(),
            after: z.unknown(),
            createdAt: z.string(),
          }),
        ),
      },
    },
    handler: async (req) => {
      const q = req.query;
      const where = and(
        q.action ? ilike(auditLogs.action, `${escapeLike(q.action)}%`) : undefined,
        q.actorId ? eq(auditLogs.actorId, q.actorId) : undefined,
        q.entityId ? eq(auditLogs.entityId, q.entityId) : undefined,
        q.from ? gte(auditLogs.createdAt, `${q.from}T00:00:00Z`) : undefined,
        q.to ? lt(auditLogs.createdAt, dayEnd(q.to)) : undefined,
        q.q
          ? or(
              ilike(auditLogs.action, contains(q.q.replace(/\s+/g, '_'))),
              ilike(auditLogs.message, contains(q.q)),
              sql`exists (select 1 from ${users} u where u.id = ${auditLogs}.actor_id and u.full_name ilike ${contains(q.q)})`,
            )
          : undefined,
      );
      return paged(q, auditLogs, where, async (limit, offset) => {
        const rows = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.id)).limit(limit).offset(offset);
        const people = await loadUserSummaries(rows.map((r) => r.actorId));
        return rows.map((r) => ({ ...r, label: actionLabel(r.action), details: actionDetails(r), actor: r.actorId ? (people.get(r.actorId) ?? null) : null }));
      });
    },
  });
};
