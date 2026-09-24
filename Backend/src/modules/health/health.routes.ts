import { sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/health', {
    config: { rateLimit: false },
    schema: {
      tags: ['Health'],
      summary: 'Liveness and database check',
      response: {
        200: z.object({ status: z.literal('ok'), db: z.literal('ok'), env: z.string(), version: z.string(), commit: z.string(), time: z.string() }),
        503: z.object({ status: z.literal('degraded'), db: z.literal('down') }),
      },
    },
    handler: async (_req, reply) => {
      try {
        await db.execute(sql`select 1`);
        return { status: 'ok' as const, db: 'ok' as const, env: env.NODE_ENV, version: env.APP_VERSION, commit: env.APP_COMMIT, time: new Date().toISOString() };
      } catch {
        return reply.status(503).send({ status: 'degraded' as const, db: 'down' as const });
      }
    },
  });
};
