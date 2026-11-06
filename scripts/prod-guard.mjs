// Production build guard and bundle scanner (no dependencies: used by vite.config.ts, by
// scripts/check-prod-bundle.mjs and by the unit tests).

/** Hosts that may use plain http, for a local `vite preview` against a local API. */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Checks the environment of a production build. Returns the problems (empty = fine):
 * - VITE_API_URL is required: an absolute https URL, or http on localhost for a local preview.
 * - VITE_API_MOCKS is refused, whatever its value: the mock API never ships.
 * @param {Record<string, string | undefined>} env
 * @returns {string[]}
 */
export function checkProductionEnv(env) {
  const problems = [];
  const raw = (env.VITE_API_URL ?? '').trim();
  if (!raw) {
    problems.push('VITE_API_URL is required for a production build (the API base URL including /api/v1).');
  } else {
    let url = null;
    try {
      url = new URL(raw);
    } catch {
      problems.push(`VITE_API_URL must be an absolute URL, got "${raw}".`);
    }
    if (url) {
      const local = url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
      if (url.protocol !== 'https:' && !local)
        problems.push(`VITE_API_URL must use https (http only for localhost), got "${raw}".`);
      if (url.username || url.password) problems.push('VITE_API_URL must not contain a user name or password.');
    }
  }
  if ((env.VITE_API_MOCKS ?? '') !== '')
    problems.push('VITE_API_MOCKS is refused by production builds: the mock API exists only in development and tests.');
  return problems;
}

/**
 * What must never be in a production bundle: the mock API (MSW), its seed data, demo credentials,
 * the demo banner and the dev sign-in hint.
 * @type {{ name: string; test: RegExp }[]}
 */
export const MARKERS = [
  { name: 'msw', test: /(^|[^A-Za-z0-9_$-])msw([^A-Za-z0-9_$-]|$)/i },
  { name: 'mockServiceWorker', test: /mockServiceWorker/ },
  { name: 'setupWorker', test: /setupWorker/ },
  { name: 'Sara Haddad', test: /Sara Haddad/ },
  // A demo code, not a digit run inside a longer one (alphabets like 0123456789 are fine).
  { name: '123456', test: /(?<![0-9])123456(?![0-9])/ },
  { name: 'Demo data', test: /demo data/i },
  { name: 'dev password', test: /panel-dev-password/ },
  { name: 'dev mock banner', test: /Development mock API/ },
  { name: 'dev TOTP secret', test: /JBSWY3DPEHPK3PXP/ },
  { name: 'mock seed', test: /The Plans tab spins forever|dev-recovery-0001|\[MOCK API\]/ },
];

/** Files whose presence alone fails the check. */
export const FORBIDDEN_FILES = [/(^|\/)mockServiceWorker\.js$/];

const TEXT = /\.(m?js|cjs|css|html|json|txt|svg|map|webmanifest)$/i;

/**
 * Scans built files. Returns one finding per marker per file.
 * @param {{ path: string; content: string }[]} files
 * @returns {{ file: string; marker: string; excerpt: string }[]}
 */
export function scanBundle(files) {
  const findings = [];
  for (const f of files) {
    if (FORBIDDEN_FILES.some((re) => re.test(f.path))) {
      findings.push({ file: f.path, marker: 'forbidden file', excerpt: f.path });
      continue;
    }
    if (!TEXT.test(f.path)) continue;
    for (const m of MARKERS) {
      const hit = m.test.exec(f.content);
      if (hit) {
        const at = Math.max(0, hit.index - 40);
        findings.push({
          file: f.path,
          marker: m.name,
          excerpt: f.content.slice(at, hit.index + 60).replace(/\s+/g, ' '),
        });
      }
    }
  }
  return findings;
}
