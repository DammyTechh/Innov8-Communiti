import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { Errors } from './errors.js';

let client: SupabaseClient | undefined;

export function supabaseAdmin() {
  if (!env.storageEnabled) throw Errors.unavailable('File storage is not configured');
  client ??= createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export type Visibility = 'public' | 'private';
const bucketFor = (v: Visibility) => (v === 'public' ? env.STORAGE_PUBLIC_BUCKET : env.STORAGE_PRIVATE_BUCKET);

/** Signed URL the client uploads to directly (PUT). Valid for 2 hours. */
export async function createUploadUrl(visibility: Visibility, path: string) {
  const { data, error } = await supabaseAdmin().storage.from(bucketFor(visibility)).createSignedUploadUrl(path);
  if (error || !data) throw Errors.unavailable(`Could not create upload URL: ${error?.message ?? 'unknown error'}`);
  return { uploadUrl: data.signedUrl, token: data.token };
}

export async function objectExists(visibility: Visibility, path: string) {
  const slash = path.lastIndexOf('/');
  const { data, error } = await supabaseAdmin()
    .storage.from(bucketFor(visibility))
    .list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
  return !error && (data?.length ?? 0) > 0;
}

export const publicUrl = (path: string) => supabaseAdmin().storage.from(env.STORAGE_PUBLIC_BUCKET).getPublicUrl(path).data.publicUrl;

/** Resolves display URLs for media rows: public objects get a CDN URL, private ones a 1-hour signed URL (batched). */
export async function resolveUrls(items: { storagePath: string; visibility: Visibility }[]) {
  const result = new Map<string, string>();
  if (!env.storageEnabled || items.length === 0) return result;
  const priv = items.filter((i) => i.visibility === 'private').map((i) => i.storagePath);
  for (const i of items) if (i.visibility === 'public') result.set(i.storagePath, publicUrl(i.storagePath));
  if (priv.length) {
    const { data } = await supabaseAdmin().storage.from(env.STORAGE_PRIVATE_BUCKET).createSignedUrls(priv, 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) result.set(d.path, d.signedUrl);
  }
  return result;
}

export async function removeObjects(visibility: Visibility, paths: string[]) {
  if (!env.storageEnabled || paths.length === 0) return;
  await supabaseAdmin().storage.from(bucketFor(visibility)).remove(paths);
}
