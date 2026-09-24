import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { follows, forumMembers, forums, posts, projectMembers } from '../../db/schema/index.js';

/**
 * SQL predicate: posts the viewer is allowed to see.
 *  - everyone: public, unless posted in a private forum the viewer is not in
 *  - followers: the viewer follows the author
 *  - forum: the viewer is a member (or the forum is public)
 *  - project: the viewer is a project member
 *  - the author always sees their own posts
 */
export function visiblePostsFor(viewerId: string): SQL {
  const followed = sql`(select ${follows.followingId} from ${follows} where ${follows.followerId} = ${viewerId})`;
  const joinedForums = sql`(select ${forumMembers.forumId} from ${forumMembers} where ${forumMembers.userId} = ${viewerId})`;
  const publicForums = sql`(select ${forums.id} from ${forums} where ${forums.visibility} = 'public' and ${forums.deletedAt} is null)`;
  const myProjects = sql`(select ${projectMembers.projectId} from ${projectMembers} where ${projectMembers.userId} = ${viewerId})`;
  return and(
    isNull(posts.deletedAt),
    isNull(posts.removedAt),
    sql`(
      ${posts.authorId} = ${viewerId}
      or (${posts.audience} = 'everyone' and (${posts.forumId} is null or ${posts.forumId} in ${publicForums} or ${posts.forumId} in ${joinedForums}))
      or (${posts.audience} = 'followers' and ${posts.authorId} in ${followed})
      or (${posts.audience} = 'forum' and (${posts.forumId} in ${joinedForums} or ${posts.forumId} in ${publicForums}))
      or (${posts.audience} = 'project' and ${posts.projectId} in ${myProjects})
    )`,
  )!;
}

export async function canViewPost(viewerId: string, postId: string) {
  const [row] = await db.select({ id: posts.id }).from(posts).where(and(eq(posts.id, postId), visiblePostsFor(viewerId))).limit(1);
  return Boolean(row);
}
