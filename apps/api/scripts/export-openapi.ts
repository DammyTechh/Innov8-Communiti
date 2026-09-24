/** Writes openapi.json (for client codegen, Postman import, or CI diffing). */
import { writeFileSync } from 'node:fs';
import { buildApp } from '../src/app.js';

const app = await buildApp();
await app.ready();
writeFileSync('openapi.json', JSON.stringify(app.swagger(), null, 2));
const paths = Object.values(app.swagger().paths ?? {}).reduce((n, p) => n + Object.keys(p ?? {}).length, 0);
console.log(`Wrote openapi.json (${paths} operations)`);
await app.close();
process.exit(0);
