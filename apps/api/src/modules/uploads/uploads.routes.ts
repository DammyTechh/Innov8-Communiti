import { and, eq } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { uuidv7 } from 'uuidv7';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { media } from '../../db/schema/index.js';
import { AppError, Errors } from '../../lib/errors.js';
import { createUploadUrl, objectExists, publicUrl, removeObjects } from '../../lib/storage.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, idParam, mediaDto, noContent } from '../_shared/dto.js';
import { toMediaDtos } from '../_shared/media.js';

const tags = ['Uploads'];
const MB = 1024 * 1024;

/** What each purpose accepts, where it is stored, and the size cap. */
const PURPOSES = {
  avatar: { kinds: ['image'], visibility: 'public', maxBytes: 5 * MB },
  cover: { kinds: ['image'], visibility: 'public', maxBytes: 10 * MB },
  post: { kinds: ['image', 'video'], visibility: 'public', maxBytes: 200 * MB },
  message: { kinds: ['image', 'video', 'document', 'audio'], visibility: 'private', maxBytes: 50 * MB },
  research: { kinds: ['document', 'image'], visibility: 'private', maxBytes: 25 * MB },
  prototype: { kinds: ['image', 'video', 'document'], visibility: 'private', maxBytes: 200 * MB },
  contract: { kinds: ['document'], visibility: 'private', maxBytes: 25 * MB },
  project: { kinds: ['image', 'video'], visibility: 'public', maxBytes: 200 * MB },
  forum: { kinds: ['image'], visibility: 'public', maxBytes: 10 * MB },
  event: { kinds: ['image'], visibility: 'public', maxBytes: 10 * MB },
  highlight: { kinds: ['image', 'video'], visibility: 'public', maxBytes: 200 * MB },
} as const;

const MIME: Record<string, 'image' | 'video' | 'document' | 'audio'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'image/heic': 'image',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
  'audio/mpeg': 'audio',
  'audio/mp4': 'audio',
  'audio/aac': 'audio',
  'audio/webm': 'audio',
  'audio/ogg': 'audio',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'application/vnd.ms-powerpoint': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document',
  'text/plain': 'document',
  'text/csv': 'document',
};

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4', 'application/pdf': 'pdf' };

export const uploadRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.post('/presign', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags,
      summary: 'Step 1: get a signed URL to upload a file directly to storage',
      description:
        'Upload the file with `PUT uploadUrl` (body = file bytes, header `Content-Type`). Then call `POST /uploads/{mediaId}/complete`. Use the returned `mediaId` in posts, messages and workspace items; for avatar/cover use `publicUrl`.',
      security: auth,
      body: z.object({
        purpose: z.enum(Object.keys(PURPOSES) as [keyof typeof PURPOSES, ...(keyof typeof PURPOSES)[]]),
        mimeType: z.string().max(120),
        sizeBytes: z.number().int().positive(),
        fileName: z.string().max(200).optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        durationSeconds: z.number().int().positive().max(600).optional(),
      }),
      response: {
        201: z.object({
          mediaId: z.uuid(),
          uploadUrl: z.string(),
          token: z.string(),
          publicUrl: z.string().nullable().describe('Final URL for public files (avatar, cover, post images)'),
          expiresIn: z.number(),
        }),
      },
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const b = req.body;
      const rule = PURPOSES[b.purpose];
      const kind = MIME[b.mimeType.toLowerCase()];
      if (!kind || !(rule.kinds as readonly string[]).includes(kind)) {
        throw new AppError(415, 'UNSUPPORTED_MEDIA', `This file type is not allowed for ${b.purpose}`);
      }
      if (b.sizeBytes > rule.maxBytes) throw new AppError(413, 'FILE_TOO_LARGE', `Max size for ${b.purpose} is ${rule.maxBytes / MB} MB`);

      const id = uuidv7();
      const ext = EXT[b.mimeType] ?? b.fileName?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) ?? 'bin';
      const storagePath = `${b.purpose}/${me.id}/${id}.${ext}`;
      const { uploadUrl, token } = await createUploadUrl(rule.visibility, storagePath);
      await db.insert(media).values({
        id,
        ownerId: me.id,
        kind,
        visibility: rule.visibility,
        storagePath,
        mimeType: b.mimeType,
        sizeBytes: b.sizeBytes,
        originalName: b.fileName ?? null,
        width: b.width ?? null,
        height: b.height ?? null,
        durationSeconds: b.durationSeconds ?? null,
      });
      return reply.status(201).send({ mediaId: id, uploadUrl, token, publicUrl: rule.visibility === 'public' ? publicUrl(storagePath) : null, expiresIn: 7200 });
    },
  });

  app.post('/:id/complete', {
    schema: {
      tags,
      summary: 'Step 2: confirm the upload finished',
      description: 'Checks the object exists in storage and marks the media ready so it can be attached.',
      security: auth,
      params: idParam,
      response: { 200: mediaDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const [m] = await db.select().from(media).where(and(eq(media.id, req.params.id), eq(media.ownerId, me.id)));
      if (!m) throw Errors.notFound('Upload');
      if (m.status !== 'ready') {
        if (!(await objectExists(m.visibility, m.storagePath))) throw Errors.badRequest('The file has not been uploaded yet');
        await db.update(media).set({ status: 'ready' }).where(eq(media.id, m.id));
        m.status = 'ready';
      }
      return (await toMediaDtos([m])).get(m.id)!;
    },
  });

  app.delete('/:id', {
    schema: { tags, summary: 'Delete an upload I own', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const [m] = await db.delete(media).where(and(eq(media.id, req.params.id), eq(media.ownerId, me.id))).returning();
      if (!m) throw Errors.notFound('Upload');
      await removeObjects(m.visibility, [m.storagePath]);
      return reply.status(204).send(null);
    },
  });
};
