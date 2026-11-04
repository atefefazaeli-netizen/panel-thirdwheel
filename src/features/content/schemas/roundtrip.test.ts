// Editor round trip on all 170 seeded items (the mock seed is the backend's content.data.ts; the
// same check ran against the real API's data: see the audit report). Opening an item and saving it
// unchanged must send back exactly what was loaded, unknown fields and key order included.
import { describe, expect, it } from 'vitest';
import seed from '@/mocks/data/content-seed.json';
import type { ContentSnapshot } from '../api/types';
import { editorSchema, formToSnapshot, snapshotToForm } from './editor';

type Seed = { id: string; kind: string; catalog: ContentSnapshot['catalog']; body: ContentSnapshot['body'] };

describe('editor codec on every seeded item', () => {
  const items = seed as unknown as Seed[];
  it('has the 170 items', () => expect(items).toHaveLength(170));
  it.each(items.map((s) => [s.id, s] as const))('%s round-trips byte for byte and validates', (_id, s) => {
    const snapshot: ContentSnapshot = { catalog: s.catalog, body: s.body };
    const form = snapshotToForm(snapshot);
    expect(JSON.stringify(formToSnapshot(form))).toBe(JSON.stringify(snapshot));
    const r = editorSchema(s.kind).safeParse(form);
    expect(r.success ? [] : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)).toEqual([]);
  });
});
