/**
 * Plausibility checks for free-text onboarding answers: catches placeholders ("test", "n/a", "asdf"),
 * keyboard mashing ("sdfghjk"), repeated characters ("aaaa"), and letter sequences that do not occur in
 * real words, while accepting Nigerian and other non-English names and institutions.
 *
 * The rules are deliberately conservative: an answer is refused only when it is clearly not real
 * (tested against the ~10,000 university names in data/universities.ts, which all pass).
 */

export type TextKind = 'person' | 'label' | 'prose';
export type TextVerdict = { ok: true } | { ok: false; reason: string };

const PLACEHOLDERS = new Set([
  'test', 'testing', 'tester', 'tests', 'test test', 'testing testing', 'demo', 'sample', 'example', 'dummy', 'fake', 'random',
  'na', 'n a', 'nil', 'null', 'none', 'nothing', 'no', 'nope', 'not applicable', 'not available', 'unknown', 'idk', 'i dont know', 'dont know',
  'abc', 'abcd', 'abcde', 'abcdef', 'xyz', 'xxx', 'xxxx', 'xx', 'aaa', 'aa', 'zzz', 'qqq', 'foo', 'bar', 'foobar', 'foo bar', 'baz', 'blah', 'blah blah',
  'asdf', 'asd', 'qwe', 'qwerty', 'lorem', 'lorem ipsum', 'ipsum', 'hello', 'hello world', 'hi', 'hey', 'ok', 'okay', 'yes', 'whatever', 'something',
  'anything', 'stuff', 'thing', 'things', 'name', 'my name', 'your name', 'company', 'my company', 'organisation', 'organization', 'school', 'my school',
  'university', 'institution', 'course', 'title', 'job', 'work', 'business', 'project', 'my project', 'venture', 'startup', 'description', 'other',
  'user', 'admin', 'student', 'person', 'me', 'myself', 'self', 'nobody', 'someone', 'anonymous', 'tbd', 'tba', 'todo', 'pending', 'later', 'soon',
]);

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890'];
const KEYBOARD_RUNS = new Set<string>();
for (const row of ROWS) {
  for (const r of [row, [...row].reverse().join('')]) for (let i = 0; i + 5 <= r.length; i++) KEYBOARD_RUNS.add(r.slice(i, i + 5));
}

const KEYBOARD_RUNS_4 = new Set<string>();
for (const row of ROWS.slice(0, 3)) {
  for (const r of [row, [...row].reverse().join('')]) for (let i = 0; i + 4 <= r.length; i++) KEYBOARD_RUNS_4.add(r.slice(i, i + 4));
}
for (const real of ['erty', 'ytre', 'wert', 'trew', 'poiu', 'lkjh']) KEYBOARD_RUNS_4.delete(real);
const STRONG = new Set(['keyboard pattern', 'repeated letters', 'repeated pattern']);

/** Letter pairs that essentially never occur inside real words in English or the major Nigerian languages. */
const RARE_BIGRAMS = new Set(
  (
    'bq bz cj cv cx dx fq fv fx fz gq gv gx hx hz jb jc jd jf jg jh jk jl jm jn jp jq jr js jt jv jw jx jz kq kx kz lx mx mz pq pv px ' +
    'qb qc qd qf qg qh qj qk ql qm qn qp qq qr qs qt qv qw qx qy qz sx tq vb vc vd vf vg vh vj vk vm vn vp vq vt vw vx vz wq wv wx wz ' +
    'xb xd xg xj xk xm xn xq xr xv xw xz yq yv zb zc zf zg zj zk zm zn zp zq zr zv zw zx'
  ).split(' '),
);

/** Lower-case, strip accents (Ọ̀ → o, é → e) and collapse whitespace. */
export function normalize(s: string) {
  return s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Latin letter words of a string, accents removed. */
export function words(s: string) {
  return normalize(s).split(/[^a-z]+/).filter(Boolean);
}

const VOWELS = /[aeiouy]/;
const isLatin = (t: string) => /^[a-z]+$/.test(t);

/** Why a single word looks invented, or null when it looks like a real word. `original` keeps the casing. */
export function gibberishWord(token: string, original = token): string | null {
  if (!isLatin(token) || token.length < 4) return null;
  // Acronyms: UNILAG, FUTA, NNPC, BSc, MBBS, PhD
  if (original.length <= 10 && /^[A-Z][A-Za-z]*$/.test(original) && original.replace(/[^A-Z]/g, '').length >= Math.ceil(original.length / 2)) return null;
  if (/(.)\1{3}/.test(token)) return 'repeated letters';
  if (/(.)\1\1/.test(token)) return 'triple letters';
  for (let i = 0; i + 5 <= token.length; i++) if (KEYBOARD_RUNS.has(token.slice(i, i + 5))) return 'keyboard pattern';
  // Short mashes made of a 4-key run: "asdf", "hjkl", "fdsa" ("erty" is excluded: liberty, property)
  if (token.length <= 6) for (let i = 0; i + 4 <= token.length; i++) if (KEYBOARD_RUNS_4.has(token.slice(i, i + 4))) return 'keyboard pattern';
  if (!VOWELS.test(token)) return 'no vowels';
  if (/[^aeiouy]{6,}/.test(token)) return 'unpronounceable';
  let rare = 0;
  for (let i = 0; i + 2 <= token.length; i++) if (RARE_BIGRAMS.has(token.slice(i, i + 2))) rare++;
  const vowelShare = token.replace(/[^aeiouy]/g, '').length / token.length;
  if (rare >= 2 || (rare >= 1 && vowelShare < 0.25)) return 'unusual letter combination';
  if (token.length >= 7 && vowelShare < 0.15) return 'too few vowels';
  // Two-letter loops: "abababab", "lalalala"
  if (token.length >= 6 && new Set(token).size <= 2) return 'repeated pattern';
  return null;
}

function isPlaceholder(s: string) {
  const n = normalize(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return true;
  if (PLACEHOLDERS.has(n)) return true;
  if (/lorem ipsum/.test(n)) return true;
  const tokens = n.split(' ');
  if (tokens.every((t) => PLACEHOLDERS.has(t) || /^\d+$/.test(t))) return true;
  if (/^(.)\1*$/.test(n.replace(/ /g, ''))) return true; // "aaaa", "...."
  return false;
}

/**
 * person: a person's name (letters, spaces, hyphens, apostrophes and dots only).
 * label:  an organisation, institution, title, course, venture or level.
 * prose:  a sentence or short description.
 */
export function assessText(value: string, kind: TextKind): TextVerdict {
  const raw = value.trim();
  if (isPlaceholder(raw)) return { ok: false, reason: 'placeholder' };

  const letters = raw.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 2) return { ok: false, reason: 'no letters' };

  if (kind === 'person') {
    if (!/^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u.test(raw)) return { ok: false, reason: 'invalid characters' };
  } else {
    const visible = raw.replace(/\s/g, '').length;
    if (letters / visible < 0.5) return { ok: false, reason: 'mostly symbols or numbers' };
    if (/(.)\1{5,}/u.test(raw)) return { ok: false, reason: 'repeated characters' };
  }

  const originals = raw.normalize('NFKD').replace(/\p{M}/gu, '').split(/[^A-Za-z]+/).filter(Boolean);
  const judged = originals.filter((o) => o.length >= 4);
  const reasons = judged.map((o) => gibberishWord(o.toLowerCase(), o));
  const bad = reasons.filter(Boolean);
  // One keyboard mash or "aaaa" anywhere is enough; weaker signals need a majority of the words.
  if (reasons.some((r) => r && STRONG.has(r))) return { ok: false, reason: 'gibberish' };
  if (judged.length && bad.length / judged.length > 0.5) return { ok: false, reason: 'gibberish' };
  if (kind === 'prose') {
    if (bad.length >= 3 && bad.length / judged.length > 0.3) return { ok: false, reason: 'gibberish' };
    const all = words(raw);
    if (all.length >= 4 && new Set(all).size / all.length < 0.35) return { ok: false, reason: 'repetitive' };
  }
  // A single short "word" that is a mash: "sdfg", "kjhg"
  if (judged.length === 0 && kind !== 'person') {
    const only = words(raw).join('');
    if (only.length >= 3 && !VOWELS.test(only) && !/^[A-Z]+$/.test(raw.replace(/[^A-Za-z]/g, ''))) return { ok: false, reason: 'gibberish' };
  }
  return { ok: true };
}

const LEVEL_WORDS =
  /^(final|first|second|third|fourth|fifth|sixth|1st|2nd|3rd|[4-7]th)\s*years?$|^years?\s*[1-7]$|^(year|yr)\s*(one|two|three|four|five|six|seven)$|^[1-9]00\s*(l|lvl|level)?$|^(nd|hnd|ond|nce|ss|jss|sss)\s*[1-3]?$|^(level|lvl)\s*[1-9]00$|^(masters?|msc|m\.sc|ma|mba|mphil|phd|ph\.d|doctorate|postgraduate|post\s*graduate|pgd|pg|undergraduate|graduate|diploma|certificate|foundation|pre-?degree|remedial|jupeb|ijmb|a-?levels?|o-?levels?|freshman|sophomore|junior|senior|fresher|bootcamp|intern(ship)?)$/i;

/** "200", "200L", "300 level", "Year 2", "Final year", "HND 1", "SS3", "MSc", "PhD" … */
export function assessLevel(value: string): TextVerdict {
  const v = value.trim().replace(/\s+/g, ' ');
  if (LEVEL_WORDS.test(v)) return { ok: true };
  if (/^\d+$/.test(v)) return { ok: false, reason: 'unknown level' };
  return assessText(v, 'label');
}

/** Name tokens for matching: accents removed, honorifics and single letters dropped. */
const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'professor', 'engr', 'sir', 'chief', 'alhaji', 'alhaja', 'pastor', 'rev', 'barr', 'arc', 'jr', 'sr']);
export function nameTokens(s: string) {
  return words(s).filter((t) => t.length >= 2 && !HONORIFICS.has(t));
}

/**
 * True when two names plausibly belong to the same person: they share a name (≥ 3 letters, or an exact
 * 2-letter name), or one is an initial-plus-surname form of the other ("A. Okafor" vs "Adaeze Okafor").
 */
export function namesMatch(a: string, b: string) {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const sb = new Set(tb);
  if (ta.some((t) => sb.has(t))) return true;
  // Close spellings of a long name (Mohammed / Muhammad, Olúwaṣeun / Oluwaseun)
  return ta.some((x) => x.length >= 5 && tb.some((y) => y.length >= 5 && similarity(x, y) >= 0.8));
}

/** Normalised Levenshtein similarity, 0..1. */
export function similarity(a: string, b: string) {
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n]! / Math.max(m, n);
}

const STOP = new Set(['the', 'of', 'and', 'for', 'in', 'at', 'a', 'an', 'de', 'la', 'le', 'du', 'des', 'state', 'federal', 'national', 'ltd', 'limited', 'plc', 'inc', 'llc', 'nig', 'nigeria', 'company', 'co', 'group']);

/** Significant words of an organisation or institution name. */
export function orgTokens(s: string) {
  return words(s).filter((t) => t.length >= 3 && !STOP.has(t));
}

/** Can `label` be spelled by taking a prefix (≥ 1 letter) of some of `ws`, in order? "unilag" ← university·lagos, "futa" ← federal·university·technology·akure. */
function spelledByPrefixes(label: string, ws: string[]) {
  const memo = new Map<string, boolean>();
  const go = (i: number, w: number): boolean => {
    if (i === label.length) return true;
    if (w >= ws.length) return false;
    const key = `${i}:${w}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    let ok = go(i, w + 1); // skip this word
    const word = ws[w]!;
    for (let k = 1; !ok && k <= word.length && i + k <= label.length && label[i + k - 1] === word[k - 1]; k++) ok = go(i + k, w + 1);
    memo.set(key, ok);
    return ok;
  };
  return go(0, 0);
}

/**
 * Whether an email domain fits an organisation name: a label ("unilag", "abu", "dangote-group") contains a
 * significant word of the name, or is spelled from the starts of its words (acronyms included).
 */
export function domainMatchesOrg(domain: string, org: string) {
  const labels = domain.toLowerCase().split('.').slice(0, -1).flatMap((l) => l.split('-'));
  const ws = words(org).filter((t) => t.length >= 2 || t === 'a');
  const tokens = orgTokens(org);
  for (const label of labels) {
    if (label.length < 2 || label.length > 30 || ['edu', 'ac', 'gov', 'org', 'com', 'net', 'sch', 'mail', 'www', 'student', 'students', 'staff'].includes(label)) continue;
    if (tokens.some((t) => t.length >= 4 && (label.includes(t) || (label.length >= 4 && t.startsWith(label))))) return true;
    if (spelledByPrefixes(label, ws.slice(0, 12))) return true;
  }
  return false;
}
