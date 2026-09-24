import { inArray } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { users } from '../../db/schema/index.js';
import type { UserSummary } from './dto.js';

/** Column set for `UserSummary`, reusable in joins. */
export const userSummaryCols = {
  id: users.id,
  fullName: users.fullName,
  username: users.username,
  avatarUrl: users.avatarUrl,
  headline: users.headline,
  memberRole: users.memberRole,
};

export async function loadUserSummaries(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const map = new Map<string, UserSummary>();
  if (!unique.length) return map;
  const rows = await db.select(userSummaryCols).from(users).where(inArray(users.id, unique));
  for (const r of rows) map.set(r.id, r);
  return map;
}
