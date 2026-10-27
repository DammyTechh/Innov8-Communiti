import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { db } from '../../db/client.js';
import { maintenanceWindows, platformSettings } from '../../db/schema/index.js';
import { AppError } from '../../lib/errors.js';
import { verifyAccessToken } from '../../lib/jwt.js';

type Window = typeof maintenanceWindows.$inferSelect;
export interface AppConfig {
  imageOptimization: boolean;
  /** The active or next upcoming maintenance window, if any. */
  maintenance: (Pick<Window, 'id' | 'message' | 'startsAt' | 'endsAt' | 'disableAccess'> & { active: boolean }) | null;
}

export async function getPlatformSettings() {
  const [row] = await db.insert(platformSettings).values({ id: 1 }).onConflictDoNothing().returning();
  return row ?? (await db.select().from(platformSettings).where(eq(platformSettings.id, 1)))[0]!;
}

export async function nextMaintenance() {
  const [w] = await db
    .select()
    .from(maintenanceWindows)
    .where(and(isNull(maintenanceWindows.cancelledAt), gt(maintenanceWindows.endsAt, new Date().toISOString())))
    .orderBy(asc(maintenanceWindows.startsAt))
    .limit(1);
  return w ?? null;
}

// Read on every request by the maintenance guard, so cached briefly per serverless instance.
const TTL_MS = 15_000;
let cache: { at: number; value: AppConfig } | undefined;

export function invalidateAppConfig() {
  cache = undefined;
}

export async function appConfig(): Promise<AppConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return withActive(cache.value);
  const [settings, w] = await Promise.all([getPlatformSettings(), nextMaintenance()]);
  const value: AppConfig = {
    imageOptimization: settings.imageOptimization,
    maintenance: w ? { id: w.id, message: w.message, startsAt: w.startsAt, endsAt: w.endsAt, disableAccess: w.disableAccess, active: false } : null,
  };
  cache = { at: Date.now(), value };
  return withActive(value);
}

function withActive(c: AppConfig): AppConfig {
  if (!c.maintenance) return c;
  const now = Date.now();
  const active = new Date(c.maintenance.startsAt).getTime() <= now && now < new Date(c.maintenance.endsAt).getTime();
  return { ...c, maintenance: now >= new Date(c.maintenance.endsAt).getTime() ? null : { ...c.maintenance, active } };
}

/** Paths that keep working during maintenance: health, config, sign-in, the admin dashboard and cron. */
const OPEN = ['/api/v1/health', '/api/v1/app-config', '/api/v1/auth/', '/api/v1/admin/', '/api/v1/internal/', '/api/docs'];

/**
 * onRequest hook: while a maintenance window with `disableAccess` is running, members get
 * 503 MAINTENANCE (with Retry-After). Staff tokens (moderator and above) still get through.
 */
export async function maintenanceGuard(req: FastifyRequest) {
  const path = req.url.split('?')[0]!;
  if (OPEN.some((p) => path === p || path.startsWith(p))) return;
  const { maintenance: m } = await appConfig();
  if (!m?.active || !m.disableAccess) return;
  const h = req.headers.authorization;
  if (h?.startsWith('Bearer ')) {
    const claims = await verifyAccessToken(h.slice(7).trim()).catch(() => null);
    if (claims && claims.prole !== 'member') return;
  }
  const retry = Math.max(60, Math.ceil((new Date(m.endsAt).getTime() - Date.now()) / 1000));
  throw new AppError(503, 'MAINTENANCE', m.message || 'CommUniti is down for scheduled maintenance. Please try again later.', undefined, { 'retry-after': String(retry) });
}
