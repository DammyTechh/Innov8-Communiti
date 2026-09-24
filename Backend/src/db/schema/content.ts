import { type AnyPgColumn, bigint, index, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, pk, timestamps, ts } from './_helpers.js';
import { mediaKind, mediaStatus, mediaVisibility, postAudience } from './enums.js';
import { forums } from './forums.js';
import { projects } from './projects.js';
import { topics, users } from './users.js';

export const media = pgTable(
  'media',
  {
    id: pk(),
    ownerId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: mediaKind().notNull(),
    visibility: mediaVisibility().notNull().default('public'),
    storagePath: text().notNull().unique(),
    mimeType: text().notNull(),
    sizeBytes: bigint({ mode: 'number' }).notNull(),
    originalName: text(),
    width: integer(),
    height: integer(),
    durationSeconds: integer(),
    status: mediaStatus().notNull().default('pending'),
    createdAt: createdAt(),
  },
  (t) => [index('media_owner_idx').on(t.ownerId)],
);

export const posts = pgTable(
  'posts',
  {
    id: pk(),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    forumId: uuid().references(() => forums.id, { onDelete: 'cascade' }),
    projectId: uuid().references(() => projects.id, { onDelete: 'cascade' }),
    body: text().notNull().default(''),
    audience: postAudience().notNull().default('everyone'),
    likeCount: integer().notNull().default(0),
    commentCount: integer().notNull().default(0),
    shareCount: integer().notNull().default(0),
    editedAt: ts(),
    removedAt: ts(), // by moderation
    deletedAt: ts(), // by author
    ...timestamps(),
  },
  (t) => [
    index('posts_author_idx').on(t.authorId, t.id),
    index('posts_forum_idx').on(t.forumId, t.id),
    index('posts_project_idx').on(t.projectId, t.id),
  ],
);

export const postMedia = pgTable(
  'post_media',
  {
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    mediaId: uuid()
      .notNull()
      .references(() => media.id, { onDelete: 'cascade' }),
    position: integer().notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.postId, t.mediaId] })],
);

export const postTopics = pgTable(
  'post_topics',
  {
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    topicId: uuid()
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.postId, t.topicId] }), index('post_topics_topic_idx').on(t.topicId)],
);

export const postLikes = pgTable(
  'post_likes',
  {
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] }), index('post_likes_user_idx').on(t.userId)],
);

export const comments = pgTable(
  'comments',
  {
    id: pk(),
    postId: uuid()
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    authorId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: uuid().references((): AnyPgColumn => comments.id, { onDelete: 'cascade' }),
    body: text().notNull(),
    likeCount: integer().notNull().default(0),
    replyCount: integer().notNull().default(0),
    editedAt: ts(),
    removedAt: ts(),
    deletedAt: ts(),
    ...timestamps(),
  },
  (t) => [index('comments_post_idx').on(t.postId, t.id), index('comments_parent_idx').on(t.parentId)],
);

export const commentLikes = pgTable(
  'comment_likes',
  {
    commentId: uuid()
      .notNull()
      .references(() => comments.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId] })],
);
