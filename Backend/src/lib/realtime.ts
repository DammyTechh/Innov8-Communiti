import { env } from '../config/env.js';
import { logger } from './logger.js';

export type RealtimeTopic = `user:${string}` | `conversation:${string}` | `project:${string}`;

/**
 * Server → client push through Supabase Realtime Broadcast (HTTP API).
 * Works on serverless (no long-lived sockets on Vercel). Clients subscribe to
 * private channels with their API access token; access is enforced by the
 * `realtime_can_access` policy in the migration.
 * Failures are logged and never fail the request: the REST API stays the source of truth.
 */
export async function broadcast(messages: { topic: RealtimeTopic; event: string; payload: unknown }[]) {
  if (!env.storageEnabled || messages.length === 0) return;
  try {
    const res = await fetch(`${env.SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ messages: messages.map((m) => ({ ...m, private: true })) }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) logger.warn({ status: res.status, body: await res.text() }, '[realtime] broadcast failed');
  } catch (err) {
    logger.warn({ err }, '[realtime] broadcast error');
  }
}
