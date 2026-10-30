import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  MODE_LAYOUT,
  PROFILE_MODES,
  PROFILE_MODULES,
  STUDIO_ACCENTS,
  STUDIO_BANNER_MIN_DIM,
  STUDIO_INK,
  STUDIO_OPACITY,
  STUDIO_SURFACES,
  applyMode,
  canSee,
  defaultIdentity,
  visibleModules,
  type IdentityConfig,
} from '@/config/identity-studio';
import { PROFILE_STUDIO_RULES } from '@/config/business-rules';
import { parseIdentity, readStoredIdentity } from '@/server/domains/identity/studio';
import { isDomainError } from '@/server/errors';

/**
 * The Identity Studio's rules that hold without a database: the colours
 * every choice can produce stay readable, what a member sends is checked
 * strictly, and presentation never changes who can see what.
 */

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const luminance = (h: string) => {
  const [r, g, b] = hex(h)
    .map((v) => v / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
const over = (top: string, under: string, alpha: number) => toHex(hex(top).map((v, i) => v * alpha + hex(under)[i]! * (1 - alpha)));

const config = (patch: (c: IdentityConfig) => void = () => {}) => {
  const c = defaultIdentity();
  patch(c);
  return c;
};
const failure = (input: unknown) => {
  try {
    parseIdentity(input);
  } catch (error) {
    if (isDomainError(error)) return { key: error.messageKey, details: error.details };
    throw error;
  }
  return null;
};

describe('the colours a member can choose', () => {
  // A glass card lets the background through at most (100 − min opacity)%:
  // the worst background for light words is white, for dark words black.
  const worst = (color: string, tone: 'night' | 'day') => over(color, tone === 'night' ? '#ffffff' : '#000000', STUDIO_OPACITY.min / 100);

  it('keep every kind of text readable on every surface, solid or glass (WCAG AA)', () => {
    for (const [id, surface] of Object.entries(STUDIO_SURFACES)) {
      const ink = STUDIO_INK[surface.tone];
      for (const background of [surface.color, worst(surface.color, surface.tone)]) {
        for (const [name, color] of Object.entries(ink)) {
          expect(contrast(color, background), `${name} on ${id} (${background})`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('keep every accent readable as text on every surface of its tone', () => {
    for (const [id, surface] of Object.entries(STUDIO_SURFACES)) {
      for (const [accentId, accent] of Object.entries(STUDIO_ACCENTS)) {
        const color = surface.tone === 'night' ? accent.night : accent.day;
        for (const background of [surface.color, worst(surface.color, surface.tone)]) {
          expect(contrast(color, background), `${accentId} on ${id}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('keep the words on an accent button readable', () => {
    for (const [id, accent] of Object.entries(STUDIO_ACCENTS)) {
      expect(contrast(accent.nightInk, accent.night), `night ${id}`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accent.dayInk, accent.day), `day ${id}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('what a member sends', () => {
  it('accepts Yavaya’s own default profile', () => {
    expect(failure(defaultIdentity())).toBeNull();
  });

  it('refuses anything outside the vocabulary: unknown fields, values, styles', () => {
    expect(failure({ ...defaultIdentity(), css: 'body{display:none}' })?.key).toBe('studio.error.config');
    expect(failure(config((c) => ((c.appearance as Record<string, unknown>).accent = '#ff0000')))?.key).toBe('studio.error.config');
    expect(failure(config((c) => ((c.appearance as Record<string, unknown>).html = '<script>')))?.key).toBe('studio.error.config');
    expect(failure(config((c) => (c.appearance.opacity = 20)))?.key).toBe('studio.error.config');
  });

  it('takes links only as whole https addresses to a named host', () => {
    const withLink = (url: string) => config((c) => (c.content.links = [{ label: 'Mi sitio', url }]));
    expect(failure(withLink('https://example.org/me'))).toBeNull();
    for (const url of ['javascript:alert(1)', 'http://example.org', 'https://127.0.0.1/', 'https://[::1]/', 'https://user:pass@example.org', 'https://localhost/', 'data:text/html,hi']) {
      expect(failure(withLink(url))?.key, url).toBe('studio.error.link');
    }
    expect(failure(config((c) => (c.content.links = [{ label: '', url: 'https://example.org' }])))?.key).toBe('studio.error.link_label');
  });

  it('names the limit it enforces', () => {
    const long = config((c) => (c.content.headline = 'a'.repeat(PROFILE_STUDIO_RULES.headlineMaxLength + 1)));
    expect(failure(long)).toEqual({ key: 'studio.error.headline', details: { max: PROFILE_STUDIO_RULES.headlineMaxLength } });
    const many = config((c) => (c.content.links = Array.from({ length: PROFILE_STUDIO_RULES.maxLinks + 1 }, (_, i) => ({ label: `L${i}`, url: `https://example.org/${i}` }))));
    expect(failure(many)).toEqual({ key: 'studio.error.links', details: { max: PROFILE_STUDIO_RULES.maxLinks } });
  });

  it('removes control and direction-reversing characters, and tidies spaces', () => {
    const parsed = parseIdentity(config((c) => (c.content.headline = '  Diseñadora‮ gráfica\u0007   en   León ')));
    expect(parsed.content.headline).toBe('Diseñadora gráfica en León');
    const about = parseIdentity(config((c) => (c.content.about = 'Uno\r\n\r\n\r\n\r\nDos⁦'))).content.about;
    expect(about).toBe('Uno\n\nDos');
  });

  it('keeps every section exactly once, and each language once', () => {
    expect(failure(config((c) => c.layout.modules.pop()))?.key).toBe('studio.error.config');
    expect(failure(config((c) => (c.layout.modules[1] = { ...c.layout.modules[0]! })))?.key).toBe('studio.error.config');
    expect(failure(config((c) => (c.content.languages = ['es', 'es'])))?.key).toBe('studio.error.languages');
  });

  it('takes designs only from the library, and only for the slot they are made for', () => {
    expect(failure(config((c) => (c.appearance.background = { kind: 'asset', asset: 'not-a-design' })))?.key).toBe('studio.error.asset');
    // An ornament is not a background, and a frame is not an ornament.
    expect(failure(config((c) => (c.appearance.background = { kind: 'asset', asset: 'decor-corner-deco-gold' })))?.key).toBe('studio.error.asset');
    expect(failure(config((c) => (c.appearance.decoration = { ...c.appearance.decoration, asset: 'frame-ring-gold' })))?.key).toBe('studio.error.asset');
    expect(failure(config((c) => (c.appearance.avatar = { ...c.appearance.avatar, frame: 'decor-trim-stars-gold' })))?.key).toBe('studio.error.asset');
  });

  it('keeps a banner readable and a frame on the photo shape it was drawn for', () => {
    const banner = parseIdentity(config((c) => ((c.appearance.header = 'banner'), (c.appearance.coverDim = 0))));
    expect(banner.appearance.coverDim).toBe(STUDIO_BANNER_MIN_DIM);
    const framed = parseIdentity(config((c) => (c.appearance.avatar = { ...c.appearance.avatar, shape: 'hexagon', frame: 'frame-ring-gold' })));
    expect(framed.appearance.avatar.shape).toBe('circle');
    const rounded = parseIdentity(config((c) => (c.appearance.avatar = { ...c.appearance.avatar, shape: 'circle', frame: 'frame-rounded-ring-gold' })));
    expect(rounded.appearance.avatar.shape).toBe('rounded');
  });

  it('draws a stored profile even after one of its designs is gone', () => {
    const stored = config((c) => {
      c.content.headline = 'Panadera';
      c.appearance.accent = 'emerald';
    }) as unknown as Record<string, unknown>;
    (stored.appearance as Record<string, unknown>).background = { kind: 'asset', asset: 'retired-design' };
    (stored.appearance as Record<string, unknown>).avatar = { ...DEFAULT_APPEARANCE.avatar, frame: 'retired-frame' };
    const read = readStoredIdentity(stored);
    expect(read.appearance.background).toEqual({ kind: 'default' });
    expect(read.appearance.avatar.frame).toBeNull();
    expect(read.appearance.accent).toBe('emerald');
    expect(read.content.headline).toBe('Panadera');
    expect(readStoredIdentity(null)).toEqual(defaultIdentity());
    expect(readStoredIdentity('not json')).toEqual(defaultIdentity());
  });
});

describe('who sees what', () => {
  it('lets the owner see everything, members what is public or for members, visitors only what is public', () => {
    expect([canSee('public', 'visitor'), canSee('members', 'visitor'), canSee('private', 'visitor')]).toEqual([true, false, false]);
    expect([canSee('public', 'member'), canSee('members', 'member'), canSee('private', 'member')]).toEqual([true, true, false]);
    expect([canSee('public', 'owner'), canSee('members', 'owner'), canSee('private', 'owner')]).toEqual([true, true, true]);
  });

  it('filters a profile’s sections by viewer, in the member’s order', () => {
    const c = config((c) => {
      c.layout.modules = c.layout.modules.map((m) => ({ ...m, visibility: m.id === 'about' ? 'members' : m.id === 'links' ? 'private' : 'public' }));
    });
    expect(visibleModules(c, 'visitor')).not.toContain('about');
    expect(visibleModules(c, 'member')).toContain('about');
    expect(visibleModules(c, 'member')).not.toContain('links');
    expect(visibleModules(c, 'owner')).toHaveLength(PROFILE_MODULES.length);
  });

  it('never changes who sees a section when the presentation mode changes', () => {
    const start = config((c) => (c.layout.modules = c.layout.modules.map((m, i) => ({ ...m, visibility: (['public', 'members', 'private'] as const)[i % 3]!, collapsed: i % 2 === 0 }))));
    const before = Object.fromEntries(start.layout.modules.map((m) => [m.id, m.visibility]));
    for (const mode of PROFILE_MODES) {
      const layout = applyMode(start.layout, mode);
      expect(layout.modules.map((m) => m.id)).toEqual(MODE_LAYOUT[mode].order);
      expect(Object.fromEntries(layout.modules.map((m) => [m.id, m.visibility]))).toEqual(before);
      expect(layout.featured).toBe(MODE_LAYOUT[mode].featured);
    }
  });
});
