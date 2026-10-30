# Identity Studio design library

Everything a member can pick in the Identity Studio's gallery — backgrounds,
banners, photo frames, ornaments and professional surfaces — is made here.
The site never reads this folder: it reads the files `build.mjs` writes into
`platform/public/identity/` and the manifest beside the code.

## Making the library

```bash
cd platform
node ../tools/identity-assets/render.mjs    # shader designs → masters/ (3840×2160 PNG, about 1.3 GB)
node ../tools/identity-assets/vector.mjs    # frames and ornaments → vector/ (SVG)
node ../tools/identity-assets/build.mjs     # sizes, manifest, names
```

`render.mjs` needs Playwright and its Chromium (WebGL2). The first program a
run meets takes a few seconds to compile; after that a design takes about two
seconds. `masters/` and `previews/` are not committed: the same catalogue
always renders the same pictures.

`build.mjs` writes:

| What | Where |
| --- | --- |
| Web sizes (WebP 480, 1280, 1920 or 2560, 3840) and SVGs | `platform/public/identity/<collection>/` |
| The manifest the site reads | `platform/src/config/identity-assets.json` |
| Every design's name and description, both languages | `platform/src/i18n/dictionaries/identity-assets.ts` |

It never enlarges a master, measures every size from the file it wrote, and
refuses two designs that are the same picture (same structure and colours).

## Where a design comes from

`catalog.mjs` is the source of truth. Each design records its `source`:

- `supplied` — artwork the owner provided, in `sources/`, used as given. The
  liquid-gold artwork is 1672×941, so its largest file is 1672 wide; it is not
  presented as 4K.
- `yavaya-photo` — Yavaya's own photographs in `platform/public/art/`,
  reused at the sizes that already exist (largest 2560×1440).
- `procedural-shader` — drawn by a fragment shader in `shaders/`, natively at
  3840×2160.
- `procedural-vector` — drawn as SVG by `vector.mjs`; sharp at any size.

Within a family, designs that share a geometry and differ in metal or colour
are variants, and are described that way.

## Reviewing

```bash
node ../tools/identity-assets/render.mjs --preview --sheet horizon-   # 960 px previews + a contact sheet
```

Every design in the library was reviewed on such a sheet before it was
rendered at full size.

## Adding a design

1. Add it to `catalog.mjs` with an id, collection, style, colours, search
   words, and its name and description in Spanish and English.
2. A new `style` needs `studio.style.<style>` in both dictionaries.
3. Render (or draw) it, run `build.mjs`, and check it in the Studio.
4. `npm test` checks every file exists at the size the manifest claims.
