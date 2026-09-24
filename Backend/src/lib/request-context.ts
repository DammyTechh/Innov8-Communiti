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
