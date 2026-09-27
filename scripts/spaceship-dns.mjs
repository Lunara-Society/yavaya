#!/usr/bin/env node
// Points yavaya.lat at GitHub Pages through the Spaceship DNS API.
//
//   node scripts/spaceship-dns.mjs list                show the zone
//   node scripts/spaceship-dns.mjs plan  [web|email]   show what apply would change
//   node scripts/spaceship-dns.mjs apply [web|email]   make the change, re-read the zone
//   node scripts/spaceship-dns.mjs verify              check public DNS answers
//
// Record sets: `web` points the site at its host; `email` lets Resend send as
// @yavaya.lat. Each set owns only its own names and types, so applying one
// never touches the other, or the Spacemail inbox records at the apex.
//
// Credentials come from SPACESHIP_API_KEY and SPACESHIP_API_SECRET and are
// never printed. In GitHub Actions they are repository secrets, not workflow
// inputs: an input is recorded verbatim in the run's metadata.
//
// Field names follow Spaceship's OpenAPI spec (docs.spaceship.dev): an A or
// AAAA record carries its target in `address`, a CNAME in `cname`, and the
// apex is named "@". An earlier helper sent a generic `value` field for every
// type, which the API does not accept — the reason this was rewritten.

const API = 'https://spaceship.dev/api/v1';
const DOMAIN = 'yavaya.lat';
const PAGES_HOST = 'lunara-society.github.io';

// GitHub Pages' published apex addresses.
const WEB = [
  ...['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153'].map((address) => ({ type: 'A', name: '@', address })),
  ...['2606:50c0:8000::153', '2606:50c0:8001::153', '2606:50c0:8002::153', '2606:50c0:8003::153'].map((address) => ({ type: 'AAAA', name: '@', address })),
  { type: 'CNAME', name: 'www', cname: PAGES_HOST },
];

// Resend (region us-east-1), as issued for yavaya.lat. Sending mail goes out
// through `send.`, which keeps bounces off the apex where Spacemail receives.
const EMAIL = [
  { type: 'TXT', name: 'resend._domainkey', value: 'p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBWl5OPMT1/VblV0Eig3IRBNsz/gdjIur8x2Dwtf9txHFlyCIzXWKBUdufymq9njjGjFYZpjVU2Ik/1XP3rqgQMjRnHi9v5sdoC1UjQaiaKTAhHTX3RARRyJ9UJ2kcBv3LCtB3rRrSy6mpPhcaLYalNBukHN1Lzy8xz/Nyc/igmQIDAQAB' },
  { type: 'MX', name: 'send', exchange: 'feedback-smtp.us-east-1.amazonses.com', preference: 10 },
  { type: 'TXT', name: 'send', value: 'v=spf1 include:amazonses.com ~all' },
  { type: 'CNAME', name: 'rsend', cname: 'send.forge.rmta.net' },
];

// A set owns these (name, type) pairs: records there that are not in the set
// are replaced. Everything else in the zone is never touched.
const SETS = {
  web: { desired: WEB, owns: (r) => ['A', 'AAAA', 'CNAME', 'ALIAS'].includes(r.type) && ['@', 'www'].includes(norm(nameOf(r))) },
  email: { desired: EMAIL, owns: (r) => EMAIL.some((d) => d.type === r.type && norm(d.name) === norm(nameOf(r))) },
};
const DESIRED = WEB;

const key = process.env.SPACESHIP_API_KEY;
const secret = process.env.SPACESHIP_API_SECRET;

async function api(method, body) {
  if (!key || !secret) {
    throw new Error('SPACESHIP_API_KEY and SPACESHIP_API_SECRET must both be set (Spaceship → API Manager, scopes dnsrecords:read and dnsrecords:write).');
  }
  const query = method === 'GET' ? '?take=500&skip=0' : '';
  const res = await fetch(`${API}/dns/records/${DOMAIN}${query}`, {
    method,
    headers: { 'X-API-Key': key, 'X-API-Secret': secret, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    // 401 wrong credentials, 403 missing scope or not your domain, 422 invalid
    // record: each needs a different fix, so the status is always shown.
    throw new Error(`Spaceship ${method} returned ${res.status} ${res.headers.get('spaceship-error-code') ?? ''}\n${text}`);
  }
  return text ? JSON.parse(text) : null;
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/\.$/, '');
const nameOf = (r) => (r.name === '' || r.name == null ? '@' : r.name);
const target = (r) => r.address ?? r.cname ?? r.aliasName ?? r.value ?? r.exchange ?? JSON.stringify(r);
const same = (a, b) => a.type === b.type && norm(nameOf(a)) === norm(nameOf(b)) && norm(target(a)) === norm(target(b));

async function zone() {
  return (await api('GET'))?.items ?? [];
}

function show(items) {
  if (!items.length) return console.log(`  (${DOMAIN} has no records)`);
  for (const r of items) console.log(`  ${r.type.padEnd(6)} ${nameOf(r).padEnd(10)} ${target(r)}`);
}

function planFor(items, set) {
  const { desired, owns } = SETS[set];
  const remove = items.filter((r) => owns(r) && !desired.some((d) => same(d, r)));
  const add = desired.filter((d) => !items.some((r) => same(d, r)));
  return { remove, add };
}

async function verify() {
  // Ask public resolvers over HTTPS, not the local cache.
  const ask = async (name, type) => {
    const res = await fetch(`https://dns.google/resolve?name=${name}&type=${type}`);
    const body = await res.json();
    return (body.Answer ?? []).map((a) => norm(a.data));
  };
  const a = await ask(DOMAIN, 'A');
  const www = await ask(`www.${DOMAIN}`, 'CNAME');
  const wantA = DESIRED.filter((d) => d.type === 'A').map((d) => d.address);
  const okA = wantA.every((ip) => a.includes(ip));
  const okWww = www.includes(PAGES_HOST);
  console.log(`${DOMAIN} A     ${a.join(', ') || '(nothing)'}  ${okA ? '✓' : '✗'}`);
  console.log(`www   CNAME ${www.join(', ') || '(nothing)'}  ${okWww ? '✓' : '✗'}`);
  return okA && okWww;
}

const command = process.argv[2];
try {
  if (command === 'list') {
    show(await zone());
  } else if (command === 'plan' || command === 'apply') {
    const set = process.argv[3] || 'web';
    if (!SETS[set]) throw new Error(`unknown record set "${set}" (web or email)`);
    const before = await zone();
    console.log('Zone now:');
    show(before);
    const { remove, add } = planFor(before, set);
    console.log('\nRemove (conflicting web records only):');
    remove.length ? show(remove) : console.log('  nothing');
    console.log('\nAdd:');
    add.length ? show(add) : console.log('  nothing — already correct');
    if (command === 'apply') {
      if (remove.length) {
        // Delete items are the listed records themselves, minus the TTL.
        await api('DELETE', remove.map(({ ttl, group, ...r }) => ({ ...r, name: nameOf(r) })));
      }
      if (add.length) await api('PUT', { force: true, items: add.map((r) => ({ ...r, ttl: 3600 })) });
      console.log('\nApplied. Zone re-read from Spaceship:');
      show(await zone());
      const left = planFor(await zone(), set);
      if (left.add.length || left.remove.length) throw new Error('The zone still differs from the plan after applying.');
    }
  } else if (command === 'verify') {
    process.exit((await verify()) ? 0 : 1);
  } else {
    console.error('usage: spaceship-dns.mjs <list|plan|apply|verify> [web|email]');
    process.exit(2);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
