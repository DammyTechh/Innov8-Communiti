import { and, count, eq, sql, type SQL } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { db } from '../../db/client.js';
import { type BroadcastAudience, broadcastDeliveries, broadcasts, forumMembers, notifications, projectMembers, users, userSettings } from '../../db/schema/index.js';
import { audit } from '../../lib/audit.js';
import { logger } from '../../lib/logger.js';
import { sendMail, templates } from '../../lib/mailer/index.js';
import type { AuthUser } from '../../plugins/auth.js';

/**
 * Admin broadcasts (Notifications page and maintenance notices).
 *
 * The design sends them by EMAIL. Recipients are written to `broadcast_deliveries` in one
 * statement, then emailed in small parallel batches until a time budget runs out, so a send
 * to thousands of members fits in serverless requests: whatever is left is picked up by
 * POST /admin/broadcasts/:id/resume or the daily cron. In-app delivery is optional.
 */

const MAX_ATTEMPTS = 3;
const BATCH = 25;
const PARALLEL = 5;
const DEFAULT_BUDGET_MS = 20_000; // Vercel maxDuration is 30 s

export interface BroadcastInput {
  kind: 'announcement' | 'maintenance';
  title: string;
  body: string;
  audience: BroadcastAudience;
  channels: { email: boolean; inApp: boolean };
  data?: Record<string, unknown>;
}

/** WHERE clause over `users u` (and `user_settings s` for email opt-outs). */
function audienceWhere(a: BroadcastAudience, forEmail: boolean, respectOptOut: boolean) {
  const ids = a.ids?.length ? sql.join(a.ids.map((id) => sql`${id}::uuid`), sql`, `) : null;
  const filters: (SQL | undefined)[] = [
    sql`u.deleted_at is null`,
    sql`u.status <> 'blocked'`,
    forEmail ? sql`u.email_verified_at is not null` : undefined,
    forEmail && respectOptOut ? sql`coalesce((s.notification_prefs -> 'broadcast' ->> 'email')::boolean, true)` : undefined,
    a.platform === 'users' && ids ? sql`u.id in (${ids})` : undefined,
    a.platform === 'forums'
      ? sql`exists (select 1 from ${forumMembers} fm where fm.user_id = u.id ${ids ? sql`and fm.forum_id in (${ids})` : sql``})`
      : undefined,
    a.platform === 'projects'
      ? sql`exists (select 1 from ${projectMembers} pm where pm.user_id = u.id ${ids ? sql`and pm.project_id in (${ids})` : sql``})`
      : undefined,
    a.memberRoles?.length ? sql`u.member_role::text in (${sql.join(a.memberRoles.map((r) => sql`${r}`), sql`, `)})` : undefined,
    a.countries?.length ? sql`u.country in (${sql.join(a.countries.map((c) => sql`${c}`), sql`, `)})` : undefined,
  ];
  return sql.join(filters.filter((f): f is SQL => Boolean(f)), sql` and `);
}

export async function createBroadcast(req: FastifyRequest, actor: AuthUser, input: BroadcastInput) {
  const [b] = await db
    .insert(broadcasts)
    .values({
      kind: input.kind,
      title: input.title,
      body: input.body,
      audience: input.audience,
      channels: input.channels,
      data: input.data ?? {},
      status: input.channels.email ? 'sending' : 'sent',
      sentById: actor.id,
    })
    .returning();
  const id = b!.id;

  let inAppCount = 0;
  if (input.channels.inApp) {
    const result = await db.execute(sql`
      insert into ${notifications} (id, user_id, type, title, body, data, target_type, target_id)
      select gen_random_uuid(), u.id, 'broadcast', ${input.title}, ${input.body}, ${JSON.stringify({ broadcastId: id })}::jsonb, 'broadcast', ${id}::uuid
      from ${users} u where ${audienceWhere(input.audience, false, false)}`);
    inAppCount = result.count ?? 0;
  }

  let emailCount = 0;
  if (input.channels.email) {
    // Maintenance notices are service messages: they ignore the "broadcast" email opt-out.
    const result = await db.execute(sql`
      insert into ${broadcastDeliveries} (broadcast_id, user_id, email, first_name)
      select ${id}::uuid, u.id, u.email, split_part(u.full_name, ' ', 1)
      from ${users} u left join ${userSettings} s on s.user_id = u.id
      where ${audienceWhere(input.audience, true, input.kind !== 'maintenance')}
      on conflict do nothing`);
    emailCount = result.count ?? 0;
  }

  await db
    .update(broadcasts)
    .set({
      recipientCount: input.channels.email ? emailCount : inAppCount,
      ...(input.channels.email ? {} : { deliveredCount: inAppCount, sentAt: new Date().toISOString() }),
    })
    .where(eq(broadcasts.id, id));
  await audit(
    { actorId: actor.id, action: 'broadcast.sent', entityType: 'broadcast', entityId: id, message: input.title, after: { recipients: input.channels.email ? emailCount : inAppCount, channels: input.channels, audience: input.audience } },
    req,
  );

  if (input.channels.email) await drainBroadcasts({ broadcastId: id });
  return id;
}

const fmt = (iso: unknown) =>
  typeof iso === 'string' ? `${new Date(iso).toLocaleString('en-GB', { timeZone: 'Africa/Lagos', dateStyle: 'full', timeStyle: 'short' })} (WAT)` : '';

/** Claims up to BATCH pending emails atomically; a claim older than 2 minutes is treated as abandoned. */
async function claim(broadcastId?: string) {
  const rows = await db.execute<{ broadcast_id: string; user_id: string; email: string; first_name: string; attempts: number }>(sql`
    update ${broadcastDeliveries} d set claimed_at = now(), attempts = d.attempts + 1
    where (d.broadcast_id, d.user_id) in (
      select broadcast_id, user_id from ${broadcastDeliveries}
      where status = 'pending' and attempts < ${MAX_ATTEMPTS}
        and (claimed_at is null or claimed_at < now() - interval '2 minutes')
        ${broadcastId ? sql`and broadcast_id = ${broadcastId}::uuid` : sql``}
      order by attempts limit ${BATCH}
      for update skip locked)
    returning d.broadcast_id, d.user_id, d.email, d.first_name, d.attempts`);
  return [...rows];
}

/** Sends pending broadcast emails until none are left or the time budget is spent. Returns emails sent. */
export async function drainBroadcasts(opts: { broadcastId?: string; budgetMs?: number } = {}) {
  const deadline = Date.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS);
  const touched = new Set<string>(opts.broadcastId ? [opts.broadcastId] : []);
  const cache = new Map<string, typeof broadcasts.$inferSelect>();
  let sent = 0;

  while (Date.now() < deadline) {
    const batch = await claim(opts.broadcastId);
    if (!batch.length) break;
    for (let i = 0; i < batch.length; i += PARALLEL) {
      await Promise.all(
        batch.slice(i, i + PARALLEL).map(async (d) => {
          touched.add(d.broadcast_id);
          let b = cache.get(d.broadcast_id);
          if (!b) {
            [b] = await db.select().from(broadcasts).where(eq(broadcasts.id, d.broadcast_id));
            if (b) cache.set(b.id, b);
          }
          if (!b) return;
          const template =
            b.kind === 'maintenance'
              ? templates.maintenance({ name: d.first_name, message: b.body, from: fmt(b.data.from), to: fmt(b.data.to), disableAccess: Boolean(b.data.disableAccess) })
              : templates.broadcast({ name: d.first_name, title: b.title, body: b.body });
          const key = and(eq(broadcastDeliveries.broadcastId, d.broadcast_id), eq(broadcastDeliveries.userId, d.user_id));
          try {
            await sendMail(d.email, template);
            await db.update(broadcastDeliveries).set({ status: 'sent', sentAt: new Date().toISOString(), claimedAt: null, error: null }).where(key);
            sent++;
          } catch (err) {
            const failed = d.attempts >= MAX_ATTEMPTS;
            await db
              .update(broadcastDeliveries)
              .set({ status: failed ? 'failed' : 'pending', claimedAt: null, error: err instanceof Error ? err.message.slice(0, 300) : 'send failed' })
              .where(key);
          }
        }),
      );
    }
  }

  for (const id of touched) await refreshBroadcastStatus(id);
  if (sent) logger.info({ sent, broadcasts: [...touched] }, '[broadcast] emails sent');
  return sent;
}

/** Recomputes delivered/failed counts and the overall status from the delivery rows. */
export async function refreshBroadcastStatus(id: string) {
  const rows = await db.select({ status: broadcastDeliveries.status, n: count() }).from(broadcastDeliveries).where(eq(broadcastDeliveries.broadcastId, id)).groupBy(broadcastDeliveries.status);
  const n = (s: string) => rows.find((r) => r.status === s)?.n ?? 0;
  const [pending, delivered, failed] = [n('pending'), n('sent'), n('failed')];
  const status = pending > 0 ? 'sending' : delivered === 0 && failed > 0 ? 'failed' : 'sent';
  await db
    .update(broadcasts)
    .set({ deliveredCount: delivered, failedCount: failed, status, ...(pending === 0 ? { sentAt: sql`coalesce(${broadcasts.sentAt}, now())` } : {}) })
    .where(and(eq(broadcasts.id, id), sql`(${broadcasts.channels} ->> 'email')::boolean`));
}
