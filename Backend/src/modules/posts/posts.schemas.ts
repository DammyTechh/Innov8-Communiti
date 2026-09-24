import { z } from 'zod';
import { mediaDto, topicDto, userSummary } from '../_shared/dto.js';

export const postDto = z
  .object({
    id: z.uuid(),
    author: userSummary,
    body: z.string(),
    audience: z.enum(['everyone', 'followers', 'forum', 'project']),
    forum: z.object({ id: z.uuid(), name: z.string(), slug: z.string() }).nullable(),
    projectId: z.uuid().nullable(),
    media: z.array(mediaDto),
    topics: z.array(topicDto),
    likeCount: z.number(),
    commentCount: z.number(),
    shareCount: z.number(),
    likedByMe: z.boolean(),
    isMine: z.boolean(),
    shareUrl: z.string(),
    editedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'Post' });

export const commentDto = z
  .object({
    id: z.uuid(),
    postId: z.uuid(),
    parentId: z.uuid().nullable(),
    author: userSummary,
    body: z.string(),
    likeCount: z.number(),
    replyCount: z.number(),
    likedByMe: z.boolean(),
    isMine: z.boolean(),
    isDeleted: z.boolean(),
    editedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'Comment' });

export const likeResult = z.object({ liked: z.boolean(), likeCount: z.number() });

export const createPostBody = z.object({
  body: z.string().max(5000).default(''),
  mediaIds: z.array(z.uuid()).max(10).default([]),
  topicIds: z.array(z.uuid()).max(5).default([]),
  audience: z.enum(['everyone', 'followers', 'forum', 'project']).default('everyone').describe('Figma composer "Everyone" dropdown'),
  forumId: z.uuid().optional(),
  projectId: z.uuid().optional(),
});
