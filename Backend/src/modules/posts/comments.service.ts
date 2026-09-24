import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { commentLikes, comments, posts, users } from '../../db/schema/index.js';
import { Errors } from '../../lib/errors.js';
import { toCursorPage } from '../../lib/pagination.js';
import { userSummaryCols } from '../_shared/users.js';
import { notify } from '../notifications/notifications.service.js';
import { canViewPost } from './posts.access.js';

const commentCols = {
  id: comments.id,
  postId: comments.postId,
  parentId: comments.parentId,
  body: comments.body,
  likeCount: comments.likeCount,
  replyCount: comments.replyCount,
  editedAt: comments.editedAt,
  createdAt: comments.createdAt,
  deletedAt: comments.deletedAt,
  author: userSummaryCols,
};

type Row = Awaited<ReturnType<typeof baseQuery>>[number];
const baseQuery = () => db.select(commentCols).from(comments).innerJoin(users, eq(users.id, comments.authorId));

async function withViewerState(rows: Row[], viewerId: string) {
  const ids = rows.map((r) => r.id);
  const liked = ids.length
    ? new Set((await db.select({ id: commentLikes.commentId }).from(commentLikes).where(and(inArray(commentLikes.commentId, ids), eq(commentLikes.userId, viewerId)))).map((l) => l.id))
    : new Set<string>();
  // Deleted comments that still have replies keep their place as a tombstone.
  return rows.map(({ deletedAt, ...r }) => ({ ...r, body: deletedAt ? '[deleted]' : r.body, isDeleted: Boolean(deletedAt), likedByMe: liked.has(r.id), isMine: r.author.id === viewerId }));
}

export async function listComments(viewerId: string, postId: string, sort: 'top' | 'newest' | 'oldest', cursor: string | undefined, limit: number) {
  if (!(await canViewPost(viewerId, postId))) throw Errors.notFound('Post');
  const base = and(eq(comments.postId, postId), isNull(comments.parentId), isNull(comments.removedAt), or(isNull(comments.deletedAt), sql`${comments.replyCount} > 0`));

  let rows: Row[];
  if (sort === 'top') {
    let after;
    if (cursor) {
      const [c] = await db.select({ likeCount: comments.likeCount }).from(comments).where(eq(comments.id, cursor));
      if (c) after = sql`(${comments.likeCount}, ${comments.id}) < (${c.likeCount}, ${cursor})`;
    }
    rows = await baseQuery().where(and(base, after)).orderBy(desc(comments.likeCount), desc(comments.id)).limit(limit + 1);
  } else if (sort === 'oldest') {
    rows = await baseQuery().where(and(base, cursor ? sql`${comments.id} > ${cursor}` : undefined)).orderBy(asc(comments.id)).limit(limit + 1);
  } else {
    rows = await baseQuery().where(and(base, cursor ? lt(comments.id, cursor) : undefined)).orderBy(desc(comments.id)).limit(limit + 1);
  }
  const page = toCursorPage(rows, limit);
  return { ...page, data: await withViewerState(page.data, viewerId) };
}

export async function listReplies(viewerId: string, commentId: string, cursor: string | undefined, limit: number) {
  const [parent] = await db.select({ postId: comments.postId, removedAt: comments.removedAt }).from(comments).where(eq(comments.id, commentId));
  // A comment removed by moderation takes its whole thread with it.
  if (!parent || parent.removedAt || !(await canViewPost(viewerId, parent.postId))) throw Errors.notFound('Comment');
  const rows = await baseQuery()
    .where(and(eq(comments.parentId, commentId), isNull(comments.deletedAt), isNull(comments.removedAt), cursor ? sql`${comments.id} > ${cursor}` : undefined))
    .orderBy(asc(comments.id))
    .limit(limit + 1);
  const page = toCursorPage(rows, limit);
  return { ...page, data: await withViewerState(page.data, viewerId) };
}

export async function createComment(userId: string, postId: string, body: string, parentId?: string) {
  if (!(await canViewPost(userId, postId))) throw Errors.notFound('Post');
  let parentAuthor: string | null = null;
  if (parentId) {
    const [p] = await db.select().from(comments).where(eq(comments.id, parentId));
    if (!p || p.postId !== postId || p.deletedAt || p.removedAt) throw Errors.notFound('Comment');
    // One level of replies: replying to a reply attaches to its top-level comment.
    parentId = p.parentId ?? p.id;
    parentAuthor = p.authorId;
  }
  const id = await db.transaction(async (tx) => {
    const [c] = await tx.insert(comments).values({ postId, authorId: userId, body: body.trim(), parentId: parentId ?? null }).returning({ id: comments.id });
    await tx.update(posts).set({ commentCount: sql`${posts.commentCount} + 1` }).where(eq(posts.id, postId));
    if (parentId) await tx.update(comments).set({ replyCount: sql`${comments.replyCount} + 1` }).where(eq(comments.id, parentId));
    return c!.id;
  });

  const [[post], [actor]] = await Promise.all([
    db.select({ authorId: posts.authorId }).from(posts).where(eq(posts.id, postId)),
    db.select({ fullName: users.fullName }).from(users).where(eq(users.id, userId)),
  ]);
  const snippet = body.trim().slice(0, 120);
  if (parentAuthor) await notify([parentAuthor], { type: 'comment_reply', actorId: userId, targetType: 'post', targetId: postId, title: `${actor?.fullName} replied to your comment`, body: snippet, data: { commentId: id } });
  if (post && post.authorId !== parentAuthor) await notify([post.authorId], { type: 'post_comment', actorId: userId, targetType: 'post', targetId: postId, title: `${actor?.fullName} commented on your post`, body: snippet, data: { commentId: id } });

  const [row] = await baseQuery().where(eq(comments.id, id));
  return (await withViewerState([row!], userId))[0]!;
}

export async function updateComment(userId: string, commentId: string, body: string) {
  const [c] = await db.select().from(comments).where(eq(comments.id, commentId));
  if (!c || c.deletedAt || c.removedAt) throw Errors.notFound('Comment');
  if (c.authorId !== userId) throw Errors.forbidden('You can only edit your own comments');
  await db.update(comments).set({ body: body.trim(), editedAt: new Date().toISOString() }).where(eq(comments.id, commentId));
  const [row] = await baseQuery().where(eq(comments.id, commentId));
  return (await withViewerState([row!], userId))[0]!;
}

export async function deleteComment(userId: string, commentId: string) {
  const [c] = await db.select().from(comments).where(eq(comments.id, commentId));
  if (!c || c.deletedAt) throw Errors.notFound('Comment');
  const [post] = await db.select({ authorId: posts.authorId }).from(posts).where(eq(posts.id, c.postId));
  // Comment author or the post author may delete.
  if (c.authorId !== userId && post?.authorId !== userId) throw Errors.forbidden();
  await db.transaction(async (tx) => {
    await tx.update(comments).set({ deletedAt: new Date().toISOString() }).where(eq(comments.id, commentId));
    await tx.update(posts).set({ commentCount: sql`greatest(${posts.commentCount} - 1, 0)` }).where(eq(posts.id, c.postId));
    if (c.parentId) await tx.update(comments).set({ replyCount: sql`greatest(${comments.replyCount} - 1, 0)` }).where(eq(comments.id, c.parentId));
  });
}

export async function setCommentLike(userId: string, commentId: string, like: boolean) {
  const [c] = await db.select({ postId: comments.postId }).from(comments).where(and(eq(comments.id, commentId), isNull(comments.deletedAt), isNull(comments.removedAt)));
  if (!c || !(await canViewPost(userId, c.postId))) throw Errors.notFound('Comment');
  await db.transaction(async (tx) => {
    if (like) {
      const [r] = await tx.insert(commentLikes).values({ commentId, userId }).onConflictDoNothing().returning();
      if (r) await tx.update(comments).set({ likeCount: sql`${comments.likeCount} + 1` }).where(eq(comments.id, commentId));
    } else {
      const [r] = await tx.delete(commentLikes).where(and(eq(commentLikes.commentId, commentId), eq(commentLikes.userId, userId))).returning();
      if (r) await tx.update(comments).set({ likeCount: sql`greatest(${comments.likeCount} - 1, 0)` }).where(eq(comments.id, commentId));
    }
  });
  const [r] = await db.select({ likeCount: comments.likeCount }).from(comments).where(eq(comments.id, commentId));
  return { liked: like, likeCount: r?.likeCount ?? 0 };
}
