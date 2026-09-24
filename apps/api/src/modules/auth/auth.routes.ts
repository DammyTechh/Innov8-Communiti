import { createHash } from 'node:crypto';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { randomToken } from '../../lib/crypto.js';
import { AppError, Errors } from '../../lib/errors.js';
import { exchangeGoogleCode, googleAuthUrl, verifyGoogleIdToken } from '../../lib/google.js';
import { signPurposeToken, verifyPurposeToken } from '../../lib/jwt.js';
import { currentUser } from '../../plugins/auth.js';
import * as S from './auth.schemas.js';
import * as auth from './auth.service.js';
import {
  clearRefreshCookie,
  deliverRefreshToken,
  listSessions,
  readRefreshToken,
  revokeAllSessions,
  revokeSession,
  rotateSession,
} from './session.service.js';

const tag = ['Auth'];
const strict = { rateLimit: { max: 10, timeWindow: '1 minute' } };
const OAUTH_COOKIE = 'communiti_oauth';
const OAUTH_COOKIE_PATH = '/api/v1/auth/google';
const noContent = { 204: z.null().describe('No content') };

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  // ── Sign up + email verification ──────────────────────────────────────────

  app.post('/register', {
    config: strict,
    schema: {
      tags: tag,
      summary: 'Create an account with email and password',
      description: 'Creates an unverified account and emails a 6-digit code. Retrying with an unverified email updates the details and resends the code.',
      body: S.registerBody,
      response: { 201: S.verificationPending },
    },
    handler: async (req, reply) => reply.status(201).send(await auth.register(req.body)),
  });

  app.post('/verify-email', {
    config: strict,
    schema: {
      tags: tag,
      summary: 'Verify email with the 6-digit code and sign in',
      description: 'On success the user is signed in. Next step: onboarding (`PATCH /me/onboarding`) when `user.onboardingComplete` is false.',
      body: S.verifyEmailBody,
      response: { 200: S.tokenResponse },
    },
    handler: async (req, reply) => {
      const { tokens, user } = await auth.verifyEmail(req, req.body.email, req.body.code);
      return { ...tokens, refreshToken: deliverRefreshToken(req, reply, tokens.refreshToken), user: auth.toAuthUser(user) };
    },
  });

  app.post('/verify-email/resend', {
    config: strict,
    schema: { tags: tag, summary: 'Resend the email verification code', body: S.emailOnlyBody, response: { 202: S.accepted } },
    handler: async (req, reply) => {
      await auth.resendVerification(req.body.email);
      return reply.status(202).send({ message: 'If this email needs verification, a new code is on its way.' });
    },
  });

  // ── Login / tokens ────────────────────────────────────────────────────────

  app.post('/login', {
    config: strict,
    schema: {
      tags: tag,
      summary: 'Sign in with email and password',
      description:
        'Errors: `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED` (a new code is emailed), `PASSWORD_NOT_SET` (Google-only account), `ACCOUNT_LOCKED` (5 failed attempts, 15 min), `ACCOUNT_SUSPENDED`, `ACCOUNT_BLOCKED`.',
      body: S.loginBody,
      response: { 200: S.tokenResponse },
    },
    handler: async (req, reply) => {
      const { tokens, user } = await auth.login(req, req.body.email, req.body.password);
      return { ...tokens, refreshToken: deliverRefreshToken(req, reply, tokens.refreshToken), user: auth.toAuthUser(user) };
    },
  });

  app.post('/admin/login', {
    config: strict,
    schema: {
      tags: tag,
      summary: 'Admin dashboard sign-in (moderator, admin, super_admin)',
      body: S.loginBody,
      response: { 200: S.tokenResponse },
    },
    handler: async (req, reply) => {
      const { tokens, user } = await auth.login(req, req.body.email, req.body.password, { requireStaff: true });
      return { ...tokens, refreshToken: deliverRefreshToken(req, reply, tokens.refreshToken), user: auth.toAuthUser(user) };
    },
  });

  app.post('/refresh', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags: tag,
      summary: 'Get a new access token',
      description: 'Web: sends the httpOnly cookie automatically (use `credentials: "include"`). Mobile: send `{ refreshToken }`. The refresh token rotates on every call.',
      body: S.refreshBody,
      response: { 200: S.tokenResponse },
    },
    handler: async (req, reply) => {
      const presented = readRefreshToken(req, req.body?.refreshToken);
      if (!presented) throw Errors.unauthenticated('No refresh token provided');
      try {
        const rotated = await rotateSession(presented);
        const user = await auth.getUserById(rotated.userId);
        return {
          accessToken: rotated.accessToken,
          accessTokenExpiresIn: rotated.accessTokenExpiresIn,
          refreshToken: deliverRefreshToken(req, reply, rotated.refreshToken),
          user: auth.toAuthUser(user),
        };
      } catch (err) {
        if (err instanceof AppError && err.statusCode === 401) clearRefreshCookie(req, reply);
        throw err;
      }
    },
  });

  app.post('/logout', {
    onRequest: [app.authenticate],
    schema: { tags: tag, summary: 'Sign out of this device', security: [{ bearerAuth: [] }], response: noContent },
    handler: async (req, reply) => {
      await revokeSession(currentUser(req).sessionId, 'logout');
      clearRefreshCookie(req, reply);
      return reply.status(204).send(null);
    },
  });

  app.post('/logout-all', {
    onRequest: [app.authenticate],
    schema: { tags: tag, summary: 'Sign out of every device', security: [{ bearerAuth: [] }], response: noContent },
    handler: async (req, reply) => {
      await revokeAllSessions(currentUser(req).id, 'logout_all');
      clearRefreshCookie(req, reply);
      return reply.status(204).send(null);
    },
  });

  app.get('/sessions', {
    onRequest: [app.authenticate],
    schema: { tags: tag, summary: 'List signed-in devices', security: [{ bearerAuth: [] }], response: { 200: z.object({ data: z.array(S.sessionDto) }) } },
    handler: async (req) => {
      const me = currentUser(req);
      const rows = await listSessions(me.id);
      return { data: rows.map((s) => ({ ...s, current: s.id === me.sessionId })) };
    },
  });

  app.delete('/sessions/:sessionId', {
    onRequest: [app.authenticate],
    schema: {
      tags: tag,
      summary: 'Sign out a specific device',
      security: [{ bearerAuth: [] }],
      params: z.object({ sessionId: z.uuid() }),
      response: noContent,
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const mine = (await listSessions(me.id)).some((s) => s.id === req.params.sessionId);
      if (!mine) throw Errors.notFound('Session');
      await revokeSession(req.params.sessionId, 'revoked_by_user');
      return reply.status(204).send(null);
    },
  });

  // ── Google OAuth (web redirect flow, with PKCE) ───────────────────────────

  app.get('/google', {
    schema: {
      tags: tag,
      summary: 'Start Google sign-in (web redirect flow)',
      description:
        'Open this URL in the browser (full-page navigation, not fetch). Redirects to Google, then back to `/auth/google/callback`, which sets the refresh cookie and redirects to `{WEB_URL|ADMIN_URL}/auth/callback`. The frontend then calls `POST /auth/refresh` to get an access token.',
      querystring: S.googleStartQuery,
    },
    handler: async (req, reply) => {
      if (!env.googleEnabled) throw Errors.unavailable('Google sign-in is not configured');
      const nonce = randomToken(24);
      const verifier = randomToken(48);
      const challenge = createHash('sha256').update(verifier).digest('base64url');
      const stateCookie = await signPurposeToken('google_oauth', { nonce, verifier, app: req.query.app, returnTo: req.query.returnTo ?? '/' }, 600);
      reply.setCookie(OAUTH_COOKIE, stateCookie, {
        httpOnly: true,
        secure: env.isProd,
        sameSite: 'lax', // must survive the top-level redirect back from Google
        path: OAUTH_COOKIE_PATH,
        maxAge: 600,
      });
      return reply.redirect(googleAuthUrl(nonce, challenge));
    },
  });

  app.get('/google/callback', {
    schema: { tags: tag, summary: 'Google OAuth callback (called by Google)', querystring: S.googleCallbackQuery },
    handler: async (req, reply) => {
      let appUrl = env.WEB_URL;
      const fail = (code: string, message: string) =>
        reply.redirect(`${appUrl}/auth/callback?error=${encodeURIComponent(code)}&message=${encodeURIComponent(message)}`);

      const raw = req.cookies[OAUTH_COOKIE];
      reply.clearCookie(OAUTH_COOKIE, { path: OAUTH_COOKIE_PATH });
      if (!raw) return fail('STATE_MISSING', 'Your sign-in session expired. Please try again.');

      let state: { nonce: string; verifier: string; app: 'web' | 'admin'; returnTo: string };
      try {
        state = await verifyPurposeToken('google_oauth', raw);
      } catch {
        return fail('STATE_INVALID', 'Your sign-in session expired. Please try again.');
      }
      appUrl = state.app === 'admin' ? env.ADMIN_URL : env.WEB_URL;

      if (req.query.error) return fail('GOOGLE_DENIED', 'Google sign-in was cancelled.');
      if (!req.query.code || req.query.state !== state.nonce) return fail('STATE_MISMATCH', 'Sign-in could not be verified. Please try again.');

      try {
        const profile = await exchangeGoogleCode(req.query.code, state.verifier);
        const { tokens, isNewUser, user } = await auth.signInWithGoogle(req, profile, { requireStaff: state.app === 'admin' });
        deliverRefreshToken(req, reply, tokens.refreshToken); // browser flow: always the cookie
        const params = new URLSearchParams({ returnTo: state.returnTo, new: isNewUser ? '1' : '0', onboarding: user.onboardingCompletedAt ? '0' : '1' });
        return reply.redirect(`${appUrl}/auth/callback?${params.toString()}`);
      } catch (err) {
        req.log.warn({ err }, 'google callback failed');
        if (err instanceof AppError) return fail(err.code, err.message);
        return fail('GOOGLE_FAILED', 'Google sign-in failed. Please try again.');
      }
    },
  });

  // ── Google (mobile / One Tap: ID token) ───────────────────────────────────

  app.post('/google/token', {
    config: strict,
    schema: {
      tags: tag,
      summary: 'Sign in with a Google ID token (mobile apps, Google One Tap)',
      description: 'Verifies the ID token against the web and mobile client IDs. Creates the account on first sign-in (`isNewUser: true`).',
      body: S.googleTokenBody,
      response: { 200: S.tokenResponse },
    },
    handler: async (req, reply) => {
      const profile = await verifyGoogleIdToken(req.body.idToken);
      const { tokens, user, isNewUser } = await auth.signInWithGoogle(req, profile);
      return { ...tokens, refreshToken: deliverRefreshToken(req, reply, tokens.refreshToken), user: auth.toAuthUser(user), isNewUser };
    },
  });

  // ── Forgot / reset / change password ──────────────────────────────────────

  app.post('/password/forgot', {
    config: strict,
    schema: {
      tags: tag,
      summary: 'Forgot password: email a reset code',
      description: 'Always returns 202, whether or not the email is registered.',
      body: S.forgotBody,
      response: { 202: S.accepted },
    },
    handler: async (req, reply) => {
      await auth.forgotPassword(req.body.email);
      return reply.status(202).send({ message: 'If an account exists for this email, a reset code is on its way.' });
    },
  });

  app.post('/password/verify-code', {
    config: strict,
    schema: {
      tags: tag,
      summary: 'Verify the reset code and get a reset token',
      body: S.verifyResetBody,
      response: { 200: S.resetTokenResponse },
    },
    handler: async (req) => auth.verifyResetCode(req.body.email, req.body.code),
  });

  app.post('/password/reset', {
    config: strict,
    schema: {
      tags: tag,
      summary: 'Set a new password with the reset token',
      description: 'Signs the user out of every device and emails a confirmation. The user then signs in with the new password.',
      body: S.resetBody,
      response: noContent,
    },
    handler: async (req, reply) => {
      await auth.resetPassword(req, req.body.resetToken, req.body.newPassword);
      clearRefreshCookie(req, reply);
      return reply.status(204).send(null);
    },
  });

  app.post('/password/change', {
    onRequest: [app.authenticate],
    config: strict,
    schema: {
      tags: tag,
      summary: 'Change password (or set one for a Google-only account)',
      description: 'Keeps this device signed in and signs out every other device.',
      security: [{ bearerAuth: [] }],
      body: S.changePasswordBody,
      response: noContent,
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      await auth.changePassword(req, me.id, me.sessionId, req.body.currentPassword, req.body.newPassword);
      return reply.status(204).send(null);
    },
  });
};
