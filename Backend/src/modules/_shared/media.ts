import { and, asc, eq, inArray } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { db, type DbOrTx } from '../../db/client.js';
import { media } from '../../db/schema/index.js';
import { Errors } from '../../lib/errors.js';
import { resolveUrls } from '../../lib/storage.js';
import type { MediaDto } from './dto.js';

type MediaRow = typeof media.$inferSelect;

export async function toMediaDtos(rows: MediaRow[]): Promise<Map<string, MediaDto>> {
  const urls = await resolveUrls(rows.map((r) => ({ storagePath: r.storagePath, visibility: r.visibility })));
  const out = new Map<string, MediaDto>();
  for (const r of rows) {
    out.set(r.id, {
      id: r.id,
      kind: r.kind,
      url: urls.get(r.storagePath) ?? null,
      mimeType: r.mimeType,
      sizeBytes: r.sizeBytes,
      originalName: r.originalName,
      width: r.width,
      height: r.height,
      durationSeconds: r.durationSeconds,
    });
  }
  return out;
}

export async function loadMedia(ids: string[]) {
  if (!ids.length) return new Map<string, MediaDto>();
  const rows = await db.select().from(media).where(inArray(media.id, [...new Set(ids)]));
  return toMediaDtos(rows);
}

/** Ensures every id is an uploaded, ready file owned by the user. Returns them in the given order. */
export async function assertOwnedReadyMedia(ownerId: string, ids: string[], tx: DbOrTx = db, allowed?: MediaRow['kind'][]) {
  if (!ids.length) return [];
  const rows = await tx.select().from(media).where(and(inArray(media.id, ids), eq(media.ownerId, ownerId), eq(media.status, 'ready')));
  if (rows.length !== new Set(ids).size) throw Errors.validation('One or more files are missing or still uploading', { mediaIds: 'Invalid media' });
  if (allowed && rows.some((r) => !allowed.includes(r.kind))) throw Errors.validation(`Only ${allowed.join(', ')} files are allowed here`);
  return ids.map((id) => rows.find((r) => r.id === id)!);
}

/**
 * Loads attachments for many parents from a join table (post_media, message_media, ...).
 * Returns parentId → ordered MediaDto[].
 */
export async function attachmentsFor(
  table: PgTable,
  cols: { parent: PgColumn; media: PgColumn; position: PgColumn },
  parentIds: string[],
) {
  const map = new Map<string, MediaDto[]>();
  if (!parentIds.length) return map;
  const links = (await db
    .select({ parentId: cols.parent, mediaId: cols.media })
    .from(table)
    .where(inArray(cols.parent, parentIds))
    .orderBy(asc(cols.position))) as { parentId: string; mediaId: string }[];
  const dtos = await loadMedia(links.map((l) => l.mediaId));
  for (const l of links) {
    const d = dtos.get(l.mediaId);
    if (d) map.set(l.parentId, [...(map.get(l.parentId) ?? []), d]);
  }
  return map;
}
