import { and, count, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import {
  comments,
  forumMembers,
  forums,
  forumTopics,
  messages,
  moderationActions,
  postMedia,
  posts,
  projectMembers,
  projects,
  projectTopics,
  reports,
  topics,
  users,
} from '../../db/schema/index.js';
import { mediaDto, topicDto, userSummary } from '../_shared/dto.js';
import { attachmentsFor } from '../_shared/media.js';
import { loadUserSummaries, userSummaryCols } from '../_shared/users.js';
import { reportReasonEnum, reportTargetEnum } from '../reports/reports.routes.js';

/** What happened to a resolved report; null while pending. The queue's Status pill shows `outcome ?? status`. */
export const outcomeEnum = z.enum(['dismissed', 'content_removed', 'warned', 'restricted', 'suspended', 'blocked']);
const outcomeOf: Record<string, z.infer<typeof outcomeEnum>> = {
  dismiss: 'dismissed',
  remove_content: 'content_removed',
  warn: 'warned',
  restrict: 'restricted',
  suspend: 'suspended',
  block: 'blocked',
};

export const reportDto = z
  .object({
    id: z.uuid(),
    number: z.number().describe('Short number for "Report #2341"'),
    targetType: reportTargetEnum,
    targetId: z.uuid(),
    targetName: z.string().nullable().describe('Name / Title column: forum name, project title, or the reported person'),
    reason: reportReasonEnum,
    details: z.string().nullable(),
    status: z.enum(['pending', 'reviewed', 'dismissed']),
    outcome: outcomeEnum.nullable(),
    reportsCount: z.number().describe('All reports on the same item (Report Details → Reports count)'),
    reporter: userSummary.nullable(),
    targetUser: userSummary.nullable(),
    preview: z.string().nullable().describe('Short excerpt of the reported content'),
    resolution: z.string().nullable(),
    reviewedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'AdminReport' });

export const reportedContentDto = z
  .object({
    type: reportTargetEnum,
    id: z.uuid(),
    title: z.string().nullable().describe('Forum name or project title'),
    body: z.string().nullable().describe('Post/comment/message text, forum "About", project pitch, or user bio'),
    author: userSummary.nullable().describe('Post/comment author, message sender, forum/project owner, or the reported user'),
    coverUrl: z.string().nullable(),
    media: z.array(mediaDto),
    topics: z.array(topicDto).describe('Forum/project "Focus" tags'),
    memberCount: z.number().nullable(),
    members: z.array(userSummary).describe('Up to 5 members for the avatar stack'),
    likeCount: z.number().nullable(),
    commentCount: z.number().nullable(),
    status: z.string().nullable().describe('Forum/project moderation status'),
    removed: z.boolean(),
    createdAt: z.string().nullable(),
  })
  .meta({ id: 'ReportedContent' });

export const reportHistoryDto = z
  .object({
    previousReports: z.number(),
    previousWarnings: z.number(),
    accountStatus: z.string().describe("The person's account status, or the forum/project moderation status"),
  })
  .meta({ id: 'ReportHistory' });

async function previews(rows: { targetType: string; targetId: string }[]) {
  const by = (t: string) => rows.filter((r) => r.targetType === t).map((r) => r.targetId);
  const out = new Map<string, string>();
  const add = (list: { id: string; text: string | null }[]) => list.forEach((r) => out.set(r.id, (r.text ?? '').slice(0, 200)));
  const [p, c, f, pr, m] = [by('post'), by('comment'), by('forum'), by('project'), by('message')];
  if (p.length) add(await db.select({ id: posts.id, text: posts.body }).from(posts).where(inArray(posts.id, p)));
  if (c.length) add(await db.select({ id: comments.id, text: comments.body }).from(comments).where(inArray(comments.id, c)));
  if (f.length) add(await db.select({ id: forums.id, text: forums.name }).from(forums).where(inArray(forums.id, f)));
  if (pr.length) add(await db.select({ id: projects.id, text: projects.title }).from(projects).where(inArray(projects.id, pr)));
  if (m.length) add(await db.select({ id: messages.id, text: messages.body }).from(messages).where(inArray(messages.id, m)));
  return out;
}

export async function reportsOut(rows: (typeof reports.$inferSelect)[]) {
  if (!rows.length) return [];
  const targets = [...new Set(rows.map((r) => r.targetId))];
  const [people, texts, counts] = await Promise.all([
    loadUserSummaries(rows.flatMap((r) => [r.reporterId, r.targetUserId])),
    previews(rows),
    db.select({ targetId: reports.targetId, n: count() }).from(reports).where(inArray(reports.targetId, targets)).groupBy(reports.targetId),
  ]);
  return rows.map((r) => {
    const targetUser = r.targetUserId ? (people.get(r.targetUserId) ?? null) : null;
    const preview = texts.get(r.targetId) ?? null;
    return {
      ...r,
      reporter: people.get(r.reporterId) ?? null,
      targetUser,
      targetName: r.targetType === 'forum' || r.targetType === 'project' ? preview : (targetUser?.fullName ?? null),
      preview,
      outcome: r.status === 'pending' ? null : (outcomeOf[(r.resolution ?? '').split(':')[0]!] ?? (r.status === 'dismissed' ? 'dismissed' : null)),
      reportsCount: counts.find((c) => c.targetId === r.targetId)?.n ?? 1,
    };
  });
}

/** "Search reports": reported person's name, forum name, project title, or the report number. */
export function reportSearch(q: string) {
  const like = `%${q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  return or(
    sql`exists (select 1 from ${users} u where u.id = ${reports}.target_user_id and u.full_name ilike ${like})`,
    sql`exists (select 1 from ${forums} f where f.id = ${reports}.target_id and f.name ilike ${like})`,
    sql`exists (select 1 from ${projects} p where p.id = ${reports}.target_id and p.title ilike ${like})`,
    /^\d+$/.test(q) ? eq(reports.number, Number(q)) : undefined,
  );
}

const emptyContent = { title: null, body: null, author: null, coverUrl: null, media: [], topics: [], memberCount: null, members: [], likeCount: null, commentCount: null, status: null, removed: false, createdAt: null };

async function topicsOf(type: 'forum' | 'project', id: string) {
  const link = type === 'forum' ? forumTopics : projectTopics;
  const col = type === 'forum' ? forumTopics.forumId : projectTopics.projectId;
  return db.select({ id: topics.id, slug: topics.slug, name: topics.name }).from(link).innerJoin(topics, eq(topics.id, link.topicId)).where(eq(col, id));
}

/** Loads the reported item for the Review Report side panel. Removed items are still shown to moderators. */
export async function reportedContent(r: typeof reports.$inferSelect): Promise<z.infer<typeof reportedContentDto>> {
  const base = { ...emptyContent, type: r.targetType, id: r.targetId };
  const person = async (id: string | null) => (id ? ((await loadUserSummaries([id])).get(id) ?? null) : null);

  if (r.targetType === 'post') {
    const [p] = await db.select().from(posts).where(eq(posts.id, r.targetId));
    if (!p) return base;
    const media = await attachmentsFor(postMedia, { parent: postMedia.postId, media: postMedia.mediaId, position: postMedia.position }, [p.id]);
    return { ...base, body: p.body, author: await person(p.authorId), media: media.get(p.id) ?? [], likeCount: p.likeCount, commentCount: p.commentCount, removed: Boolean(p.removedAt || p.deletedAt), createdAt: p.createdAt };
  }
  if (r.targetType === 'comment') {
    const [c] = await db.select().from(comments).where(eq(comments.id, r.targetId));
    if (!c) return base;
    return { ...base, body: c.body, author: await person(c.authorId), likeCount: c.likeCount, removed: Boolean(c.removedAt || c.deletedAt), createdAt: c.createdAt };
  }
  if (r.targetType === 'message') {
    const [m] = await db.select().from(messages).where(eq(messages.id, r.targetId));
    if (!m) return base;
    return { ...base, body: m.body, author: await person(m.senderId), removed: Boolean(m.deletedAt), createdAt: m.createdAt };
  }
  if (r.targetType === 'forum' || r.targetType === 'project') {
    const isForum = r.targetType === 'forum';
    const [row] = isForum ? await db.select().from(forums).where(eq(forums.id, r.targetId)) : await db.select().from(projects).where(eq(projects.id, r.targetId));
    if (!row) return base;
    const members = isForum
      ? await db.select(userSummaryCols).from(forumMembers).innerJoin(users, eq(users.id, forumMembers.userId)).where(eq(forumMembers.forumId, row.id)).limit(5)
      : await db.select(userSummaryCols).from(projectMembers).innerJoin(users, eq(users.id, projectMembers.userId)).where(eq(projectMembers.projectId, row.id)).limit(5);
    return {
      ...base,
      title: 'name' in row ? row.name : row.title,
      body: 'about' in row ? row.about : row.pitch,
      author: await person(row.ownerId),
      coverUrl: row.coverUrl,
      topics: await topicsOf(r.targetType, row.id),
      memberCount: row.memberCount,
      members,
      status: row.moderationStatus,
      removed: Boolean(row.removedAt || row.deletedAt),
      createdAt: row.createdAt,
    };
  }
  // user
  const [u] = await db.select({ bio: users.bio, createdAt: users.createdAt, coverUrl: users.coverUrl }).from(users).where(eq(users.id, r.targetId));
  return { ...base, body: u?.bio ?? null, author: await person(r.targetId), coverUrl: u?.coverUrl ?? null, createdAt: u?.createdAt ?? null };
}

/** Report History block: earlier reports and warnings on the same person (or forum/project), and its current status. */
export async function reportHistory(r: typeof reports.$inferSelect): Promise<z.infer<typeof reportHistoryDto>> {
  if (r.targetType === 'forum' || r.targetType === 'project') {
    const table = r.targetType === 'forum' ? forums : projects;
    const [[prev], [warns], [row]] = await Promise.all([
      db.select({ n: count() }).from(reports).where(and(eq(reports.targetId, r.targetId), ne(reports.id, r.id))),
      db.select({ n: count() }).from(moderationActions).where(and(eq(moderationActions.targetId, r.targetId), eq(moderationActions.action, 'warn'))),
      db.select({ status: table.moderationStatus }).from(table).where(eq(table.id, r.targetId)),
    ]);
    return { previousReports: prev?.n ?? 0, previousWarnings: warns?.n ?? 0, accountStatus: row?.status ?? 'active' };
  }
  if (!r.targetUserId) return { previousReports: 0, previousWarnings: 0, accountStatus: 'active' };
  const [[prev], [warns], [u]] = await Promise.all([
    db.select({ n: count() }).from(reports).where(and(eq(reports.targetUserId, r.targetUserId), ne(reports.id, r.id))),
    db.select({ n: count() }).from(moderationActions).where(and(eq(moderationActions.targetUserId, r.targetUserId), eq(moderationActions.targetType, 'user'), eq(moderationActions.action, 'warn'))),
    db.select({ status: users.status }).from(users).where(eq(users.id, r.targetUserId)),
  ]);
  return { previousReports: prev?.n ?? 0, previousWarnings: warns?.n ?? 0, accountStatus: u?.status ?? 'active' };
}
