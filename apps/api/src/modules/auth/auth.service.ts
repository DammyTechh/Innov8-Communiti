import { and, eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { db } from '../../db/client.js';
import { sessions, userSettings, users } from '../../db/schema/index.js';
import { audit } from '../../lib/audit.js';
import { AppError, Errors } from '../../lib/errors.js';
import type { GoogleProfile } from '../../lib/google.js';
import { signPurposeToken, verifyPurposeToken } from '../../lib/jwt.js';
import { sendMail, sendMailSafe, templates } from '../../lib/mailer/index.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../../lib/password.js';
import { slugify } from '../../lib/slug.js';
import { hasRole } from '../../plugins/auth.js';
import { requestMeta } from '../../lib/request-context.js';
import { consumeOtp, issueOtp, otpCooldown, OTP_TTL_SECONDS } from './otp.service.js';
import { revokeAllSessions, startSession } from './session.service.js';

type UserRow = typeof users.$inferSelect;

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const RESET_TOKEN_TTL = 15 * 60;

export function toAuthUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    emailVerified: Boolean(u.emailVerifiedAt),
    fullName: u.fullName,
    username: u.username,
    avatarUrl: u.avatarUrl,
    headline: u.headline,
    memberRole: u.memberRole,
    platformRole: u.platformRole,
    status: u.status,
    onboardingComplete: Boolean(u.onboardingCompletedAt),
    hasPassword: Boolean(u.passwordHash),
    googleLinked: Boolean(u.googleId),
    createdAt: u.createdAt,
  };
}

const findByEmail = async (email: string) => (await db.select().from(users).where(eq(users.email, email)).limit(1))[0];

async function generateUsername(fullName: string) {
  const base = slugify(fullName, 20).replace(/-/g, '') || 'member';
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}${Math.floor(1000 + Math.random() * 9000)}`;
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, candidate)).limit(1);
    if (!taken) return candidate;
  }
  return `${base}${Date.now().toString(36)}`;
}

function assertCanSignIn(u: UserRow) {
  if (u.deletedAt) throw Errors.forbidden('This account has been deleted', 'ACCOUNT_DELETED');
  if (u.status === 'blocked') throw Errors.forbidden('This account has been blocked', 'ACCOUNT_BLOCKED');
  if (u.status === 'suspended' && (!u.statusUntil || new Date(u.statusUntil) > new Date())) {
    throw Errors.forbidden(`This account is suspended${u.statusUntil ? ` until ${new Date(u.statusUntil).toUTCString()}` : ''}`, 'ACCOUNT_SUSPENDED');
  }
}

/** Signing in during the 30-day deletion grace period cancels the deletion. */
async function cancelPendingDeletion(u: UserRow) {
  if (u.deletionScheduledFor) await db.update(users).set({ deletionScheduledFor: null }).where(eq(users.id, u.id));
}

async function sendVerification(u: Pick<UserRow, 'id' | 'email' | 'fullName'>) {
  const otp = await issueOtp(u.email, 'verify_email', u.id);
  await sendMail(u.email, templates.verifyEmail({ name: u.fullName.split(' ')[0]!, code: otp.code, minutes: OTP_TTL_SECONDS / 60 }));
  return otp;
}

/**
 * Emails a security alert when an existing account signs in from a device (user agent)
 * it has never used before. First sign-ins after sign-up are not alerted.
 */
async function alertIfNewDevice(req: FastifyRequest, u: UserRow) {
  const meta = requestMeta(req);
  if (!meta.userAgent) return;
  const [seen] = await db.select({ id: sessions.id }).from(sessions).where(and(eq(sessions.userId, u.id), eq(sessions.userAgent, meta.userAgent))).limit(1);
  const [any] = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, u.id)).limit(1);
  if (seen || !any) return;
  const device = `${meta.client === 'unknown' ? 'Browser' : meta.client} · ${meta.userAgent.slice(0, 80)}`;
  await sendMailSafe(u.email, templates.newSignIn({ name: u.fullName.split(' ')[0]!, device, ip: meta.ip, when: new Date().toUTCString() }));
}

// ── Email + password ─────────────────────────────────────────────────────────

export async function register(input: { fullName: string; email: string; password: string }) {
  const existing = await findByEmail(input.email);
  if (existing?.emailVerifiedAt) throw Errors.conflict('An account with this email already exists. Sign in instead.', 'EMAIL_TAKEN');

  const passwordHash = await hashPassword(input.password);
  let user: UserRow;
  if (existing) {
    // Unverified sign-up retried: take the latest details and resend the code.
    [user] = (await db
      .update(users)
      .set({ fullName: input.fullName, passwordHash, acceptedTermsAt: new Date().toISOString() })
      .where(eq(users.id, existing.id))
      .returning()) as [UserRow];
  } else {
    // Generated before the transaction: it queries through the pool, and inside a
    // transaction that would wait on a second connection (deadlock at pool size 1).
    const username = await generateUsername(input.fullName);
    user = await db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({
          email: input.email,
          fullName: input.fullName,
          passwordHash,
          passwordChangedAt: new Date().toISOString(),
          username,
          acceptedTermsAt: new Date().toISOString(),
        })
        .returning();
      await tx.insert(userSettings).values({ userId: u!.id });
      return u!;
    });
  }

  const wait = await otpCooldown(user.email, 'verify_email');
  const otp = wait > 0 ? { expiresIn: OTP_TTL_SECONDS, resendAvailableIn: wait } : await sendVerification(user);
  return { email: user.email, verificationRequired: true as const, codeExpiresIn: otp.expiresIn, resendAvailableIn: otp.resendAvailableIn };
}

export async function verifyEmail(req: FastifyRequest, email: string, code: string) {
  const user = await findByEmail(email);
  if (!user) throw Errors.badRequest('This code has expired. Request a new one.', 'OTP_EXPIRED');
  if (user.emailVerifiedAt) throw Errors.conflict('This email is already verified. Sign in instead.');
  await consumeOtp(email, 'verify_email', code);
  assertCanSignIn(user);

  const [verified] = await db.update(users).set({ emailVerifiedAt: new Date().toISOString() }).where(eq(users.id, user.id)).returning();
  const tokens = await startSession(req, verified!);
  await audit({ actorId: user.id, action: 'auth.email_verified', entityType: 'user', entityId: user.id }, req);
  return { tokens, user: verified! };
}

export async function resendVerification(email: string) {
  const user = await findByEmail(email);
  // Same response whether or not the account exists (no email enumeration).
  if (!user || user.emailVerifiedAt) return;
  await sendVerification(user);
}

export async function login(req: FastifyRequest, email: string, password: string, opts: { requireStaff?: boolean } = {}) {
  const user = await findByEmail(email);
  if (!user) {
    await burnPasswordCheck(password);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  }
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    const mins = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 60_000);
    throw new AppError(403, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'} or reset your password.`);
  }
  if (!user.passwordHash) {
    throw new AppError(400, 'PASSWORD_NOT_SET', 'This account uses Google sign-in. Continue with Google, or reset your password to create one.');
  }

  if (!(await verifyPassword(user.passwordHash, password))) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await db
      .update(users)
      .set({ failedLoginCount: lock ? 0 : failed, lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null })
      .where(eq(users.id, user.id));
    await audit({ actorId: user.id, action: 'auth.login_failed', entityType: 'user', entityId: user.id, message: lock ? 'Account locked' : undefined }, req);
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  }

  if (opts.requireStaff && !hasRole(user, 'moderator')) {
    throw Errors.forbidden('This account does not have admin access');
  }
  if (!user.emailVerifiedAt) {
    if ((await otpCooldown(email, 'verify_email')) === 0) await sendVerification(user);
    throw Errors.forbidden('Verify your email to continue. We sent you a new code.', 'EMAIL_NOT_VERIFIED');
  }
  assertCanSignIn(user);
  await cancelPendingDeletion(user);
  await alertIfNewDevice(req, user);

  const tokens = await startSession(req, user);
  await audit({ actorId: user.id, action: opts.requireStaff ? 'auth.admin_login' : 'auth.login', entityType: 'user', entityId: user.id }, req);
  return { tokens, user };
}

// ── Google (the only OAuth provider) ─────────────────────────────────────────

/**
 * Finds or creates the user for a verified Google profile.
 * Linking to an existing email account only happens when Google has verified the email.
 */
export async function signInWithGoogle(req: FastifyRequest, profile: GoogleProfile, opts: { requireStaff?: boolean } = {}) {
  if (!profile.emailVerified) throw Errors.forbidden('Your Google email address is not verified');

  let isNewUser = false;
  let [user] = await db.select().from(users).where(eq(users.googleId, profile.googleId)).limit(1);

  if (!user) {
    const byEmail = await findByEmail(profile.email);
    if (byEmail) {
      [user] = await db
        .update(users)
        .set({
          googleId: profile.googleId,
          emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date().toISOString(),
          avatarUrl: byEmail.avatarUrl ?? profile.avatarUrl,
          // An unverified sign-up's password was never proven to belong to this person: drop it.
          passwordHash: byEmail.emailVerifiedAt ? byEmail.passwordHash : null,
        })
        .where(eq(users.id, byEmail.id))
        .returning();
      await audit({ actorId: byEmail.id, action: 'auth.google_linked', entityType: 'user', entityId: byEmail.id }, req);
    } else {
      if (opts.requireStaff) throw Errors.forbidden('This account does not have admin access');
      isNewUser = true;
      const username = await generateUsername(profile.fullName);
      user = await db.transaction(async (tx) => {
        const [u] = await tx
          .insert(users)
          .values({
            email: profile.email,
            googleId: profile.googleId,
            fullName: profile.fullName,
            avatarUrl: profile.avatarUrl,
            emailVerifiedAt: new Date().toISOString(),
            username,
            acceptedTermsAt: new Date().toISOString(),
          })
          .returning();
        await tx.insert(userSettings).values({ userId: u!.id });
        return u!;
      });
    }
  }

  if (opts.requireStaff && !hasRole(user!, 'moderator')) throw Errors.forbidden('This account does not have admin access');
  assertCanSignIn(user!);
  await cancelPendingDeletion(user!);
  if (!isNewUser) await alertIfNewDevice(req, user!);

  const tokens = await startSession(req, user!);
  await audit({ actorId: user!.id, action: isNewUser ? 'auth.google_signup' : 'auth.google_login', entityType: 'user', entityId: user!.id }, req);
  return { tokens, user: user!, isNewUser };
}

// ── Forgot / reset / change password ─────────────────────────────────────────

export async function forgotPassword(email: string) {
  const user = await findByEmail(email);
  if (!user || user.deletedAt || user.status === 'blocked') return; // silent: no enumeration
  const otp = await issueOtp(email, 'password_reset', user.id).catch((err) => {
    // Respect the cooldown silently so the endpoint's response never differs.
    if (err instanceof AppError && err.code === 'RATE_LIMITED') return null;
    throw err;
  });
  if (!otp) return;
  await sendMail(email, templates.passwordReset({ name: user.fullName.split(' ')[0]!, code: otp.code, minutes: OTP_TTL_SECONDS / 60, email }));
}

/** Exchanges a valid code for a short-lived, single-purpose reset token. */
export async function verifyResetCode(email: string, code: string) {
  const user = await findByEmail(email);
  if (!user) throw Errors.badRequest('This code has expired. Request a new one.', 'OTP_EXPIRED');
  await consumeOtp(email, 'password_reset', code);
  // `pca` binds the token to the current password: once it changes, the token is dead (single use).
  const resetToken = await signPurposeToken('password_reset', { sub: user.id, pca: user.passwordChangedAt ?? 'none' }, RESET_TOKEN_TTL);
  return { resetToken, expiresIn: RESET_TOKEN_TTL };
}

export async function resetPassword(req: FastifyRequest, resetToken: string, newPassword: string) {
  const claims = await verifyPurposeToken<{ sub: string; pca: string }>('password_reset', resetToken);
  const [user] = await db.select().from(users).where(eq(users.id, claims.sub)).limit(1);
  if (!user || (user.passwordChangedAt ?? 'none') !== claims.pca) {
    throw Errors.badRequest('This reset link has already been used or has expired', 'TOKEN_INVALID');
  }
  const now = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: await hashPassword(newPassword),
        passwordChangedAt: now,
        failedLoginCount: 0,
        lockedUntil: null,
        // Receiving the code proves ownership of the inbox.
        emailVerifiedAt: user.emailVerifiedAt ?? now,
      })
      .where(eq(users.id, user.id));
    await revokeAllSessions(user.id, 'password_reset', undefined, tx);
  });
  await audit({ actorId: user.id, action: 'auth.password_reset', entityType: 'user', entityId: user.id }, req);
  await sendMailSafe(user.email, templates.passwordChanged({ name: user.fullName.split(' ')[0]!, when: new Date().toUTCString() }));
}

export async function changePassword(req: FastifyRequest, userId: string, sessionId: string, current: string | undefined, next: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw Errors.notFound('User');
  if (user.passwordHash) {
    if (!current) throw Errors.validation('Enter your current password', { currentPassword: 'Required' });
    if (!(await verifyPassword(user.passwordHash, current))) {
      throw Errors.validation('Your current password is incorrect', { currentPassword: 'Incorrect password' });
    }
    if (await verifyPassword(user.passwordHash, next)) {
      throw Errors.validation('Choose a password you have not used here before', { newPassword: 'Same as current password' });
    }
  }
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: await hashPassword(next), passwordChangedAt: new Date().toISOString() }).where(eq(users.id, userId));
    await revokeAllSessions(userId, 'password_changed', sessionId, tx);
  });
  await audit({ actorId: userId, action: user.passwordHash ? 'auth.password_changed' : 'auth.password_set', entityType: 'user', entityId: userId }, req);
  await sendMailSafe(user.email, templates.passwordChanged({ name: user.fullName.split(' ')[0]!, when: new Date().toUTCString() }));
}

export async function getUserById(id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!u) throw Errors.notFound('User');
  return u;
}
