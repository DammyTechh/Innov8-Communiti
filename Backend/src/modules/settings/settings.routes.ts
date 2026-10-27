import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { appConfig } from './settings.service.js';

export const appConfigDto = z
  .object({
    imageOptimization: z.boolean().describe('Admin Settings → Image Optimization: prefetch images ahead of time'),
    maintenance: z
      .object({
        id: z.uuid(),
        message: z.string(),
        startsAt: z.string(),
        endsAt: z.string(),
        disableAccess: z.boolean().describe('true = the API answers 503 MAINTENANCE to members while active'),
        active: z.boolean(),
      })
      .nullable()
      .describe('The running or next scheduled maintenance window'),
  })
  .meta({ id: 'AppConfig' });

export const settingsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/app-config', {
    schema: {
      tags: ['App'],
      summary: 'Public app configuration (image prefetching, maintenance banner)',
      description: 'No auth. Clients call it on start-up to show a maintenance banner, and when any call returns `503 MAINTENANCE`.',
      response: { 200: appConfigDto },
    },
    handler: async (_req, reply) => {
      reply.header('cache-control', 'public, max-age=30');
      return appConfig();
    },
  });
};
