import { and, eq, gt, isNull, ne, or } from 'drizzle-orm';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../config/env.js';
import { db, type DbOrTx } from '../../db/client.js';
import { sessions, users } from '../../db/schema/index.js';
import { randomToken, sha256 } from '../../lib/crypto.js';
import { Errors } from '../../lib/errors.js';
import { type PlatformRole, signAccessToken } from '../../lib/jwt.js';
import { refreshCookieSameSite } from '../../lib/origins.js';
import { isMobile, requestMeta } from '../../lib/request-context.js';

export const REFRESH_COOKIE = 'communiti_rt';
const REFRESH_COOKIE_PATH = '/api/v1/auth';
/** A refresh token presented again within this window (parallel tabs/requests) is tolerated. */
const REUSE_GRACE_MS = 30_000;

const refreshTtlMs = () => env.REFRESH_TOKEN_TTL_DAYS * 86_400_000;

async function accessFor(userId: string, sessionId: string, platformRole: PlatformRole) {
  return {
    accessToken: await signAccessToken({ sub: userId, sid: sessionId, prole: platformRole }),
    accessTokenExpiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  };
}

/** Creates a session for a successful sign-in and returns fresh tokens. */
export async function startSession(req: FastifyRequest, user: { id: string; platformRole: PlatformRole }, tx: DbOrTx = db) {
  const refreshToken = randomToken();
  const meta = requestMeta(req);
  const [session] = await tx
    .insert(sessions)
    .values({
      userId: user.id,
      refreshTokenHash: sha256(refreshToken),
      client: meta.client,
      userAgent: meta.userAgent,
      ip: meta.ip,
      expiresAt: new Date(Date.now() + refreshTtlMs()).toISOString(),
      lastUsedAt: new Date().toISOString(),
    })
    .returning({ id: sessions.id });
  await tx.update(users).set({ lastLoginAt: new Date().toISOString(), failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, user.id));
  return { sessionId: session!.id, refreshToken, ...(await accessFor(user.id, session!.id, user.platformRole)) };
}

/**
 * Refresh-token rotation with reuse detection:
 * - current token → rotate (new refresh token + new access token)
 * - previous token within 30 s → new access token only (parallel requests)
 * - previous token after that → token was stolen; revoke the session
 */
export async function rotateSession(presented: string) {
  const hash = sha256(presented);
  const now = new Date();
  const [session] = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      refreshTokenHash: sessions.refreshTokenHash,
      rotatedAt: sessions.rotatedAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      platformRole: users.platformRole,
      status: users.status,
      deletedAt: users.deletedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(or(eq(sessions.refreshTokenHash, hash), eq(sessions.previousRefreshTokenHash, hash)))
    .limit(1);

  if (!session || session.revokedAt || new Date(session.expiresAt) < now) {
    throw Errors.unauthenticated('Your session has ended. Please sign in again.', 'TOKEN_INVALID');
  }
  if (session.deletedAt) throw Errors.forbidden('This account has been deleted', 'ACCOUNT_DELETED');
  if (session.status === 'blocked') throw Errors.forbidden('This account has been blocked', 'ACCOUNT_BLOCKED');

  if (session.refreshTokenHash !== hash) {
    const rotatedAgo = session.rotatedAt ? now.getTime() - new Date(session.rotatedAt).getTime() : Infinity;
    if (rotatedAgo > REUSE_GRACE_MS) {
      await revokeSession(session.id, 'refresh_token_reuse');
      throw Errors.unauthenticated('Your session has ended. Please sign in again.', 'TOKEN_INVALID');
    }
    return { refreshToken: null, sessionId: session.id, userId: session.userId, ...(await accessFor(session.userId, session.id, session.platformRole)) };
  }

  const refreshToken = randomToken();
  const [won] = await db
    .update(sessions)
    .set({
      previousRefreshTokenHash: hash,
      refreshTokenHash: sha256(refreshToken),
      rotatedAt: now.toISOString(),
      lastUsedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + refreshTtlMs()).toISOString(), // sliding expiry
    })
    // Conditional swap: if a parallel request rotated first, we lose and fall back to the grace path.
    .where(and(eq(sessions.id, session.id), eq(sessions.refreshTokenHash, hash)))
    .returning({ id: sessions.id });
  if (!won) {
    return { refreshToken: null, sessionId: session.id, userId: session.userId, ...(await accessFor(session.userId, session.id, session.platformRole)) };
  }
  return { refreshToken, sessionId: session.id, userId: session.userId, ...(await accessFor(session.userId, session.id, session.platformRole)) };
}

export async function revokeSession(sessionId: string, reason: string) {
  await db
    .update(sessions)
    .set({ revokedAt: new Date().toISOString(), revokedReason: reason })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
}

export async function revokeAllSessions(userId: string, reason: string, exceptSessionId?: string, tx: DbOrTx = db) {
  await tx
    .update(sessions)
    .set({ revokedAt: new Date().toISOString(), revokedReason: reason })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), exceptSessionId ? ne(sessions.id, exceptSessionId) : undefined));
}

export async function listSessions(userId: string) {
  return db
    .select({
      id: sessions.id,
      client: sessions.client,
      userAgent: sessions.userAgent,
      ip: sessions.ip,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date().toISOString())))
    .orderBy(sessions.createdAt);
}

// ── Transport: web gets an httpOnly cookie, mobile gets the token in the body ──

const cookieOptions = (req: FastifyRequest) => {
  const sameSite = refreshCookieSameSite(req.headers.origin);
  return {
    httpOnly: true,
    // SameSite=None is only accepted by browsers together with Secure.
    secure: env.isProd || sameSite === 'none',
    sameSite,
    domain: env.COOKIE_DOMAIN, // leave unset: host-only on the API domain is enough and safest
    path: REFRESH_COOKIE_PATH,
  };
};

/** Returns the refresh token for the response body (mobile) or sets the cookie (web) and returns null. */
export function deliverRefreshToken(req: FastifyRequest, reply: FastifyReply, token: string | null) {
  if (token === null) return null;
  if (isMobile(req)) return token;
  reply.setCookie(REFRESH_COOKIE, token, { ...cookieOptions(req), maxAge: Math.floor(refreshTtlMs() / 1000) });
  return null;
}

export function clearRefreshCookie(req: FastifyRequest, reply: FastifyReply) {
  reply.clearCookie(REFRESH_COOKIE, cookieOptions(req));
}

export function readRefreshToken(req: FastifyRequest, bodyToken?: string) {
  return bodyToken ?? req.cookies[REFRESH_COOKIE] ?? null;
}
