import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from '../src/app.js';

/**
 * Vercel serverless entry. vercel.json rewrites every path here; Fastify routes it.
 * The app is built once per warm instance and reused across invocations.
 */
const appPromise = buildApp().then(async (app) => {
  await app.ready();
  return app;
});

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await appPromise;
  app.server.emit('request', req, res);
}
