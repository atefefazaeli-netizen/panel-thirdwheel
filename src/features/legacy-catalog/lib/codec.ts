import type { CatalogItem, Experience } from '../api/types';
import type { CatalogItemForm, ExperienceForm } from '../schemas/legacy';

const opt = <T>(v: T | '' | null | undefined) => (v === '' || v === null || v === undefined ? undefined : v);

export function itemToForm(i: CatalogItem | null, nextId: number): CatalogItemForm {
  return {
    id: i?.id ?? nextId,
    title: i?.title ?? '',
    where: i?.where ?? 'out',
    usd: i?.usd ?? 0,
    per: i?.per ?? '',
    reason: i?.reason ?? '',
    meta: i?.meta ?? '',
    kind: i?.kind ?? 'book',
    provider: i?.provider ?? '',
    site: i?.site ?? '',
    deposit: i?.deposit ?? null,
    cancel: i?.cancel ?? '',
    slots: i?.slots ?? [],
    weekendOnly: !!i?.weekendOnly,
    voucher: !!i?.voucher,
    d: i?.d ?? 'M12 20s-7-4.35-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.65-7 9-7 9z',
    tags: i?.tags ?? [],
    refPrefix: i?.refPrefix ?? '',
  };
}

/** The request body: empty optional fields are left out, as the DTO expects. */
export function formToItem(f: CatalogItemForm): CatalogItem {
  const out: CatalogItem = {
    id: f.id,
    title: f.title.trim(),
    where: f.where,
    usd: f.usd,
    reason: f.reason.trim(),
    meta: f.meta.trim(),
    kind: f.kind,
    d: f.d.trim(),
  };
  const extra: Partial<CatalogItem> = {
    // Not trimmed: the app renders `${usd}${per}` (" groceries, estimated").
    per: opt(f.per),
    provider: opt(f.provider.trim()),
    site: opt(f.site.trim()),
    deposit: opt(f.deposit),
    cancel: opt(f.cancel.trim()),
    slots: f.slots.length ? f.slots : undefined,
    weekendOnly: f.weekendOnly || undefined,
    voucher: f.voucher || undefined,
    tags: f.tags.length ? f.tags : undefined,
    refPrefix: opt(f.refPrefix.trim()),
  };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  return out;
}

export function xpToForm(x: Experience | null): ExperienceForm {
  return {
    id: x?.id ?? '',
    exp: x?.exp ?? 'talk',
    title: x?.title ?? '',
    meta: x?.meta ?? '',
    reason: x?.reason ?? '',
    d: x?.d ?? '',
    items: x?.items ?? [],
    tag: x?.tag ?? '',
    kind: x?.kind ?? '',
    onlyDur: (x?.only?.dur ?? []) as ExperienceForm['onlyDur'],
    onlyKids: (x?.only?.kids ?? []) as ExperienceForm['onlyKids'],
    onlyLiving: (x?.only?.living ?? []) as ExperienceForm['onlyLiving'],
    no: (x?.no ?? []) as ExperienceForm['no'],
    pText: x?.p ? JSON.stringify(x.p) : '',
    cmdText: x?.cmd ? JSON.stringify(x.cmd) : '',
  };
}

export function formToXp(f: ExperienceForm): Experience {
  const x: Experience = { id: f.id, exp: f.exp, title: f.title.trim(), meta: f.meta.trim(), reason: f.reason.trim() };
  if (f.d.trim()) x.d = f.d.trim();
  if (f.items.length) x.items = f.items;
  if (f.tag.trim()) x.tag = f.tag.trim();
  if (f.kind.trim()) x.kind = f.kind.trim();
  const only: Experience['only'] = {};
  if (f.onlyDur.length) only.dur = f.onlyDur;
  if (f.onlyKids.length) only.kids = f.onlyKids;
  if (f.onlyLiving.length) only.living = f.onlyLiving;
  if (Object.keys(only).length) x.only = only;
  if (f.no.length) x.no = f.no;
  if (f.pText.trim()) x.p = JSON.parse(f.pText) as Record<string, number>;
  if (f.cmdText.trim()) x.cmd = JSON.parse(f.cmdText) as Experience['cmd'];
  return x;
}
