import { sql } from 'drizzle-orm';
import { timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/** UUID v7 primary key: time-ordered, so `id` doubles as the pagination cursor. */
export const pk = () =>
  uuid()
    .primaryKey()
    .default(sql`gen_random_uuid()`)
    .$defaultFn(() => uuidv7());

export const ts = () => timestamp({ withTimezone: true, mode: 'string' });

export const createdAt = () => ts().notNull().defaultNow();

/** `updated_at` is maintained by a trigger declared in the migration. */
export const timestamps = () => ({
  createdAt: createdAt(),
  updatedAt: ts().notNull().defaultNow(),
});
