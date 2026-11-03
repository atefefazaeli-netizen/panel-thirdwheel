// JSON parsing with a line and column for syntax errors (JsonEditor, imports).

export interface JsonParseResult {
  ok: boolean;
  value?: unknown;
  error?: string;
  line?: number;
  column?: number;
}

/** Parses JSON and reports a line and column for syntax errors. */
export function parseJson(text: string): JsonParseResult {
  if (!text.trim()) return { ok: false, error: 'Empty. Enter JSON or clear the field.' };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    const message = (e as Error).message;
    const pos = /position (\d+)/i.exec(message);
    if (pos) {
      const index = Number(pos[1]);
      const before = text.slice(0, index).split('\n');
      return { ok: false, error: message, line: before.length, column: (before.at(-1)?.length ?? 0) + 1 };
    }
    const lc = /line (\d+) column (\d+)/i.exec(message);
    return { ok: false, error: message, line: lc ? Number(lc[1]) : undefined, column: lc ? Number(lc[2]) : undefined };
  }
}
