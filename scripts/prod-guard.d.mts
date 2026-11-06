export function checkProductionEnv(env: Record<string, string | undefined>): string[];
export const MARKERS: { name: string; test: RegExp }[];
export const FORBIDDEN_FILES: RegExp[];
export function scanBundle(
  files: { path: string; content: string }[],
): { file: string; marker: string; excerpt: string }[];
