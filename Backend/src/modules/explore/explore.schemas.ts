import { httpUrl } from '../../lib/url.js';
import { z } from 'zod';
import { mediaDto, topicDto, userSummary } from '../_shared/dto.js';

export const eventCategory = z
  .enum(['hackathon', 'workshop', 'bootcamp', 'networking_fair', 'meetup', 'conference', 'webinar', 'other'])
  .describe('Dashboard event types: hackathon, workshop, bootcamp, networking_fair (Networking / showcase fair)');

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
    organizerName: z.string().nullable(),
    organizerLogoUrl: z.string().nullable(),
    organizerTagline: z.string().nullable(),
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
    coverUrl: httpUrl().nullable().optional(),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    timezone: z.string().max(60).default('Africa/Lagos'),
    venue: z.string().max(200).nullable().optional(),
    city: z.string().max(100).nullable().optional(),
    country: z.string().max(2).nullable().optional(),
    isOnline: z.boolean().default(false),
    meetingUrl: httpUrl().nullable().optional(),
    registrationUrl: httpUrl().nullable().optional(),
    organizerName: z.string().trim().max(120).nullable().optional().describe('"Organized by", e.g. Innovation Hub'),
    organizerLogoUrl: httpUrl().nullable().optional().describe('Upload with purpose `event`, then pass the publicUrl'),
    organizerTagline: z.string().trim().max(120).nullable().optional().describe('Line under the organizer name, e.g. Creative Media'),
    capacity: z.number().int().positive().nullable().optional(),
    status: z.enum(['draft', 'published', 'cancelled']).default('draft'),
});

export const eventBody = eventFields
  .extend({ registrationUrl: httpUrl('Enter a valid registration link').describe('Required: the Register button opens it') })
  .refine((e) => new Date(e.endsAt) > new Date(e.startsAt), { message: 'End time must be after the start time', path: ['endsAt'] });

export const featuredDto = z
  .object({
    id: z.uuid(),
    title: z.string(),
    summary: z.string(),
    body: z.string(),
    coverUrl: z.string().nullable(),
    projectId: z.uuid().nullable(),
    position: z.number(),
    topics: z.array(topicDto).describe('Used by "Sort topics"'),
    media: z.array(mediaDto).describe('Image gallery (thumbnail strip on Featured View)'),
    shareUrl: z.string().describe('Share button'),
    publishedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'FeaturedInnovation' });

export const highlightDto = z
  .object({
    id: z.uuid(),
    title: z.string(),
    caption: z.string(),
    event: z.object({ id: z.uuid(), title: z.string(), category: eventCategory, startsAt: z.string(), endsAt: z.string() }).nullable().describe('The past event this album belongs to'),
    media: z.array(mediaDto),
    publishedAt: z.string().nullable(),
    createdAt: z.string(),
    createdBy: userSummary.nullable(),
  })
  .meta({ id: 'Highlight' });
