// Site checks, run by `npm test` and in CI.
//
// 1. en.mjs has exactly the shape of es.mjs (same keys, same array lengths),
//    so no page silently loses a section in one language.
// 2. The committed output matches what the generator produces now.
// 3. Every relative link and asset reference in the output resolves to a file.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import es from './content/es.mjs';
import en from './content/en.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

function shape(a, b, path) {
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return problems.push(`${path}: array in es, not in en`);
    if (a.length !== b.length) problems.push(`${path}: ${a.length} items in es, ${b.length} in en`);
    a.forEach((v, i) => b[i] !== undefined && shape(v, b[i], `${path}[${i}]`));
  } else if (a && typeof a === 'object') {
    if (!b || typeof b !== 'object') return problems.push(`${path}: object in es, not in en`);
    for (const k of Object.keys(a)) (k in b ? shape(a[k], b[k], `${path}.${k}`) : problems.push(`${path}.${k}: missing in en`));
    for (const k of Object.keys(b)) if (!(k in a)) problems.push(`${path}.${k}: only in en`);
  } else if (typeof a !== typeof b) {
    problems.push(`${path}: ${typeof a} in es, ${typeof b} in en`);
  }
}
shape(es, en, 'content');

// Rebuild, then require a clean tree: output is committed, so it must be current.
execSync('node build/build.mjs', { cwd: ROOT, stdio: 'ignore' });
if (process.env.CI) {
  const dirty = execSync('git status --porcelain', { cwd: ROOT }).toString().trim();
  if (dirty) problems.push(`generated output is out of date; run npm run build and commit:\n${dirty}`);
}

const htmlFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (['.git', 'node_modules', 'build', 'docs', '.github'].includes(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.html')) htmlFiles.push(p);
  }
})(ROOT);

for (const file of htmlFiles) {
  if (file.endsWith('404.html')) continue; // absolute links by design
  const html = readFileSync(file, 'utf8');
  for (const [, ref] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|#|data:)/.test(ref)) continue;
    const clean = ref.split('#')[0].split('?')[0];
    let target = join(dirname(file), clean);
    if (clean.endsWith('/') || clean === '' || clean === '.' || clean === './') target = join(target, 'index.html');
    if (!existsSync(target)) problems.push(`${relative(ROOT, file)}: broken link ${ref}`);
  }
  if (!/<title>[^<]+<\/title>/.test(html)) problems.push(`${relative(ROOT, file)}: no <title>`);
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${htmlFiles.length} HTML files, content shapes match, all links resolve.`);
