#!/usr/bin/env node
// Points yavaya.lat at GitHub Pages through the Spaceship DNS API.
//
//   node scripts/spaceship-dns.mjs list    show the zone
//   node scripts/spaceship-dns.mjs plan    show what apply would change
//   node scripts/spaceship-dns.mjs apply   make the change, then re-read the zone
//   node scripts/spaceship-dns.mjs verify  check public DNS answers
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
const DESIRED = [
  ...['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153'].map((address) => ({ type: 'A', name: '@', address })),
  ...['2606:50c0:8000::153', '2606:50c0:8001::153', '2606:50c0:8002::153', '2606:50c0:8003::153'].map((address) => ({ type: 'AAAA', name: '@', address })),
  { type: 'CNAME', name: 'www', cname: PAGES_HOST },
];

// Only records of these types, at these names, can conflict with the site.
// Mail (MX), verification (TXT) and anything else in the zone is never touched.
const WEB_TYPES = new Set(['A', 'AAAA', 'CNAME', 'ALIAS']);
const WEB_NAMES = new Set(['@', 'www']);

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

function planFor(items) {
  const remove = items.filter((r) => WEB_TYPES.has(r.type) && WEB_NAMES.has(norm(nameOf(r))) && !DESIRED.some((d) => same(d, r)));
  const add = DESIRED.filter((d) => !items.some((r) => same(d, r)));
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
    const before = await zone();
    console.log('Zone now:');
    show(before);
    const { remove, add } = planFor(before);
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
      const left = planFor(await zone());
      if (left.add.length || left.remove.length) throw new Error('The zone still differs from the plan after applying.');
    }
  } else if (command === 'verify') {
    process.exit((await verify()) ? 0 : 1);
  } else {
    console.error('usage: spaceship-dns.mjs <list|plan|apply|verify>');
    process.exit(2);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
