import { and, desc, eq, inArray, lt, sql, type SQL } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { forumMembers, forums, postLikes, postMedia, posts, postTopics, projectMembers, topics, users } from '../../db/schema/index.js';
import { Errors } from '../../lib/errors.js';
import { toCursorPage } from '../../lib/pagination.js';
import { attachmentsFor, assertOwnedReadyMedia } from '../_shared/media.js';
import { userSummaryCols } from '../_shared/users.js';
import { notify } from '../notifications/notifications.service.js';
import { canViewPost, visiblePostsFor } from './posts.access.js';

const postCols = {
  id: posts.id,
  body: posts.body,
  audience: posts.audience,
  forumId: posts.forumId,
  projectId: posts.projectId,
  likeCount: posts.likeCount,
  commentCount: posts.commentCount,
  shareCount: posts.shareCount,
  editedAt: posts.editedAt,
  createdAt: posts.createdAt,
  author: userSummaryCols,
};

type PostRow = { id: string; forumId: string | null; author: { id: string } } & Record<string, unknown>;

/** Adds media, topics, forum name and viewer state (liked, isMine) to post rows in 4 batched queries. */
export async function hydratePosts<T extends PostRow>(rows: T[], viewerId: string) {
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [mediaMap, topicRows, liked, forumRows] = await Promise.all([
    attachmentsFor(postMedia, { parent: postMedia.postId, media: postMedia.mediaId, position: postMedia.position }, ids),
    db
      .select({ postId: postTopics.postId, id: topics.id, slug: topics.slug, name: topics.name })
      .from(postTopics)
      .innerJoin(topics, eq(topics.id, postTopics.topicId))
      .where(inArray(postTopics.postId, ids)),
    db.select({ postId: postLikes.postId }).from(postLikes).where(and(inArray(postLikes.postId, ids), eq(postLikes.userId, viewerId))),
    (() => {
      const fids = [...new Set(rows.map((r) => r.forumId).filter(Boolean))] as string[];
      return fids.length ? db.select({ id: forums.id, name: forums.name, slug: forums.slug }).from(forums).where(inArray(forums.id, fids)) : [];
    })(),
  ]);
  const likedSet = new Set(liked.map((l) => l.postId));
  return rows.map((r) => ({
    ...r,
    media: mediaMap.get(r.id) ?? [],
    topics: topicRows.filter((t) => t.postId === r.id).map(({ postId: _p, ...t }) => t),
    forum: forumRows.find((f) => f.id === r.forumId) ?? null,
    likedByMe: likedSet.has(r.id),
    isMine: r.author.id === viewerId,
    shareUrl: `${env.WEB_URL}/posts/${r.id}`,
  }));
}

export async function listPosts(viewerId: string, where: SQL | undefined, cursor: string | undefined, limit: number) {
  const rows = await db
    .select(postCols)
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .where(and(visiblePostsFor(viewerId), where, cursor ? lt(posts.id, cursor) : undefined))
    .orderBy(desc(posts.id))
    .limit(limit + 1);
  const page = toCursorPage(rows, limit);
  return { ...page, data: await hydratePosts(page.data, viewerId) };
}

export async function getPost(viewerId: string, postId: string) {
  if (!(await canViewPost(viewerId, postId))) throw Errors.notFound('Post');
  const [row] = await db.select(postCols).from(posts).innerJoin(users, eq(users.id, posts.authorId)).where(eq(posts.id, postId));
  if (!row) throw Errors.notFound('Post');
  return (await hydratePosts([row], viewerId))[0]!;
}

export interface CreatePostInput {
  body: string;
  mediaIds: string[];
  topicIds: string[];
  audience: 'everyone' | 'followers' | 'forum' | 'project';
  forumId?: string;
  projectId?: string;
}

export async function createPost(authorId: string, input: CreatePostInput) {
  if (!input.body.trim() && input.mediaIds.length === 0) throw Errors.validation('Write something or add a photo', { body: 'Required' });
  let audience = input.audience;
  if (input.forumId) {
    const [m] = await db.select().from(forumMembers).where(and(eq(forumMembers.forumId, input.forumId), eq(forumMembers.userId, authorId)));
    if (!m) throw Errors.forbidden('Join this forum to post in it');
    audience = audience === 'everyone' ? 'everyone' : 'forum';
  }
  if (input.projectId) {
    const [m] = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, authorId)));
    if (!m) throw Errors.forbidden('Only project members can post here');
    audience = 'project';
  }

  const id = await db.transaction(async (tx) => {
    await assertOwnedReadyMedia(authorId, input.mediaIds, tx, ['image', 'video']);
    const [p] = await tx
      .insert(posts)
      .values({ authorId, body: input.body.trim(), audience, forumId: input.forumId ?? null, projectId: input.projectId ?? null })
      .returning({ id: posts.id });
    if (input.mediaIds.length) await tx.insert(postMedia).values(input.mediaIds.map((mediaId, position) => ({ postId: p!.id, mediaId, position })));
    if (input.topicIds.length) await tx.insert(postTopics).values([...new Set(input.topicIds)].map((topicId) => ({ postId: p!.id, topicId })));
    await tx.update(users).set({ postCount: sql`${users.postCount} + 1` }).where(eq(users.id, authorId));
    if (input.forumId) await tx.update(forums).set({ postCount: sql`${forums.postCount} + 1` }).where(eq(forums.id, input.forumId));
    return p!.id;
  });
  return getPost(authorId, id);
}

export async function updatePost(userId: string, postId: string, patch: { body?: string; topicIds?: string[] }) {
  const [p] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!p || p.deletedAt || p.removedAt) throw Errors.notFound('Post');
  if (p.authorId !== userId) throw Errors.forbidden('You can only edit your own posts');
  await db.transaction(async (tx) => {
    if (patch.body !== undefined) await tx.update(posts).set({ body: patch.body.trim(), editedAt: new Date().toISOString() }).where(eq(posts.id, postId));
    if (patch.topicIds) {
      await tx.delete(postTopics).where(eq(postTopics.postId, postId));
      if (patch.topicIds.length) await tx.insert(postTopics).values([...new Set(patch.topicIds)].map((topicId) => ({ postId, topicId })));
    }
  });
  return getPost(userId, postId);
}

export async function deletePost(userId: string, postId: string) {
  const [p] = await db.select().from(posts).where(eq(posts.id, postId));
  if (!p || p.deletedAt) throw Errors.notFound('Post');
  if (p.authorId !== userId) throw Errors.forbidden('You can only delete your own posts');
  await db.transaction(async (tx) => {
    await tx.update(posts).set({ deletedAt: new Date().toISOString() }).where(eq(posts.id, postId));
    await tx.update(users).set({ postCount: sql`greatest(${users.postCount} - 1, 0)` }).where(eq(users.id, userId));
    if (p.forumId) await tx.update(forums).set({ postCount: sql`greatest(${forums.postCount} - 1, 0)` }).where(eq(forums.id, p.forumId));
  });
}

export async function setLike(userId: string, postId: string, like: boolean) {
  if (!(await canViewPost(userId, postId))) throw Errors.notFound('Post');
  const changed = await db.transaction(async (tx) => {
    if (like) {
      const [r] = await tx.insert(postLikes).values({ postId, userId }).onConflictDoNothing().returning();
      if (r) await tx.update(posts).set({ likeCount: sql`${posts.likeCount} + 1` }).where(eq(posts.id, postId));
      return Boolean(r);
    }
    const [r] = await tx.delete(postLikes).where(and(eq(postLikes.postId, postId), eq(postLikes.userId, userId))).returning();
    if (r) await tx.update(posts).set({ likeCount: sql`greatest(${posts.likeCount} - 1, 0)` }).where(eq(posts.id, postId));
    return Boolean(r);
  });
  const [p] = await db.select({ likeCount: posts.likeCount, authorId: posts.authorId }).from(posts).where(eq(posts.id, postId));
  if (like && changed && p) {
    const [actor] = await db.select({ fullName: users.fullName }).from(users).where(eq(users.id, userId));
    await notify([p.authorId], { type: 'post_like', actorId: userId, targetType: 'post', targetId: postId, title: `${actor?.fullName} liked your post`, push: false });
  }
  return { liked: like, likeCount: p?.likeCount ?? 0 };
}

export async function sharePost(userId: string, postId: string) {
  if (!(await canViewPost(userId, postId))) throw Errors.notFound('Post');
  const [p] = await db.update(posts).set({ shareCount: sql`${posts.shareCount} + 1` }).where(eq(posts.id, postId)).returning({ shareCount: posts.shareCount });
  return { shareUrl: `${env.WEB_URL}/posts/${postId}`, shareCount: p?.shareCount ?? 0 };
}
