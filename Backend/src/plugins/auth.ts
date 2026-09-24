import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { db } from '../db/client.js';
import { sessions, users } from '../db/schema/index.js';
import { Errors } from '../lib/errors.js';
import { type PlatformRole, verifyAccessToken } from '../lib/jwt.js';

export interface AuthUser {
  id: string;
  sessionId: string;
  platformRole: PlatformRole;
  status: 'active' | 'flagged' | 'restricted' | 'suspended' | 'blocked';
  onboarded: boolean;
  emailVerified: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
  interface FastifyInstance {
    /** onRequest hook: requires a valid access token and a live session. */
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** onRequest hook: attaches the user if a valid token is sent, otherwise continues anonymously. */
    authenticateOptional: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler: user finished onboarding and is allowed to create content. */
    requireMember: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler factory: platform role check (moderator < admin < super_admin). */
    requireRole: (min: PlatformRole) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const rank: Record<PlatformRole, number> = { member: 0, moderator: 1, admin: 2, super_admin: 3 };
export const hasRole = (user: Pick<AuthUser, 'platformRole'> | null, min: PlatformRole) => !!user && rank[user.platformRole] >= rank[min];

function bearer(req: FastifyRequest) {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

async function resolveUser(token: string): Promise<AuthUser> {
  const claims = await verifyAccessToken(token);
  // One indexed lookup per request: enforces logout, revocation and suspension immediately,
  // instead of waiting up to 15 minutes for the access token to expire.
  const [row] = await db
    .select({
      id: users.id,
      platformRole: users.platformRole,
      status: users.status,
      statusUntil: users.statusUntil,
      deletedAt: users.deletedAt,
      onboardingCompletedAt: users.onboardingCompletedAt,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, claims.sid), eq(sessions.userId, claims.sub), isNull(sessions.revokedAt)))
    .limit(1);

  if (!row) throw Errors.unauthenticated('Your session has ended. Please sign in again.', 'TOKEN_INVALID');
  if (row.deletedAt) throw Errors.forbidden('This account has been deleted', 'ACCOUNT_DELETED');

  let status = row.status;
  if ((status === 'suspended' || status === 'restricted') && row.statusUntil && new Date(row.statusUntil) < new Date()) {
    await db.update(users).set({ status: 'active', statusUntil: null, statusReason: null }).where(eq(users.id, row.id));
    status = 'active';
  }
  if (status === 'blocked') throw Errors.forbidden('This account has been blocked', 'ACCOUNT_BLOCKED');
  if (status === 'suspended') throw Errors.forbidden('This account is suspended', 'ACCOUNT_SUSPENDED');

  return {
    id: row.id,
    sessionId: claims.sid,
    platformRole: row.platformRole,
    status,
    onboarded: Boolean(row.onboardingCompletedAt),
    emailVerified: Boolean(row.emailVerifiedAt),
  };
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('user', null);

  app.decorate('authenticate', async (req: FastifyRequest) => {
    const token = bearer(req);
    if (!token) throw Errors.unauthenticated();
    req.user = await resolveUser(token);
  });

  app.decorate('authenticateOptional', async (req: FastifyRequest) => {
    const token = bearer(req);
    if (!token) return;
    try {
      req.user = await resolveUser(token);
    } catch {
      req.user = null;
    }
  });

  app.decorate('requireMember', async (req: FastifyRequest) => {
    if (!req.user) throw Errors.unauthenticated();
    if (!req.user.onboarded) throw Errors.forbidden('Finish setting up your account first', 'ONBOARDING_REQUIRED');
    if (req.user.status === 'restricted') throw Errors.forbidden('Your account is restricted from posting right now');
  });

  app.decorate('requireRole', (min: PlatformRole) => async (req: FastifyRequest) => {
    if (!req.user) throw Errors.unauthenticated();
    if (!hasRole(req.user, min)) throw Errors.forbidden();
  });
});

/** Narrowing helper for handlers behind `authenticate`. */
export function currentUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw Errors.unauthenticated();
  return req.user;
}
