/** Escapes LIKE/ILIKE wildcards so user input like "50%" or "a_b" is matched literally. */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** "%term%" pattern for contains-search. */
export const contains = (s: string) => `%${escapeLike(s)}%`;
