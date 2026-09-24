import { z } from 'zod';

/** Response DTOs shared across modules. Serialization strips any field not listed here. */

export const idParam = z.object({ id: z.uuid() });
export const noContent = { 204: z.null().describe('No content') };
export const auth = [{ bearerAuth: [] }];

export const memberRoleEnum = z.enum(['innovator', 'researcher', 'expert', 'investor', 'student']);

export const userSummary = z
  .object({
    id: z.uuid(),
    fullName: z.string(),
    username: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    headline: z.string().nullable(),
    memberRole: memberRoleEnum.nullable(),
  })
  .meta({ id: 'UserSummary' });
export type UserSummary = z.infer<typeof userSummary>;

export const mediaDto = z
  .object({
    id: z.uuid(),
    kind: z.enum(['image', 'video', 'document', 'audio']),
    url: z.string().nullable(),
    mimeType: z.string(),
    sizeBytes: z.number(),
    originalName: z.string().nullable(),
    width: z.number().nullable(),
    height: z.number().nullable(),
    durationSeconds: z.number().nullable(),
  })
  .meta({ id: 'Media' });
export type MediaDto = z.infer<typeof mediaDto>;

export const topicDto = z.object({ id: z.uuid(), slug: z.string(), name: z.string() }).meta({ id: 'Topic' });

export const mediaIds = z.array(z.uuid()).max(10).default([]).describe('IDs from POST /uploads/presign (status must be ready)');
