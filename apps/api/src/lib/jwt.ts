import { SignJWT, errors as joseErrors, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { Errors } from './errors.js';

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const ISSUER = 'communiti-api';

export type PlatformRole = 'member' | 'moderator' | 'admin' | 'super_admin';

export interface AccessClaims {
  sub: string;
  sid: string; // session id
  prole: PlatformRole;
}

/**
 * Access tokens are HS256 JWTs. `role: authenticated` + `aud: authenticated` make them
 * valid Supabase JWTs when JWT_ACCESS_SECRET is the project's JWT secret, so clients can
 * pass the same token to Supabase Realtime for private channels.
 */
export async function signAccessToken(claims: AccessClaims) {
  return new SignJWT({ sid: claims.sid, prole: claims.prole, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, audience: 'authenticated', algorithms: ['HS256'] });
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw Errors.unauthenticated('Invalid token', 'TOKEN_INVALID');
    return { sub: payload.sub, sid: payload.sid, prole: (payload.prole as PlatformRole) ?? 'member' };
  } catch (err) {
    if (err instanceof joseErrors.JWTExpired) throw Errors.unauthenticated('Access token expired', 'TOKEN_EXPIRED');
    throw Errors.unauthenticated('Invalid access token', 'TOKEN_INVALID');
  }
}

/** Short-lived single-purpose tokens (password reset, OAuth state). */
export async function signPurposeToken(purpose: string, payload: Record<string, unknown>, ttlSeconds: number) {
  return new SignJWT({ ...payload, pur: purpose })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);
}

export async function verifyPurposeToken<T extends Record<string, unknown>>(purpose: string, token: string): Promise<T> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: ISSUER, algorithms: ['HS256'] });
    if (payload.pur !== purpose) throw new Error('wrong purpose');
    return payload as unknown as T;
  } catch {
    throw Errors.badRequest('This link or token is invalid or has expired', 'TOKEN_INVALID');
  }
}
