import { z } from 'zod';

type Unwrapped<T> = T extends z.ZodDefault<infer I> ? I : T;

/**
 * PATCH body from a create schema: every field optional and every `.default()` removed.
 * Zod 4's `.partial()` keeps defaults, so a partial update would silently reset
 * unspecified fields (e.g. status back to "draft"). Always use this for PATCH bodies.
 */
export function patchOf<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    const inner = field instanceof z.ZodDefault ? (field.unwrap() as z.ZodType) : (field as z.ZodType);
    shape[key] = inner.optional();
  }
  return z.object(shape) as unknown as z.ZodObject<{ [K in keyof T]: z.ZodOptional<Unwrapped<T[K]>> }>;
}
