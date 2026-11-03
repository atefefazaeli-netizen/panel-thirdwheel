// Display formatting. Dates show in the viewer's time zone.

const dateFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const toDate = (v: string | number | Date | null | undefined): Date | null => {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function formatDate(v: string | number | Date | null | undefined, empty = 'Never'): string {
  const d = toDate(v);
  return d ? dateFmt.format(d) : empty;
}

export function formatDateTime(v: string | number | Date | null | undefined, empty = 'Never'): string {
  const d = toDate(v);
  return d ? dateTimeFmt.format(d) : empty;
}

const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 hours ago", "in 2 days", "now". */
export function formatRelative(
  v: string | number | Date | null | undefined,
  now = Date.now(),
  empty = 'Never',
): string {
  const d = toDate(v);
  if (!d) return empty;
  const diff = Math.round((d.getTime() - now) / 1000);
  const abs = Math.abs(diff);
  for (const [unit, secs] of STEPS) {
    if (abs >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return 'just now';
}

/** "2026-11-03" for <input type="date">. */
export const toDateInput = (v: string | null | undefined): string => (v ? v.slice(0, 10) : '');

export const initials = (s: string | null | undefined): string =>
  (s ?? '?')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export const humanize = (s: string) => s.replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
