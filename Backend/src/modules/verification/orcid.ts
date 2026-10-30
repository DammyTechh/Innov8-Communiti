import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

/** ISO 7064 MOD 11-2 check character of the first 15 digits (how ORCID iDs are checksummed). */
export function orcidCheckDigit(base15: string) {
  let total = 0;
  for (const ch of base15) total = (total + Number(ch)) * 2;
  const result = (12 - (total % 11)) % 11;
  return result === 10 ? 'X' : String(result);
}

/** `0000-0002-1825-0097` → true when the format and the checksum are right. */
export function isValidOrcid(id: string) {
  if (!/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/.test(id)) return false;
  const digits = id.replace(/-/g, '');
  return orcidCheckDigit(digits.slice(0, 15)) === digits[15];
}

/** ORCID issues iDs from 0000-0001-5000-0007 to 0000-0003-5000-0001 and from 0009-0000-0000-0000 upward. */
export function isInIssuedRange(id: string) {
  const n = BigInt(id.replace(/-/g, '').slice(0, 15));
  const lo1 = BigInt('000000015000000');
  const hi1 = BigInt('000000035000000');
  const lo2 = BigInt('000900000000000');
  const hi2 = BigInt('000999999999999');
  return (n >= lo1 && n <= hi1) || (n >= lo2 && n <= hi2);
}

export type OrcidLookup =
  | { found: true; names: string[] }
  | { found: false; reason: 'not_found' | 'deactivated' }
  | { found: null; reason: 'unavailable' };

const cache = new Map<string, { v: OrcidLookup; at: number }>();

/** Public ORCID record: the names on it (given, family, credit and other names the owner made public). */
export async function lookupOrcid(id: string, timeoutMs = 5000): Promise<OrcidLookup> {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.v;
  let v: OrcidLookup;
  try {
    const res = await fetch(`${env.ORCID_API_URL}/${id}/person`, {
      headers: { accept: 'application/json', 'user-agent': 'CommUnitiVerifier/1.0 (+https://mycommuniti.org)' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (res.status === 404) v = { found: false, reason: 'not_found' };
    else if (res.status === 409 || res.status === 410) v = { found: false, reason: 'deactivated' };
    else if (!res.ok) v = { found: null, reason: 'unavailable' };
    else {
      const p = (await res.json()) as {
        name?: { 'given-names'?: { value?: string } | null; 'family-name'?: { value?: string } | null; 'credit-name'?: { value?: string } | null } | null;
        'other-names'?: { 'other-name'?: { content?: string }[] } | null;
      };
      const given = p.name?.['given-names']?.value ?? '';
      const family = p.name?.['family-name']?.value ?? '';
      const names = [`${given} ${family}`.trim(), p.name?.['credit-name']?.value ?? '', ...(p['other-names']?.['other-name'] ?? []).map((o) => o.content ?? '')].filter(Boolean);
      v = { found: true, names };
    }
  } catch (err) {
    logger.debug({ err, id }, '[verification] ORCID lookup failed');
    v = { found: null, reason: 'unavailable' };
  }
  if (v.found !== null) cache.set(id, { v, at: Date.now() });
  if (cache.size > 2000) cache.delete(cache.keys().next().value!);
  return v;
}
