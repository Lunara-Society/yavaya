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
 *
 * Styles are measured per page too, since 24 October 2026: each district now
 * loads a small stylesheet of its own (app/<district>/barrio.css, through its
 * layout), and adding up seven files that no page ever loads together
 * measured nothing anyone downloads. A page counts the root layout's styles,
 * every layout above it, and its own.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const BUDGET = {
  /** Compressed JavaScript any one page loads on arrival. */
  pageJsKb: 135,
  /** Compressed CSS any one page loads on arrival. */
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

/** `/a/b/page` → its own entry and the layouts above it: `/layout`, `/a/layout`, `/a/b/layout`. */
const cssOf = (route) => {
  const segments = route.split('/').slice(1, -1);
  const entries = ['/layout', ...segments.map((_, i) => `/${segments.slice(0, i + 1).join('/')}/layout`), route];
  return [...new Set(entries.flatMap((entry) => pages[entry] ?? []))].filter((f) => f.endsWith('.css'));
};
let css = { route: '', kb: 0 };
for (const route of Object.keys(pages)) {
  if (!route.endsWith('/page')) continue;
  const total = cssOf(route).reduce((sum, f) => sum + kb(f), 0);
  if (total > css.kb) css = { route, kb: total };
  if (total > BUDGET.cssKb) failures.push(`${route}: ${total.toFixed(1)} KB of styles (budget ${BUDGET.cssKb} KB)`);
}

if (failures.length) {
  console.error(`Size budget exceeded:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`Size budget: heaviest page ${heaviest.route} ${heaviest.kb.toFixed(1)}/${BUDGET.pageJsKb} KB JS; styles ${css.route} ${css.kb.toFixed(1)}/${BUDGET.cssKb} KB.`);
