import { and, count, desc, eq, gt, isNull } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { otpCodes } from '../../db/schema/index.js';
import { randomOtp, safeEqual, sha256 } from '../../lib/crypto.js';
import { AppError, Errors } from '../../lib/errors.js';

export type OtpPurpose = 'verify_email' | 'password_reset';

export const OTP_TTL_SECONDS = 10 * 60;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_PER_HOUR = 5;

const hashCode = (email: string, code: string) => sha256(`${env.JWT_ACCESS_SECRET}:${email}:${code}`);

/** Seconds until another code may be sent (0 = now). */
export async function otpCooldown(email: string, purpose: OtpPurpose) {
  const [last] = await db
    .select({ createdAt: otpCodes.createdAt })
    .from(otpCodes)
    .where(and(eq(otpCodes.email, email), eq(otpCodes.purpose, purpose)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);
  if (!last) return 0;
  const elapsed = (Date.now() - new Date(last.createdAt).getTime()) / 1000;
  return Math.max(0, Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - elapsed));
}

/**
 * Issues a new code, invalidating older unused ones.
 * Throws RATE_LIMITED during the resend cooldown or past the hourly cap.
 */
export async function issueOtp(email: string, purpose: OtpPurpose, userId: string | null) {
  const wait = await otpCooldown(email, purpose);
  if (wait > 0) throw Errors.tooMany(`Please wait ${wait} seconds before requesting another code`, wait);

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(otpCodes)
    .where(and(eq(otpCodes.email, email), eq(otpCodes.purpose, purpose), gt(otpCodes.createdAt, hourAgo)));
  if (n >= OTP_MAX_PER_HOUR) throw Errors.tooMany('Too many codes requested. Try again in an hour.', 3600);

  const code = randomOtp();
  await db.transaction(async (tx) => {
    await tx
      .update(otpCodes)
      .set({ consumedAt: new Date().toISOString() })
      .where(and(eq(otpCodes.email, email), eq(otpCodes.purpose, purpose), isNull(otpCodes.consumedAt)));
    await tx.insert(otpCodes).values({
      email,
      purpose,
      userId,
      codeHash: hashCode(email, code),
      expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString(),
    });
  });
  return { code, expiresIn: OTP_TTL_SECONDS, resendAvailableIn: OTP_RESEND_COOLDOWN_SECONDS };
}

/** Verifies and consumes a code. Wrong guesses count toward a 5-attempt limit per code. */
export async function consumeOtp(email: string, purpose: OtpPurpose, code: string) {
  const [row] = await db
    .select()
    .from(otpCodes)
    .where(and(eq(otpCodes.email, email), eq(otpCodes.purpose, purpose), isNull(otpCodes.consumedAt)))
    .orderBy(desc(otpCodes.createdAt))
    .limit(1);

  if (!row || new Date(row.expiresAt) < new Date()) {
    throw Errors.badRequest('This code has expired. Request a new one.', 'OTP_EXPIRED');
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    throw new AppError(400, 'OTP_TOO_MANY_ATTEMPTS', 'Too many wrong attempts. Request a new code.');
  }
  if (!safeEqual(row.codeHash, hashCode(email, code))) {
    const attempts = row.attempts + 1;
    await db.update(otpCodes).set({ attempts }).where(eq(otpCodes.id, row.id));
    const left = OTP_MAX_ATTEMPTS - attempts;
    throw Errors.badRequest(left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.` : 'Too many wrong attempts. Request a new code.', left > 0 ? 'OTP_INVALID' : 'OTP_TOO_MANY_ATTEMPTS');
  }
  await db.update(otpCodes).set({ consumedAt: new Date().toISOString() }).where(eq(otpCodes.id, row.id));
  return row;
}
