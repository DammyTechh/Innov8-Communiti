import { randomBytes } from 'node:crypto';

export function slugify(input: string, maxLength = 60) {
  const base = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength);
  return base || 'item';
}

/** Slug with a short random suffix so it is unique without a lookup loop. */
export const uniqueSlug = (input: string) => `${slugify(input, 50)}-${randomBytes(3).toString('hex')}`;
