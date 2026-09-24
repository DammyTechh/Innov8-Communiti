import { and, count, desc, eq, inArray, isNull, lt } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { notifications, pushTokens, userSettings, users } from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { sendMailSafe, type Template } from '../../lib/mailer/index.js';
import { broadcast } from '../../lib/realtime.js';

export type NotificationType =
  | 'follow'
  | 'post_like'
  | 'post_comment'
  | 'comment_reply'
  | 'mention'
  | 'forum_join'
  | 'project_invite'
  | 'project_join_request'
  | 'project_join_accepted'
  | 'project_join_declined'
  | 'task_assigned'
  | 'task_completed'
  | 'expert_evaluation'
  | 'research_comment'
  | 'prototype_version'
  | 'message'
  | 'event_reminder'
  | 'moderation'
  | 'broadcast';

export interface NotifyInput {
  type: NotificationType;
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  push?: boolean;
  /** false = push only (e.g. chat messages, which have their own unread counts). */
  inApp?: boolean;
}

/**
 * Creates in-app notifications, pushes them live over Supabase Realtime and
 * sends mobile push via Expo. Never notifies the actor about their own action.
 * Users can turn a type off per channel in settings.notificationPrefs[type].
 */
export async function notify(userIds: string[], input: NotifyInput) {
  const recipients = [...new Set(userIds)].filter((id) => id && id !== input.actorId);
  if (!recipients.length) return;

  const prefs = await db
    .select({ userId: userSettings.userId, prefs: userSettings.notificationPrefs })
    .from(userSettings)
    .where(inArray(userSettings.userId, recipients));
  const prefOf = (uid: string) => prefs.find((p) => p.userId === uid)?.prefs?.[input.type];
  const inApp = input.inApp === false ? [] : recipients.filter((uid) => prefOf(uid)?.inApp !== false);
  const pushTo = input.push === false ? [] : recipients.filter((uid) => prefOf(uid)?.push !== false);

  if (inApp.length) {
    const rows = await db
      .insert(notifications)
      .values(
        inApp.map((userId) => ({
          userId,
          type: input.type,
          actorId: input.actorId ?? null,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          title: input.title,
          body: input.body ?? '',
          data: input.data ?? {},
        })),
      )
      .returning();
    await broadcast(rows.map((n) => ({ topic: `user:${n.userId}` as const, event: 'notification:new', payload: n })));
  }
  if (pushTo.length) await sendPush(pushTo, input);
}

async function sendPush(userIds: string[], input: NotifyInput) {
  const tokens = await db.select({ token: pushTokens.token }).from(pushTokens).where(inArray(pushTokens.userId, userIds));
  if (!tokens.length) return;
  const messages = tokens.map((t) => ({
    to: t.token,
    title: input.title,
    body: input.body ?? '',
    sound: 'default',
    data: { type: input.type, targetType: input.targetType, targetId: input.targetId, ...input.data },
  }));
  try {
    for (let i = 0; i < messages.length; i += 100) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(messages.slice(i, i + 100)),
        signal: AbortSignal.timeout(5000),
      });
    }
  } catch (err) {
    logger.warn({ err }, '[push] send failed');
  }
}

export async function listNotifications(userId: string, filter: 'all' | 'unread', cursor: string | undefined, limit: number) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), filter === 'unread' ? isNull(notifications.readAt) : undefined, cursor ? lt(notifications.id, cursor) : undefined))
    .orderBy(desc(notifications.id))
    .limit(limit + 1);
}

export async function unreadCount(userId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}

export async function markRead(userId: string, ids: string[] | 'all') {
  await db
    .update(notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), ids === 'all' ? undefined : inArray(notifications.id, ids)));
}

/**
 * Sends a templated email (via Resend SMTP) to each user, skipping anyone who turned
 * email off for this notification type, and deleted/blocked accounts.
 * `build` receives the recipient so the template can be personalised.
 */
export async function emailUsers(userIds: string[], type: NotificationType, build: (u: { email: string; firstName: string }) => Template) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;
  const rows = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName, deletedAt: users.deletedAt, status: users.status, prefs: userSettings.notificationPrefs })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(inArray(users.id, ids));
  for (const r of rows) {
    if (r.deletedAt || r.status === 'blocked' || r.prefs?.[type]?.email === false) continue;
    await sendMailSafe(r.email, build({ email: r.email, firstName: r.fullName.split(' ')[0]! }));
  }
}
