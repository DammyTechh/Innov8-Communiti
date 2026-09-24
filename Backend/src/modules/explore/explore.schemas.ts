import { z } from 'zod';
import { mediaDto, userSummary } from '../_shared/dto.js';

export const eventCategory = z.enum(['hackathon', 'workshop', 'meetup', 'conference', 'webinar', 'other']);

export const eventDto = z
  .object({
    id: z.uuid(),
    title: z.string(),
    category: eventCategory,
    summary: z.string(),
    description: z.string(),
    coverUrl: z.string().nullable(),
    startsAt: z.string(),
    endsAt: z.string(),
    timezone: z.string(),
    venue: z.string().nullable(),
    city: z.string().nullable(),
    country: z.string().nullable(),
    isOnline: z.boolean(),
    meetingUrl: z.string().nullable(),
    registrationUrl: z.string().nullable(),
    capacity: z.number().nullable(),
    status: z.enum(['draft', 'published', 'cancelled']),
    goingCount: z.number(),
    interestedCount: z.number(),
    myRsvp: z.enum(['going', 'interested']).nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'Event' });

export const eventFields = z.object({
    title: z.string().trim().min(3).max(160),
    category: eventCategory.default('other'),
    summary: z.string().trim().max(300).default(''),
    description: z.string().trim().max(10000).default(''),
    coverUrl: z.url().nullable().optional(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    timezone: z.string().max(60).default('Africa/Lagos'),
    venue: z.string().max(200).nullable().optional(),
    city: z.string().max(100).nullable().optional(),
    country: z.string().max(2).nullable().optional(),
    isOnline: z.boolean().default(false),
    meetingUrl: z.url().nullable().optional(),
    registrationUrl: z.url().nullable().optional(),
    capacity: z.number().int().positive().nullable().optional(),
    status: z.enum(['draft', 'published', 'cancelled']).default('draft'),
});

export const eventBody = eventFields.refine((e) => new Date(e.endsAt) > new Date(e.startsAt), { message: 'End time must be after the start time', path: ['endsAt'] });

export const featuredDto = z
  .object({
    id: z.uuid(),
    title: z.string(),
    summary: z.string(),
    body: z.string(),
    coverUrl: z.string().nullable(),
    projectId: z.uuid().nullable(),
    position: z.number(),
    publishedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'FeaturedInnovation' });

export const highlightDto = z
  .object({ id: z.uuid(), title: z.string(), caption: z.string(), media: z.array(mediaDto), publishedAt: z.string().nullable(), createdAt: z.string(), createdBy: userSummary.nullable() })
  .meta({ id: 'Highlight' });
