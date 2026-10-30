import { UNIVERSITIES } from './data/universities.js';
import { normalize, orgTokens } from './text.js';

export interface University {
  name: string;
  country: string;
  domains: string[];
}

let byDomain: Map<string, University> | undefined;
let byName: Map<string, University> | undefined;
let byLabel: Map<string, University[]> | undefined;

const key = (s: string) => normalize(s).replace(/[^a-z0-9]+/g, ' ').trim();

function load() {
  if (byDomain) return;
  byDomain = new Map();
  byName = new Map();
  byLabel = new Map();
  for (const line of UNIVERSITIES.split('\n')) {
    const [name, country, domains] = line.split('|');
    if (!name || !country || !domains) continue;
    const u: University = { name, country, domains: domains.split(',') };
    byName.set(key(name), u);
    for (const d of u.domains) {
      byDomain.set(d, u);
      const label = d.split('.')[0]!;
      byLabel.set(label, [...(byLabel.get(label) ?? []), u]);
    }
  }
}

/** The university that owns an email domain (`cs.unilag.edu.ng` → University of Lagos), if listed. */
export function universityByDomain(domain: string): University | undefined {
  load();
  const parts = domain.toLowerCase().split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const hit = byDomain!.get(parts.slice(i).join('.'));
    if (hit) return hit;
  }
  return undefined;
}

/** A listed university matching what a member typed: the full name, or its acronym/domain label ("UNILAG", "ABU"). */
export function universityByName(input: string): University | undefined {
  load();
  const k = key(input);
  const exact = byName!.get(k) ?? byName!.get(`the ${k}`) ?? byName!.get(k.replace(/^the /, ''));
  if (exact) return exact;
  const compact = k.replace(/ /g, '');
  if (/^[a-z]{2,10}$/.test(compact)) {
    const hits = byLabel!.get(compact);
    if (hits?.length === 1) return hits[0];
    const ng = hits?.filter((h) => h.country === 'NG');
    if (ng?.length === 1) return ng[0];
  }
  return undefined;
}

/** True when two institution names refer to the same place: same listed university, or most significant words shared. */
export function sameInstitution(a: string, b: string) {
  const ua = universityByName(a);
  const ub = universityByName(b);
  if (ua && ub) return ua === ub;
  const ta = new Set(orgTokens(a));
  const tb = orgTokens(b);
  if (!ta.size || !tb.length) return false;
  const shared = tb.filter((t) => ta.has(t)).length;
  return shared / Math.min(ta.size, tb.length) >= 0.6;
}

const ACADEMIC = /(^|\.)((edu|sch)(\.[a-z]{2})?|ac\.[a-z]{2})$/i;
const GOVERNMENT = /(^|\.)(gov|govt|mil|gouv|gob)(\.[a-z]{2})?$/i;

/** academic: .edu, .edu.ng, .ac.uk, .sch.ng … · government: .gov, .gov.ng … */
export function domainKind(domain: string): 'academic' | 'government' | 'other' {
  if (ACADEMIC.test(domain)) return 'academic';
  if (GOVERNMENT.test(domain)) return 'government';
  return 'other';
}
