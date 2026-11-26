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

Fonts: none bundled; the offline screen uses the system font. Sounds,
haptics, 3D models, shaders: none yet.

Web assets (the Guardian artwork, district photographs, medallions, Genesis
characters, films) are registered in the platform's documentation,
for example [`platform/docs/FIRST-LIGHT.md`](../../platform/docs/FIRST-LIGHT.md),
[`DISTRICTS-3D.md`](../../platform/docs/DISTRICTS-3D.md) and
[`GENESIS.md`](../../platform/docs/GENESIS.md).
