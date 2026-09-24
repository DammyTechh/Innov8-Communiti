import { and, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { conversationMembers, conversations, follows, messageMedia, messages, projects, userSettings, users } from '../../db/schema/index.js';
import { Errors } from '../../lib/errors.js';
import { cursorPageSchema, cursorQuery, toCursorPage } from '../../lib/pagination.js';
import { broadcast } from '../../lib/realtime.js';
import { currentUser } from '../../plugins/auth.js';
import { auth, idParam, mediaDto, noContent, userSummary } from '../_shared/dto.js';
import { assertOwnedReadyMedia, attachmentsFor } from '../_shared/media.js';
import { loadUserSummaries, userSummaryCols } from '../_shared/users.js';
import { notify } from '../notifications/notifications.service.js';

const tags = ['Chat'];
const EDIT_WINDOW_MS = 15 * 60_000;

const conversationDto = z
  .object({
    id: z.uuid(),
    kind: z.enum(['direct', 'project']),
    title: z.string(),
    avatarUrl: z.string().nullable(),
    otherUser: userSummary.nullable(),
    project: z.object({ id: z.uuid(), title: z.string(), coverUrl: z.string().nullable() }).nullable(),
    lastMessagePreview: z.string().nullable(),
    lastMessageAt: z.string().nullable(),
    unreadCount: z.number(),
    mutedUntil: z.string().nullable(),
  })
  .meta({ id: 'Conversation' });

const messageDto = z
  .object({
    id: z.uuid(),
    conversationId: z.uuid(),
    sender: userSummary.nullable(),
    kind: z.enum(['text', 'image', 'file', 'voice', 'system']),
    body: z.string().nullable(),
    media: z.array(mediaDto),
    replyTo: z.object({ id: z.uuid(), body: z.string().nullable(), senderName: z.string().nullable() }).nullable(),
    isMine: z.boolean(),
    isDeleted: z.boolean(),
    editedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .meta({ id: 'Message' });

async function membership(conversationId: string, userId: string) {
  const [m] = await db
    .select({ member: conversationMembers, conversation: conversations })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)));
  if (!m) throw Errors.notFound('Conversation');
  return m;
}

async function conversationCards(rows: { conversation: typeof conversations.$inferSelect; member: typeof conversationMembers.$inferSelect }[], viewerId: string) {
  const ids = rows.map((r) => r.conversation.id);
  if (!ids.length) return [];
  const directIds = rows.filter((r) => r.conversation.kind === 'direct').map((r) => r.conversation.id);
  const projectIds = rows.map((r) => r.conversation.projectId).filter(Boolean) as string[];
  const [others, projectRows] = await Promise.all([
    directIds.length
      ? db.select({ conversationId: conversationMembers.conversationId, user: userSummaryCols }).from(conversationMembers).innerJoin(users, eq(users.id, conversationMembers.userId)).where(and(inArray(conversationMembers.conversationId, directIds), ne(conversationMembers.userId, viewerId)))
      : [],
    projectIds.length ? db.select({ id: projects.id, title: projects.title, coverUrl: projects.coverUrl }).from(projects).where(inArray(projects.id, projectIds)) : [],
  ]);
  return rows.map(({ conversation: c, member: m }) => {
    const other = others.find((o) => o.conversationId === c.id)?.user ?? null;
    const project = projectRows.find((p) => p.id === c.projectId) ?? null;
    const cleared = m.clearedAt && c.lastMessageAt && m.clearedAt >= c.lastMessageAt;
    return {
      id: c.id,
      kind: c.kind,
      title: c.kind === 'direct' ? (other?.fullName ?? 'Deleted user') : (project?.title ?? 'Project'),
      avatarUrl: c.kind === 'direct' ? (other?.avatarUrl ?? null) : (project?.coverUrl ?? null),
      otherUser: other,
      project,
      lastMessagePreview: cleared ? null : c.lastMessagePreview,
      lastMessageAt: c.lastMessageAt,
      unreadCount: m.unreadCount,
      mutedUntil: m.mutedUntil,
    };
  });
}

async function messagesOut(rows: (typeof messages.$inferSelect)[], viewerId: string) {
  const ids = rows.map((r) => r.id);
  const replyIds = rows.map((r) => r.replyToId).filter(Boolean) as string[];
  const [media, replies] = await Promise.all([
    attachmentsFor(messageMedia, { parent: messageMedia.messageId, media: messageMedia.mediaId, position: messageMedia.position }, ids),
    replyIds.length ? db.select({ id: messages.id, body: messages.body, deletedAt: messages.deletedAt, senderId: messages.senderId }).from(messages).where(inArray(messages.id, replyIds)) : [],
  ]);
  const people = await loadUserSummaries([...rows.map((r) => r.senderId), ...replies.map((r) => r.senderId)]);
  return rows.map((r) => {
    const reply = replies.find((x) => x.id === r.replyToId);
    return {
      id: r.id,
      conversationId: r.conversationId,
      sender: r.senderId ? (people.get(r.senderId) ?? null) : null,
      kind: r.kind,
      body: r.deletedAt ? null : r.body,
      media: r.deletedAt ? [] : (media.get(r.id) ?? []),
      replyTo: reply ? { id: reply.id, body: reply.deletedAt ? null : reply.body, senderName: reply.senderId ? (people.get(reply.senderId)?.fullName ?? null) : null } : null,
      isMine: r.senderId === viewerId,
      isDeleted: Boolean(r.deletedAt),
      editedAt: r.editedAt,
      createdAt: r.createdAt,
    };
  });
}

export const chatRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/conversations', {
    schema: {
      tags,
      summary: 'My conversations (most recent first)',
      security: auth,
      querystring: cursorQuery.extend({ filter: z.enum(['all', 'direct', 'project', 'unread']).default('all'), q: z.string().trim().max(80).optional() }),
      response: { 200: cursorPageSchema(conversationDto) },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const { filter, cursor, limit, q } = req.query;
      const activity = sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`;
      let after;
      if (cursor) {
        const [c] = await db.select({ at: sql<string>`${activity}` }).from(conversations).where(eq(conversations.id, cursor));
        if (c) after = sql`(${activity}, ${conversations.id}) < (${c.at}::timestamptz, ${cursor}::uuid)`;
      }
      const rows = await db
        .select({ conversation: conversations, member: conversationMembers })
        .from(conversationMembers)
        .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
        .where(
          and(
            eq(conversationMembers.userId, me.id),
            // Parenthesised on purpose: drizzle's and() does not wrap raw SQL, so a bare OR would escape the user filter.
            sql`(${conversations.lastMessageAt} is not null or ${conversations.kind} = 'project')`,
            sql`(${conversations.projectId} is null or exists (select 1 from ${projects} p where p.id = ${conversations.projectId} and p.deleted_at is null))`,
            filter === 'direct' || filter === 'project' ? eq(conversations.kind, filter) : undefined,
            filter === 'unread' ? gt(conversationMembers.unreadCount, 0) : undefined,
            after,
          ),
        )
        .orderBy(desc(activity), desc(conversations.id))
        .limit(limit + 1);
      const page = toCursorPage(rows.map((r) => ({ ...r, id: r.conversation.id })), limit);
      let data = await conversationCards(page.data, me.id);
      if (q) data = data.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));
      return { data, nextCursor: page.nextCursor };
    },
  });

  app.get('/conversations/unread-count', {
    schema: { tags, summary: 'Total unread messages (badge)', security: auth, response: { 200: z.object({ count: z.number() }) } },
    handler: async (req) => {
      const [r] = await db.select({ n: sql<number>`coalesce(sum(${conversationMembers.unreadCount}), 0)::int` }).from(conversationMembers).where(eq(conversationMembers.userId, currentUser(req).id));
      return { count: r?.n ?? 0 };
    },
  });

  app.post('/conversations/direct', {
    preHandler: [app.requireMember],
    schema: {
      tags,
      summary: 'Open (or create) a direct conversation with a user',
      description: "Respects the other user's message permission setting (everyone, people they follow, nobody).",
      security: auth,
      body: z.object({ userId: z.uuid() }),
      response: { 200: conversationDto },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const otherId = req.body.userId;
      if (otherId === me.id) throw Errors.badRequest('You cannot message yourself');
      const [other] = await db
        .select({ id: users.id, permission: userSettings.messagePermission })
        .from(users)
        .leftJoin(userSettings, eq(userSettings.userId, users.id))
        .where(and(eq(users.id, otherId), isNull(users.deletedAt), ne(users.status, 'blocked')));
      if (!other) throw Errors.notFound('User');

      const directKey = [me.id, otherId].sort().join(':');
      let [conv] = await db.select().from(conversations).where(eq(conversations.directKey, directKey));
      if (!conv) {
        if (other.permission === 'none') throw Errors.forbidden('This person is not accepting messages');
        if (other.permission === 'following') {
          const [f] = await db.select().from(follows).where(and(eq(follows.followerId, otherId), eq(follows.followingId, me.id)));
          if (!f) throw Errors.forbidden('This person only accepts messages from people they follow');
        }
        conv = await db.transaction(async (tx) => {
          const [c] = await tx.insert(conversations).values({ kind: 'direct', directKey }).onConflictDoNothing().returning();
          const created = c ?? (await tx.select().from(conversations).where(eq(conversations.directKey, directKey)))[0]!;
          await tx.insert(conversationMembers).values([{ conversationId: created.id, userId: me.id }, { conversationId: created.id, userId: otherId }]).onConflictDoNothing();
          return created;
        });
      }
      const m = await membership(conv.id, me.id);
      return (await conversationCards([m], me.id))[0]!;
    },
  });

  app.get('/conversations/:id', {
    schema: { tags, summary: 'Conversation details with members', security: auth, params: idParam, response: { 200: conversationDto.extend({ members: z.array(userSummary) }) } },
    handler: async (req) => {
      const me = currentUser(req);
      const m = await membership(req.params.id, me.id);
      const members = await db.select(userSummaryCols).from(conversationMembers).innerJoin(users, eq(users.id, conversationMembers.userId)).where(eq(conversationMembers.conversationId, req.params.id));
      return { ...(await conversationCards([m], me.id))[0]!, members };
    },
  });

  app.get('/conversations/:id/messages', {
    schema: {
      tags,
      summary: 'Messages (newest first; page backwards with the cursor)',
      description: 'Live updates: subscribe to the Supabase Realtime private channel `conversation:<id>` (events `message:new`, `message:updated`, `message:deleted`, `read`).',
      security: auth,
      params: idParam,
      querystring: cursorQuery.extend({ limit: z.coerce.number().int().min(1).max(100).default(30) }),
      response: { 200: cursorPageSchema(messageDto) },
    },
    handler: async (req) => {
      const me = currentUser(req);
      const { member } = await membership(req.params.id, me.id);
      const rows = await db
        .select()
        .from(messages)
        .where(and(eq(messages.conversationId, req.params.id), member.clearedAt ? gt(messages.createdAt, member.clearedAt) : undefined, req.query.cursor ? lt(messages.id, req.query.cursor) : undefined))
        .orderBy(desc(messages.id))
        .limit(req.query.limit + 1);
      const page = toCursorPage(rows, req.query.limit);
      return { ...page, data: await messagesOut(page.data, me.id) };
    },
  });

  app.post('/conversations/:id/messages', {
    preHandler: [app.requireMember],
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    schema: {
      tags,
      summary: 'Send a message',
      security: auth,
      params: idParam,
      body: z.object({
        body: z.string().trim().max(4000).optional(),
        mediaIds: z.array(z.uuid()).max(10).default([]),
        replyToId: z.uuid().optional(),
        clientId: z.string().max(64).optional().describe('Echoed in the realtime event so the sender can reconcile its optimistic message'),
      }),
      response: { 201: messageDto },
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const { conversation } = await membership(req.params.id, me.id);
      const b = req.body;
      if (!b.body && !b.mediaIds.length) throw Errors.validation('Write a message or attach a file', { body: 'Required' });

      const row = await db.transaction(async (tx) => {
        const files = await assertOwnedReadyMedia(me.id, b.mediaIds, tx);
        const kind = !files.length ? 'text' : files.every((f) => f.kind === 'image') ? 'image' : files.some((f) => f.kind === 'audio') && !b.body ? 'voice' : 'file';
        if (b.replyToId) {
          const [r] = await tx.select({ id: messages.id }).from(messages).where(and(eq(messages.id, b.replyToId), eq(messages.conversationId, conversation.id)));
          if (!r) throw Errors.notFound('Replied message');
        }
        const [msg] = await tx.insert(messages).values({ conversationId: conversation.id, senderId: me.id, kind, body: b.body ?? null, replyToId: b.replyToId ?? null }).returning();
        if (files.length) await tx.insert(messageMedia).values(files.map((f, position) => ({ messageId: msg!.id, mediaId: f.id, position })));
        const preview = b.body ? b.body.slice(0, 120) : kind === 'image' ? 'Photo' : kind === 'voice' ? 'Voice note' : 'Attachment';
        await tx.update(conversations).set({ lastMessageAt: msg!.createdAt, lastMessagePreview: preview, lastMessageSenderId: me.id }).where(eq(conversations.id, conversation.id));
        await tx
          .update(conversationMembers)
          .set({ unreadCount: sql`${conversationMembers.unreadCount} + 1` })
          .where(and(eq(conversationMembers.conversationId, conversation.id), ne(conversationMembers.userId, me.id)));
        await tx.update(conversationMembers).set({ lastReadMessageId: msg!.id, lastReadAt: msg!.createdAt, unreadCount: 0 }).where(and(eq(conversationMembers.conversationId, conversation.id), eq(conversationMembers.userId, me.id)));
        return { msg: msg!, preview };
      });

      const [out] = await messagesOut([row.msg], me.id);
      await broadcast([{ topic: `conversation:${conversation.id}`, event: 'message:new', payload: { ...out, isMine: false, clientId: b.clientId ?? null } }]);

      const recipients = await db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(and(eq(conversationMembers.conversationId, conversation.id), ne(conversationMembers.userId, me.id), or(isNull(conversationMembers.mutedUntil), lt(conversationMembers.mutedUntil, new Date().toISOString()))));
      await notify(recipients.map((r) => r.userId), {
        type: 'message',
        actorId: me.id,
        targetType: 'conversation',
        targetId: conversation.id,
        title: out!.sender?.fullName ?? 'New message',
        body: row.preview,
        inApp: false,
      });
      return reply.status(201).send(out!);
    },
  });

  app.patch('/messages/:id', {
    schema: { tags, summary: 'Edit my message (within 15 minutes)', security: auth, params: idParam, body: z.object({ body: z.string().trim().min(1).max(4000) }), response: { 200: messageDto } },
    handler: async (req) => {
      const me = currentUser(req);
      const [m] = await db.select().from(messages).where(and(eq(messages.id, req.params.id), eq(messages.senderId, me.id), isNull(messages.deletedAt)));
      if (!m) throw Errors.notFound('Message');
      if (Date.now() - new Date(m.createdAt).getTime() > EDIT_WINDOW_MS) throw Errors.forbidden('Messages can only be edited for 15 minutes');
      const [u] = await db.update(messages).set({ body: req.body.body, editedAt: new Date().toISOString() }).where(eq(messages.id, m.id)).returning();
      const [out] = await messagesOut([u!], me.id);
      await broadcast([{ topic: `conversation:${m.conversationId}`, event: 'message:updated', payload: { ...out, isMine: false } }]);
      return out!;
    },
  });

  app.delete('/messages/:id', {
    schema: { tags, summary: 'Delete my message for everyone', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      const me = currentUser(req);
      const [m] = await db.update(messages).set({ deletedAt: new Date().toISOString() }).where(and(eq(messages.id, req.params.id), eq(messages.senderId, me.id), isNull(messages.deletedAt))).returning();
      if (!m) throw Errors.notFound('Message');
      await broadcast([{ topic: `conversation:${m.conversationId}`, event: 'message:deleted', payload: { id: m.id } }]);
      return reply.status(204).send(null);
    },
  });

  app.post('/conversations/:id/read', {
    schema: { tags, summary: 'Mark the conversation as read', security: auth, params: idParam, body: z.object({ messageId: z.uuid().optional() }).nullish(), response: noContent },
    handler: async (req, reply) => {
      const me = currentUser(req);
      await membership(req.params.id, me.id);
      const [last] = req.body?.messageId
        ? [{ id: req.body.messageId }]
        : await db.select({ id: messages.id }).from(messages).where(eq(messages.conversationId, req.params.id)).orderBy(desc(messages.id)).limit(1);
      await db
        .update(conversationMembers)
        .set({ unreadCount: 0, lastReadAt: new Date().toISOString(), lastReadMessageId: last?.id ?? null })
        .where(and(eq(conversationMembers.conversationId, req.params.id), eq(conversationMembers.userId, me.id)));
      await broadcast([{ topic: `conversation:${req.params.id}`, event: 'read', payload: { userId: me.id, messageId: last?.id ?? null } }]);
      return reply.status(204).send(null);
    },
  });

  app.post('/conversations/:id/mute', {
    schema: {
      tags,
      summary: 'Mute or unmute notifications for a conversation',
      security: auth,
      params: idParam,
      body: z.object({ until: z.iso.datetime().nullable().describe('null to unmute; far-future date for "always"') }),
      response: noContent,
    },
    handler: async (req, reply) => {
      const me = currentUser(req);
      await membership(req.params.id, me.id);
      await db.update(conversationMembers).set({ mutedUntil: req.body.until }).where(and(eq(conversationMembers.conversationId, req.params.id), eq(conversationMembers.userId, me.id)));
      return reply.status(204).send(null);
    },
  });

  app.delete('/conversations/:id/messages', {
    schema: { tags, summary: 'Clear chat history for me only', security: auth, params: idParam, response: noContent },
    handler: async (req, reply) => {
      const me = currentUser(req);
      await membership(req.params.id, me.id);
      await db.update(conversationMembers).set({ clearedAt: new Date().toISOString(), unreadCount: 0 }).where(and(eq(conversationMembers.conversationId, req.params.id), eq(conversationMembers.userId, me.id)));
      return reply.status(204).send(null);
    },
  });
};
