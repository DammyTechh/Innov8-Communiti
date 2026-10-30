import { z } from 'zod';

/** Response DTOs shared across modules. Serialization strips any field not listed here. */

export const idParam = z.object({ id: z.uuid() });
export const noContent = { 204: z.null().describe('No content') };
export const auth = [{ bearerAuth: [] }];

/** Every stored role. The four current ones are researcher, innovator, professional and learner; expert, investor and student are legacy. */
export const memberRoleEnum = z
  .enum(['researcher', 'innovator', 'professional', 'learner', 'expert', 'investor', 'student'])
  .describe('Current roles: researcher, innovator, professional, learner. Legacy (existing accounts only): expert, investor, student');
/** Roles a member can pick today (Select Role screen). */
export const selectableRoleEnum = z.enum(['researcher', 'innovator', 'professional', 'learner']);
export const verificationStatusEnum = z
  .enum(['unverified', 'pending', 'verified', 'rejected'])
  .describe('Role verification: unverified (no role form), verified (passed automatic verification or approved by an admin), rejected (refused or revoked by an admin; resubmit with PUT /me/role), pending (legacy: submitted before automatic verification, cleared by the daily job)');

export const userSummary = z
  .object({
    id: z.uuid(),
    fullName: z.string(),
    username: z.string().nullable(),
    avatarUrl: z.string().nullable(),
    headline: z.string().nullable(),
    memberRole: memberRoleEnum.nullable(),
    verified: z.boolean().describe('Role verified by an admin (show the verified badge)'),
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
