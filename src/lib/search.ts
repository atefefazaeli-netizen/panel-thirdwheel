// Helpers for list filters that live in the URL (typed search params per route).
import { z } from 'zod';

/** page / limit as the API takes them; bad values fall back to the defaults. */
export const pageSearch = {
  page: z.coerce.number().int().min(1).optional().catch(undefined),
  limit: z.coerce.number().int().min(1).max(100).optional().catch(undefined),
};

export const optionalString = z.string().trim().min(1).optional().catch(undefined);
export const optionalEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).optional().catch(undefined);
export const optionalBool = z
  .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
  .optional()
  .catch(undefined);

/** Drops undefined, null and empty strings so the URL stays short. */
export function cleanSearch<T extends Record<string, unknown>>(s: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

/** Builds a search validator for TanStack Router from a Zod object. */
export function searchValidator<S extends z.ZodType>(schema: S) {
  return (input: Record<string, unknown>): z.output<S> => schema.parse(input);
}
