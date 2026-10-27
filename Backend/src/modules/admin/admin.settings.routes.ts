import { and, count, desc, eq, gt, isNotNull, isNull, lt, lte, ne, or } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { maintenanceWindows, platformSettings } from '../../db/schema/index.js';
import { audit } from '../../lib/audit.js';
import { Errors } from '../../lib/errors.js';
import { offsetPageSchema, pageQuery } from '../../lib/pagination.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, idParam, noContent, userSummary } from '../_shared/dto.js';
import { loadUserSummaries } from '../_shared/users.js';
import { getPlatformSettings, invalidateAppConfig } from '../settings/settings.service.js';
import { createBroadcast } from './admin.broadcast.js';

/** Admin Settings page: Image Optimization switch and scheduled maintenance. */

const tags = ['Admin'];

const settingsDto = z
  .object({
    imageOptimization: z.boolean().describe('Prefetch images ahead of time in the apps'),
    updatedBy: userSummary.nullable(),
    updatedAt: z.string(),
  })
  .meta({ id: 'PlatformSettings' });

const maintenanceDto = z
  .object({
    id: z.uuid(),
    message: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
    disableAccess: z.boolean(),
    state: z.enum(['scheduled', 'active', 'completed', 'cancelled']),
    broadcastId: z.uuid().nullable().describe('The email sent to members, if any (GET /admin/broadcasts/{id} for delivery progress)'),
    createdBy: userSummary.nullable(),
    cancelledAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'MaintenanceWindow' });

const maintenanceFields = z.object({
  message: z.string().trim().min(3, 'Enter a message for members').max(2000).describe('"Message users": emailed to every member'),
  startsAt: z.iso.datetime({ offset: true }).describe('Start date'),
  endsAt: z.iso.datetime({ offset: true }).describe('End date (estimate)'),
  disableAccess: z.boolean().default(false).describe('"Disable CommUniti during maintenance period?" Members get 503 MAINTENANCE while it runs; staff keep access'),
});

type Window = typeof maintenanceWindows.$inferSelect;
function stateOf(w: Window) {
  if (w.cancelledAt) return 'cancelled' as const;
  const now = Date.now();
  if (now < new Date(w.startsAt).getTime()) return 'scheduled' as const;
  if (now < new Date(w.endsAt).getTime()) return 'active' as const;
  return 'completed' as const;
}
async function windowsOut(rows: Window[]) {
  const people = await loadUserSummaries(rows.map((r) => r.createdById));
  return rows.map((w) => ({ ...w, state: stateOf(w), createdBy: people.get(w.createdById) ?? null }));
}

async function assertNoOverlap(startsAt: string, endsAt: string, exceptId?: string) {
  const [clash] = await db
    .select({ id: maintenanceWindows.id })
    .from(maintenanceWindows)
    .where(
      and(
        isNull(maintenanceWindows.cancelledAt),
        lt(maintenanceWindows.startsAt, endsAt),
        gt(maintenanceWindows.endsAt, startsAt),
        exceptId ? ne(maintenanceWindows.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  if (clash) throw Errors.conflict('Another maintenance window overlaps these dates. Cancel or edit it first.');
}

export const adminSettingsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/settings', {
    schema: { tags, summary: 'Platform settings', security: auth, response: { 200: settingsDto } },
    handler: async () => {
      const s = await getPlatformSettings();
      return { ...s, updatedBy: s.updatedById ? ((await loadUserSummaries([s.updatedById])).get(s.updatedById) ?? null) : null };
    },
  });

  app.patch('/settings', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Update platform settings (admin)', security: auth, body: z.object({ imageOptimization: z.boolean().optional() }), response: { 200: settingsDto } },
    handler: async (req) => {
      const me = currentUser(req);
      const before = await getPlatformSettings();
      const [s] = await db.update(platformSettings).set({ ...req.body, updatedById: me.id }).where(eq(platformSettings.id, 1)).returning();
      invalidateAppConfig();
      await audit({ actorId: me.id, action: 'settings.updated', entityType: 'settings', message: 'System configuration saved', before: { imageOptimization: before.imageOptimization }, after: req.body }, req);
      return { ...s!, updatedBy: (await loadUserSummaries([me.id])).get(me.id) ?? null };
    },
  });

  app.get('/maintenance', {
    schema: {
      tags,
      summary: 'Maintenance windows',
      security: auth,
      querystring: pageQuery.extend({ state: z.enum(['upcoming', 'past', 'all']).default('all').describe('upcoming = scheduled or active') }),
      response: { 200: offsetPageSchema(maintenanceDto) },
    },
    handler: async (req) => {
      const now = new Date().toISOString();
      const where =
        req.query.state === 'upcoming'
          ? and(isNull(maintenanceWindows.cancelledAt), gt(maintenanceWindows.endsAt, now))
          : req.query.state === 'past'
            ? or(lte(maintenanceWindows.endsAt, now), isNotNull(maintenanceWindows.cancelledAt))
            : undefined;
      const q = req.query;
      const [[total], rows] = await Promise.all([
        db.select({ n: count() }).from(maintenanceWindows).where(where),
        db.select().from(maintenanceWindows).where(where).orderBy(desc(maintenanceWindows.startsAt)).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
      ]);
      return { data: await windowsOut(rows), page: q.page, pageSize: q.pageSize, total: total?.n ?? 0 };
    },
  });

  app.post('/maintenance', {
    preHandler: [app.requireRole('admin')],
    schema: {
      tags,
      summary: 'Schedule maintenance (admin)',
      description:
        'Settings → Maintenance → Schedule maintenance. Emails `message` to every member ahead of time (`notifyUsers`, default true). GET /app-config exposes the window to the apps for a banner, and with `disableAccess` the API returns `503 MAINTENANCE` to members while it runs.',
      security: auth,
      body: maintenanceFields
        .extend({ notifyUsers: z.boolean().default(true) })
        .refine((b) => new Date(b.endsAt) > new Date(b.startsAt), { message: 'End date must be after the start date', path: ['endsAt'] })
        .refine((b) => new Date(b.endsAt) > new Date(), { message: 'End date must be in the future', path: ['endsAt'] }),
      response: { 201: maintenanceDto },
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const { notifyUsers, ...b } = req.body;
      await assertNoOverlap(b.startsAt, b.endsAt);
      const [w] = await db.insert(maintenanceWindows).values({ ...b, createdById: me.id }).returning();
      invalidateAppConfig();
      await audit({ actorId: me.id, action: 'maintenance.scheduled', entityType: 'maintenance', entityId: w!.id, message: b.message, after: b }, req);
      let row = w!;
      if (notifyUsers) {
        const broadcastId = await createBroadcast(req, me, {
          kind: 'maintenance',
          title: 'Scheduled maintenance',
          body: b.message,
          audience: { platform: 'all' },
          channels: { email: true, inApp: false },
          data: { from: b.startsAt, to: b.endsAt, disableAccess: b.disableAccess },
        });
        [row] = (await db.update(maintenanceWindows).set({ broadcastId }).where(eq(maintenanceWindows.id, row.id)).returning()) as [Window];
      }
      return reply.status(201).send((await windowsOut([row]))[0]!);
    },
  });

  app.patch('/maintenance/:id', {
    preHandler: [app.requireRole('admin')],
    schema: {
      tags,
      summary: 'Edit a maintenance window (admin)',
      description: 'Use it to extend the end date or turn access back on early. Members are not emailed again.',
      security: auth,
      params: idParam,
      body: maintenanceFields.partial().extend({ disableAccess: z.boolean().optional() }),
      response: { 200: maintenanceDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const [w] = await db.select().from(maintenanceWindows).where(eq(maintenanceWindows.id, req.params.id));
      if (!w) throw Errors.notFound('Maintenance window');
      if (w.cancelledAt) throw Errors.conflict('This maintenance window was cancelled');
      const startsAt = req.body.startsAt ?? w.startsAt;
      const endsAt = req.body.endsAt ?? w.endsAt;
      if (new Date(endsAt) <= new Date(startsAt)) throw Errors.validation('End date must be after the start date', { endsAt: 'Must be after startsAt' });
      await assertNoOverlap(startsAt, endsAt, w.id);
      const [row] = await db.update(maintenanceWindows).set(req.body).where(eq(maintenanceWindows.id, w.id)).returning();
      invalidateAppConfig();
      await audit({ actorId: me.id, action: 'maintenance.updated', entityType: 'maintenance', entityId: w.id, before: { startsAt: w.startsAt, endsAt: w.endsAt, disableAccess: w.disableAccess }, after: req.body }, req);
      return (await windowsOut([row!]))[0]!;
    },
  });

  app.delete('/maintenance/:id', {
    preHandler: [app.requireRole('admin')],
    schema: { tags, summary: 'Cancel a maintenance window (admin)', description: 'Ends it immediately if it is running.', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      const [w] = await db.update(maintenanceWindows).set({ cancelledAt: new Date().toISOString() }).where(and(eq(maintenanceWindows.id, req.params.id), isNull(maintenanceWindows.cancelledAt))).returning();
      if (!w) throw Errors.notFound('Maintenance window');
      invalidateAppConfig();
      await audit({ actorId: currentUser(req).id, action: 'maintenance.cancelled', entityType: 'maintenance', entityId: w.id, message: w.message }, req);
      return reply.status(204).send(null);
    },
  });
};
