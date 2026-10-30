/**
 * Identity Studio — the vocabulary of a profile's look.
 *
 * A member never writes CSS, HTML or a colour code. Everything they can
 * choose is one of the values below, each designed and checked here: the
 * colours against every surface they can sit on (WCAG AA, see
 * tests/unit/identity-studio.test.ts), the layouts against every screen
 * width. The server accepts these ids and nothing else, and the page turns
 * them into styles itself, so a profile can look like its owner without any
 * way to break the page, hide its trust signals, or attack a visitor.
 *
 * Client-safe: the Studio imports it for its controls, the public profile
 * for rendering. It holds no text — names are i18n keys.
 */

export const STUDIO_TONES = ['night', 'day'] as const;
export type StudioTone = (typeof STUDIO_TONES)[number];

/**
 * The colour cards are made of. The tone follows from the surface: night
 * surfaces carry light ink, day surfaces dark ink.
 */
export const STUDIO_SURFACES = {
  obsidian: { tone: 'night', color: '#101317' },
  midnight: { tone: 'night', color: '#0c1631' },
  forest: { tone: 'night', color: '#0d221d' },
  plum: { tone: 'night', color: '#1d1328' },
  espresso: { tone: 'night', color: '#1e1612' },
  ivory: { tone: 'day', color: '#fbf7ee' },
  paper: { tone: 'day', color: '#ffffff' },
  mist: { tone: 'day', color: '#eff3f6' },
  blush: { tone: 'day', color: '#fbf0ec' },
  sage: { tone: 'day', color: '#eef4ec' },
} as const satisfies Record<string, { tone: StudioTone; color: string }>;
export type StudioSurfaceId = keyof typeof STUDIO_SURFACES;
export const STUDIO_SURFACE_IDS = Object.keys(STUDIO_SURFACES) as StudioSurfaceId[];

/** Ink on each tone: body text, secondary text, quiet text. */
export const STUDIO_INK = {
  night: { text: '#f5efe3', text2: '#d2cabd', text3: '#b9b1a4' },
  day: { text: '#18140f', text2: '#463f36', text3: '#575047' },
} as const satisfies Record<StudioTone, { text: string; text2: string; text3: string }>;

/**
 * Accents, each in a night shade and a day shade, with the ink that sits on
 * the accent when it fills a button. Every pair is tested for contrast.
 */
export const STUDIO_ACCENTS = {
  gold: { night: '#e6bf5e', nightInk: '#1a1406', day: '#6f5108', dayInk: '#ffffff' },
  champagne: { night: '#f2dca2', nightInk: '#1a1406', day: '#68541f', dayInk: '#ffffff' },
  rosegold: { night: '#ebae96', nightInk: '#1d0f0a', day: '#824330', dayInk: '#ffffff' },
  coral: { night: '#ff907a', nightInk: '#1d0905', day: '#923727', dayInk: '#ffffff' },
  ruby: { night: '#ff8999', nightInk: '#1d0508', day: '#9e253a', dayInk: '#ffffff' },
  orchid: { night: '#f29ad8', nightInk: '#1d0617', day: '#8b2975', dayInk: '#ffffff' },
  violet: { night: '#bca4ff', nightInk: '#12082a', day: '#5a3fb0', dayInk: '#ffffff' },
  sapphire: { night: '#94b8ff', nightInk: '#061026', day: '#2650a9', dayInk: '#ffffff' },
  sky: { night: '#82d6f8', nightInk: '#04161f', day: '#175c79', dayInk: '#ffffff' },
  teal: { night: '#62d9cb', nightInk: '#031814', day: '#0e6056', dayInk: '#ffffff' },
  emerald: { night: '#66d69f', nightInk: '#04170d', day: '#14623c', dayInk: '#ffffff' },
  lime: { night: '#bcdd70', nightInk: '#121805', day: '#445e10', dayInk: '#ffffff' },
  pearl: { night: '#f4ecdc', nightInk: '#16120c', day: '#585145', dayInk: '#ffffff' },
  platinum: { night: '#d6dce3', nightInk: '#0f1318', day: '#48525f', dayInk: '#ffffff' },
  bronze: { night: '#dda570', nightInk: '#1a0f05', day: '#7a491c', dayInk: '#ffffff' },
} as const satisfies Record<string, { night: string; nightInk: string; day: string; dayInk: string }>;
export type StudioAccentId = keyof typeof STUDIO_ACCENTS;
export const STUDIO_ACCENT_IDS = Object.keys(STUDIO_ACCENTS) as StudioAccentId[];

/** Plain colours a background can be. Cards sit on their own surface, so any of these stays readable. */
export const STUDIO_SOLIDS = {
  midnight: '#0b1530',
  obsidian: '#0d0f12',
  forest: '#0e2a24',
  ocean: '#0b2f45',
  plum: '#2a1636',
  wine: '#3a0f1d',
  graphite: '#2b2f36',
  sand: '#e9dcc3',
  ivory: '#f6f0e3',
  blush: '#f3dcd6',
  sage: '#d9e4d5',
  sky: '#d6e6f2',
} as const satisfies Record<string, string>;
export type StudioSolidId = keyof typeof STUDIO_SOLIDS;
export const STUDIO_SOLID_IDS = Object.keys(STUDIO_SOLIDS) as StudioSolidId[];

/** Gradients, written here once; a member picks one by name. */
export const STUDIO_GRADIENTS = {
  'black-gold': 'linear-gradient(150deg, #0b0b0c 0%, #1b1710 55%, #3a2c10 100%)',
  'midnight-sapphire': 'linear-gradient(160deg, #050b1c 0%, #0d1f4a 60%, #1d3f86 100%)',
  dusk: 'linear-gradient(165deg, #1a1236 0%, #4d2448 55%, #b8693f 100%)',
  ocean: 'linear-gradient(170deg, #03141d 0%, #083247 55%, #0f6a7f 100%)',
  'emerald-night': 'linear-gradient(160deg, #04110d 0%, #0b2e22 60%, #17604a 100%)',
  'violet-horizon': 'linear-gradient(165deg, #0f0a24 0%, #2f1b5e 55%, #7a4fb8 100%)',
  'rose-gold': 'linear-gradient(155deg, #2a1a17 0%, #6b4237 55%, #c08a74 100%)',
  'ivory-silk': 'linear-gradient(160deg, #fdfaf3 0%, #f1e6d1 60%, #e3d0ac 100%)',
  platinum: 'linear-gradient(160deg, #f4f6f8 0%, #dde2e8 55%, #b9c2cc 100%)',
  sunrise: 'linear-gradient(170deg, #fbe3c4 0%, #f3b48c 55%, #e07a62 100%)',
  'forest-moss': 'linear-gradient(165deg, #0b1a12 0%, #1f3a22 55%, #4f6b34 100%)',
  aurora: 'radial-gradient(120% 90% at 15% 10%, #1d5a6b 0%, transparent 55%), radial-gradient(110% 80% at 85% 20%, #4b2a7a 0%, transparent 55%), linear-gradient(180deg, #060b16 0%, #0a1426 100%)',
} as const satisfies Record<string, string>;
export type StudioGradientId = keyof typeof STUDIO_GRADIENTS;
export const STUDIO_GRADIENT_IDS = Object.keys(STUDIO_GRADIENTS) as StudioGradientId[];

export const STUDIO_CARD_STYLES = ['solid', 'glass', 'elevated', 'framed'] as const;
export const STUDIO_BORDERS = ['none', 'hairline', 'accent', 'double'] as const;
export const STUDIO_RADII = ['sharp', 'soft', 'round'] as const;
export const STUDIO_DIVIDERS = ['line', 'dots', 'ornament', 'none'] as const;
/** Only the two families the site already loads: a typography choice never costs a download. */
export const STUDIO_TYPOGRAPHY = ['classic', 'modern', 'elegant', 'editorial'] as const;
export const STUDIO_HEADERS = ['classic', 'centered', 'banner', 'minimal'] as const;
export const STUDIO_DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export const STUDIO_AVATAR_SHAPES = ['circle', 'rounded', 'square', 'hexagon', 'arch'] as const;
export const STUDIO_DECORATION_PLACEMENTS = ['corners', 'header', 'border'] as const;

export const STUDIO_BACKGROUND_KINDS = ['default', 'asset', 'solid', 'gradient', 'upload'] as const;
export const STUDIO_COVER_KINDS = ['default', 'asset', 'upload', 'none'] as const;

/**
 * Glass cards let the background show through, but never so much that the
 * words on them stop being readable: the contrast test assumes this floor.
 */
export const STUDIO_OPACITY = { min: 85, max: 100 } as const;
/** How much a photo or design is darkened behind what sits over it, in percent. */
export const STUDIO_DIM = { min: 0, max: 80 } as const;
/** Text set on a cover needs a scrim; the banner layout never goes below this. */
export const STUDIO_BANNER_MIN_DIM = 35;
export const STUDIO_ZOOM = { min: 100, max: 300 } as const;
export const STUDIO_INTENSITY = { min: 10, max: 100 } as const;

/** Who sees a part of the profile. Hiding never deletes anything. */
export const VISIBILITIES = ['public', 'members', 'private'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/**
 * The parts a profile can show, each backed by something real on Yavaya.
 * The Trust Shield is not among them: it is always shown, right under the
 * header, because trust is never hidden (Master Bible, "The profile
 * system").
 */
export const PROFILE_MODULES = ['about', 'links', 'languages', 'contact', 'listings', 'work', 'services', 'store'] as const;
export type ProfileModuleId = (typeof PROFILE_MODULES)[number];

/** Where a module's content comes from: the member's own words, or their real activity in a district. */
export const MODULE_SOURCE: Record<ProfileModuleId, 'content' | 'district'> = {
  about: 'content',
  links: 'content',
  languages: 'content',
  contact: 'content',
  listings: 'district',
  work: 'district',
  services: 'district',
  store: 'district',
};

/** What a module shows until its owner decides: what was already public stays so; anything new waits to be turned on. */
export const MODULE_DEFAULT_VISIBILITY: Record<ProfileModuleId, Visibility> = {
  about: 'public',
  links: 'public',
  languages: 'public',
  contact: 'private',
  listings: 'public',
  work: 'private',
  services: 'private',
  store: 'private',
};

/**
 * Presentation modes. A mode only reorders and highlights; it never changes
 * who can see anything.
 */
export const PROFILE_MODES = ['personal', 'professional', 'business', 'freelancer', 'creator', 'seller', 'provider', 'jobseeker', 'community'] as const;
export type ProfileMode = (typeof PROFILE_MODES)[number];

export const MODE_LAYOUT: Record<ProfileMode, { order: ProfileModuleId[]; featured: ProfileModuleId }> = {
  personal: { order: ['about', 'links', 'languages', 'listings', 'work', 'services', 'store', 'contact'], featured: 'about' },
  professional: { order: ['work', 'about', 'links', 'languages', 'services', 'contact', 'listings', 'store'], featured: 'work' },
  business: { order: ['store', 'services', 'contact', 'about', 'links', 'listings', 'languages', 'work'], featured: 'store' },
  freelancer: { order: ['services', 'work', 'about', 'links', 'contact', 'languages', 'listings', 'store'], featured: 'services' },
  creator: { order: ['links', 'about', 'work', 'languages', 'listings', 'services', 'store', 'contact'], featured: 'links' },
  seller: { order: ['listings', 'about', 'contact', 'links', 'store', 'services', 'work', 'languages'], featured: 'listings' },
  provider: { order: ['services', 'about', 'contact', 'links', 'languages', 'work', 'listings', 'store'], featured: 'services' },
  jobseeker: { order: ['work', 'about', 'languages', 'links', 'contact', 'services', 'listings', 'store'], featured: 'work' },
  community: { order: ['about', 'languages', 'links', 'listings', 'services', 'work', 'store', 'contact'], featured: 'about' },
};

/**
 * Languages a member can say they speak, shown by name from the
 * dictionaries. Regional languages first-class beside the international ones.
 */
// 'sgn' is sign language in general: each country of the region has its own, and naming one would leave the others out.
export const PROFILE_LANGUAGES = ['es', 'en', 'pt', 'fr', 'it', 'de', 'zh', 'miq', 'cab', 'quc', 'cak', 'kek', 'mam', 'yua', 'nah', 'sgn'] as const;
export type ProfileLanguage = (typeof PROFILE_LANGUAGES)[number];

export type FocusPoint = { x: number; y: number };

export type BackgroundChoice =
  | { kind: 'default' }
  | { kind: 'asset'; asset: string }
  | { kind: 'solid'; solid: StudioSolidId }
  | { kind: 'gradient'; gradient: StudioGradientId }
  | { kind: 'upload'; media: string };

export type CoverChoice = { kind: 'default' } | { kind: 'none' } | { kind: 'asset'; asset: string } | { kind: 'upload'; media: string };

export type ProfileModuleSetting = { id: ProfileModuleId; visibility: Visibility; collapsed: boolean };

export type IdentityAppearance = {
  /** The theme last applied, if any — a label for the Studio, not a source of truth. */
  theme: string | null;
  surface: StudioSurfaceId;
  accent: StudioAccentId;
  card: (typeof STUDIO_CARD_STYLES)[number];
  opacity: number;
  border: (typeof STUDIO_BORDERS)[number];
  radius: (typeof STUDIO_RADII)[number];
  divider: (typeof STUDIO_DIVIDERS)[number];
  typography: (typeof STUDIO_TYPOGRAPHY)[number];
  header: (typeof STUDIO_HEADERS)[number];
  density: (typeof STUDIO_DENSITIES)[number];
  background: BackgroundChoice;
  backgroundFocus: FocusPoint;
  backgroundDim: number;
  cover: CoverChoice;
  coverFocus: FocusPoint;
  coverDim: number;
  avatar: {
    media: string | null;
    zoom: number;
    focus: FocusPoint;
    shape: (typeof STUDIO_AVATAR_SHAPES)[number];
    frame: string | null;
  };
  decoration: { asset: string | null; placement: (typeof STUDIO_DECORATION_PLACEMENTS)[number]; intensity: number };
};

export type IdentityContent = {
  headline: string;
  about: string;
  links: Array<{ label: string; url: string }>;
  languages: ProfileLanguage[];
};

export type IdentityConfig = {
  v: 1;
  appearance: IdentityAppearance;
  content: IdentityContent;
  layout: { mode: ProfileMode; featured: ProfileModuleId | null; modules: ProfileModuleSetting[] };
  /** Who sees the photo and the cover. The name and YAY ID are public everywhere already. */
  privacy: { avatar: Exclude<Visibility, 'private'>; cover: Exclude<Visibility, 'private'> };
};

/** What a profile looks like before its owner changes anything: Yavaya's own night, gold, and the street at dusk. */
export const DEFAULT_APPEARANCE: IdentityAppearance = {
  theme: null,
  surface: 'midnight',
  accent: 'gold',
  card: 'glass',
  opacity: 92,
  border: 'hairline',
  radius: 'soft',
  divider: 'line',
  typography: 'classic',
  header: 'classic',
  density: 'comfortable',
  background: { kind: 'default' },
  backgroundFocus: { x: 50, y: 50 },
  backgroundDim: 0,
  cover: { kind: 'default' },
  coverFocus: { x: 50, y: 50 },
  coverDim: 35,
  avatar: { media: null, zoom: 100, focus: { x: 50, y: 50 }, shape: 'circle', frame: null },
  decoration: { asset: null, placement: 'corners', intensity: 60 },
};

export function defaultModules(mode: ProfileMode = 'personal'): ProfileModuleSetting[] {
  return MODE_LAYOUT[mode].order.map((id) => ({ id, visibility: MODULE_DEFAULT_VISIBILITY[id], collapsed: false }));
}

export function defaultIdentity(): IdentityConfig {
  return {
    v: 1,
    appearance: structuredClone(DEFAULT_APPEARANCE),
    content: { headline: '', about: '', links: [], languages: [] },
    layout: { mode: 'personal', featured: null, modules: defaultModules('personal') },
    privacy: { avatar: 'public', cover: 'public' },
  };
}

/**
 * Applies a mode: modules take its order and its highlight. Who can see each
 * one is carried over untouched — presentation never overrides privacy.
 */
export function applyMode(layout: IdentityConfig['layout'], mode: ProfileMode): IdentityConfig['layout'] {
  const byId = new Map(layout.modules.map((module) => [module.id, module]));
  return {
    mode,
    featured: MODE_LAYOUT[mode].featured,
    modules: MODE_LAYOUT[mode].order.map((id) => byId.get(id) ?? { id, visibility: MODULE_DEFAULT_VISIBILITY[id], collapsed: false }),
  };
}

/** The colours a profile is drawn with, resolved from its ids. */
export function studioPalette(appearance: Pick<IdentityAppearance, 'surface' | 'accent'>) {
  const surface = STUDIO_SURFACES[appearance.surface];
  const accent = STUDIO_ACCENTS[appearance.accent];
  const ink = STUDIO_INK[surface.tone];
  return {
    tone: surface.tone,
    surface: surface.color,
    text: ink.text,
    text2: ink.text2,
    text3: ink.text3,
    accent: surface.tone === 'night' ? accent.night : accent.day,
    accentInk: surface.tone === 'night' ? accent.nightInk : accent.dayInk,
  };
}

/** Who is looking: the owner sees all of their own; members, what is public or for members; visitors, what is public. */
export type ProfileViewer = 'owner' | 'member' | 'visitor';

export function canSee(visibility: Visibility, viewer: ProfileViewer): boolean {
  if (viewer === 'owner') return true;
  if (visibility === 'public') return true;
  return visibility === 'members' && viewer === 'member';
}

/** The modules this viewer may see, in the member's order. */
export function visibleModules(config: IdentityConfig, viewer: ProfileViewer): ProfileModuleId[] {
  return config.layout.modules.filter((module) => canSee(module.visibility, viewer)).map((module) => module.id);
}
