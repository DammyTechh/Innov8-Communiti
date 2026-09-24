import { z } from 'zod';

/**
 * Cursor pagination. IDs are UUID v7 (time-ordered), so the cursor is simply the last id.
 * Admin tables use page/pageSize instead to show "15 of 2000 rows".
 */
export const cursorQuery = z.object({
  cursor: z.uuid().optional().describe('Opaque cursor from the previous page (`nextCursor`)'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CursorQuery = z.infer<typeof cursorQuery>;

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(15),
});
export type PageQuery = z.infer<typeof pageQuery>;

/** Fetch `limit + 1` rows, then call this to trim and compute `nextCursor`. */
export function toCursorPage<T extends { id: string }>(rows: T[], limit: number) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  return { data, nextCursor: hasMore ? (data[data.length - 1]?.id ?? null) : null };
}

export const cursorPageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), nextCursor: z.uuid().nullable() });

export const offsetPageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), page: z.number(), pageSize: z.number(), total: z.number() });
