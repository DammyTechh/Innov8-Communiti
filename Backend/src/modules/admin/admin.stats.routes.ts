import { and, count, countDistinct, eq, gt, gte, isNotNull, isNull, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { auditLogs, events, forums, ledgerEntries, moderationActions, posts, projects, sessions, users } from '../../db/schema/index.js';
import { kpi, kpiDto, rangeEnum, rangeWindow } from '../../lib/stats.js';
import { auth } from '../_shared/dto.js';

/**
 * KPI cards for the Users, Forums, Projects and Events pages.
 * Cards titled "Last N days" count what happened inside the range and compare it with the
 * previous range of the same length. Totals compare now with the start of the range.
 */

const tags = ['Admin'];
const n = async (table: PgTable, where?: SQL) => (await db.select({ n: count() }).from(table).where(where))[0]?.n ?? 0;
const inRange = (col: Parameters<typeof gte>[0], from: string, to: string) => and(gte(col, from), lt(col, to));

/** Distinct forums/projects/users that entered a moderation state inside [from, to). */
const actioned = async (targetType: 'user' | 'forum' | 'project', action: 'warn' | 'restrict' | 'block', from: string, to: string) =>
  (
    await db
      .select({ n: countDistinct(moderationActions.targetId) })
      .from(moderationActions)
      .where(and(eq(moderationActions.targetType, targetType), eq(moderationActions.action, action), inRange(moderationActions.createdAt, from, to)))
  )[0]?.n ?? 0;

const query = z.object({ range: rangeEnum });

export const adminStatsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/stats/users', {
    schema: {
      tags,
      summary: 'Users page KPI cards: Total, Active, New, Blocked',
      description: 'active = members who signed in or used the app in the range; blocked = accounts blocked in the range. `totals` are current counts.',
      security: auth,
      querystring: query,
      response: {
        200: z.object({
          range: rangeEnum,
          total: kpiDto,
          active: kpiDto,
          new: kpiDto,
          blocked: kpiDto,
          totals: z.object({ active: z.number(), flagged: z.number(), restricted: z.number(), suspended: z.number(), blocked: z.number() }),
        }),
      },
    },
    handler: async (req) => {
      const w = rangeWindow(req.query.range);
      const live = isNull(users.deletedAt);
      const active = async (from: string, to: string) => {
        const [r] = await db.execute<{ n: number }>(sql`
          select count(*)::int as n from (
            select user_id as id from ${sessions} where last_used_at >= ${from} and last_used_at < ${to}
            union
            select actor_id from ${auditLogs} where actor_id is not null and action in ('auth.login', 'auth.google_login', 'auth.admin_login', 'auth.email_verified') and created_at >= ${from} and created_at < ${to}
          ) a`);
        return r?.n ?? 0;
      };
      const [total, totalBefore, act, actPrev, created, createdPrev, blocked, blockedPrev, statuses] = await Promise.all([
        n(users, live),
        n(users, and(live, lt(users.createdAt, w.from))),
        active(w.from, w.to),
        active(w.prevFrom, w.from),
        n(users, and(live, inRange(users.createdAt, w.from, w.to))),
        n(users, and(live, inRange(users.createdAt, w.prevFrom, w.from))),
        actioned('user', 'block', w.from, w.to),
        actioned('user', 'block', w.prevFrom, w.from),
        db.select({ status: users.status, n: count() }).from(users).where(live).groupBy(users.status),
      ]);
      const st = (s: string) => statuses.find((x) => x.status === s)?.n ?? 0;
      return {
        range: req.query.range,
        total: kpi(total, totalBefore),
        active: kpi(act, actPrev),
        new: kpi(created, createdPrev),
        blocked: kpi(blocked, blockedPrev),
        totals: { active: st('active'), flagged: st('flagged'), restricted: st('restricted'), suspended: st('suspended'), blocked: st('blocked') },
      };
    },
  });

  app.get('/stats/forums', {
    schema: {
      tags,
      summary: 'Forums page KPI cards: Total, Active, Restricted, Flagged',
      description: 'active = forums with posts in the range; restricted / flagged = forums restricted / warned in the range. `totals` are current counts by moderation status.',
      security: auth,
      querystring: query,
      response: {
        200: z.object({
          range: rangeEnum,
          total: kpiDto,
          active: kpiDto,
          restricted: kpiDto,
          flagged: kpiDto,
          totals: z.object({ active: z.number(), flagged: z.number(), restricted: z.number(), suspended: z.number(), removed: z.number() }),
        }),
      },
    },
    handler: async (req) => {
      const w = rangeWindow(req.query.range);
      const live = isNull(forums.deletedAt);
      const posting = async (from: string, to: string) =>
        (await db.select({ n: countDistinct(posts.forumId) }).from(posts).innerJoin(forums, eq(forums.id, posts.forumId)).where(and(live, isNull(posts.deletedAt), inRange(posts.createdAt, from, to))))[0]?.n ?? 0;
      const [total, before, act, actPrev, restricted, restrictedPrev, flagged, flaggedPrev, statuses, removed] = await Promise.all([
        n(forums, live),
        n(forums, and(live, lt(forums.createdAt, w.from))),
        posting(w.from, w.to),
        posting(w.prevFrom, w.from),
        actioned('forum', 'restrict', w.from, w.to),
        actioned('forum', 'restrict', w.prevFrom, w.from),
        actioned('forum', 'warn', w.from, w.to),
        actioned('forum', 'warn', w.prevFrom, w.from),
        db.select({ status: forums.moderationStatus, n: count() }).from(forums).where(and(live, or(isNull(forums.removedAt), eq(forums.moderationStatus, 'suspended')))).groupBy(forums.moderationStatus),
        n(forums, and(live, isNotNull(forums.removedAt), ne(forums.moderationStatus, 'suspended'))),
      ]);
      const st = (s: string) => statuses.find((x) => x.status === s)?.n ?? 0;
      return {
        range: req.query.range,
        total: kpi(total, before),
        active: kpi(act, actPrev),
        restricted: kpi(restricted, restrictedPrev),
        flagged: kpi(flagged, flaggedPrev),
        totals: { active: st('active'), flagged: st('flagged'), restricted: st('restricted'), suspended: st('suspended'), removed },
      };
    },
  });

  const slice = z.object({ count: z.number(), pct: z.number().describe('Share of all projects, one decimal') });

  app.get('/stats/projects', {
    schema: {
      tags,
      summary: 'Projects page KPI cards (Total, Active, Completed, New) and Project distribution donut',
      description:
        'active = projects with workspace activity in the range; completed = projects marked completed in the range; new = created in the range. Distribution slices do not overlap: completed, then featured, then inactive (archived, suspended, or no activity in 30 days), then in development.',
      security: auth,
      querystring: query,
      response: {
        200: z.object({
          range: rangeEnum,
          total: kpiDto,
          active: kpiDto,
          completed: kpiDto,
          new: kpiDto,
          distribution: z.object({ featured: slice, inDevelopment: slice, inactive: slice, completed: slice }),
        }),
      },
    },
    handler: async (req) => {
      const w = rangeWindow(req.query.range);
      const live = isNull(projects.deletedAt);
      const working = async (from: string, to: string) =>
        (await db.select({ n: countDistinct(ledgerEntries.projectId) }).from(ledgerEntries).innerJoin(projects, eq(projects.id, ledgerEntries.projectId)).where(and(live, inRange(ledgerEntries.createdAt, from, to))))[0]?.n ?? 0;
      const completedIn = (from: string, to: string) => n(projects, and(live, eq(projects.status, 'completed'), inRange(projects.updatedAt, from, to)));
      const recent = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const [total, before, act, actPrev, done, donePrev, created, createdPrev, dist] = await Promise.all([
        n(projects, live),
        n(projects, and(live, lt(projects.createdAt, w.from))),
        working(w.from, w.to),
        working(w.prevFrom, w.from),
        completedIn(w.from, w.to),
        completedIn(w.prevFrom, w.from),
        n(projects, and(live, inRange(projects.createdAt, w.from, w.to))),
        n(projects, and(live, inRange(projects.createdAt, w.prevFrom, w.from))),
        db.execute<{ slice: string; n: number }>(sql`
          select case
            when p.status = 'completed' then 'completed'
            when p.featured_at is not null then 'featured'
            when p.status = 'archived' or p.moderation_status = 'suspended'
              or not exists (select 1 from ${ledgerEntries} l where l.project_id = p.id and l.created_at >= ${recent}) and p.created_at < ${recent}
              then 'inactive'
            else 'inDevelopment' end as slice, count(*)::int as n
          from ${projects} p where p.deleted_at is null group by 1`),
      ]);
      const rows = [...dist];
      const all = rows.reduce((a, r) => a + r.n, 0);
      const sl = (k: string) => {
        const c = rows.find((r) => r.slice === k)?.n ?? 0;
        return { count: c, pct: all ? Math.round((c / all) * 1000) / 10 : 0 };
      };
      return {
        range: req.query.range,
        total: kpi(total, before),
        active: kpi(act, actPrev),
        completed: kpi(done, donePrev),
        new: kpi(created, createdPrev),
        distribution: { featured: sl('featured'), inDevelopment: sl('inDevelopment'), inactive: sl('inactive'), completed: sl('completed') },
      };
    },
  });

  app.get('/stats/events', {
    schema: {
      tags,
      summary: 'Events page KPI cards: Total, Active, Concluded, Upcoming',
      description: 'Published events. Each card compares the count now with the count at the start of the range.',
      security: auth,
      querystring: query,
      response: { 200: z.object({ range: rangeEnum, total: kpiDto, active: kpiDto, concluded: kpiDto, upcoming: kpiDto }) },
    },
    handler: async (req) => {
      const w = rangeWindow(req.query.range);
      const pub = and(eq(events.status, 'published'), isNull(events.deletedAt));
      const asOf = (t: string) =>
        Promise.all([
          n(events, and(pub, lte(events.createdAt, t))),
          n(events, and(pub, lte(events.startsAt, t), gt(events.endsAt, t))),
          n(events, and(pub, lte(events.endsAt, t))),
          n(events, and(pub, gt(events.startsAt, t), lte(events.createdAt, t))),
        ]);
      const [[total, active, concluded, upcoming], [total0, active0, concluded0, upcoming0]] = await Promise.all([asOf(w.to), asOf(w.from)]);
      return { range: req.query.range, total: kpi(total, total0), active: kpi(active, active0), concluded: kpi(concluded, concluded0), upcoming: kpi(upcoming, upcoming0) };
    },
  });
};
