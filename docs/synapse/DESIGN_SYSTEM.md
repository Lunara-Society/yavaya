# Design system for Synapse

> **From 27 Nov 2026:** The look for new work lives in [docs/aether/VISUAL_CONSTITUTION.md](../aether/VISUAL_CONSTITUTION.md) (Aether × Roxi Anima). This file is kept as the record of Synapse Chapters 00–09.

## Inherited, real today

Synapse starts from Yavaya's existing design system, which the website already
uses: [`platform/docs/DESIGN-SYSTEM.md`](../../platform/docs/DESIGN-SYSTEM.md).
In short:

- **Palette** (owner's October 2026 direction): a midnight-teal night
  (`#071B22`), forest-teal and evergreen bands, warm obsidian, antique gold for
  actions (`#C99B35`) with champagne highlights (`#F3D77B`), ivory text
  (`#F4EBD8`). Light is lamp gold, water teal and dusk violet; text is warm,
  never grey.
- **District worlds**: each district keeps its own colour and atmosphere over
  the shared platform.
- **Roxi's Presence**: her visual system. The Halo palette is obsidian, violet
  and champagne gold with no grey and no white
  ([`platform/docs/roxi/HALO.md`](../../platform/docs/roxi/HALO.md)); the
  Classic look is the gold orb.
- **The Guardian**: the owner's artwork and the brand's mark
  ([`platform/docs/FIRST-LIGHT.md`](../../platform/docs/FIRST-LIGHT.md)). The
  app's icon and splash are the Guardian icon from `platform/public/`.
- **Mobile first**: body text never below 16 px, thumb reach, honest loading,
  empty and error states, zoom never disabled.

The app's own native screen (the offline screen) uses the same tokens: night
`#0B0A10`, day `#F6EFE2`, gold button `#D8B25A`, 48 dp touch targets.

## Synapse principles (from the master directive; not implemented)

1. Every effect earns its place: it must guide, confirm, reveal or calm. An
   effect with no functional, emotional or navigational job is removed.
2. Reconstruction is the signature: content materialises from particles and
   light as it loads and dissolves as it leaves, driven by real loading state,
   never by a fixed delay.
3. Touch is acknowledged at once (light, haptic, sound when not silenced),
   before any network wait.
4. Depth is information: nearer means more actionable.
5. Original identity: no Roman, imperial or medieval settings, no copied
   interfaces, characters, sounds or logos from any game or film, no generic
   cyberpunk, no excessive neon, no flashing, no meaningless numbers, no cheap
   glassmorphism, no clutter. The full list is in
   [MASTER_DIRECTIVE.md](MASTER_DIRECTIVE.md) section 3.

## Motion and accessibility tiers (proposed, to be measured on phones)

| Tier | When | What renders |
| --- | --- | --- |
| Full | capable device, motion allowed | particles, depth, lighting, transitions |
| Reduced | the system's reduce-motion setting, low battery saver, low-end device | cross-fades and position changes only; no particles or parallax |
| Static | very low-end device or rendering failure | the plain interface; every function still available |

Sound follows the phone's silent mode; haptics follow the system setting.
Nothing essential is carried by sound, colour or motion alone.

## Tokens to carry into native code

When the first native screen is built, the colour, type and spacing tokens are
defined once (a shared module in `mobile/src/`) from the values above, so
native and web stay in step. Not built yet.
