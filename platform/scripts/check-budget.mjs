#!/usr/bin/env node
/**
 * Fails the build when a page's JavaScript or the stylesheets outgrow their
 * budget. Most of the people Yavaya is for are on inexpensive Android phones
 * and mobile data; weight that creeps in one harmless-looking import at a
 * time is how a site gets slow without anyone deciding it should.
 *
 * Measured after `next build`, compressed the way a browser receives it. A
 * page counts everything it loads on arrival: the root layout, the error
 * boundary and the page itself. When this fails, find what grew before
 * raising the number; when it truly has to grow, raise it here in the same
 * change and say why in the commit.
 *
 * October 2026, when this was written: pages 103–117 KB, styles 48 KB.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET = {
  /** Compressed JavaScript any one page loads on arrival. */
  pageJsKb: 135,
  /** Compressed CSS, all stylesheets together. */
  cssKb: 60,
};

const next = path.join(process.cwd(), '.next');
const pages = JSON.parse(readFileSync(path.join(next, 'app-build-manifest.json'), 'utf8')).pages;

const sizes = new Map();
const kb = (file) => {
  if (!sizes.has(file)) sizes.set(file, gzipSync(readFileSync(path.join(next, file)), { level: 9 }).length / 1024);
  return sizes.get(file);
};

const shell = new Set([...(pages['/layout'] ?? []), ...(pages['/error'] ?? [])]);
const failures = [];
let heaviest = { route: '', kb: 0 };
for (const [route, files] of Object.entries(pages)) {
  if (!route.endsWith('/page')) continue;
  const total = [...new Set([...shell, ...files])].filter((f) => f.endsWith('.js')).reduce((sum, f) => sum + kb(f), 0);
  if (total > heaviest.kb) heaviest = { route, kb: total };
  if (total > BUDGET.pageJsKb) failures.push(`${route}: ${total.toFixed(1)} KB of JavaScript (budget ${BUDGET.pageJsKb} KB)`);
}

const css = [...new Set(Object.values(pages).flat())].filter((f) => f.endsWith('.css')).reduce((sum, f) => sum + kb(f), 0);
if (css > BUDGET.cssKb) failures.push(`stylesheets: ${css.toFixed(1)} KB (budget ${BUDGET.cssKb} KB)`);

if (failures.length) {
  console.error(`Size budget exceeded:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Size budget: heaviest page ${heaviest.route} ${heaviest.kb.toFixed(1)}/${BUDGET.pageJsKb} KB JS; styles ${css.toFixed(1)}/${BUDGET.cssKb} KB.`);
