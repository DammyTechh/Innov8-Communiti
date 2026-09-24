import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** URL-safe opaque token (refresh tokens, state values). */
export const randomToken = (bytes = 48) => randomBytes(bytes).toString('base64url');

/** Uniformly distributed 6-digit numeric code. */
export const randomOtp = (digits = 6) => randomInt(0, 10 ** digits).toString().padStart(digits, '0');

export const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
};
