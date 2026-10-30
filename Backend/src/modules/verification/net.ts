/**
 * Outbound lookups for onboarding auto-verification: DNS and a small, SSRF-safe HTTP client.
 *
 * Safety: links come from members, so every connection is resolved through `guardedLookup`, which refuses
 * private, loopback, link-local and other non-public addresses (including after redirects and DNS
 * rebinding, because the check runs at connect time). Bodies are capped and every call has a deadline.
 *
 * Reliability: a DNS failure only counts against a member when the resolver is demonstrably working
 * (a known-good name resolves). Otherwise the result is "inconclusive" and never causes a rejection.
 */
import { promises as dnsp, lookup as dnsLookup, type LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { env } from '../../config/env.js';

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8], ['64:ff9b::', 96], ['2001:db8::', 32], ['100::', 64]] as const) blocked.addSubnet(net, prefix, 'ipv6');

/** True for addresses on private, loopback, link-local, multicast, documentation or reserved ranges. */
export function isPrivateAddress(ip: string) {
  const v = isIP(ip);
  if (v === 4) return blocked.check(ip, 'ipv4');
  if (v === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (mapped) return blocked.check(mapped[1]!, 'ipv4');
    return blocked.check(ip, 'ipv6');
  }
  return true;
}

const RESERVED_HOST = /(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|invalid|example|onion|arpa)$/i;
const RESERVED_DOMAIN = /(^|\.)example\.(com|net|org|edu)$/i;

/** Hosts that can never be a real public website or mailbox: localhost, *.local, example.com, test, invalid … */
export function isReservedHost(host: string) {
  const h = host.toLowerCase().replace(/\.$/, '');
  return RESERVED_HOST.test(h) || RESERVED_DOMAIN.test(h) || !h.includes('.');
}

class BlockedAddressError extends Error {
  code = 'EBLOCKED';
}

const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { all: true, verbatim: true }, (err, addresses: LookupAddress[]) => {
    if (err) return callback(err, '', 4);
    const list = addresses ?? [];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) return callback(new BlockedAddressError(`${hostname} resolves to a non-public address`), '', 4);
    if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
    const first = list.find((a) => !options.family || a.family === options.family) ?? list[0]!;
    callback(null, first.address, first.family);
  });
};

export type FetchFailure = 'not_found_dns' | 'blocked' | 'unsupported_port' | 'timeout' | 'network' | 'too_many_redirects' | 'bad_url';
export interface FetchResult {
  ok: boolean;
  status?: number;
  finalUrl: string;
  contentType?: string;
  body?: string;
  failure?: FetchFailure;
}

const UA = 'Mozilla/5.0 (compatible; CommUnitiVerifier/1.0; +https://mycommuniti.org)';

function requestOnce(url: URL, timeoutMs: number, maxBytes: number): Promise<{ status: number; location?: string; contentType?: string; body: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.request(
      url,
      {
        method: 'GET',
        lookup: guardedLookup,
        timeout: timeoutMs,
        headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5', 'accept-language': 'en' },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers['content-type'] ?? '');
        const location = typeof res.headers.location === 'string' ? res.headers.location : undefined;
        if ((status >= 300 && status < 400) || !/text|html|json|xml/.test(contentType)) {
          res.destroy();
          return resolve({ status, location, contentType, body: '' });
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => {
          size += c.length;
          chunks.push(c);
          if (size >= maxBytes) res.destroy();
        });
        const done = () => resolve({ status, location, contentType, body: Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8') });
        res.on('end', done);
        res.on('close', done);
        res.on('error', done);
      },
    );
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    req.end();
  });
}

/** GET a public web page, following up to 5 redirects, reading at most `maxBytes`. Never throws. */
export async function safeFetch(rawUrl: string, { timeoutMs = 5000, maxBytes = 200_000 } = {}): Promise<FetchResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, finalUrl: rawUrl, failure: 'bad_url' };
  }
  const deadline = Date.now() + timeoutMs;
  for (let hop = 0; hop <= 5; hop++) {
    if (!['http:', 'https:'].includes(url.protocol)) return { ok: false, finalUrl: url.href, failure: 'blocked' };
    if (isIP(url.hostname.replace(/^\[|\]$/g, '')) && isPrivateAddress(url.hostname.replace(/^\[|\]$/g, ''))) return { ok: false, finalUrl: url.href, failure: 'blocked' };
    if (url.port && !['80', '443', '8080', '8443'].includes(url.port)) return { ok: false, finalUrl: url.href, failure: 'unsupported_port' };
    const left = deadline - Date.now();
    if (left <= 0) return { ok: false, finalUrl: url.href, failure: 'timeout' };
    try {
      const r = await requestOnce(url, left, maxBytes);
      if (r.status >= 300 && r.status < 400 && r.location) {
        url = new URL(r.location, url);
        continue;
      }
      return { ok: r.status >= 200 && r.status < 400, status: r.status, finalUrl: url.href, contentType: r.contentType, body: r.body };
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'EBLOCKED') return { ok: false, finalUrl: url.href, failure: 'blocked' };
      if (code === 'ENOTFOUND') return { ok: false, finalUrl: url.href, failure: (await resolverHealthy()) ? 'not_found_dns' : 'network' };
      if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') return { ok: false, finalUrl: url.href, failure: 'timeout' };
      return { ok: false, finalUrl: url.href, failure: 'network' };
    }
  }
  return { ok: false, finalUrl: url.href, failure: 'too_many_redirects' };
}

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), ms).unref())]);

/** Cached for a minute: does the resolver answer for names that certainly exist? */
let health: { ok: boolean; at: number } | undefined;
export async function resolverHealthy() {
  if (health && Date.now() - health.at < 60_000) return health.ok;
  const probes = await Promise.allSettled(['google.com', 'cloudflare.com', 'wikipedia.org'].map((h) => withTimeout(dnsp.resolve4(h), 2500)));
  health = { ok: probes.some((p) => p.status === 'fulfilled'), at: Date.now() };
  return health.ok;
}

export type MailDomainVerdict = 'accepts_mail' | 'implicit_mx' | 'no_mail' | 'not_found' | 'inconclusive';
const mailCache = new Map<string, { v: MailDomainVerdict; at: number }>();

/** Whether a domain can receive email: MX records, else an A/AAAA record (RFC 5321 implicit MX). */
export async function mailDomainStatus(domain: string, timeoutMs = 3000): Promise<MailDomainVerdict> {
  const hit = mailCache.get(domain);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.v;
  const codeOf = (e: unknown) => (e as { code?: string }).code;
  let v: MailDomainVerdict;
  try {
    const mx = await withTimeout(dnsp.resolveMx(domain), timeoutMs);
    // RFC 7505 "null MX": the domain explicitly accepts no mail.
    v = mx.length === 1 && (mx[0]!.exchange === '' || mx[0]!.exchange === '.') ? 'no_mail' : mx.length ? 'accepts_mail' : 'no_mail';
  } catch (e) {
    const code = codeOf(e);
    if (code === 'ENOTFOUND' || code === 'ENODATA') {
      const a = await Promise.allSettled([withTimeout(dnsp.resolve4(domain), timeoutMs), withTimeout(dnsp.resolve6(domain), timeoutMs)]);
      if (a.some((r) => r.status === 'fulfilled' && r.value.length)) v = 'implicit_mx';
      else if (code === 'ENOTFOUND' && a.every((r) => r.status === 'rejected' && codeOf(r.reason) === 'ENOTFOUND')) v = (await resolverHealthy()) ? 'not_found' : 'inconclusive';
      else v = (await resolverHealthy()) ? 'no_mail' : 'inconclusive';
    } else v = 'inconclusive';
  }
  if (v !== 'inconclusive') mailCache.set(domain, { v, at: Date.now() });
  if (mailCache.size > 2000) mailCache.delete(mailCache.keys().next().value!);
  return v;
}

/** Outbound checks are on unless VERIFICATION_NETWORK_CHECKS=false (offline CI, local runs). */
export const networkChecksEnabled = () => env.VERIFICATION_NETWORK_CHECKS;
