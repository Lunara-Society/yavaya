# Browser tests

Checks that need a real browser and a running site, kept apart from
`npm test` (which needs only Postgres). They create accounts, so they run
against a **local** database only; the setup script refuses anything else.

Requirements: Playwright with Chromium (`require('playwright')` — not a
dependency of this repository), `psql` on the path, and the site running
locally (`npm run dev`, or `npm run build && npx next start` for speed).

Run the site on the address `APP_URL` names (`http://localhost:3000` in
`.env.example`). A production build writes that origin into the map's style,
on purpose (see `app/api/map`), so a site served on another port draws no map:
the browser refuses the cross-origin style.

## Live tracking — `live-tracking.cjs`

A driver's phone position travels from the driver page through the server to
the customer's live map; a point that comes too soon after the last one is
held and sent, not dropped; nobody else can see it; a lost connection is said
and recovered from; an old position is shown as old; a delivered order stops
tracking; and the map's demonstration sends nothing to the server and changes
no table. Twenty-one checks, about two minutes.

```bash
npx tsx --conditions=react-server tests/e2e/tracking-setup.ts > /tmp/order.json
node tests/e2e/live-tracking.cjs /tmp/order.json
```

`E2E_BASE_URL` points it at another address (default `http://localhost:3000`).
Each run needs a fresh order: run the setup again first. The setup also clears
the local sign-in counters, since each run signs in three accounts and the
sign-in limit would otherwise refuse the third run in a quarter of an hour.
