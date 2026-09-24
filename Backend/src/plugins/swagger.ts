import swagger from '@fastify/swagger';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod';
import { env } from '../config/env.js';

export const API_TAGS = [
  { name: 'Health', description: 'Liveness and readiness' },
  { name: 'Auth', description: 'Sign up, email verification, login, Google OAuth, tokens, password reset' },
  { name: 'Me', description: 'Current user, onboarding, settings, interests, account deletion' },
  { name: 'Users', description: 'Profiles, follows, suggestions' },
  { name: 'Topics', description: 'Interest topics used for onboarding and tags' },
  { name: 'Uploads', description: 'Direct-to-storage uploads (Supabase Storage)' },
  { name: 'Feed & Posts', description: 'Feed, posts, likes, shares, comments' },
  { name: 'Search', description: 'Global search and trending' },
  { name: 'Forums', description: 'Forums, membership and forum posts' },
  { name: 'Projects', description: 'Projects, members and join requests' },
  { name: 'Workspace', description: 'Research, prototypes, versions, evaluations, contracts, tasks, ledger' },
  { name: 'Chat', description: 'Direct and project conversations' },
  { name: 'Explore', description: 'Events, featured innovations, community highlights' },
  { name: 'Notifications', description: 'In-app notifications and push tokens' },
  { name: 'Reports', description: 'Report content or users' },
  { name: 'Admin', description: 'Dashboard, moderation, users, content, events, broadcasts, logs (moderator+)' },
];

export const swaggerPlugin = fp(async (app: FastifyInstance) => {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: `${env.APP_NAME} API`,
        version: '1.0.0',
        description: [
          'One REST API for the CommUniti member web app, admin dashboard and mobile app.',
          '',
          '**Authentication.** Send `Authorization: Bearer <accessToken>`. Access tokens last 15 minutes.',
          'Web clients get the refresh token as an httpOnly cookie; mobile clients (`X-Client: ios|android`) get it in the response body and send it back to `/auth/refresh`.',
          '',
          '**Errors.** Every non-2xx response is `{ "error": { "code", "message", "fields?", "requestId" } }`.',
          '',
          '**Pagination.** Lists return `{ data, nextCursor }`; pass `?cursor=<nextCursor>` for the next page. Admin tables use `?page=&pageSize=`.',
        ].join('\n'),
      },
      servers: [{ url: env.API_URL, description: env.NODE_ENV }],
      tags: API_TAGS,
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });

  app.get('/api/docs/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  // Swagger UI served from a CDN: nothing to bundle, works the same on Vercel.
  app.get('/api/docs', { schema: { hide: true } }, async (_req, reply) => {
    reply.type('text/html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${env.APP_NAME} API</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css">
<style>body{margin:0;background:#F8F9FA}.topbar{display:none}.swagger-ui .info .title{color:#ED8322}</style>
</head><body><div id="ui"></div>
<script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" crossorigin></script>
<script>window.ui=SwaggerUIBundle({url:'/api/docs/openapi.json',dom_id:'#ui',persistAuthorization:true,docExpansion:'none',filter:true,tryItOutEnabled:true,displayRequestDuration:true});</script>
</body></html>`);
  });
});
