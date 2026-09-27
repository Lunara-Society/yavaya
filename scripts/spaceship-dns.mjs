#!/usr/bin/env node
// Points yavaya.lat at GitHub Pages through the Spaceship DNS API.
//
//   node scripts/spaceship-dns.mjs list                show the zone
//   node scripts/spaceship-dns.mjs plan  [web|email]   show what apply would change
//   node scripts/spaceship-dns.mjs apply [web|email]   make the change, re-read the zone
//   node scripts/spaceship-dns.mjs verify              check public DNS answers for the site
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
// The platform's Railway custom-domain target for yavaya.lat. Railway assigns
// it per domain; it cannot be derived, so it is copied from Railway here.
const RAILWAY_TARGET = 'yzu65a0b.up.railway.app';

// The apex goes to the platform on Railway. A CNAME is not legal at the apex,
// so it is an ALIAS, which Spaceship flattens. www stays on GitHub Pages,
// whose only job is now to redirect to https://yavaya.lat — that keeps www
// working without spending one of Railway's two custom-domain slots.
const WEB = [
  { type: 'ALIAS', name: '@', aliasName: RAILWAY_TARGET },
  { type: 'CNAME', name: 'www', cname: PAGES_HOST },
  // Railway's proof of ownership for yavaya.lat. Without it the domain stays
  // "validating ownership" and no certificate is issued, however correctly the
  // ALIAS resolves. The token is issued per domain in Railway's dashboard.
  {
    type: 'TXT',
    name: '_railway-verify',
    value: 'railway-verify=77eb168b8a996d798a80af956a63ed3888f93f5f9f0b5884a07a324735782a7e',
  },
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
  web: {
    desired: WEB,
    owns: (r) =>
      (['A', 'AAAA', 'CNAME', 'ALIAS'].includes(r.type) && ['@', 'www'].includes(norm(nameOf(r)))) ||
      (r.type === 'TXT' && norm(nameOf(r)) === '_railway-verify'),
  },
  email: { desired: EMAIL, owns: (r) => EMAIL.some((d) => d.type === r.type && norm(d.name) === norm(nameOf(r))) },
};

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
// Spaceship accepts an apex ALIAS but lists it back as a CNAME, so the two
// types compare equal; otherwise every re-run would delete and re-create it.
const kind = (t) => (t === 'ALIAS' ? 'CNAME' : t);
const same = (a, b) =>
  kind(a.type) === kind(b.type) && norm(nameOf(a)) === norm(nameOf(b)) && norm(target(a)) === norm(target(b));

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
  // Ask a public resolver over HTTPS, not the local cache. An ALIAS is
  // flattened, so the apex answers with the target's own addresses.
  const ask = async (name, type) => {
    const res = await fetch(`https://dns.google/resolve?name=${name}&type=${type}`);
    const body = await res.json();
    return (body.Answer ?? []).filter((a) => a.type === (type === 'A' ? 1 : 5)).map((a) => norm(a.data));
  };
  const apex = (await ask(DOMAIN, 'A')).sort();
  const target = (await ask(RAILWAY_TARGET, 'A')).sort();
  const www = await ask(`www.${DOMAIN}`, 'CNAME');
  const okApex = apex.length > 0 && apex.some((ip) => target.includes(ip));
  const okWww = www.includes(PAGES_HOST);
  console.log(`${DOMAIN} A     ${apex.join(', ') || '(nothing)'}  ${okApex ? '✓ matches ' + RAILWAY_TARGET : '✗'}`);
  console.log(`www   CNAME ${www.join(', ') || '(nothing)'}  ${okWww ? '✓' : '✗'}`);
  return okApex && okWww;
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
