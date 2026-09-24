import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { Errors } from './errors.js';

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  fullName: string;
  avatarUrl: string | null;
}

let client: OAuth2Client | undefined;
function oauth() {
  if (!env.googleEnabled) throw Errors.unavailable('Google sign-in is not configured');
  client ??= new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  });
  return client;
}

/** Step 1 (web): URL for Google's consent screen, bound to `state` and a PKCE challenge. */
export function googleAuthUrl(state: string, codeChallenge: string) {
  return oauth().generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state,
    code_challenge: codeChallenge,
    // google-auth-library types this as an enum; "S256" is the only value we use
    code_challenge_method: 'S256' as never,
    prompt: 'select_account',
    access_type: 'online',
  });
}

/** Step 2 (web): exchange the authorization code, then verify the returned ID token. */
export async function exchangeGoogleCode(code: string, codeVerifier: string) {
  const { tokens } = await oauth().getToken({ code, codeVerifier });
  if (!tokens.id_token) throw Errors.unauthenticated('Google did not return an identity token');
  return verifyGoogleIdToken(tokens.id_token);
}

/** Mobile (and Google One Tap): verify an ID token obtained on the device. */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const ticket = await oauth()
    .verifyIdToken({ idToken, audience: [env.GOOGLE_CLIENT_ID, ...env.GOOGLE_MOBILE_CLIENT_IDS] })
    .catch(() => {
      throw Errors.unauthenticated('Google sign-in failed. Please try again.', 'TOKEN_INVALID');
    });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email) throw Errors.unauthenticated('Google account has no email address');
  return {
    googleId: p.sub,
    email: p.email.toLowerCase(),
    emailVerified: Boolean(p.email_verified),
    fullName: p.name ?? p.email.split('@')[0]!,
    avatarUrl: p.picture ?? null,
  };
}
