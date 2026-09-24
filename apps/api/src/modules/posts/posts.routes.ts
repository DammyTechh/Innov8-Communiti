import { and, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { forumMembers, follows, posts, postTopics, userInterests } from '../../db/schema/index.js';
import { cursorPageSchema, cursorQuery } from '../../lib/pagination.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, idParam, noContent } from '../_shared/dto.js';
import * as comments from './comments.service.js';
import { commentDto, createPostBody, likeResult, postDto } from './posts.schemas.js';
import * as svc from './posts.service.js';

const tags = ['Feed & Posts'];

export const postRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/feed', {
    schema: {
      tags,
      summary: 'Home feed',
      description:
        '`for-you`: everything you can see, weighted to people you follow, forums you joined and your interests. `following`: only people you follow (and you). `forums`: posts in forums you joined. Newest first.',
      security: auth,
      querystring: cursorQuery.extend({ tab: z.enum(['for-you', 'following', 'forums']).default('for-you') }),
      response: { 200: cursorPageSchema(postDto) },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const { tab, cursor, limit } = req.query;
      const followed = sql`(select ${follows.followingId} from ${follows} where ${follows.followerId} = ${me.id})`;
      const joined = sql`(select ${forumMembers.forumId} from ${forumMembers} where ${forumMembers.userId} = ${me.id})`;
      const interests = sql`(select ${userInterests.topicId} from ${userInterests} where ${userInterests.userId} = ${me.id})`;
      const where =
        tab === 'following'
          ? sql`(${posts.authorId} in ${followed} or ${posts.authorId} = ${me.id})`
          : tab === 'forums'
            ? sql`${posts.forumId} in ${joined}`
            : sql`(${posts.projectId} is null and (
                ${posts.authorId} in ${followed} or ${posts.authorId} = ${me.id} or ${posts.forumId} in ${joined}
                or exists (select 1 from ${postTopics} pt where pt.post_id = ${posts.id} and pt.topic_id in ${interests})
                or ${posts.audience} = 'everyone'))`;
      return svc.listPosts(me.id, where, cursor, limit);
    },
  });

  app.post('/posts', {
    preHandler: [app.requireMember],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    schema: { tags, summary: 'Create a post', security: auth, body: createPostBody, response: { 201: postDto } },
    handler: async (req, reply) => reply.status(201).send(await svc.createPost(currentUser(req).id, req.body)),
  });

  app.get('/posts/:id', {
    schema: { tags, summary: 'Get a post', security: auth, params: idParam, response: { 200: postDto } },
    handler: async (req) => svc.getPost(currentUser(req).id, req.params.id),
  });

  app.patch('/posts/:id', {
    schema: {
      tags,
      summary: 'Edit my post',
      security: auth,
      params: idParam,
      body: z.object({ body: z.string().max(5000).optional(), topicIds: z.array(z.uuid()).max(5).optional() }),
      response: { 200: postDto },
    },
    handler: async (req) => svc.updatePost(currentUser(req).id, req.params.id, req.body),
  });

  app.delete('/posts/:id', {
    schema: { tags, summary: 'Delete my post', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      await svc.deletePost(currentUser(req).id, req.params.id);
      return reply.status(204).send(null);
    },
  });

  app.post('/posts/:id/like', {
    schema: { tags, summary: 'Like a post', security: auth, params: idParam, response: { 200: likeResult } },
    handler: async (req) => svc.setLike(currentUser(req).id, req.params.id, true),
  });

  app.delete('/posts/:id/like', {
    schema: { tags, summary: 'Unlike a post', security: auth, params: idParam, response: { 200: likeResult } },
    handler: async (req) => svc.setLike(currentUser(req).id, req.params.id, false),
  });

  app.post('/posts/:id/share', {
    schema: {
      tags,
      summary: 'Record a share and get the share link',
      security: auth,
      params: idParam,
      response: { 200: z.object({ shareUrl: z.string(), shareCount: z.number() }) },
    },
    handler: async (req) => svc.sharePost(currentUser(req).id, req.params.id),
  });

  app.get('/users/:id/posts', {
    schema: { tags, summary: "A user's posts (profile Posts tab)", security: auth, params: idParam, querystring: cursorQuery, response: { 200: cursorPageSchema(postDto) } },
    handler: async (req) => svc.listPosts(currentUser(req).id, and(eq(posts.authorId, req.params.id), isNull(posts.projectId)), req.query.cursor, req.query.limit),
  });

  // ── Comments ──────────────────────────────────────────────────────────────

  app.get('/posts/:id/comments', {
    schema: {
      tags,
      summary: 'Top-level comments on a post',
      description: 'Each comment has `replyCount`; load replies with GET /comments/{id}/replies.',
      security: auth,
      params: idParam,
      querystring: cursorQuery.extend({ sort: z.enum(['top', 'newest', 'oldest']).default('top') }),
      response: { 200: cursorPageSchema(commentDto) },
    },
    handler: async (req) => comments.listComments(currentUser(req).id, req.params.id, req.query.sort, req.query.cursor, req.query.limit),
  });

  app.post('/posts/:id/comments', {
    preHandler: [app.requireMember],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: {
      tags,
      summary: 'Comment on a post, or reply to a comment',
      security: auth,
      params: idParam,
      body: z.object({ body: z.string().trim().min(1).max(2000), parentId: z.uuid().optional() }),
      response: { 201: commentDto },
    },
    handler: async (req, reply) => reply.status(201).send(await comments.createComment(currentUser(req).id, req.params.id, req.body.body, req.body.parentId)),
  });

  app.get('/comments/:id/replies', {
    schema: { tags, summary: 'Replies to a comment (oldest first)', security: auth, params: idParam, querystring: cursorQuery, response: { 200: cursorPageSchema(commentDto) } },
    handler: async (req) => comments.listReplies(currentUser(req).id, req.params.id, req.query.cursor, req.query.limit),
  });

  app.patch('/comments/:id', {
    schema: { tags, summary: 'Edit my comment', security: auth, params: idParam, body: z.object({ body: z.string().trim().min(1).max(2000) }), response: { 200: commentDto } },
    handler: async (req) => comments.updateComment(currentUser(req).id, req.params.id, req.body.body),
  });

  app.delete('/comments/:id', {
    schema: { tags, summary: 'Delete a comment (mine, or on my post)', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      await comments.deleteComment(currentUser(req).id, req.params.id);
      return reply.status(204).send(null);
    },
  });

  app.post('/comments/:id/like', {
    schema: { tags, summary: 'Like a comment', security: auth, params: idParam, response: { 200: likeResult } },
    handler: async (req) => comments.setCommentLike(currentUser(req).id, req.params.id, true),
  });

  app.delete('/comments/:id/like', {
    schema: { tags, summary: 'Unlike a comment', security: auth, params: idParam, response: { 200: likeResult } },
    handler: async (req) => comments.setCommentLike(currentUser(req).id, req.params.id, false),
  });
};

