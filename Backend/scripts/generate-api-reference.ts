/**
 * Writes docs/API_REFERENCE.md: every endpoint with who can call it, its parameters, request body,
 * response fields and the errors to handle. Generated from the same Zod schemas that validate requests,
 * so it can't drift from the code.
 *
 *   npm run docs:reference
 */
import { writeFileSync } from 'node:fs';
import type { RouteOptions } from 'fastify';
import { buildApp } from '../src/app.js';
import { GUARD } from '../src/plugins/auth.js';
import { API_TAGS } from '../src/plugins/swagger.js';

type Json = Record<string, unknown>;
type Schema = Json & {
  $ref?: string;
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  anyOf?: Schema[];
  oneOf?: Schema[];
  allOf?: Schema[];
  enum?: unknown[];
  const?: unknown;
  description?: string;
  additionalProperties?: Schema | boolean;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  default?: unknown;
};

const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : v === undefined || v === null ? '' : JSON.stringify(v));

// ─── Collect route guards ─────────────────────────────────────────────────
const guards = new Map<string, Set<string>>();
const collect = (r: RouteOptions) => {
  const list = [r.onRequest, r.preHandler].flat().filter(Boolean) as unknown as Record<symbol, string>[];
  const set = new Set(list.map((f) => f[GUARD]).filter((g): g is string => typeof g === 'string'));
  for (const m of [r.method].flat()) guards.set(`${m.toUpperCase()} ${r.url.replace(/:(\w+)/g, '{$1}')}`, set);
};

const app = await buildApp({ onRoute: collect });
await app.ready();
const spec = app.swagger() as unknown as { paths: Record<string, Record<string, Json>>; components: { schemas: Record<string, Schema> } };
const schemas = spec.components.schemas;

const refName = (ref: string) => ref.split('/').pop()!;
const anchor = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const resolve = (s: Schema | undefined): Schema | undefined => (s?.$ref ? resolve(schemas[refName(s.$ref)]) : s);
/** Input and output variants of a component share one name in the docs. */
const display = (name: string) => name.replace(/Input$/, '');
const used = new Set<string>();

function typeOf(s: Schema | undefined): string {
  if (!s) return 'any';
  if (s.$ref) {
    const n = display(refName(s.$ref));
    used.add(n);
    return `[${n}](#${anchor(n)})`;
  }
  const variants = s.anyOf ?? s.oneOf;
  if (variants) {
    const parts = variants.map((v) => (v.type === 'null' ? 'null' : typeOf(v)));
    return [...new Set(parts)].join(' \\| ');
  }
  if (s.const !== undefined) return `\`${JSON.stringify(s.const)}\``;
  if (s.enum) return s.enum.map((e) => `\`${String(e)}\``).join(' \\| ');
  const t = Array.isArray(s.type) ? s.type.join(' \\| ') : s.type;
  if (t === 'array') return `${typeOf(s.items)}[]`;
  if (t === 'object' && s.additionalProperties && typeof s.additionalProperties === 'object' && !s.properties) return `map<string, ${typeOf(s.additionalProperties)}>`;
  if (t === 'string' && typeof s.format === 'string') return `string (${s.format})`;
  return t ?? 'any';
}

function rules(s: Schema | undefined): string {
  const r = resolve(s);
  if (!r) return '';
  const v = r.anyOf?.find((x) => x.type !== 'null') ?? r;
  const out: string[] = [];
  const rr = resolve(v) ?? v;
  if (rr.minLength !== undefined) out.push(`min ${rr.minLength} chars`);
  if (rr.maxLength !== undefined) out.push(`max ${rr.maxLength} chars`);
  if (rr.minimum !== undefined) out.push(`≥ ${rr.minimum}`);
  if (rr.maximum !== undefined) out.push(`≤ ${rr.maximum}`);
  if (rr.minItems !== undefined) out.push(`min ${rr.minItems} items`);
  if (rr.maxItems !== undefined) out.push(`max ${rr.maxItems} items`);
  if (typeof rr.pattern === 'string' && rr.pattern.length <= 60) out.push(`pattern \`${rr.pattern.replace(/\|/g, '\\|')}\``);
  if (r.default !== undefined) out.push(`default \`${JSON.stringify(r.default)}\``);
  return out.join(', ');
}

const clean = (t: unknown) => str(t).replace(/\n+/g, ' ').replace(/\|/g, '\\|').trim();

/** Rows for an object's fields, nested objects flattened with dot paths (2 levels). */
function fieldRows(s: Schema | undefined, prefix = '', depth = 0, showRequired = true): string[] {
  const obj = resolve(s);
  if (!obj) return [];
  const branch: Schema = obj.allOf
    ? { properties: Object.assign({}, ...obj.allOf.map((a) => resolve(a)?.properties ?? {})) as Record<string, Schema>, required: obj.allOf.flatMap((a) => resolve(a)?.required ?? []) }
    : obj;
  const props: Record<string, Schema> = branch.properties ?? {};
  const req = new Set(branch.required ?? []);
  const rows: string[] = [];
  for (const [name, prop] of Object.entries(props)) {
    const path = `${prefix}${name}`;
    const cells = [`\`${path}\``, typeOf(prop)];
    if (showRequired) cells.push(req.has(name) ? '**yes**' : 'no');
    cells.push(clean([resolve(prop)?.description ?? prop.description, rules(prop)].filter(Boolean).join(' · ')));
    rows.push(`| ${cells.join(' | ')} |`);
    const inner = resolve(prop);
    if (depth < 1 && !prop.$ref && inner?.type === 'object' && inner.properties) rows.push(...fieldRows(inner, `${path}.`, depth + 1, showRequired));
    if (depth < 1 && !prop.$ref && inner?.type === 'array' && inner.items && !inner.items.$ref && resolve(inner.items)?.properties) rows.push(...fieldRows(inner.items, `${path}[].`, depth + 1, showRequired));
  }
  return rows;
}

function bodyBlock(s: Schema | undefined, showRequired: boolean): string {
  if (!s) return '';
  const r = resolve(s);
  const union = r?.oneOf ?? r?.anyOf;
  if (union && union.some((u) => resolve(u)?.properties)) {
    return union
      .filter((u) => resolve(u)?.properties)
      .map((u, i) => {
        const disc = Object.entries(resolve(u)!.properties!).find(([, p]) => resolve(p)?.const !== undefined);
        const label = disc ? `\`${disc[0]}: "${String(resolve(disc[1])!.const)}"\`` : `variant ${i + 1}`;
        return `*When ${label}:*\n\n${table(fieldRows(u, '', 0, showRequired), showRequired)}`;
      })
      .join('\n\n');
  }
  if (r?.type === 'array') return `Array of ${typeOf(r.items)}\n\n${r.items && resolve(r.items)?.properties ? table(fieldRows(r.items, '[].', 0, showRequired), showRequired) : ''}`;
  if (s.$ref) used.add(display(refName(s.$ref)));
  // Responses that are a named schema link to it (described once under Schemas) instead of repeating it.
  if (s.$ref && !showRequired) return `Returns ${typeOf(s)}`;
  const rows = fieldRows(s, '', 0, showRequired);
  if (!rows.length) return typeOf(s) === 'any' ? '_Empty body._' : `\`${typeOf(s)}\``;
  return (s.$ref ? `Schema: ${typeOf(s)}\n\n` : '') + table(rows, showRequired);
}

const table = (rows: string[], req: boolean) => (rows.length ? `| Field | Type | ${req ? 'Required | ' : ''}Notes |\n|---|---|${req ? '---|' : ''}---|\n${rows.join('\n')}` : '');

function access(method: string, path: string, op: Json) {
  const g = guards.get(`${method} ${path}`) ?? new Set();
  const role = [...g].find((x) => x.startsWith('role:'))?.slice(5);
  const secured = Array.isArray(op.security) && op.security.length > 0;
  if (path.startsWith('/api/v1/admin')) return { label: `Staff: **${role ?? 'moderator'}** or above`, auth: true, member: false, staff: true };
  if (g.has('member')) return { label: 'Signed in, **onboarding complete**, not restricted', auth: true, member: true, staff: false };
  if (secured) return { label: 'Signed in (Bearer token)', auth: true, member: false, staff: false };
  return { label: 'Public (a token is optional; some fields are personalised when sent)', auth: false, member: false, staff: false };
}

// ─── Render ───────────────────────────────────────────────────────────────
const byTag = new Map<string, string[]>();
const index: string[] = [];
let count = 0;
for (const [path, methods] of Object.entries(spec.paths)) {
  for (const [m, opRaw] of Object.entries(methods)) {
    const op = opRaw as Json & { tags?: string[]; summary?: string; description?: string; parameters?: Json[]; requestBody?: Json; responses?: Record<string, Json> };
    const method = m.toUpperCase();
    const tag = op.tags?.[0] ?? 'Other';
    const short = path.replace('/api/v1', '');
    const a = access(method, path, op);
    const id = anchor(`${method} ${short}`);
    count++;
    index.push(`| ${tag} | \`${method}\` | [\`${short}\`](#${id}) | ${clean(op.summary)} |`);

    const parts: string[] = [`### ${method} ${short}`, '', `<a id="${id}"></a>**${clean(op.summary)}**`, '', `- **Access:** ${a.label}`];
    if (op.description) parts.push('', clean(op.description).replace(/\\\|/g, '|'));

    const params = op.parameters ?? [];
    for (const where of ['path', 'query', 'header']) {
      const ps = params.filter((p) => p.in === where && !(where === 'header' && p.name === 'authorization'));
      if (!ps.length) continue;
      parts.push('', `**${where === 'path' ? 'Path' : where === 'query' ? 'Query' : 'Header'} parameters**`, '', '| Name | Type | Required | Notes |', '|---|---|---|---|');
      for (const p of ps) {
        const s = p.schema as Schema;
        parts.push(`| \`${String(p.name)}\` | ${typeOf(s)} | ${p.required ? '**yes**' : 'no'} | ${clean([str(p.description ?? s?.description), rules(s)].filter(Boolean).join(' · '))} |`);
      }
    }

    const body = (op.requestBody?.content as Record<string, { schema?: Schema }> | undefined)?.['application/json']?.schema;
    if (body) parts.push('', `**Request body** (JSON${op.requestBody?.required ? '' : ', optional'})`, '', bodyBlock(body, true));

    const responses = op.responses ?? {};
    for (const [code, res] of Object.entries(responses)) {
      const schema = (res.content as Record<string, { schema?: Schema }> | undefined)?.['application/json']?.schema;
      const n = Number(code);
      if (n >= 400) continue;
      parts.push('', `**Response ${code}**${schema ? '' : ' — no body'}`);
      if (schema) parts.push('', bodyBlock(schema, false));
    }

    const errors: string[] = [];
    if (body || params.some((p) => p.in === 'query' || p.in === 'path')) errors.push('`400 VALIDATION_FAILED` (see `error.fields`)');
    for (const [code, res] of Object.entries(responses)) {
      if (Number(code) >= 400) {
        const s = resolve((res.content as Record<string, { schema?: Schema }> | undefined)?.['application/json']?.schema);
        const codeSchema = resolve(resolve(s?.properties?.error)?.properties?.code);
        const c = codeSchema?.const ?? codeSchema?.enum?.[0];
        errors.push(`\`${code}${c ? ` ${str(c)}` : ''}\`${res.description && res.description !== 'Default Response' ? ` (${clean(res.description)})` : ''}`);
      }
    }
    if (a.auth) errors.push('`401 UNAUTHENTICATED / TOKEN_EXPIRED / TOKEN_INVALID`', '`403 ACCOUNT_SUSPENDED / ACCOUNT_BLOCKED`');
    if (a.member) errors.push('`403 ONBOARDING_REQUIRED`', '`403 FORBIDDEN` (account restricted)');
    if (a.staff) errors.push('`403 FORBIDDEN` (role too low)');
    if (params.some((p) => p.in === 'path')) errors.push('`404 NOT_FOUND`');
    errors.push('`429 RATE_LIMITED`');
    if (!path.includes('/admin') && !path.includes('/auth/') && !path.includes('/health') && !path.includes('app-config')) errors.push('`503 MAINTENANCE`');
    parts.push('', `**Errors to handle:** ${errors.join(', ')}`, '', '---', '');
    byTag.set(tag, [...(byTag.get(tag) ?? []), parts.join('\n')]);
  }
}

// Components referenced anywhere (and the ones they reference).
const rendered = new Set<string>();
const componentDocs: string[] = [];
const queue = [...used];
while (queue.length) {
  const n = queue.shift()!;
  if (rendered.has(n)) continue;
  rendered.add(n);
  const s = schemas[n] ?? schemas[`${n}Input`];
  if (!s) continue;
  const before = new Set(used);
  const block = bodyBlock(s, true);
  for (const u of used) if (!before.has(u)) queue.push(u);
  componentDocs.push(`### ${n}\n\n${s.description ? `${clean(s.description)}\n\n` : ''}${block}\n`);
}
componentDocs.sort();

const tagOrder = API_TAGS.map((t) => t.name);
const sections = [...byTag.keys()].sort((x, y) => tagOrder.indexOf(x) - tagOrder.indexOf(y));
const doc = [
  '# CommUniti API — endpoint reference',
  '',
  `_Generated from the code by \`npm run docs:reference\` · ${count} endpoints · base URL \`https://api.mycommuniti.org/api/v1\` (local: \`http://localhost:4000/api/v1\`)._`,
  '',
  'Read **[FRONTEND_INTEGRATION.md](FRONTEND_INTEGRATION.md)** first: headers, tokens and refresh, errors, pagination, uploads, realtime and the onboarding flow. This file lists every endpoint. Swagger UI with "Try it out" is at `/api/docs`.',
  '',
  '**Reading the tables.** Request tables mark required fields. Response tables list every field the API returns (unlisted fields are never sent). `null` means the field is present with no value. Linked types are described under [Schemas](#schemas).',
  '',
  '## Index',
  '',
  '| Area | Method | Path | What it does |',
  '|---|---|---|---|',
  ...index,
  '',
  ...sections.flatMap((t) => [`## ${t}`, '', API_TAGS.find((x) => x.name === t)?.description ?? '', '', ...byTag.get(t)!]),
  '## Schemas',
  '',
  ...componentDocs,
].join('\n');

writeFileSync(new URL('../docs/API_REFERENCE.md', import.meta.url), doc);
console.log(`Wrote docs/API_REFERENCE.md (${count} endpoints, ${componentDocs.length} schemas)`);
await app.close();
process.exit(0);
