import { DEFAULT_APPEARANCE, type IdentityAppearance } from './identity-studio';

/**
 * Identity Studio themes — "Signature Realms": a whole look in one choice.
 *
 * A theme is only a set of choices from the design vocabulary
 * (identity-studio.ts) and the library (identity-assets.ts); applying one
 * fills the draft, and the member can change any part of it after. A theme
 * never carries a photo: the member's own picture, and any photo of theirs
 * used as a cover or background, stay as they were.
 *
 * Names are i18n keys: `studio.theme.<id>`. tests/unit/identity-themes.test.ts
 * checks that every theme passes the same validation as a member's own
 * profile, uses only published designs of the right kind, and has its name
 * in both languages.
 */

export type ThemeAppearance = Omit<IdentityAppearance, 'avatar' | 'theme'> & {
  avatar: Pick<IdentityAppearance['avatar'], 'shape' | 'frame'>;
};

const BASE: ThemeAppearance = (({ theme: _theme, avatar, ...rest }) => ({ ...rest, avatar: { shape: avatar.shape, frame: avatar.frame } }))(DEFAULT_APPEARANCE);

type Overrides = Partial<Omit<ThemeAppearance, 'avatar' | 'decoration'>> & {
  avatar?: Partial<ThemeAppearance['avatar']>;
  decoration?: Partial<ThemeAppearance['decoration']>;
};

function theme(id: string, overrides: Overrides): { id: string; appearance: ThemeAppearance } {
  return {
    id,
    appearance: {
      ...BASE,
      ...overrides,
      avatar: { ...BASE.avatar, ...overrides.avatar },
      decoration: { ...BASE.decoration, ...overrides.decoration },
    },
  };
}

export const IDENTITY_THEMES = [
  // --- Night ---------------------------------------------------------------------------
  theme('yavaya-night', {}),
  theme('liquid-gold', {
    surface: 'obsidian',
    accent: 'gold',
    opacity: 90,
    border: 'accent',
    divider: 'ornament',
    typography: 'elegant',
    background: { kind: 'asset', asset: 'surface-liquid-gold-midnight' },
    backgroundDim: 10,
    cover: { kind: 'asset', asset: 'surface-liquid-gold-midnight' },
    coverFocus: { x: 30, y: 50 },
  }),
  theme('black-gold', {
    surface: 'obsidian',
    accent: 'gold',
    card: 'framed',
    border: 'double',
    typography: 'classic',
    header: 'centered',
    divider: 'ornament',
    background: { kind: 'gradient', gradient: 'black-gold' },
    cover: { kind: 'none' },
  }),
  theme('midnight-sapphire', {
    surface: 'midnight',
    accent: 'sapphire',
    background: { kind: 'gradient', gradient: 'midnight-sapphire' },
    cover: { kind: 'asset', asset: 'horizon-moonlit-volcano-lake' },
  }),
  theme('aurora', {
    surface: 'midnight',
    accent: 'teal',
    opacity: 88,
    radius: 'round',
    typography: 'modern',
    background: { kind: 'gradient', gradient: 'aurora' },
    cover: { kind: 'asset', asset: 'horizon-crater-lake' },
  }),
  theme('emerald-night', {
    surface: 'forest',
    accent: 'emerald',
    background: { kind: 'gradient', gradient: 'emerald-night' },
    cover: { kind: 'asset', asset: 'horizon-coffee-road-volcano' },
  }),
  theme('violet-horizon', {
    surface: 'plum',
    accent: 'violet',
    typography: 'elegant',
    background: { kind: 'gradient', gradient: 'violet-horizon' },
    cover: { kind: 'asset', asset: 'horizon-colonial-street-dusk' },
  }),
  theme('dusk-market', {
    surface: 'plum',
    accent: 'coral',
    background: { kind: 'gradient', gradient: 'dusk' },
    cover: { kind: 'asset', asset: 'horizon-market-sunset' },
  }),
  theme('deep-ocean', {
    surface: 'midnight',
    accent: 'sky',
    radius: 'round',
    background: { kind: 'gradient', gradient: 'ocean' },
    cover: { kind: 'asset', asset: 'horizon-lighthouse-night' },
  }),
  theme('forest-moss', {
    surface: 'forest',
    accent: 'lime',
    card: 'solid',
    typography: 'modern',
    background: { kind: 'gradient', gradient: 'forest-moss' },
    cover: { kind: 'asset', asset: 'horizon-town-panorama' },
  }),
  theme('espresso', {
    surface: 'espresso',
    accent: 'bronze',
    card: 'solid',
    border: 'hairline',
    typography: 'editorial',
    background: { kind: 'solid', solid: 'obsidian' },
    cover: { kind: 'asset', asset: 'horizon-coffee-road-volcano' },
    coverDim: 30,
  }),
  theme('rose-noir', {
    surface: 'obsidian',
    accent: 'rosegold',
    typography: 'elegant',
    background: { kind: 'gradient', gradient: 'rose-gold' },
    backgroundDim: 20,
    cover: { kind: 'none' },
    header: 'centered',
  }),
  theme('ruby-velvet', {
    surface: 'plum',
    accent: 'ruby',
    card: 'elevated',
    border: 'none',
    background: { kind: 'solid', solid: 'wine' },
    cover: { kind: 'none' },
    header: 'centered',
  }),
  theme('graphite', {
    surface: 'obsidian',
    accent: 'platinum',
    card: 'solid',
    radius: 'sharp',
    typography: 'modern',
    divider: 'line',
    background: { kind: 'solid', solid: 'graphite' },
    cover: { kind: 'none' },
    header: 'minimal',
    density: 'compact',
  }),
  theme('night-market', {
    surface: 'midnight',
    accent: 'champagne',
    header: 'banner',
    coverDim: 45,
    cover: { kind: 'asset', asset: 'horizon-market-sunset' },
  }),
  theme('lighthouse', {
    surface: 'midnight',
    accent: 'champagne',
    border: 'accent',
    header: 'banner',
    coverDim: 40,
    background: { kind: 'solid', solid: 'midnight' },
    cover: { kind: 'asset', asset: 'horizon-lighthouse-night' },
  }),
  theme('volcano-moon', {
    surface: 'midnight',
    accent: 'pearl',
    typography: 'elegant',
    header: 'banner',
    coverDim: 40,
    background: { kind: 'gradient', gradient: 'midnight-sapphire' },
    cover: { kind: 'asset', asset: 'horizon-moonlit-volcano-lake' },
  }),
  theme('obsidian-pearl', {
    surface: 'obsidian',
    accent: 'pearl',
    card: 'elevated',
    border: 'none',
    radius: 'round',
    typography: 'modern',
    background: { kind: 'solid', solid: 'obsidian' },
    cover: { kind: 'none' },
  }),

  // --- Day -----------------------------------------------------------------------------
  theme('ivory-silk', {
    surface: 'ivory',
    accent: 'gold',
    typography: 'elegant',
    divider: 'ornament',
    background: { kind: 'gradient', gradient: 'ivory-silk' },
    cover: { kind: 'asset', asset: 'horizon-white-chapel-mist' },
    coverDim: 10,
  }),
  theme('platinum-day', {
    surface: 'mist',
    accent: 'platinum',
    card: 'solid',
    typography: 'modern',
    radius: 'sharp',
    background: { kind: 'gradient', gradient: 'platinum' },
    cover: { kind: 'none' },
    header: 'minimal',
  }),
  theme('sunrise', {
    surface: 'blush',
    accent: 'coral',
    radius: 'round',
    background: { kind: 'gradient', gradient: 'sunrise' },
    cover: { kind: 'asset', asset: 'horizon-town-panorama' },
    coverDim: 10,
  }),
  theme('sage-garden', {
    surface: 'sage',
    accent: 'emerald',
    card: 'solid',
    background: { kind: 'solid', solid: 'sage' },
    cover: { kind: 'asset', asset: 'horizon-coffee-road-volcano' },
    coverDim: 10,
  }),
  theme('clear-sky', {
    surface: 'mist',
    accent: 'sapphire',
    radius: 'round',
    typography: 'modern',
    background: { kind: 'solid', solid: 'sky' },
    cover: { kind: 'asset', asset: 'horizon-crater-lake' },
    coverDim: 5,
  }),
  theme('sandstone', {
    surface: 'paper',
    accent: 'bronze',
    card: 'framed',
    background: { kind: 'solid', solid: 'sand' },
    cover: { kind: 'asset', asset: 'horizon-colonial-street-dusk' },
    coverDim: 15,
  }),
  theme('blush-orchid', {
    surface: 'blush',
    accent: 'orchid',
    typography: 'elegant',
    background: { kind: 'solid', solid: 'blush' },
    cover: { kind: 'none' },
    header: 'centered',
  }),
  theme('editorial', {
    surface: 'paper',
    accent: 'ruby',
    card: 'solid',
    border: 'none',
    radius: 'sharp',
    divider: 'none',
    typography: 'editorial',
    header: 'minimal',
    background: { kind: 'solid', solid: 'ivory' },
    cover: { kind: 'none' },
  }),
  theme('classic-ivory', {
    surface: 'ivory',
    accent: 'gold',
    card: 'solid',
    border: 'double',
    header: 'centered',
    divider: 'ornament',
    background: { kind: 'solid', solid: 'ivory' },
    cover: { kind: 'none' },
  }),
  theme('chapel-morning', {
    surface: 'paper',
    accent: 'sky',
    typography: 'elegant',
    header: 'banner',
    coverDim: 35,
    background: { kind: 'solid', solid: 'ivory' },
    cover: { kind: 'asset', asset: 'horizon-white-chapel-mist' },
  }),

  // --- Professional --------------------------------------------------------------------
  theme('executive', {
    surface: 'midnight',
    accent: 'platinum',
    card: 'solid',
    radius: 'sharp',
    typography: 'modern',
    density: 'compact',
    background: { kind: 'gradient', gradient: 'midnight-sapphire' },
    cover: { kind: 'none' },
    header: 'minimal',
  }),
  theme('counsel', {
    surface: 'espresso',
    accent: 'champagne',
    card: 'framed',
    border: 'accent',
    typography: 'classic',
    header: 'centered',
    background: { kind: 'solid', solid: 'obsidian' },
    cover: { kind: 'none' },
  }),
  theme('studio-white', {
    surface: 'paper',
    accent: 'sapphire',
    card: 'elevated',
    border: 'none',
    typography: 'modern',
    background: { kind: 'solid', solid: 'sky' },
    cover: { kind: 'none' },
    header: 'minimal',
  }),
  theme('consultant', {
    surface: 'mist',
    accent: 'teal',
    card: 'solid',
    radius: 'soft',
    typography: 'modern',
    density: 'compact',
    background: { kind: 'gradient', gradient: 'platinum' },
    cover: { kind: 'asset', asset: 'horizon-town-panorama' },
    coverDim: 15,
  }),
  theme('artisan', {
    surface: 'ivory',
    accent: 'bronze',
    typography: 'editorial',
    background: { kind: 'solid', solid: 'sand' },
    cover: { kind: 'asset', asset: 'horizon-market-sunset' },
    coverDim: 20,
  }),
] as const satisfies ReadonlyArray<{ id: string; appearance: ThemeAppearance }>;

export type IdentityThemeId = (typeof IDENTITY_THEMES)[number]['id'];
