import type { FastifyRequest } from 'fastify';

export type ClientKind = 'web' | 'admin' | 'ios' | 'android' | 'unknown';

export function clientOf(req: FastifyRequest): ClientKind {
  const v = String(req.headers['x-client'] ?? '').toLowerCase();
  return (['web', 'admin', 'ios', 'android'] as const).find((c) => c === v) ?? 'unknown';
}

export const isMobile = (req: FastifyRequest) => ['ios', 'android'].includes(clientOf(req));

export function requestMeta(req: FastifyRequest) {
  return {
    ip: req.ip,
    userAgent: (req.headers['user-agent'] ?? '').slice(0, 500) || null,
    client: clientOf(req),
  };
}

/**
 * "City, Region, Country" from the edge. Vercel adds x-vercel-ip-city / -country-region / -country
 * to every request; other proxies are covered by the Cloudflare-style cf-ipcountry fallback.
 * Returns null when the API runs without a geo-aware proxy (local dev).
 */
export function requestLocation(req: FastifyRequest): string | null {
  const h = (name: string) => {
    const v = req.headers[name];
    const raw = Array.isArray(v) ? v[0] : v;
    if (!raw) return null;
    try {
      return decodeURIComponent(raw).trim() || null;
    } catch {
      return raw.trim() || null;
    }
  };
  const parts = [h('x-vercel-ip-city'), h('x-vercel-ip-country-region'), h('x-vercel-ip-country') ?? h('cf-ipcountry')].filter(Boolean);
  return parts.length ? [...new Set(parts)].join(', ').slice(0, 200) : null;
}
