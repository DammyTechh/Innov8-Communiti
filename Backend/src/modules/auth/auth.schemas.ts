import { z } from 'zod';

export const email = z
  .email('Enter a valid email address')
  .max(254)
  .transform((v) => v.trim().toLowerCase())
  .describe('Email address (case-insensitive)');

export const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number')
  .describe('8–128 characters with at least one letter and one number');

export const otpCode = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code').describe('6-digit code sent by email');

export const authUserDto = z
  .object({
    id: z.uuid(),
    email: z.string(),
    emailVerified: z.boolean(),
    fullName: z.string(),
    username: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    headline: z.string().nullable(),
    memberRole: z.enum(['innovator', 'researcher', 'expert', 'investor', 'student']).nullable(),
    platformRole: z.enum(['member', 'moderator', 'admin', 'super_admin']),
    status: z.enum(['active', 'flagged', 'restricted', 'suspended', 'blocked']),
    onboardingComplete: z.boolean(),
    hasPassword: z.boolean(),
    googleLinked: z.boolean(),
    createdAt: z.string(),
  })
  .meta({ id: 'AuthUser' });

export const tokenResponse = z
  .object({
    accessToken: z.string().describe('JWT, send as `Authorization: Bearer <token>`'),
    accessTokenExpiresIn: z.number().describe('Seconds until the access token expires'),
    refreshToken: z
      .string()
      .nullable()
      .describe('Returned only to mobile clients (`X-Client: ios|android`). Web clients receive an httpOnly cookie instead. `null` means keep the one you have.'),
    user: authUserDto,
    isNewUser: z.boolean().optional(),
  })
  .meta({ id: 'TokenResponse' });

export const verificationPending = z
  .object({
    email: z.string(),
    verificationRequired: z.literal(true),
    codeExpiresIn: z.number().describe('Seconds until the code expires'),
    resendAvailableIn: z.number().describe('Seconds until a new code can be requested'),
  })
  .meta({ id: 'VerificationPending' });

export const accepted = z.object({ message: z.string() }).meta({ id: 'Accepted' });

export const registerBody = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(80),
  email,
  password,
  acceptTerms: z.literal(true, { error: 'You must accept the terms to continue' }),
});

export const verifyEmailBody = z.object({ email, code: otpCode });
export const emailOnlyBody = z.object({ email });
export const loginBody = z.object({ email, password: z.string().min(1, 'Enter your password').max(128) });
export const refreshBody = z
  .object({ refreshToken: z.string().min(20).optional().describe('Mobile only. Web sends the httpOnly cookie automatically.') })
  .nullish();
export const googleTokenBody = z.object({ idToken: z.string().min(20).describe('Google ID token from the native / One Tap sign-in SDK') });
export const googleStartQuery = z.object({
  app: z.enum(['web', 'admin']).default('web').describe('Which frontend to return to after sign-in'),
  returnTo: z
    .string()
    .regex(/^\/(?!\/)[\w\-/?=&.%]*$/, 'returnTo must be a relative path')
    .max(300)
    .optional()
    .describe('Relative path in the frontend to land on after sign-in, e.g. /projects'),
});
export const googleCallbackQuery = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

export const forgotBody = z.object({ email });
export const verifyResetBody = z.object({ email, code: otpCode });
export const resetTokenResponse = z.object({
  resetToken: z.string().describe('Single-use token for POST /auth/password/reset'),
  expiresIn: z.number(),
});
export const resetBody = z.object({ resetToken: z.string().min(20), newPassword: password });
export const changePasswordBody = z.object({
  currentPassword: z.string().max(128).optional().describe('Required unless the account has no password yet (Google-only)'),
  newPassword: password,
});

export const sessionDto = z
  .object({
    id: z.uuid(),
    client: z.enum(['web', 'admin', 'ios', 'android', 'unknown']),
    userAgent: z.string().nullable(),
    ip: z.string().nullable(),
    createdAt: z.string(),
    lastUsedAt: z.string().nullable(),
    current: z.boolean(),
  })
  .meta({ id: 'Session' });
