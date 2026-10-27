import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { userBlocks } from '../../db/schema/index.js';
import { Errors } from '../../lib/errors.js';

/**
 * Member blocks work both ways: neither person sees the other's posts or comments,
 * and they cannot follow, message or send collaboration requests to each other.
 */

/** SQL predicate: `userCol` is not someone the viewer blocked, nor someone who blocked the viewer. Pass a table-qualified column. */
export function notBlocked(viewerId: string, userCol: SQL): SQL {
  return sql`not exists (select 1 from ${userBlocks} ub where (ub.blocker_id = ${viewerId} and ub.blocked_id = ${userCol}) or (ub.blocker_id = ${userCol} and ub.blocked_id = ${viewerId}))`;
}

export async function blockState(viewerId: string, otherId: string) {
  const rows = await db
    .select({ blockerId: userBlocks.blockerId })
    .from(userBlocks)
    .where(or(and(eq(userBlocks.blockerId, viewerId), eq(userBlocks.blockedId, otherId)), and(eq(userBlocks.blockerId, otherId), eq(userBlocks.blockedId, viewerId))));
  return { blockedByMe: rows.some((r) => r.blockerId === viewerId), blockedMe: rows.some((r) => r.blockerId === otherId) };
}

export async function assertNotBlocked(viewerId: string, otherId: string, message = 'You cannot interact with this person') {
  const s = await blockState(viewerId, otherId);
  if (s.blockedByMe) throw Errors.forbidden('You blocked this person. Unblock them first.');
  if (s.blockedMe) throw Errors.forbidden(message);
}
