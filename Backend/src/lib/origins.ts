import { env } from '../config/env.js';

/**
 * CORS allow-list and cookie policy.
 *
 * Rules come from WEB_URL, ADMIN_URL and CORS_ORIGINS (comma separated). A rule is either
 *   - an exact origin:            https://app.mycommuniti.org
 *   - a subdomain wildcard:       https://*.mycommuniti.org   (any depth of subdomain, not the apex)
 * Matching is done on parsed URLs (scheme, host, port), never on string suffixes, so
 * "evilmycommuniti.org" and "mycommuniti.org.evil.com" can never match "*.mycommuniti.org".
 * Outside production, http://localhost:* and http://127.0.0.1:* are always allowed.
 */

interface Rule {
  protocol: string;
  host: string; // exact host, or the base domain for wildcard rules
  port: string;
  wildcard: boolean;
}

function parseRule(raw: string): Rule | null {
  const value = raw.trim().replace(/\/+$/, '');
  if (!value) return null;
  const wildcard = /^https?:\/\/\*\./i.test(value);
  try {
    const url = new URL(wildcard ? value.replace('*.', 'wildcard-placeholder.') : value);
    const host = url.hostname.toLowerCase();
    return { protocol: url.protocol, host: wildcard ? host.replace(/^wildcard-placeholder\./, '') : host, port: url.port, wildcard };
  } catch {
    return null;
  }
}

const rules: Rule[] = [env.WEB_URL, env.ADMIN_URL, ...env.CORS_ORIGINS].map(parseRule).filter((r): r is Rule => r !== null);

function parseOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return { protocol: url.protocol, host: url.hostname.toLowerCase(), port: url.port };
  } catch {
    return null;
  }
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // mobile apps, curl, server-to-server: no Origin header, CORS does not apply
  const o = parseOrigin(origin);
  if (!o) return false;
  if (!env.isProd && o.protocol === 'http:' && (o.host === 'localhost' || o.host === '127.0.0.1')) return true;
  return rules.some((r) => {
    if (r.protocol !== o.protocol || r.port !== o.port) return false;
    return r.wildcard ? o.host.endsWith(`.${r.host}`) : o.host === r.host;
  });
}

/** The API's registrable domain, e.g. "mycommuniti.org" for api.mycommuniti.org. */
const apiSite = siteOf(new URL(env.API_URL).hostname);

function siteOf(host: string) {
  const labels = host.toLowerCase().split('.');
  // Good enough for .org/.com/.app/.ng; for two-part suffixes (.com.ng, .co.uk) set COOKIE_SAMESITE explicitly.
  return labels.length <= 2 ? host.toLowerCase() : labels.slice(-2).join('.');
}

/**
 * SameSite for the refresh cookie.
 * - auto (default): frontend on the same site as the API (app.mycommuniti.org → api.mycommuniti.org)
 *   gets "lax"; a frontend elsewhere (e.g. a *.vercel.app preview) gets "none" (+Secure) so it still works.
 * - lax | strict | none: forced.
 * The cookie is host-only on the API domain: it never needs to reach the frontend.
 */
export function refreshCookieSameSite(origin: string | undefined): 'lax' | 'strict' | 'none' {
  if (env.COOKIE_SAMESITE !== 'auto') return env.COOKIE_SAMESITE;
  // No Origin (e.g. the Google OAuth callback, a top-level navigation): judge by where we send the user.
  const target = origin ?? env.WEB_URL;
  const host = parseOrigin(target)?.host;
  if (!host || host === 'localhost' || host === '127.0.0.1') return 'lax';
  return siteOf(host) === apiSite ? 'lax' : 'none';
}

export const allowedOriginRules = () => rules.map((r) => `${r.protocol}//${r.wildcard ? '*.' : ''}${r.host}${r.port ? `:${r.port}` : ''}`);
