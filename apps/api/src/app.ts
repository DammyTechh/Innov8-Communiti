import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { uuidv7 } from 'uuidv7';
import { env } from './config/env.js';
import { loggerOptions } from './lib/logger.js';
import { routes } from './modules/index.js';
import { authPlugin } from './plugins/auth.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { swaggerPlugin } from './plugins/swagger.js';

export async function buildApp() {
  const app = Fastify({
    logger: loggerOptions,
    trustProxy: true, // behind Vercel's edge: req.ip comes from x-forwarded-for
    genReqId: (req) => (req.headers['x-request-id'] as string) || uuidv7(),
    bodyLimit: 1024 * 1024, // 1 MB JSON; files go straight to storage
    ajv: { customOptions: { removeAdditional: false } },
  }).withTypeProvider<ZodTypeProvider>();

  // Accept empty JSON bodies (e.g. POST /auth/refresh with only the cookie) instead of a 400.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    const text = (body as string).trim();
    if (!text) return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      done(Object.assign(new Error('Request body is not valid JSON'), { statusCode: 400 }), undefined);
    }
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(errorHandlerPlugin);
  await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
  await app.register(cors, {
    origin: (origin, cb) => {
      // Mobile apps and server-to-server calls send no Origin header.
      if (!origin || env.allowedOrigins.includes(origin.replace(/\/$/, ''))) return cb(null, true);
      cb(null, false);
    },
    credentials: true, // refresh cookie
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Client', 'X-App-Version', 'Idempotency-Key', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After'],
    maxAge: 86400,
  });
  await app.register(cookie);
  // In-memory limiter: per serverless instance. For a shared limit across instances, pass an
  // Upstash/Redis store here. Auth-critical limits (OTP attempts, login lockout) live in Postgres.
  await app.register(rateLimit, { global: true, max: 300, timeWindow: '1 minute', keyGenerator: (req) => req.ip });
  await app.register(swaggerPlugin);
  await app.register(authPlugin);

  app.addHook('onSend', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });

  await app.register(routes, { prefix: '/api/v1' });

  if (env.mailTestSender && !env.MAIL_REDIRECT_TO) {
    app.log.warn('MAIL_FROM uses onboarding@resend.dev: Resend will only deliver to your account email. Set MAIL_REDIRECT_TO to it for testing.');
  }
  if (env.isProd && (env.mailTestSender || env.MAIL_REDIRECT_TO)) {
    app.log.warn('Production is using Resend test mode (resend.dev sender or MAIL_REDIRECT_TO). Verify your domain before launch.');
  }

  app.get('/', { schema: { hide: true } }, async () => ({ name: `${env.APP_NAME} API`, docs: `${env.API_URL}/api/docs` }));

  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;
