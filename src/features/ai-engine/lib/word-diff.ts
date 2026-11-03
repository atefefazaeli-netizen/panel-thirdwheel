// A small word-level diff (longest common subsequence) for prompt text against its default.

export type DiffPart = { kind: 'same' | 'added' | 'removed'; text: string };

const tokens = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];

export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  // Prompts are at most 1500 characters, so a full table is fine.
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const out: DiffPart[] = [];
  const push = (kind: DiffPart['kind'], text: string) => {
    const last = out.at(-1);
    if (last && last.kind === kind) last.text += text;
    else out.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('same', a[i]!);
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) push('removed', a[i++]!);
    else push('added', b[j++]!);
  }
  while (i < a.length) push('removed', a[i++]!);
  while (j < b.length) push('added', b[j++]!);
  return coalesce(out);
}

/** Joins a run of changes split only by spaces into one removed and one added part. */
function coalesce(parts: DiffPart[]): DiffPart[] {
  const out: DiffPart[] = [];
  const blank = (p: DiffPart | undefined) => !!p && p.kind === 'same' && /^\s+$/.test(p.text);
  let i = 0;
  while (i < parts.length) {
    if (parts[i]!.kind === 'same') {
      out.push(parts[i++]!);
      continue;
    }
    let removed = '';
    let added = '';
    while (
      i < parts.length &&
      (parts[i]!.kind !== 'same' || (blank(parts[i]) && parts[i + 1] && parts[i + 1]!.kind !== 'same'))
    ) {
      const p = parts[i++]!;
      if (p.kind !== 'added') removed += p.text;
      if (p.kind !== 'removed') added += p.text;
    }
    if (removed.trim()) out.push({ kind: 'removed', text: removed });
    if (added.trim()) out.push({ kind: 'added', text: added });
    else if (added) out.push({ kind: 'same', text: added });
  }
  return out;
}
