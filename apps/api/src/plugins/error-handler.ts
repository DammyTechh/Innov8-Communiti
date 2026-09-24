import type { FastifyError, FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { hasZodFastifySchemaValidationErrors, isResponseSerializationError } from 'fastify-type-provider-zod';
import { AppError } from '../lib/errors.js';

/** Maps every error to { error: { code, message, fields?, requestId } }. */
export const errorHandlerPlugin = fp(async (app: FastifyInstance) => {
  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.url} not found`, requestId: req.id } });
  });

  app.setErrorHandler((err: FastifyError, req, reply) => {
    const requestId = req.id;

    if (err instanceof AppError) {
      if (err.headers) reply.headers(err.headers);
      return reply.status(err.statusCode).send({ error: { code: err.code, message: err.message, fields: err.fields, requestId } });
    }

    if (hasZodFastifySchemaValidationErrors(err)) {
      const fields: Record<string, string> = {};
      for (const v of err.validation) {
        const issuePath = (v.params as { issue?: { path?: PropertyKey[] } } | undefined)?.issue?.path;
        const path = (v.instancePath || '').replace(/^\//, '').replace(/\//g, '.') || issuePath?.map(String).join('.') || 'body';
        fields[path] ??= v.message ?? 'Invalid value';
      }
      const first = Object.values(fields)[0] ?? 'Invalid request';
      return reply.status(400).send({ error: { code: 'VALIDATION_FAILED', message: first, fields, requestId } });
    }

    if (isResponseSerializationError(err)) {
      req.log.error({ err, issues: err.cause?.issues }, 'response serialization failed');
      return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Something went wrong', requestId } });
    }

    if (err.statusCode === 429) {
      return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.', requestId } });
    }

    // Postgres unique violation that slipped past service checks
    const pgCode = (err as unknown as { code?: string; cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code;
    if (pgCode === '23505') {
      return reply.status(409).send({ error: { code: 'CONFLICT', message: 'This already exists', requestId } });
    }
    if (pgCode === '23503') {
      return reply.status(400).send({ error: { code: 'BAD_REQUEST', message: 'A referenced record does not exist', requestId } });
    }

    if (err.statusCode && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: 'BAD_REQUEST', message: err.message, requestId } });
    }

    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send({ error: { code: 'INTERNAL', message: 'Something went wrong', requestId } });
  });
});
