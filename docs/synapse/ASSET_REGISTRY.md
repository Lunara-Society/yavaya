# Asset registry

Every file the app ships that is not code, with where it came from and who
owns it. No asset from a third-party game, film or brand is allowed (master
directive, section 2).

| File | What | Source | Owner / licence | Notes |
| --- | --- | --- | --- | --- |
| `mobile/assets/icon.png` | app icon, 1024 × 1024 | enlarged from `platform/public/logo-icon-maskable-512.png` | Yavaya (the owner's Guardian artwork) | enlarged from 512 px, so it may look soft on large launchers; replace with a 1024 px master from the owner |
| `mobile/assets/android-icon-background.png` | adaptive icon, background layer | same image as the icon | Yavaya | the whole mark sits in the background layer |
| `mobile/assets/android-icon-foreground.png` | adaptive icon, foreground layer | transparent | — | intentionally empty |
| `mobile/assets/splash-icon.png` | splash mark, 800 × 800, circular crop | from the same Guardian icon | Yavaya | shown on `#0B0A10` |

The Expo template's own icons, splash and licence file were removed when the
app was created.

Fonts: none bundled; the native screens use the system font. Sounds and 3D
models: none yet. Shaders: one, Roxi's reconstruction, written for Yavaya
(`mobile/src/synapse/reconstruct.ts`).

Web assets (the Guardian artwork, district photographs, medallions, Genesis
characters, films) are registered in the platform's documentation,
for example [`platform/docs/FIRST-LIGHT.md`](../../platform/docs/FIRST-LIGHT.md),
[`DISTRICTS-3D.md`](../../platform/docs/DISTRICTS-3D.md) and
[`GENESIS.md`](../../platform/docs/GENESIS.md).

## Pre-audit prototype (P-01): Roxi

| File | What | Source | Owner / licence | Notes |
| --- | --- | --- | --- | --- |
| `mobile/art/roxi/roxi-source.png` | Roxi, full length, 1440 × 3088, on black | the owner, 26 Nov 2026 | Yavaya; AI-generated, not a real person (owner's confirmation) | not bundled in the app; source for everything below |
| `mobile/assets/roxi/roxi.webp` | the figure the app reconstructs, 720 × 1544, 36 KB | from the source | Yavaya | `make-roxi.py` |
| `mobile/assets/roxi/roxi-depth.webp` | depth map, 240 × 515, 3 KB | estimated on this machine with Depth Anything V2 Small (Apache-2.0) | Yavaya | background pinned to black |
| `mobile/assets/roxi/roxi-face.webp` | her face, 320 × 320, 8 KB | crop of the source | Yavaya | the Presence pill |
| `mobile/art/roxi/roxi-matte.png` | soft cut-out mask, full size | from the depth map and the picture's light | Yavaya | for Blender; not bundled |
| `docs/synapse/frames/*.jpg` | reference renders of the reconstruction and the film | rendered here | Yavaya | for comparing later changes |

Fonts in the film's end card: Fraunces and Plus Jakarta Sans (SIL Open Font
Licence), the ones the earlier promotional films used. No music in this cut.

## Chapters 02–08: the native app

| File | What | Source | Owner / licence | Notes |
| --- | --- | --- | --- | --- |
| `mobile/assets/audio/*.m4a` | the twelve interface sounds (awaken, init, reconstruct, dissolve, emerge, roxi, guardian, expand, confirm, back, notify, error), 164 KB in all | synthesised from code by `mobile/tools/audio/make-sounds.py`; no samples, no recordings | Yavaya, original | nothing taken from any game or film; regenerate with the script |
| `mobile/src/districts/geo.ts` | outlines of the 8 home countries, 573 points | Natural Earth 1:50m admin-0 countries, simplified | public domain | the map hologram |
| Geist, Geist Mono (6 weights bundled) | interface and figure type | `@expo-google-fonts/geist`, `@expo-google-fonts/geist-mono` | SIL Open Font Licence 1.1 | each weight required by file, not the whole family |
| shaders in `mobile/src/render/shaders.ts` | atmosphere, glass edge light, district object, reconstruction, awakening | written for Yavaya | Yavaya, original | checked by `npm run check:shaders` |
