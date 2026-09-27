// Yavaya site generator.
//
// Plain Node, no dependencies: `node build/build.mjs` writes the whole site
// into the repository root, which is what GitHub Pages serves. Every page is
// rendered once per locale from build/content/{es,en}.mjs — Spanish at the
// root (the reference locale), English under /en/.
//
// Links are relative on purpose. The same output then works on yavaya.lat and
// on any preview address GitHub Pages gives the repository.

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { icons } from './icons.mjs';
import es from './content/es.mjs';
import en from './content/en.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://yavaya.lat';
const LOCALES = { es, en };

// One entry per page. Slugs are per locale so each language reads naturally.
export const PAGES = [
  { id: 'home', slug: { es: '', en: '' } },
  { id: 'districts', slug: { es: 'distritos', en: 'districts' } },
  { id: 'mercadito', slug: { es: 'mercadito', en: 'mercadito' }, district: true },
  { id: 'yavayago', slug: { es: 'yavayago', en: 'yavayago' }, district: true },
  { id: 'work', slug: { es: 'work', en: 'work' }, district: true },
  { id: 'community', slug: { es: 'comunidad', en: 'community' }, district: true },
  { id: 'impact', slug: { es: 'impacto', en: 'impact' }, district: true },
  { id: 'animals', slug: { es: 'animales', en: 'animals' }, district: true },
  { id: 'trust', slug: { es: 'confianza', en: 'trust' } },
  { id: 'reputation', slug: { es: 'reputacion', en: 'reputation' } },
  { id: 'tokens', slug: { es: 'tokens', en: 'tokens' } },
  { id: 'pricing', slug: { es: 'precios', en: 'pricing' } },
  { id: 'transparency', slug: { es: 'transparencia', en: 'transparency' } },
  { id: 'status', slug: { es: 'estado', en: 'status' } },
  { id: 'roadmap', slug: { es: 'hoja-de-ruta', en: 'roadmap' } },
  { id: 'about', slug: { es: 'nosotros', en: 'about' } },
  { id: 'help', slug: { es: 'ayuda', en: 'help' } },
  { id: 'privacy', slug: { es: 'privacidad', en: 'privacy' } },
];

const DISTRICT_IDS = PAGES.filter((p) => p.district).map((p) => p.id);
const byId = Object.fromEntries(PAGES.map((p) => [p.id, p]));

// ── Helpers ──────────────────────────────────────────────────────────────

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Content may use **bold**, *emphasis* and `code`; everything else is escaped.
const md = (s) =>
  esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');

const paras = (list) => (Array.isArray(list) ? list : [list]).map((p) => `<p>${md(p)}</p>`).join('');

/** Path from the site root to a page, e.g. "en/trust/". */
function pathOf(locale, id) {
  const slug = byId[id].slug[locale];
  const prefix = locale === 'es' ? '' : `${locale}/`;
  return slug ? `${prefix}${slug}/` : prefix;
}

/** Relative href from one page to another. */
function makeHref(fromPath) {
  const depth = fromPath.split('/').filter(Boolean).length;
  const up = depth ? '../'.repeat(depth) : './';
  return (target) => {
    if (target === '') return up;
    return up === './' ? target : up + target;
  };
}

const badge = (c, state) => `<span class="badge badge-${state}">${esc(c.ui.states[state])}</span>`;

// ── Layout ───────────────────────────────────────────────────────────────

function layout({ locale, id, title, description, body, tone }) {
  const c = LOCALES[locale];
  const here = pathOf(locale, id);
  const href = makeHref(here);
  const other = locale === 'es' ? 'en' : 'es';
  const link = (pid) => href(pathOf(locale, pid));
  const cur = (pid) => (pid === id ? ' aria-current="page"' : '');
  const fullTitle = id === 'home' ? `${c.ui.brand} — ${c.ui.tagline}` : `${title} · ${c.ui.brand}`;

  const primary = ['districts', 'trust', 'reputation', 'tokens', 'status'];
  const menuGroups = [
    [c.ui.menu.districts, ['districts', ...DISTRICT_IDS]],
    [c.ui.menu.platform, ['trust', 'reputation', 'tokens', 'pricing', 'transparency']],
    [c.ui.menu.yavaya, ['about', 'roadmap', 'status', 'help', 'privacy']],
  ];

  const nav = primary.map((pid) => `<a href="${link(pid)}"${cur(pid)}>${esc(c.nav[pid])}</a>`).join('');
  const menu = menuGroups
    .map(
      ([label, ids]) =>
        `<div class="menu-label">${esc(label)}</div>` +
        ids.map((pid) => `<a href="${link(pid)}"${cur(pid)}>${esc(c.nav[pid])}</a>`).join(''),
    )
    .join('<hr>');

  const footCols = menuGroups
    .map(
      ([label, ids]) =>
        `<div><h4>${esc(label)}</h4><ul>${ids
          .map((pid) => `<li><a href="${link(pid)}">${esc(c.nav[pid])}</a></li>`)
          .join('')}</ul></div>`,
    )
    .join('');

  const dock = [
    ['home', icons.home],
    ['districts', icons.grid],
    ['trust', icons.shield],
    ['status', icons.pulse],
  ]
    .map(([pid, ico]) => `<a href="${link(pid)}"${cur(pid)}>${ico}<span>${esc(c.nav[pid])}</span></a>`)
    .join('');

  const canonical = `${SITE}/${here}`;
  const alt = (l) => `${SITE}/${pathOf(l, id)}`;

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<link rel="alternate" hreflang="es" href="${alt('es')}">
<link rel="alternate" hreflang="en" href="${alt('en')}">
<link rel="alternate" hreflang="x-default" href="${alt('es')}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Yavaya">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="${locale === 'es' ? 'es_419' : 'en_US'}">
<meta name="theme-color" content="#081120">
<link rel="icon" href="${href('assets/favicon.svg')}" type="image/svg+xml">
<link rel="preload" href="${href('assets/fonts/fraunces.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${href('assets/fonts/jakarta.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${href('assets/site.css')}">
<script>try{var t=localStorage.getItem('yavaya-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
</head>
<body>
<a class="skip" href="#main">${esc(c.ui.skip)}</a>
<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="${link('home')}" aria-label="${esc(c.ui.brand)} — ${esc(c.nav.home)}">${icons.mark}<span>YAVAYA</span></a>
    <nav class="nav" aria-label="${esc(c.ui.navLabel)}">${nav}</nav>
    <div class="tools">
      <a class="chip" href="${href(pathOf(other, id))}" hreflang="${other}" lang="${other}" data-lang-choice="${other}" aria-label="${esc(c.ui.switchLang)}">${other.toUpperCase()}</a>
      <button class="chip" id="theme-toggle" type="button" aria-label="${esc(c.ui.theme)}"><span class="theme-light-icon">${icons.sun}</span><span class="theme-dark-icon">${icons.moon}</span></button>
      <details class="menu">
        <summary class="chip" aria-label="${esc(c.ui.menuOpen)}">${icons.menu}</summary>
        <div class="menu-panel">${menu}</div>
      </details>
    </div>
  </div>
</header>
<div class="ribbon" role="note"><div class="wrap"><strong>${esc(c.ui.ribbon.label)}</strong><span>${md(c.ui.ribbon.text)}</span><a href="${link('status')}">${esc(c.ui.ribbon.link)}</a></div></div>
<main id="main"${tone ? ` class="tone-${tone}"` : ''}>
${body({ link, href, c, locale })}
</main>
<footer class="foot">
  <div class="wrap">
    <div class="foot-grid">
      <div class="foot-brand">
        <a class="brand" href="${link('home')}">${icons.mark}<span>YAVAYA</span></a>
        <p class="muted mt">${esc(c.ui.footer.about)}</p>
      </div>
      ${footCols}
    </div>
    <div class="foot-base"><span>${esc(c.ui.footer.copy)}</span><span>${esc(c.ui.footer.honest)}</span></div>
  </div>
</footer>
<nav class="dock" aria-label="${esc(c.ui.dockLabel)}">${dock}</nav>
<script src="${href('assets/site.js')}" defer></script>
</body>
</html>
`;
}

// ── Shared blocks ────────────────────────────────────────────────────────

function pageHero(p, tone) {
  return `<section class="page-hero${tone ? ' tinted' : ''}"><div class="wrap">
  <div class="eyebrow">${esc(p.eyebrow)}</div>
  <h1>${esc(p.title)}</h1>
  <p class="lead">${md(p.lead)}</p>
  ${p.badge ? `<p class="mt mb0">${p.badge}</p>` : ''}
</div></section>`;
}

const sectionHead = (s) =>
  `<div class="section-head">${s.eyebrow ? `<div class="eyebrow">${esc(s.eyebrow)}</div>` : ''}<h2 class="h-lg">${esc(
    s.title,
  )}</h2>${s.lead ? `<p class="lead">${md(s.lead)}</p>` : ''}</div>`;

const cards = (items, cls = 'g3', tone) =>
  `<div class="grid ${cls}">${items
    .map(
      (it) =>
        `<div class="card${tone ? ' tone' : ''}">${it.icon ? `<div class="ico">${icons[it.icon]}</div>` : ''}<h3>${esc(
          it.title,
        )}</h3>${paras(it.text)}</div>`,
    )
    .join('')}</div>`;

const checks = (items, x = false) =>
  `<ul class="list-check${x ? ' list-x' : ''}">${items.map((i) => `<li>${md(i)}</li>`).join('')}</ul>`;

const table = (head, rows) =>
  `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((cell, i) => (i === 0 ? `<td><strong>${md(cell)}</strong></td>` : `<td>${md(cell)}</td>`)).join('')}</tr>`)
    .join('')}</tbody></table></div>`;

const steps = (items) =>
  `<ol class="steps">${items.map((s) => `<li><strong>${esc(s.title)}</strong><span>${md(s.text)}</span></li>`).join('')}</ol>`;

const note = (text) => `<div class="note">${md(text)}</div>`;

function districtStatus(c, id) {
  return `${badge(c, 'planned')} <span class="muted">· ${esc(c.districts[id].phase)}</span>`;
}

function districtNext(c, link, id) {
  const i = DISTRICT_IDS.indexOf(id);
  const next = DISTRICT_IDS[(i + 1) % DISTRICT_IDS.length];
  const d = c.districts[next];
  return `<section class="section alt"><div class="wrap">
  <div class="split">
    <div>${sectionHead({ eyebrow: c.ui.sharedTitle, title: c.ui.sharedHead, lead: c.ui.sharedLead })}
      <div class="btn-row"><a class="btn btn-line" href="${link('trust')}">${esc(c.nav.trust)}</a><a class="btn btn-line" href="${link('reputation')}">${esc(c.nav.reputation)}</a></div>
    </div>
    <a class="gate tone-${next}" href="${link(next)}"><span class="gate-art">${icons[next]}</span><span class="gate-foot">${esc(c.ui.nextDistrict)}</span><span class="gate-name">${esc(d.name)}</span><span class="gate-tag">${esc(d.tagline)}</span></a>
  </div>
</div></section>`;
}

function sampleCard(c, id, s) {
  return `<div class="sample"><span class="demo-tag">${esc(c.ui.demo)}</span><div class="sample-img">${icons[s.icon || id]}</div><div class="sample-body"><h3>${esc(
    s.title,
  )}</h3><div class="sample-meta">${esc(s.meta)}</div><ul class="trustline">${s.trust.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div></div>`;
}

// ── Pages ────────────────────────────────────────────────────────────────

const render = {
  home: ({ c, link }) => {
    const p = c.pages.home;
    const gates = DISTRICT_IDS.map((id) => {
      const d = c.districts[id];
      return `<a class="gate tone-${id}" href="${link(id)}"><span class="gate-art">${icons[id]}</span><span class="gate-name">${esc(d.name)}</span><span class="gate-tag">${esc(d.tagline)}</span><span class="gate-foot">${esc(c.ui.states.planned)} · ${esc(d.phase)}</span></a>`;
    }).join('');
    return `<section class="hero"><div class="wrap">
  <h1 class="h-xl">YAVAYA</h1>
  <p class="hero-sub">${esc(p.sub)}</p>
  <ul class="hero-verbs">${p.verbs.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>
  <p class="hero-one">${esc(p.one)}</p>
  <div class="btn-row"><a class="btn btn-gold" href="#distritos">${esc(p.ctaPrimary)}</a><a class="btn btn-line" href="${link('status')}">${esc(p.ctaSecondary)}</a></div>
</div></section>
<section class="section" id="distritos" style="padding-top:0"><div class="wrap">
  ${sectionHead({ eyebrow: p.gatesEyebrow, title: p.gatesTitle })}
  <div class="gates">${gates}</div>
</div></section>
<section class="section alt"><div class="wrap">
  <div class="split">
    <div>${sectionHead({ eyebrow: p.trustEyebrow, title: p.trustTitle, lead: p.trustLead })}
      <a class="btn btn-gold" href="${link('trust')}">${esc(p.trustCta)}</a></div>
    ${cards(p.trustPoints, 'g2')}
  </div>
</div></section>
<section class="section"><div class="wrap">
  <p class="quote">${md(p.quote)}</p>
  <div class="btn-row mt"><a class="btn btn-line" href="${link('about')}">${esc(c.nav.about)}</a><a class="btn btn-line" href="${link('roadmap')}">${esc(c.nav.roadmap)}</a></div>
</div></section>`;
  },

  districts: ({ c, link }) => {
    const p = c.pages.districts;
    const rows = DISTRICT_IDS.map((id) => {
      const d = c.districts[id];
      return `<a class="gate tone-${id}" href="${link(id)}"><span class="gate-art">${icons[id]}</span><span class="gate-name">${esc(d.name)}</span><span class="gate-tag">${esc(d.purpose)}</span><span class="gate-foot">${esc(d.color)} · ${esc(c.ui.states.planned)} · ${esc(d.phase)}</span></a>`;
    }).join('');
    return `${pageHero(p)}
<section class="section"><div class="wrap"><div class="gates">${rows}</div></div></section>
<section class="section alt"><div class="wrap narrow">
  ${sectionHead(p.layer)}
  ${checks(p.layer.items)}
  <p class="mt"><a class="btn btn-gold" href="${link('trust')}">${esc(c.nav.trust)}</a></p>
</div></section>`;
  },

  mercadito: ({ c, link }) => {
    const p = c.pages.mercadito;
    const cats = p.categories.map((k) => `<li>${icons[k.icon]}<b>${esc(k.name)}</b></li>`).join('');
    return `${pageHero({ ...p, badge: districtStatus(c, 'mercadito') }, true)}
<section class="section"><div class="wrap">
  ${sectionHead(p.catsHead)}
  <ul class="dense">${cats}</ul>
</div></section>
<section class="section alt"><div class="wrap">
  ${sectionHead(p.cardHead)}
  <div class="anatomy">${sampleCard(c, 'mercadito', p.sample)}<div><ol>${p.cardParts.map((x) => `<li>${md(x)}</li>`).join('')}</ol><p class="muted mt">${esc(c.ui.demoExplain)}</p></div></div>
</div></section>
<section class="section"><div class="wrap">
  <div class="split">
    <div>${sectionHead(p.protectHead)}${checks(p.protect)}</div>
    <div>${sectionHead(p.newSellerHead)}${checks(p.newSeller)}<div class="mt">${note(p.payNote)}</div></div>
  </div>
</div></section>
${districtNext(c, link, 'mercadito')}`;
  },

  yavayago: ({ c, link }) => {
    const p = c.pages.yavayago;
    return `${pageHero({ ...p, badge: districtStatus(c, 'yavayago') }, true)}
<section class="section"><div class="wrap">
  ${sectionHead(p.routeHead)}
  <ol class="route">${p.route.map((r) => `<li><strong>${esc(r.title)}</strong><span>${md(r.text)}</span></li>`).join('')}</ol>
</div></section>
<section class="section alt"><div class="wrap">
  <div class="split">
    <div>${sectionHead(p.customerHead)}${checks(p.customer)}</div>
    <div>${sectionHead(p.driverHead)}${checks(p.driver)}</div>
  </div>
</div></section>
<section class="section"><div class="wrap">
  ${sectionHead(p.focusHead)}
  ${cards(p.focus, 'g4')}
  <div class="mt">${note(p.payNote)}</div>
</div></section>
${districtNext(c, link, 'yavayago')}`;
  },

  work: ({ c, link }) => {
    const p = c.pages.work;
    const plans = p.plans
      .map(
        (pl, i) =>
          `<div class="plan${i === 1 ? ' featured' : ''}"><h3>${esc(pl.name)}</h3><div class="price">${esc(pl.price)}</div><div class="per">${esc(pl.per)}</div><div class="when">${badge(c, pl.launch ? 'dev' : 'planned')} <span class="muted">${esc(pl.when)}</span></div></div>`,
      )
      .join('');
    return `${pageHero({ ...p, badge: districtStatus(c, 'work') }, true)}
<section class="section"><div class="wrap">
  ${sectionHead(p.diffHead)}
  ${cards(p.diff, 'g3', true)}
</div></section>
<section class="section alt"><div class="wrap">
  ${sectionHead(p.fieldsHead)}
  ${table(p.fieldsTable.head, p.fieldsTable.rows)}
</div></section>
<section class="section"><div class="wrap">
  ${sectionHead(p.plansHead)}
  <div class="plans">${plans}</div>
  <div class="mt">${note(p.plansNote)}</div>
</div></section>
<section class="section alt"><div class="wrap">
  <div class="split">
    <div>${sectionHead(p.employerHead)}${checks(p.employer)}</div>
    <div>${sectionHead(p.proHead)}${checks(p.pro)}</div>
  </div>
</div></section>
${districtNext(c, link, 'work')}`;
  },

  community: ({ c, link }) => {
    const p = c.pages.community;
    return `${pageHero({ ...p, badge: districtStatus(c, 'community') }, true)}
<section class="section"><div class="wrap">
  <div class="calm">${p.spaces.map((s) => `<article><h3>${esc(s.title)}</h3><p>${md(s.text)}</p></article>`).join('')}</div>
</div></section>
<section class="section alt"><div class="wrap">
  <div class="split">
    <div>${sectionHead(p.yesHead)}${checks(p.yes)}</div>
    <div>${sectionHead(p.noHead)}${checks(p.no, true)}</div>
  </div>
  <div class="mt">${note(p.modNote)}</div>
</div></section>
${districtNext(c, link, 'community')}`;
  },

  impact: ({ c, link }) => {
    const p = c.pages.impact;
    return `${pageHero({ ...p, badge: districtStatus(c, 'impact') }, true)}
<section class="section"><div class="wrap">
  <div class="promise">${p.promise.map((x) => `<div><b>${esc(x.big)}</b><h3>${esc(x.title)}</h3><p class="muted mb0">${md(x.text)}</p></div>`).join('')}</div>
</div></section>
<section class="section alt"><div class="wrap">
  ${sectionHead(p.reviewHead)}
  ${steps(p.review)}
</div></section>
<section class="section"><div class="wrap">
  ${sectionHead(p.typesHead)}
  ${table(p.typesTable.head, p.typesTable.rows)}
  <div class="mt">${note(p.typesNote)}</div>
</div></section>
<section class="section alt"><div class="wrap">
  ${sectionHead(p.causesHead)}
  ${cards(p.causes, 'g3', true)}
</div></section>
${districtNext(c, link, 'impact')}`;
  },

  animals: ({ c, link }) => {
    const p = c.pages.animals;
    return `${pageHero({ ...p, badge: districtStatus(c, 'animals') }, true)}
<section class="section"><div class="wrap">
  <div class="organic"><div>${sectionHead(p.pillarsHead)}${cards(p.pillars, 'g2', true)}</div><div class="blob">${icons.animals}</div></div>
</div></section>
<section class="section alt"><div class="wrap">
  ${sectionHead(p.adoptHead)}
  ${steps(p.adopt)}
  <div class="mt">${note(p.adoptNote)}</div>
</div></section>
${districtNext(c, link, 'animals')}`;
  },

  trust: ({ c }) => {
    const p = c.pages.trust;
    const tiers = p.pyramid
      .map(
        (t, i) =>
          `<div class="tier"><div class="tier-n">${i}</div><div><h3>${esc(t.name)}</h3><dl><dt>${esc(p.pyramidLabels.needs)}</dt><dd>${esc(t.needs)}</dd><dt>${esc(p.pyramidLabels.can)}</dt><dd>${esc(t.can)}</dd></dl></div></div>`,
      )
      .join('');
    return `${pageHero(p)}
<section class="section"><div class="wrap">
  <p class="quote">${md(p.rule)}</p>
</div></section>
<section class="section alt"><div class="wrap">
  ${sectionHead(p.pyramidHead)}
  <div class="pyramid">${tiers}</div>
</div></section>
<section class="section"><div class="wrap">
  ${sectionHead(p.verifyHead)}
  ${table(p.verifyTable.head, p.verifyTable.rows)}
</div></section>
<section class="section alt"><div class="wrap">
  ${sectionHead(p.defenseHead)}
  ${cards(p.defense, 'g3')}
  <div class="mt">${note(p.defenseNote)}</div>
</div></section>
<section class="section"><div class="wrap">
  ${sectionHead(p.districtHead)}
  ${table(p.districtTable.head, p.districtTable.rows)}
</div></section>
<section class="section alt"><div class="wrap">
  <div class="split">
    <div>${sectionHead(p.guardianHead)}${checks(p.guardian)}<p class="muted mt">${md(p.guardianNote)}</p></div>
    <div>${sectionHead(p.businessHead)}${checks(p.business)}</div>
  </div>
</div></section>
<section class="section"><div class="wrap">
  ${sectionHead(p.formulaHead)}
  ${table(p.formulaTable.head, p.formulaTable.rows)}
</div></section>`;
  },

  reputation: ({ c }) => {
    const p = c.pages.reputation;
    return `${pageHero(p)}
<section class="section"><div class="wrap">
  <div class="split">
    <div>${sectionHead(p.scoreHead)}<p class="muted">${md(p.scoreNote)}</p></div>
    <div class="grid g2">
      <div class="card"><h3>${esc(p.plusTitle)}</h3>${checks(p.plus)}</div>
      <div class="card"><h3>${esc(p.minusTitle)}</h3>${checks(p.minus, true)}</div>
    </div>
  </div>
</div></section>
<section class="section alt"><div class="wrap">
  ${sectionHead(p.levelsHead)}
  <ol class="ladder">${p.levels.map((l, i) => `<li><div class="n">${String(i + 1).padStart(2, '0')}</div><h3>${esc(l.name)}</h3><p>${esc(l.unlock)}</p></li>`).join('')}</ol>
</div></section>
<section class="section"><div class="wrap">
  ${sectionHead(p.medalsHead)}
  <div class="medals">${p.medals.map((m) => `<div class="medal"><i aria-hidden="true">${m.symbol}</i><span>${esc(m.name)}</span></div>`).join('')}</div>
</div></section>
<section class="section alt"><div class="wrap">
  <div class="split">
    <div>${sectionHead(p.earnHead)}${checks(p.earn)}</div>
    <div>${sectionHead(p.journeyHead)}${steps(p.journey)}</div>
  </div>
</div></section>`;
  },

  tokens: ({ c, link }) => {
    const p = c.pages.tokens;
    return `${pageHero(p)}
<section class="section"><div class="wrap">
  ${cards(p.pillars, 'g3')}
</div></section>
<section class="section alt"><div class="wrap">
  ${sectionHead(p.packagesHead)}
  <div class="plans">${p.packages.map((pk) => `<div class="plan"><h3>${esc(pk.name)}</h3><div class="price">${esc(pk.tokens)}</div><div class="per">${esc(p.tokensWord)}</div>${pk.note ? `<p class="muted mb0">${esc(pk.note)}</p>` : ''}</div>`).join('')}</div>
  <div class="mt">${note(p.packagesNote)}</div>
</div></section>
<section class="section"><div class="wrap">
  <div class="split">
    <div>${sectionHead(p.useHead)}${table(p.useTable.head, p.useTable.rows)}</div>
    <div>${sectionHead(p.earnHead)}${table(p.earnTable.head, p.earnTable.rows)}</div>
  </div>
</div></section>
<section class="section alt"><div class="wrap narrow">
  ${sectionHead(p.payHead)}
  ${checks(p.pay)}
  <p class="mt"><a class="btn btn-line" href="${link('pricing')}">${esc(c.nav.pricing)}</a></p>
</div></section>`;
  },

  pricing: ({ c, link }) => {
    const p = c.pages.pricing;
    return `${pageHero(p)}
<section class="section"><div class="wrap">
  <div class="split">
    <div>${sectionHead(p.freeHead)}${checks(p.free)}</div>
    <div>${sectionHead(p.classesHead)}${table(p.classesTable.head, p.classesTable.rows)}</div>
  </div>
</div></section>
<section class="section alt"><div class="wrap">
  ${sectionHead(p.paidHead)}
  ${table(p.paidTable.head, p.paidTable.rows)}
  <div class="mt">${note(p.paidNote)}</div>
  <div class="btn-row mt"><a class="btn btn-line" href="${link('work')}">${esc(c.districts.work.name)}</a><a class="btn btn-line" href="${link('tokens')}">${esc(c.nav.tokens)}</a></div>
</div></section>
<section class="section"><div class="wrap">
  ${sectionHead(p.founderHead)}
  ${steps(p.founder)}
  <p class="quote mt">${md(p.founderQuote)}</p>
</div></section>`;
  },

  transparency: ({ c }) => {
    const p = c.pages.transparency;
    return `${pageHero(p)}
<section class="section"><div class="wrap">
  ${sectionHead(p.willHead)}
  ${cards(p.will, 'g3')}
  <div class="mt">${note(p.nowNote)}</div>
</div></section>
<section class="section alt"><div class="wrap">
  ${sectionHead(p.demoHead)}
  ${steps(p.demo)}
  <div class="mt">${checks(p.demoRules)}</div>
</div></section>
<section class="section"><div class="wrap narrow">
  ${sectionHead(p.northHead)}
  ${paras(p.north)}
</div></section>`;
  },

  status: ({ c }) => {
    const p = c.pages.status;
    const groups = p.groups
      .map(
        (g) =>
          `<h2 class="reg-group">${esc(g.title)}</h2>` +
          g.items.map((it) => `<div class="reg-row"><div><h3>${esc(it.name)}</h3><p>${md(it.detail)}</p></div>${badge(c, it.state)}</div>`).join(''),
      )
      .join('');
    return `${pageHero(p)}
<section class="section"><div class="wrap narrow">
  <div class="register">${groups}</div>
</div></section>
<section class="section alt"><div class="wrap narrow">
  ${sectionHead(p.legendHead)}
  <div class="register">${Object.keys(c.ui.states).map((s) => `<div class="reg-row"><div><p>${md(p.legend[s])}</p></div>${badge(c, s)}</div>`).join('')}</div>
  <p class="muted mt">${md(p.updated)}</p>
</div></section>`;
  },

  roadmap: ({ c }) => {
    const p = c.pages.roadmap;
    const phases = p.phases
      .map(
        (ph) =>
          `<div class="card"><div class="btn-row" style="align-items:center;justify-content:space-between;margin-bottom:10px"><h3 class="h-md" style="margin:0">${esc(ph.title)}</h3>${badge(c, ph.state)}</div>${paras(ph.text)}<ul class="tags mt">${ph.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`,
      )
      .join('');
    return `${pageHero(p)}
<section class="section"><div class="wrap narrow"><div class="grid">${phases}</div></div></section>
<section class="section alt"><div class="wrap narrow">
  ${sectionHead(p.rulesHead)}
  ${checks(p.rules)}
</div></section>`;
  },

  about: ({ c }) => {
    const p = c.pages.about;
    return `${pageHero(p)}
<section class="section"><div class="wrap">
  <div class="split">
    <div>${sectionHead(p.notHead)}${checks(p.not, true)}</div>
    <div><p class="quote">${md(p.is)}</p><p class="lead mt">${md(p.isLead)}</p></div>
  </div>
</div></section>
<section class="section alt"><div class="wrap">
  ${sectionHead(p.missionHead)}
  ${cards(p.mission, 'g3')}
</div></section>
<section class="section"><div class="wrap">
  <div class="split">
    <div>${sectionHead(p.goldenHead)}${checks(p.golden)}</div>
    <div>${sectionHead(p.moatHead)}${table(p.moatTable.head, p.moatTable.rows)}</div>
  </div>
</div></section>
<section class="section alt"><div class="wrap">
  ${sectionHead(p.countriesHead)}
  <ul class="tags">${p.countries.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
</div></section>
<section class="section"><div class="wrap">
  ${sectionHead(p.visionHead)}
  <div class="grid g2">${p.vision.map((v) => `<div class="card"><p class="quote mb0" style="font-size:1.35rem">${md(v)}</p></div>`).join('')}</div>
</div></section>`;
  },

  help: ({ c }) => {
    const p = c.pages.help;
    return `${pageHero(p)}
<section class="section"><div class="wrap narrow">
  <div class="faq">${p.faq.map((q) => `<details><summary>${esc(q.q)}</summary><div class="a">${paras(q.a)}</div></details>`).join('')}</div>
</div></section>`;
  },

  privacy: ({ c }) => {
    const p = c.pages.privacy;
    return `${pageHero(p)}
<section class="section"><div class="wrap"><div class="prose">${p.sections
      .map((s) => `<h2>${esc(s.title)}</h2>${paras(s.text)}${s.list ? `<ul>${s.list.map((i) => `<li>${md(i)}</li>`).join('')}</ul>` : ''}`)
      .join('')}</div></div></section>`;
  },
};

// ── 404 and legacy redirects ─────────────────────────────────────────────

function notFound() {
  // GitHub Pages serves this from any depth, so it links absolutely.
  const c = es;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>404 · Yavaya</title><meta name="robots" content="noindex"><link rel="icon" href="/assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/site.css"><script>try{var t=localStorage.getItem('yavaya-theme');if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}</script></head><body>
<main id="main"><section class="hero"><div class="wrap narrow">
<p class="eyebrow" style="justify-content:center">404</p>
<h1 class="h-lg">${esc(c.ui.notFound.title)}</h1>
<p class="lead" style="margin:18px auto 30px">${esc(c.ui.notFound.body)}</p>
<div class="btn-row"><a class="btn btn-gold" href="/">${esc(c.nav.home)}</a><a class="btn btn-line" href="/en/" lang="en">${esc(en.ui.notFound.home)}</a></div>
</div></section></main></body></html>
`;
}

// The previous static site used flat file names. Anyone holding an old link
// lands on the equivalent new page instead of a 404.
const LEGACY = {
  'mercadito.html': 'mercadito/',
  'yavayago.html': 'yavayago/',
  'work.html': 'work/',
  'church.html': 'comunidad/',
  'animals.html': 'animales/',
  'ayuda.html': 'ayuda/',
  'tokens.html': 'tokens/',
  'admin.html': '',
};

const redirect = (to) =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Yavaya</title><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=./${to}"><link rel="canonical" href="${SITE}/${to}"></head><body><p><a href="./${to}">Yavaya</a></p></body></html>
`;

// ── Write ────────────────────────────────────────────────────────────────

function write(path, html) {
  const file = join(ROOT, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
}

export function build() {
  // Output directories are owned by the generator; clear them so a renamed
  // page cannot leave a stale copy behind.
  for (const locale of Object.keys(LOCALES)) {
    for (const page of PAGES) {
      const slug = page.slug[locale];
      if (!slug) continue;
      const dir = join(ROOT, locale === 'es' ? slug : `${locale}/${slug}`);
      if (existsSync(dir)) rmSync(dir, { recursive: true });
    }
  }

  const written = [];
  for (const [locale, c] of Object.entries(LOCALES)) {
    for (const page of PAGES) {
      const p = c.pages[page.id];
      const html = layout({
        locale,
        id: page.id,
        title: p.title,
        description: p.description,
        tone: page.district ? page.id : undefined,
        body: render[page.id],
      });
      const out = `${pathOf(locale, page.id)}index.html`;
      write(out, html);
      written.push(out);
    }
  }

  write('404.html', notFound());
  for (const [from, to] of Object.entries(LEGACY)) write(from, redirect(to));

  const urls = Object.keys(LOCALES).flatMap((l) => PAGES.map((p) => `${SITE}/${pathOf(l, p.id)}`));
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`);
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
  return written;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pages = build();
  console.log(`Built ${pages.length} pages + 404, redirects, sitemap.`);
}
