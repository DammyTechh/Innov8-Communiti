/**
 * Onboarding auto-verification.
 *
 * Every role form (Researcher, Innovator, Professional, Learner) is checked the moment it is submitted:
 *
 *   Local checks (always):   placeholder / gibberish text, levels, ORCID checksum and issued range,
 *                            email syntax, disposable and consumer mailbox domains, reserved and private
 *                            hosts, LinkedIn profile URL shape, the same ORCID / email already used by
 *                            another member.
 *   Network checks (default) email domain receives mail (MX / A), the ORCID record exists and carries the
 *                            member's name, links resolve and do not 404, parked "domain for sale" pages,
 *                            the linked page mentions the member / organisation.
 *
 * Decision: any failed check rejects the form at once, with a message for each field to fix. Otherwise the
 * member is verified immediately. Checks that cannot be completed (a site blocks bots, a lookup times
 * out) never reject; they only lower the trust score shown to admins, who can still revoke.
 */
import type { RoleBody } from '../me/verification.js';
import { safeFetch, isReservedHost, mailDomainStatus, networkChecksEnabled, isPrivateAddress } from './net.js';
import { DISPOSABLE_DOMAINS } from './data/disposable-domains.js';
import { FREE_EMAIL_PROVIDERS } from './data/free-email-providers.js';
import { isInIssuedRange, isValidOrcid, lookupOrcid } from './orcid.js';
import { assessLevel, assessText, domainMatchesOrg, namesMatch, nameTokens, normalize, orgTokens, type TextKind } from './text.js';
import { domainKind, sameInstitution, universityByDomain, universityByName } from './universities.js';
import { isIP } from 'node:net';

export type Outcome = 'pass' | 'warn' | 'fail' | 'skipped';
export interface CheckResult {
  /** Form field, e.g. `orcidId`; `form` for checks about the whole submission. */
  field: string;
  check: string;
  outcome: Outcome;
  message: string;
  /** Trust points this result adds (or removes). */
  points: number;
}

export interface Assessment {
  decision: 'verified' | 'rejected';
  /** 0–100: how much independent evidence backs the form. Shown to admins. */
  score: number;
  checks: CheckResult[];
  /** `details.<field>` → what to fix (only when rejected). */
  fieldErrors: Record<string, string>;
  /** One line for admins and logs. */
  summary: string;
  networkChecks: boolean;
  checkedAt: string;
  durationMs: number;
}

export interface Subject {
  userId: string;
  fullName: string;
  /** The account's sign-in email, already proven by the 6-digit code. */
  accountEmail: string;
}

export interface Dependencies {
  /** Fields whose value another account already uses: returns the subset of `values` keys that clash. */
  findDuplicates?: (userId: string, values: { orcidId?: string; emails: string[] }) => Promise<{ orcidId: boolean; emails: Set<string> }>;
  network?: boolean;
}

const r = (field: string, check: string, outcome: Outcome, message: string, points = 0): CheckResult => ({ field, check, outcome, message, points });

let disposable: Set<string> | undefined;
function isDisposable(domain: string) {
  disposable ??= new Set(DISPOSABLE_DOMAINS.split('\n'));
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) if (disposable.has(parts.slice(i).join('.'))) return true;
  return false;
}

// ─── Text ─────────────────────────────────────────────────────────────────

const TEXT_MESSAGES: Record<string, (label: string) => string> = {
  placeholder: (l) => `Enter your real ${l}, not a placeholder`,
  'no letters': (l) => `Enter your ${l} in words`,
  'mostly symbols or numbers': (l) => `Your ${l} should be written in words`,
  'repeated characters': (l) => `Your ${l} doesn't look real. Check it and try again`,
  gibberish: (l) => `Your ${l} doesn't look real. Check it and try again`,
  repetitive: (l) => `Describe your ${l} in a sentence or two`,
  'invalid characters': (l) => `Your ${l} can only contain letters, spaces, hyphens and apostrophes`,
  'unknown level': () => 'Enter your level like 100, 200L, Year 2, Final year, HND 1 or MSc',
};

function text(field: string, label: string, value: string | undefined, kind: TextKind, opts: { minWords?: number } = {}): CheckResult[] {
  if (value === undefined || value === '') return [];
  const v = assessText(value, kind);
  if (!v.ok) return [r(field, 'text_quality', 'fail', TEXT_MESSAGES[v.reason]?.(label) ?? `Check your ${label}`)];
  if (opts.minWords && value.trim().split(/\s+/).length < opts.minWords) return [r(field, 'text_detail', 'fail', `Tell us a little more about your ${label} (at least ${opts.minWords} words)`)];
  return [r(field, 'text_quality', 'pass', 'Looks like a real answer', 2)];
}

// ─── Email ────────────────────────────────────────────────────────────────

interface EmailOpts {
  field: string;
  label: string;
  /** What the email should belong to, for the domain/organisation match. */
  org?: string;
  /** Institution-type fields: a university or .edu/.ac domain is the strongest evidence. */
  academic?: boolean;
  /** What the address should prove, for messages: "your institution", "where you work", "your school". */
  proves: string;
}

async function email(value: string | undefined, subject: Subject, o: EmailOpts, net: boolean): Promise<CheckResult[]> {
  if (!value) return [];
  const out: CheckResult[] = [];
  const at = value.lastIndexOf('@');
  const local = value.slice(0, at);
  const domain = value.slice(at + 1).toLowerCase();
  if (at < 1 || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || /\.\.|^\.|\.$/.test(domain)) return [r(o.field, 'email_syntax', 'fail', `Enter a valid ${o.label}`)];
  if (isReservedHost(domain)) return [r(o.field, 'email_domain', 'fail', `${domain} is not a real email domain. Enter your actual ${o.label}`)];
  if (isDisposable(domain)) return [r(o.field, 'email_disposable', 'fail', `Temporary or disposable email addresses can't be used. Enter your ${o.label}`)];
  if (FREE_EMAIL_PROVIDERS.has(domain)) {
    return [r(o.field, 'email_free_provider', 'fail', `A personal ${domain} address can't confirm ${o.proves}. Use the email ${o.proves} gave you, or leave this blank`)];
  }
  if (/^(test|testing|example|sample|fake|dummy|noreply|no-reply|donotreply|asdf|qwerty|abc|xyz|null|none)\d*$/i.test(local)) {
    return [r(o.field, 'email_local_part', 'fail', `Enter your own ${o.label}`)];
  }

  if (value === subject.accountEmail) out.push(r(o.field, 'email_ownership', 'pass', 'Same address as the sign-in email, which was confirmed with a code', 20));

  const uni = universityByDomain(domain);
  const kind = domainKind(domain);
  if (uni) out.push(r(o.field, 'email_institution', 'pass', `Belongs to ${uni.name}`, o.academic ? 25 : 15));
  else if (kind === 'academic') out.push(r(o.field, 'email_institution', 'pass', 'Academic email domain', o.academic ? 20 : 10));
  else if (kind === 'government') out.push(r(o.field, 'email_institution', 'pass', 'Government email domain', 12));
  else if (o.academic) out.push(r(o.field, 'email_institution', 'warn', `${domain} is not a recognised academic domain`, -5));
  else out.push(r(o.field, 'email_institution', 'pass', 'Organisation email domain', 8));

  if (o.org) {
    const matches = (uni && sameInstitution(uni.name, o.org)) || domainMatchesOrg(domain, o.org);
    if (matches) out.push(r(o.field, 'email_matches_org', 'pass', `Domain matches "${o.org}"`, 10));
    else if (uni) out.push(r(o.field, 'email_matches_org', 'warn', `This email belongs to ${uni.name}, not "${o.org}"`, -10));
    else out.push(r(o.field, 'email_matches_org', 'warn', `Domain does not obviously match "${o.org}"`, -3));
  }

  if (net) {
    const status = await mailDomainStatus(domain);
    if (status === 'not_found') out.push(r(o.field, 'email_dns', 'fail', `The email domain ${domain} doesn't exist. Check for typos`));
    else if (status === 'no_mail') out.push(r(o.field, 'email_dns', 'fail', `${domain} can't receive email. Check the address`));
    else if (status === 'accepts_mail') out.push(r(o.field, 'email_dns', 'pass', 'Domain receives email (MX)', 5));
    else if (status === 'implicit_mx') out.push(r(o.field, 'email_dns', 'pass', 'Domain exists (no MX record)', 2));
    else out.push(r(o.field, 'email_dns', 'skipped', 'Could not look up the domain right now'));
  }
  return out;
}

// ─── Links ────────────────────────────────────────────────────────────────

/** Phrases parking/for-sale pages lead with. Only the title and the start of the page are checked, so an article that merely mentions domain sales is not affected. */
const PARKED = /(this domain (name )?(is|may be) for sale|domain (name )?is for sale|buy this domain|this domain is parked|parked free,? courtesy of|this domain is available for (purchase|sale)|the domain [a-z0-9.-]+ (is|may be) for sale)/i;
const NOT_FOUND_TEXT = /<title>[^<]{0,60}\b(404|page not found|not found)\b[^<]{0,60}<\/title>/i;

interface LinkOpts {
  field: string;
  label: string;
  /** professional profile: LinkedIn URLs must point at a person or company page. */
  profile?: boolean;
  /** Words the page is expected to mention (the member's surname, venture or organisation). */
  expect?: string[];
}

function pageText(html: string) {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '';
  const body = html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ');
  return normalize(`${title} ${body}`).slice(0, 150_000);
}

async function link(value: string | undefined, o: LinkOpts, net: boolean): Promise<CheckResult[]> {
  if (!value) return [];
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return [r(o.field, 'link_syntax', 'fail', `Enter a valid ${o.label}, starting with https://`)];
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!['http:', 'https:'].includes(url.protocol)) return [r(o.field, 'link_syntax', 'fail', `Enter a valid ${o.label}, starting with https://`)];
  if (url.username || url.password) return [r(o.field, 'link_syntax', 'fail', `Remove the username or password from your ${o.label}`)];
  if (isIP(host)) {
    if (isPrivateAddress(host)) return [r(o.field, 'link_public', 'fail', `Your ${o.label} must be a public website`)];
    return [r(o.field, 'link_public', 'fail', `Use the website's address (like https://site.com/page), not an IP address`)];
  }
  if (isReservedHost(host)) return [r(o.field, 'link_public', 'fail', `${host} is not a real website. Enter your actual ${o.label}`)];

  const out: CheckResult[] = [];
  if (url.protocol === 'https:') out.push(r(o.field, 'link_https', 'pass', 'Secure link', 1));

  const isLinkedIn = /(^|\.)linkedin\.com$/.test(host);
  if (isLinkedIn) {
    const profile = /^\/(in|pub|company|school|showcase)\/[^/?#]{2,}/i.test(url.pathname);
    if (!profile) {
      return [r(o.field, 'link_linkedin', o.profile ? 'fail' : 'warn', 'Link to a LinkedIn profile or company page, like https://www.linkedin.com/in/your-name', o.profile ? 0 : -3)];
    }
    out.push(r(o.field, 'link_linkedin', 'pass', 'LinkedIn profile link', 8));
    // LinkedIn refuses automated requests (HTTP 999), so it is not fetched. Check the slug against the name instead.
    let rawSlug = url.pathname.split('/')[2] ?? '';
    try {
      rawSlug = decodeURIComponent(rawSlug);
    } catch {
      // malformed %-escape: compare the raw text
    }
    const slug = normalize(rawSlug.replace(/[-_]+/g, ' '));
    if (o.expect?.some((w) => w.length >= 3 && slug.includes(normalize(w)))) out.push(r(o.field, 'link_mentions', 'pass', 'Profile address carries your name', 8));
    return out;
  }
  if (!net) return out;

  const res = await safeFetch(url.href, { timeoutMs: 5000 });
  if (res.failure === 'not_found_dns') return [r(o.field, 'link_reachable', 'fail', `The website ${host} doesn't exist. Check the link for typos`)];
  if (res.failure === 'blocked') return [r(o.field, 'link_public', 'fail', `Your ${o.label} must be a public website`)];
  if (res.failure) {
    out.push(r(o.field, 'link_reachable', 'skipped', `Could not open the page right now (${res.failure.replace(/_/g, ' ')})`));
    return out;
  }
  if (res.status === 404 || res.status === 410) return [r(o.field, 'link_reachable', 'fail', `This page doesn't exist (error ${res.status}). Check your ${o.label}`)];
  if (!res.ok) {
    out.push(r(o.field, 'link_reachable', 'skipped', `The site did not let us check the page (HTTP ${res.status})`));
    return out;
  }
  const html = res.body ?? '';
  if (PARKED.test(pageText(html).slice(0, 2500))) return [r(o.field, 'link_parked', 'fail', `This link goes to a parked or for-sale domain, not your work. Check your ${o.label}`)];
  if (NOT_FOUND_TEXT.test(html.slice(0, 5000))) return [r(o.field, 'link_reachable', 'fail', `This page says it can't be found. Check your ${o.label}`)];
  out.push(r(o.field, 'link_reachable', 'pass', `Page opens (HTTP ${res.status})`, 6));
  if (o.expect?.length && html) {
    const t = pageText(html);
    const hit = o.expect.find((w) => w.length >= 3 && t.includes(normalize(w)));
    if (hit) out.push(r(o.field, 'link_mentions', 'pass', `Page mentions "${hit}"`, 10));
    else out.push(r(o.field, 'link_mentions', 'warn', 'Page does not mention your name or organisation', -2));
  }
  return out;
}

// ─── ORCID ────────────────────────────────────────────────────────────────

async function orcid(value: string | undefined, subject: Subject, net: boolean): Promise<CheckResult[]> {
  if (!value) return [];
  const f = 'orcidId';
  if (!isValidOrcid(value)) return [r(f, 'orcid_checksum', 'fail', 'This ORCID iD is not valid (the last character does not match). Copy it from your ORCID profile')];
  const out: CheckResult[] = [r(f, 'orcid_checksum', 'pass', 'Valid ORCID checksum', 5)];
  if (!isInIssuedRange(value)) out.push(r(f, 'orcid_range', 'warn', 'Outside the ranges ORCID issues iDs from', -10));
  if (!net) return out;
  const rec = await lookupOrcid(value);
  if (rec.found === false) {
    return [r(f, 'orcid_record', 'fail', rec.reason === 'deactivated' ? 'This ORCID iD has been deactivated. Use your current ORCID iD' : 'No ORCID record exists for this iD. Check it on orcid.org')];
  }
  if (rec.found === null) {
    out.push(r(f, 'orcid_record', 'skipped', 'ORCID could not be reached right now'));
    return out;
  }
  out.push(r(f, 'orcid_record', 'pass', 'ORCID record exists', 15));
  if (!rec.names.length) out.push(r(f, 'orcid_name', 'skipped', 'The name on this ORCID record is private'));
  else if (rec.names.some((n) => namesMatch(n, subject.fullName))) out.push(r(f, 'orcid_name', 'pass', `Name matches the ORCID record (${rec.names[0]})`, 30));
  else return [r(f, 'orcid_name', 'fail', `This ORCID iD belongs to someone with a different name. Use your own ORCID iD, or make sure your profile name matches it`)];
  return out;
}

// ─── Per role ─────────────────────────────────────────────────────────────

function surname(fullName: string) {
  const t = nameTokens(fullName);
  return t.length ? t[t.length - 1]! : '';
}

async function roleChecks(body: RoleBody, s: Subject, net: boolean): Promise<CheckResult[]> {
  const nameWords = [surname(s.fullName), ...nameTokens(s.fullName)].filter((w) => w.length >= 3);
  switch (body.memberRole) {
    case 'researcher': {
      const d = body.details;
      return [
        ...(
          await Promise.all([
            email(d.institutionalEmail, s, { field: 'institutionalEmail', label: 'institutional email', academic: true, proves: 'your institution' }, net),
            orcid(d.orcidId, s, net),
            link(d.researchProjectLink, { field: 'researchProjectLink', label: 'research project link', expect: nameWords }, net),
          ])
        ).flat(),
        ...text('researchEvidence', 'research', d.researchEvidence, 'prose', { minWords: 2 }),
      ];
    }
    case 'innovator': {
      const d = body.details;
      const fileCount = new Set([...d.evidenceFileIds, ...d.otherCueFileIds]).size;
      return [
        ...text('ventureName', 'project or venture name', d.ventureName, 'label'),
        ...text('description', 'project', d.description, 'prose', { minWords: 2 }),
        ...(await link(d.evidenceLink, { field: 'evidenceLink', label: 'evidence link', expect: [...orgTokens(d.ventureName), ...nameWords] }, net)),
        ...(fileCount ? [r('evidenceFileIds', 'evidence_files', 'pass', `${fileCount} evidence file(s) uploaded`, Math.min(20, fileCount * 8))] : []),
      ];
    }
    case 'professional': {
      const d = body.details;
      return [
        ...text('organizationName', 'organisation name', d.organizationName, 'label'),
        ...text('professionalTitle', 'professional title', d.professionalTitle, 'label'),
        ...(
          await Promise.all([
            link(d.profileLink, { field: 'profileLink', label: 'profile link', profile: true, expect: [...nameWords, ...orgTokens(d.organizationName)] }, net),
            email(d.workEmail, s, { field: 'workEmail', label: 'work email', org: d.organizationName, proves: 'your organisation' }, net),
          ])
        ).flat(),
      ];
    }
    case 'learner': {
      const d = body.details;
      const known = universityByName(d.institution);
      return [
        ...text('institution', 'school or institution', d.institution, 'label'),
        ...(known ? [r('institution', 'institution_known', 'pass', `Recognised: ${known.name}`, 10)] : []),
        ...text('courseOfStudy', 'course of study', d.courseOfStudy, 'label'),
        ...(d.level
          ? (() => {
              const v = assessLevel(d.level);
              return v.ok ? [r('level', 'level_format', 'pass', 'Valid level', 1)] : [r('level', 'level_format', 'fail', TEXT_MESSAGES[v.reason]?.('level') ?? 'Enter a valid level')];
            })()
          : []),
        ...(await email(d.studentEmail, s, { field: 'studentEmail', label: 'student email', org: d.institution, academic: true, proves: 'your school' }, net)),
      ];
    }
  }
}

function emailsOf(body: RoleBody) {
  const d = body.details as Record<string, unknown>;
  return (['institutionalEmail', 'workEmail', 'studentEmail'] as const).filter((k) => typeof d[k] === 'string' && d[k]).map((k) => ({ field: k, value: d[k] as string }));
}

/** Runs every check for a role form and decides: verified now, or rejected with what to fix. */
export async function assessRole(body: RoleBody, subject: Subject, deps: Dependencies = {}): Promise<Assessment> {
  const started = Date.now();
  const net = deps.network ?? networkChecksEnabled();
  const checks = await roleChecks(body, subject, net);

  // One identity per account: the same ORCID iD or role email cannot back two members.
  if (deps.findDuplicates) {
    const orcidId = body.memberRole === 'researcher' ? body.details.orcidId : undefined;
    const emails = emailsOf(body);
    const dup = await deps.findDuplicates(subject.userId, { orcidId, emails: emails.map((e) => e.value) });
    if (orcidId && dup.orcidId) checks.push(r('orcidId', 'orcid_unique', 'fail', 'This ORCID iD is already linked to another CommUniti account'));
    for (const e of emails) if (dup.emails.has(e.value)) checks.push(r(e.field, 'email_unique', 'fail', 'This email is already used by another CommUniti account'));
  }

  const evidence = checks.filter((c) => c.outcome === 'pass' && c.points >= 8).length;
  if (!evidence && !checks.some((c) => c.outcome === 'fail')) checks.push(r('form', 'independent_evidence', 'warn', 'No independently checkable evidence (institutional email, ORCID, profile link or files)', -10));

  const fieldErrors: Record<string, string> = {};
  for (const c of checks) if (c.outcome === 'fail') fieldErrors[`details.${c.field}`] ??= c.message;
  const rejected = Object.keys(fieldErrors).length > 0;
  const score = rejected ? 0 : Math.max(0, Math.min(100, 30 + checks.reduce((n, c) => n + c.points, 0)));
  const fails = checks.filter((c) => c.outcome === 'fail').map((c) => c.check);
  const warns = checks.filter((c) => c.outcome === 'warn').map((c) => c.check);
  return {
    decision: rejected ? 'rejected' : 'verified',
    score,
    checks,
    fieldErrors,
    summary: rejected ? `Rejected: ${[...new Set(fails)].join(', ')}` : `Verified automatically (trust ${score}/100${warns.length ? `; flags: ${[...new Set(warns)].join(', ')}` : ''})`,
    networkChecks: net,
    checkedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };
}
