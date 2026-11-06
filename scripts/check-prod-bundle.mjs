#!/usr/bin/env node
// CI check: builds the panel for production and fails if the bundle contains the mock API, mock
// data, demo credentials or dev-only copy (markers in prod-guard.mjs).
//   npm run check:prod-bundle
// Uses VITE_API_URL from the environment, or a placeholder https URL when unset (the bundle's
// content does not depend on it). VITE_API_MOCKS is removed: a production build refuses it anyway.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanBundle } from './prod-guard.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const env = { ...process.env, VITE_API_URL: process.env.VITE_API_URL || 'https://api.example.invalid/api/v1' };
delete env.VITE_API_MOCKS;

if (!process.argv.includes('--no-build')) {
  const vite = path.join(root, 'node_modules', '.bin', 'vite');
  const r = spawnSync(vite, ['build', '--mode', 'production'], { cwd: root, env, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('\ncheck:prod-bundle: the production build failed.');
    process.exit(r.status ?? 1);
  }
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

if (!fs.existsSync(dist)) {
  console.error('check:prod-bundle: no dist/ folder.');
  process.exit(1);
}
const files = walk(dist).map((p) => ({
  path: path.relative(dist, p).split(path.sep).join('/'),
  content: fs.readFileSync(p, 'utf8'),
}));
const findings = scanBundle(files);
if (findings.length) {
  console.error(`\ncheck:prod-bundle: FAILED, ${findings.length} finding(s):`);
  for (const f of findings) console.error(`  ${f.file}: ${f.marker}  …${f.excerpt}…`);
  process.exit(1);
}
console.log(`check:prod-bundle: OK, ${files.length} files scanned, no mock, demo or dev markers.`);
