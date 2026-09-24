import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Loads lib/origins with a fresh environment, exactly as the server would at boot. */
async function load(overrides: Record<string, string>) {
  vi.resetModules();
  process.env = {
    NODE_ENV: 'production',
    API_URL: 'https://api.mycommuniti.org',
    WEB_URL: 'https://app.mycommuniti.org',
    ADMIN_URL: 'https://admin.mycommuniti.org',
    CORS_ORIGINS: 'https://mycommuniti.org,https://*.mycommuniti.org',
    DATABASE_URL: 'postgres://unused',
    JWT_ACCESS_SECRET: 'x'.repeat(64),
    ...overrides,
  };
  return import('../../src/lib/origins.js');
}

describe('production CORS for api.mycommuniti.org', () => {
  let o: Awaited<ReturnType<typeof load>>;
  beforeEach(async () => {
    o = await load({});
  });

  it.each([
    'https://app.mycommuniti.org',
    'https://admin.mycommuniti.org',
    'https://mycommuniti.org',
    'https://www.mycommuniti.org',
    'https://beta.app.mycommuniti.org',
    'https://APP.MyCommuniti.org',
  ])('allows %s', (origin) => expect(o.isAllowedOrigin(origin)).toBe(true));

  it.each([
    'https://evilmycommuniti.org', // suffix look-alike
    'https://mycommuniti.org.evil.com', // prefix look-alike
    'http://app.mycommuniti.org', // plain http
    'https://app.mycommuniti.org:8443', // other port
    'http://localhost:5173', // localhost is dev-only
    'https://mycommuniti.com',
    'null',
    'not a url',
  ])('blocks %s', (origin) => expect(o.isAllowedOrigin(origin)).toBe(false));

  it('lets requests without an Origin through (mobile apps, servers)', () => expect(o.isAllowedOrigin(undefined)).toBe(true));

  it('uses SameSite=Lax for frontends on mycommuniti.org', () => {
    expect(o.refreshCookieSameSite('https://app.mycommuniti.org')).toBe('lax');
    expect(o.refreshCookieSameSite('https://mycommuniti.org')).toBe('lax');
  });

  it('uses SameSite=None for a frontend on another site (e.g. a Vercel preview)', () => {
    expect(o.refreshCookieSameSite('https://communiti-web-git-feature.vercel.app')).toBe('none');
  });

  it('judges the Google OAuth callback (no Origin header) by WEB_URL', () => {
    expect(o.refreshCookieSameSite(undefined)).toBe('lax');
  });
});

describe('other configurations', () => {
  it('allows localhost in development', async () => {
    const o = await load({ NODE_ENV: 'development' });
    expect(o.isAllowedOrigin('http://localhost:5173')).toBe(true);
    expect(o.isAllowedOrigin('http://127.0.0.1:3000')).toBe(true);
  });

  it('honours a forced COOKIE_SAMESITE', async () => {
    const o = await load({ COOKIE_SAMESITE: 'strict' });
    expect(o.refreshCookieSameSite('https://anything.example')).toBe('strict');
  });

  it('works with a Vercel preview wildcard when listed', async () => {
    const o = await load({ CORS_ORIGINS: 'https://*.vercel.app' });
    expect(o.isAllowedOrigin('https://communiti-web-abc123.vercel.app')).toBe(true);
    expect(o.isAllowedOrigin('https://vercel.app')).toBe(false);
  });
});
