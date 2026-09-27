# Yavaya — yavaya.lat

El sitio web de Yavaya, el hogar digital de Centroamérica. Español en `/`,
inglés en `/en/`.

It is a static website: no server, no database, no dependencies. GitHub Pages
serves this repository's `main` branch from the root, and `CNAME` points it at
**yavaya.lat**.

## Editing

All text lives in `build/content/es.mjs` (the reference) and
`build/content/en.mjs`. Layout is in `build/build.mjs`, styles in
`assets/site.css`.

```bash
npm run build   # regenerate every page into the repository root
npm test        # same sections in both languages, no broken links
npm run serve   # preview at http://localhost:8080
```

The generated HTML is committed, since GitHub Pages serves it as-is. CI fails if
it is out of date, so always run `npm run build` before committing.

## Rules the content follows

- Nothing on the site is presented as working unless it works. Yavaya has not
  opened, and every page says so. `/estado/` is the honest register.
- No invented numbers, users, reviews or testimonials. Examples are marked
  `DEMO`.
- No purchase or sign-up button until the thing behind it exists.
- Source of truth for product rules: [`docs/YAVAYA_MASTER_BIBLE.md`](docs/YAVAYA_MASTER_BIBLE.md).
  The platform itself (accounts, reputation, tokens) is built in the separate
  YavayaGo repository.

## Domain

DNS for yavaya.lat is at Spaceship. With repository secrets
`SPACESHIP_API_KEY` and `SPACESHIP_API_SECRET` set, run the **DNS (Spaceship)**
workflow: `plan` shows the change, `apply` makes it. It adds GitHub Pages' four
A and four AAAA records at the apex and `www → lunara-society.github.io`,
removes only conflicting web records at those two names, and leaves mail and
TXT records alone.
