# Yavaya — yavaya.lat

El hogar digital de Centroamérica. Una cuenta. Una reputación. Un ecosistema.

## What is here

| Path | What it is |
| --- | --- |
| [`platform/`](platform/) | **The Yavaya platform and website**: accounts, identity, reputation, tokens, trust, and every public page. Next.js + PostgreSQL, deployed on Railway at **yavaya.lat**. Start with [`platform/CLAUDE.md`](platform/CLAUDE.md) and [`platform/docs/`](platform/docs/). |
| [`docs/YAVAYA_MASTER_BIBLE.md`](docs/YAVAYA_MASTER_BIBLE.md) | The product specification. Product rules come from here. |
| [`scripts/spaceship-dns.mjs`](scripts/spaceship-dns.mjs) | DNS for yavaya.lat, run through the **DNS (Spaceship)** workflow. |
| `index.html`, `404.html`, `CNAME` | GitHub Pages serves only a redirect: `www.yavaya.lat` (and old Pages addresses) go to `https://yavaya.lat`, keeping the path. |

## Working on the platform

```bash
cd platform
npm ci
npm run dev
npm run typecheck
npm test                # needs Postgres; see platform/CLAUDE.md
```

CI (`.github/workflows/ci.yml`) runs the typecheck, the full test suite against
a real Postgres, the production build, and the release step against an empty
database on every push.

## Deployment

Railway builds `platform/` from `main` (root directory `/platform`, watch
pattern `/platform/**`). Before new instances take traffic it runs
`node dist/scripts/release.cjs` — migrations, then the idempotent seed. See
[`platform/docs/DEPLOYMENT.md`](platform/docs/DEPLOYMENT.md).

Email is sent through Resend's HTTPS API as `no-reply@yavaya.lat` (Railway
blocks SMTP below the Pro plan).

## DNS

Repository secrets `SPACESHIP_API_KEY` and `SPACESHIP_API_SECRET` let the
**DNS (Spaceship)** workflow manage two record sets:

- `web` — `yavaya.lat` ALIAS to the Railway custom-domain target, `www` CNAME to
  GitHub Pages (which redirects).
- `email` — Resend's DKIM and return-path records on `send.`, `rsend.` and
  `resend._domainkey`.

Each set touches only its own names and types. The Spacemail inbox records at
the apex are never modified. Run `plan` first; it changes nothing.
