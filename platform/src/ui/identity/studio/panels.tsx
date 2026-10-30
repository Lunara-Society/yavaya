'use client';

import { lazy, Suspense, useId, useRef, useState } from 'react';
import {
  PROFILE_LANGUAGES,
  PROFILE_MODES,
  STUDIO_ACCENTS,
  STUDIO_ACCENT_IDS,
  STUDIO_AVATAR_SHAPES,
  STUDIO_BORDERS,
  STUDIO_CARD_STYLES,
  STUDIO_DENSITIES,
  STUDIO_DIM,
  STUDIO_DIVIDERS,
  STUDIO_GRADIENTS,
  STUDIO_GRADIENT_IDS,
  STUDIO_HEADERS,
  STUDIO_INTENSITY,
  STUDIO_OPACITY,
  STUDIO_RADII,
  STUDIO_SOLIDS,
  STUDIO_SOLID_IDS,
  STUDIO_SURFACES,
  STUDIO_SURFACE_IDS,
  STUDIO_TYPOGRAPHY,
  STUDIO_ZOOM,
  VISIBILITIES,
  applyMode,
  type IdentityAppearance,
  type IdentityConfig,
  type ProfileLanguage,
  type ProfileModuleId,
  type Visibility,
} from '@/config/identity-studio';
import { ImageLink } from '@/ui/components/image-link';
import { Choice, fmt, Range, Section, Select, Swatches } from './controls';
import type { GalleryTab } from './gallery';
import type { CatalogItem, StudioPreset, StudioProps, StudioTheme } from './types';
import type { StudioChangeKind } from './labels';

/**
 * The gallery shows only in the Backgrounds panel, which is not the one the
 * Studio opens on, so it is fetched the first time it is shown instead of
 * with the page: on an inexpensive phone every kilobyte on arrival counts
 * (scripts/check-budget.mjs). The space it will take is held meanwhile.
 * React's own `lazy`: next/dynamic would add more to the page than this saves.
 */
const Gallery = lazy(() => import('./gallery').then((m) => ({ default: m.Gallery })));

export type PhotoSlot = 'avatar' | 'cover' | 'background';

/** What every panel works with: the draft, ways to change it, and the Studio's words. */
export type PanelContext = {
  draft: IdentityConfig;
  published: IdentityConfig;
  set: (next: IdentityConfig) => void;
  look: (patch: Partial<IdentityAppearance>) => void;
  props: StudioProps;
  upload: (slot: PhotoSlot, file: File) => void;
  uploading: PhotoSlot | null;
  favorites: string[];
  onFavorite: (id: string, on: boolean) => void;
  galleryTab: GalleryTab;
  setGalleryTab: (tab: GalleryTab) => void;
  presets: StudioPreset[];
  presetAction: (action: 'save' | 'rename' | 'duplicate' | 'delete', preset?: StudioPreset, name?: string) => void;
  busy: boolean;
  onPublish: () => void;
  onDiscard: () => void;
  canDiscard: boolean;
};

const byId = (catalog: CatalogItem[], id: string | null | undefined) => (id ? catalog.find((item) => item.id === id) ?? null : null);

// --- Photos -------------------------------------------------------------------------

function PhotoField({ ctx, slot, has, onRemove }: { ctx: PanelContext; slot: PhotoSlot; has: boolean; onRemove: () => void }) {
  const L = ctx.props.labels.text;
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  if (!ctx.props.canUpload) return <p className="ids-note">{ctx.props.canPublish ? L.photoUnavailable : L.verifyFirst}</p>;
  const busy = ctx.uploading === slot;
  // A form of its own so the photo-from-a-link field finds this photo input (and its Enter never submits anything).
  return (
    <form className="ids-photo" onSubmit={(event) => event.preventDefault()}>
      <input
        ref={input}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) ctx.upload(slot, file);
          event.currentTarget.value = '';
        }}
      />
      <div className="ids-row">
        <button type="button" className="btn btn-line" disabled={busy} aria-busy={busy} onClick={() => input.current?.click()}>
          {busy ? L.photoUploading : has ? L.photoReplace : L.photoUpload}
        </button>
        {has ? (
          <button type="button" className="ids-link" onClick={onRemove}>
            {L.photoRemove}
          </button>
        ) : null}
      </div>
      <p className="ids-note">{fmt(L.photoHint, { max: ctx.props.limits.uploadMb })}</p>
      {busy ? null : <ImageLink labels={ctx.props.linkLabels} />}
    </form>
  );
}

function Focus({ ctx, value, onChange }: { ctx: PanelContext; value: { x: number; y: number }; onChange: (value: { x: number; y: number }) => void }) {
  const L = ctx.props.labels.text;
  return (
    <>
      <Range label={L.focusX} value={value.x} min={0} max={100} onChange={(x) => onChange({ ...value, x })} />
      <Range label={L.focusY} value={value.y} min={0} max={100} onChange={(y) => onChange({ ...value, y })} />
    </>
  );
}

// --- Appearance ---------------------------------------------------------------------

export function AppearancePanel({ ctx }: { ctx: PanelContext }) {
  const { draft, look, props } = ctx;
  const { text: L, names: N } = props.labels;
  const a = draft.appearance;
  const frames = props.catalog.filter((item) => item.kind === 'frame');
  const tone = STUDIO_SURFACES[a.surface].tone;

  const applyTheme = (theme: StudioTheme) =>
    look({
      ...theme.appearance,
      theme: theme.id,
      // A theme never takes the member's own photo, its framing, or their own photos elsewhere.
      avatar: { ...a.avatar, shape: theme.appearance.avatar.shape, frame: theme.appearance.avatar.frame },
      background: a.background.kind === 'upload' ? a.background : theme.appearance.background,
      cover: a.cover.kind === 'upload' ? a.cover : theme.appearance.cover,
    });

  return (
    <>
      <Section title={L.themes} lead={L.themesLead}>
        <ul className="ids-themes">
          {props.themes.map((theme) => {
            const bg = theme.appearance.background;
            const picture = bg.kind === 'asset' ? byId(props.catalog, bg.asset)?.thumb : theme.appearance.cover.kind === 'asset' ? byId(props.catalog, theme.appearance.cover.asset)?.thumb : null;
            const fill = bg.kind === 'gradient' ? STUDIO_GRADIENTS[bg.gradient] : bg.kind === 'solid' ? STUDIO_SOLIDS[bg.solid] : undefined;
            const surface = STUDIO_SURFACES[theme.appearance.surface];
            const accent = STUDIO_ACCENTS[theme.appearance.accent];
            const on = a.theme === theme.id;
            return (
              <li key={theme.id}>
                <button type="button" className={`ids-theme${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => applyTheme(theme)}>
                  <span className="ids-theme-art" style={fill ? { background: fill } : undefined} aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element -- library thumbnail */}
                    {picture ? <img src={picture} alt="" loading="lazy" decoding="async" /> : null}
                    <span className="ids-theme-card" style={{ background: surface.color, borderColor: surface.tone === 'night' ? accent.night : accent.day }}>
                      <span style={{ background: surface.tone === 'night' ? accent.night : accent.day }} />
                    </span>
                  </span>
                  <span className="ids-theme-name">{theme.name}</span>
                  {on ? <span className="ids-badge">{L.themeApplied}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title={L.photo}>
        <PhotoField ctx={ctx} slot="avatar" has={Boolean(a.avatar.media)} onRemove={() => look({ avatar: { ...a.avatar, media: null } })} />
        {a.avatar.media ? (
          <>
            <Range label={L.zoom} value={a.avatar.zoom} min={STUDIO_ZOOM.min} max={STUDIO_ZOOM.max} step={5} onChange={(zoom) => look({ avatar: { ...a.avatar, zoom } })} />
            <Focus ctx={ctx} value={a.avatar.focus} onChange={(focus) => look({ avatar: { ...a.avatar, focus } })} />
          </>
        ) : null}
        <Choice
          legend={L.shape}
          value={a.avatar.shape}
          options={STUDIO_AVATAR_SHAPES.map((shape) => ({ value: shape, label: N.shape[shape] }))}
          onChange={(shape) => {
            // A frame is drawn for one shape of photo; another shape lets it go.
            const frame = byId(props.catalog, a.avatar.frame);
            look({ avatar: { ...a.avatar, shape, frame: frame && (frame.frameShape ?? 'circle') === shape ? frame.id : null } });
          }}
          columns={3}
        />
        <fieldset className="ids-frames">
          <legend>{L.frame}</legend>
          <label className={a.avatar.frame === null ? 'is-on' : undefined}>
            <input type="radio" name="ids-frame" checked={a.avatar.frame === null} onChange={() => look({ avatar: { ...a.avatar, frame: null } })} />
            <span className="ids-frame-none">{L.noFrame}</span>
          </label>
          {frames.map((frame) => (
            <label key={frame.id} className={a.avatar.frame === frame.id ? 'is-on' : undefined} title={frame.name}>
              <input
                type="radio"
                name="ids-frame"
                checked={a.avatar.frame === frame.id}
                onChange={() => look({ avatar: { ...a.avatar, frame: frame.id, shape: frame.frameShape === 'rounded' ? 'rounded' : 'circle' } })}
              />
              {/* eslint-disable-next-line @next/next/no-img-element -- vector frame */}
              <img src={frame.thumb} alt="" loading="lazy" width={56} height={56} />
              <span className="sr-only">{frame.name}</span>
            </label>
          ))}
        </fieldset>
      </Section>

      <Section title={L.colors}>
        <Swatches
          legend={`${L.surface} · ${tone === 'night' ? L.toneNight : L.toneDay}`}
          value={a.surface}
          options={STUDIO_SURFACE_IDS.map((id) => ({ value: id, color: STUDIO_SURFACES[id].color, label: `${N.surface[id]} (${STUDIO_SURFACES[id].tone === 'night' ? L.toneNight : L.toneDay})` }))}
          onChange={(surface) => look({ surface })}
        />
        <Swatches
          legend={L.accent}
          value={a.accent}
          options={STUDIO_ACCENT_IDS.map((id) => ({ value: id, color: tone === 'night' ? STUDIO_ACCENTS[id].night : STUDIO_ACCENTS[id].day, label: N.accent[id] }))}
          onChange={(accent) => look({ accent })}
        />
      </Section>

      <Section title={L.cards}>
        <Choice legend={L.cardStyle} value={a.card} options={STUDIO_CARD_STYLES.map((v) => ({ value: v, label: N.card[v] }))} onChange={(card) => look({ card })} columns={2} />
        <Range label={L.opacity} value={a.opacity} min={STUDIO_OPACITY.min} max={STUDIO_OPACITY.max} disabled={a.card !== 'glass'} onChange={(opacity) => look({ opacity })} />
        <Choice legend={L.border} value={a.border} options={STUDIO_BORDERS.map((v) => ({ value: v, label: N.border[v] }))} onChange={(border) => look({ border })} columns={2} />
        <Choice legend={L.radius} value={a.radius} options={STUDIO_RADII.map((v) => ({ value: v, label: N.radius[v] }))} onChange={(radius) => look({ radius })} columns={3} />
        <Choice legend={L.divider} value={a.divider} options={STUDIO_DIVIDERS.map((v) => ({ value: v, label: N.divider[v] }))} onChange={(divider) => look({ divider })} columns={2} />
      </Section>

      <Section title={L.typography}>
        <Choice legend={L.typography} value={a.typography} options={STUDIO_TYPOGRAPHY.map((v) => ({ value: v, label: N.typography[v] }))} onChange={(typography) => look({ typography })} columns={2} />
      </Section>
      <Section title={L.header}>
        <Choice legend={L.header} value={a.header} options={STUDIO_HEADERS.map((v) => ({ value: v, label: N.header[v] }))} onChange={(header) => look({ header, coverDim: header === 'banner' ? Math.max(a.coverDim, 35) : a.coverDim })} columns={2} />
        <Choice legend={L.density} value={a.density} options={STUDIO_DENSITIES.map((v) => ({ value: v, label: N.density[v] }))} onChange={(density) => look({ density })} columns={3} />
      </Section>
    </>
  );
}

// --- Backgrounds and decoration -------------------------------------------------------

export function BackgroundsPanel({ ctx }: { ctx: PanelContext }) {
  const { draft, look, props } = ctx;
  const { text: L, names: N } = props.labels;
  const a = draft.appearance;
  // "Your photo" is chosen by uploading one; it appears among the kinds only once it is the current one.
  const bgKinds = (['default', 'asset', 'solid', 'gradient', 'upload'] as const).filter((kind) => kind !== 'upload' || a.background.kind === 'upload');
  const coverKinds = (['default', 'asset', 'upload', 'none'] as const).filter((kind) => kind !== 'upload' || a.cover.kind === 'upload');
  const bgAsset = a.background.kind === 'asset' ? byId(props.catalog, a.background.asset) : null;
  const coverAsset = a.cover.kind === 'asset' ? byId(props.catalog, a.cover.asset) : null;
  const decoration = byId(props.catalog, a.decoration.asset);
  const firstOf = (kind: CatalogItem['kind']) => props.catalog.find((item) => item.kind === kind)?.id ?? null;

  return (
    <>
      <Section title={L.background}>
        <Choice
          legend={L.backgroundKind}
          value={a.background.kind}
          options={bgKinds.map((kind) => ({ value: kind, label: { default: L.bgDefault, asset: L.bgAsset, solid: L.bgSolid, gradient: L.bgGradient, upload: L.bgUpload }[kind] }))}
          onChange={(kind) => {
            if (kind === 'default') look({ background: { kind } });
            if (kind === 'solid') look({ background: { kind, solid: STUDIO_SOLID_IDS[0]! } });
            if (kind === 'gradient') look({ background: { kind, gradient: STUDIO_GRADIENT_IDS[0]! } });
            if (kind === 'asset') {
              const first = firstOf('background');
              if (first) look({ background: { kind, asset: first } });
              ctx.setGalleryTab('backgrounds');
            }
          }}
          columns={3}
        />
        {a.background.kind === 'solid' ? (
          <Swatches legend={L.bgSolid} value={a.background.solid} options={STUDIO_SOLID_IDS.map((id) => ({ value: id, color: STUDIO_SOLIDS[id], label: N.solid[id] }))} onChange={(solid) => look({ background: { kind: 'solid', solid } })} />
        ) : null}
        {a.background.kind === 'gradient' ? (
          <Swatches
            legend={L.bgGradient}
            value={a.background.gradient}
            options={STUDIO_GRADIENT_IDS.map((id) => ({ value: id, color: STUDIO_GRADIENTS[id], label: N.gradient[id] }))}
            onChange={(gradient) => look({ background: { kind: 'gradient', gradient } })}
          />
        ) : null}
        {a.background.kind === 'asset' ? <p className="ids-current">{bgAsset ? bgAsset.name : L.pickInGallery}</p> : null}
        {a.background.kind === 'upload' ? <PhotoField ctx={ctx} slot="background" has onRemove={() => look({ background: { kind: 'default' } })} /> : null}
        {a.background.kind === 'asset' || a.background.kind === 'upload' ? <Focus ctx={ctx} value={a.backgroundFocus} onChange={(backgroundFocus) => look({ backgroundFocus })} /> : null}
        <Range label={L.dim} value={a.backgroundDim} min={STUDIO_DIM.min} max={STUDIO_DIM.max} onChange={(backgroundDim) => look({ backgroundDim })} />
      </Section>
      {a.background.kind !== 'upload' && props.canUpload ? <UploadPrompt ctx={ctx} slot="background" /> : null}

      <Section title={L.cover}>
        <Choice
          legend={L.cover}
          value={a.cover.kind}
          options={coverKinds.map((kind) => ({ value: kind, label: { default: L.coverDefault, asset: L.coverAsset, upload: L.coverUpload, none: L.coverNone }[kind] }))}
          onChange={(kind) => {
            if (kind === 'default' || kind === 'none') look({ cover: { kind } });
            if (kind === 'asset') {
              const first = firstOf('cover');
              if (first) look({ cover: { kind, asset: first } });
              ctx.setGalleryTab('covers');
            }
          }}
          columns={2}
        />
        {a.cover.kind === 'asset' ? <p className="ids-current">{coverAsset ? coverAsset.name : L.pickInGallery}</p> : null}
        {a.cover.kind === 'upload' ? <PhotoField ctx={ctx} slot="cover" has onRemove={() => look({ cover: { kind: 'default' } })} /> : null}
        {a.cover.kind !== 'none' ? (
          <>
            <Focus ctx={ctx} value={a.coverFocus} onChange={(coverFocus) => look({ coverFocus })} />
            <Range label={L.coverDim} value={a.coverDim} min={a.header === 'banner' ? 35 : STUDIO_DIM.min} max={STUDIO_DIM.max} onChange={(coverDim) => look({ coverDim })} />
          </>
        ) : null}
      </Section>
      {a.cover.kind !== 'upload' && props.canUpload ? <UploadPrompt ctx={ctx} slot="cover" /> : null}

      <Section title={L.decoration}>
        <p className="ids-current">{decoration ? decoration.name : L.noDecoration}</p>
        {decoration ? (
          <>
            <Range label={L.intensity} value={a.decoration.intensity} min={STUDIO_INTENSITY.min} max={STUDIO_INTENSITY.max} onChange={(intensity) => look({ decoration: { ...a.decoration, intensity } })} />
            <button type="button" className="ids-link" onClick={() => look({ decoration: { ...a.decoration, asset: null } })}>
              {L.noDecoration}
            </button>
          </>
        ) : null}
      </Section>

      <Suspense fallback={<div className="ids-gallery-loading" aria-hidden="true" />}>
        <Gallery
          catalog={props.catalog}
          labels={props.labels}
          tab={ctx.galleryTab}
          onTab={ctx.setGalleryTab}
          favorites={ctx.favorites}
          onFavorite={ctx.onFavorite}
          appearance={a}
          onApply={(item, slot) => {
            if (slot === 'background') look({ background: { kind: 'asset', asset: item.id }, backgroundFocus: item.focus });
            if (slot === 'cover') look({ cover: { kind: 'asset', asset: item.id }, coverFocus: item.focus });
            if (slot === 'frame') look({ avatar: { ...a.avatar, frame: item.id, shape: item.frameShape === 'rounded' ? 'rounded' : 'circle' } });
            if (slot === 'decoration') look({ decoration: { ...a.decoration, asset: item.id, placement: item.placement === 'header' || item.placement === 'border' ? item.placement : 'corners' } });
          }}
        />
      </Suspense>
    </>
  );
}

/** "Use your own photo" for the cover or the background, when the member can upload. */
function UploadPrompt({ ctx, slot }: { ctx: PanelContext; slot: 'cover' | 'background' }) {
  const L = ctx.props.labels.text;
  return (
    <div className="ids-upload-prompt">
      <span>{slot === 'cover' ? L.coverUpload : L.bgUpload}</span>
      <PhotoField ctx={ctx} slot={slot} has={false} onRemove={() => {}} />
    </div>
  );
}

// --- Layout and content ---------------------------------------------------------------

export function LayoutPanel({ ctx }: { ctx: PanelContext }) {
  const { draft, set, props } = ctx;
  const { text: L, names: N } = props.labels;
  const limits = props.limits;
  const content = draft.content;
  const setContent = (patch: Partial<IdentityConfig['content']>) => set({ ...draft, content: { ...content, ...patch } });
  const modules = draft.layout.modules;
  const setModules = (next: typeof modules) => set({ ...draft, layout: { ...draft.layout, modules: next } });
  const move = (index: number, by: number) => {
    const next = [...modules];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    setModules(next);
  };
  const available = (id: ProfileModuleId) =>
    id === 'about' ? true : id === 'links' ? true : id === 'languages' ? true : id === 'contact' ? Boolean(props.whatsapp) : props.districtFilled.includes(id);

  return (
    <>
      <Section title={L.mode} lead={L.modeLead}>
        <Choice
          legend={L.mode}
          value={draft.layout.mode}
          options={PROFILE_MODES.map((mode) => ({ value: mode, label: N.mode[mode] }))}
          onChange={(mode) => set({ ...draft, layout: applyMode(draft.layout, mode) })}
          columns={3}
        />
      </Section>

      <Section title={L.headline}>
        <TextField label={L.headline} hint={fmt(L.headlineHint, { max: limits.headline })} value={content.headline} max={limits.headline} counter={L.chars} onChange={(headline) => setContent({ headline })} />
      </Section>

      <Section title={L.about}>
        <TextField label={L.about} hint={fmt(L.aboutHint, { max: limits.about })} value={content.about} max={limits.about} counter={L.chars} multiline onChange={(about) => setContent({ about })} />
      </Section>

      <Section title={L.links} lead={fmt(L.linksHint, { max: limits.links })}>
        <ol className="ids-links">
          {content.links.map((link, index) => (
            <li key={index}>
              <label>
                <span>{L.linkLabel}</span>
                <input value={link.label} maxLength={limits.linkLabel} onChange={(event) => setContent({ links: content.links.map((l, i) => (i === index ? { ...l, label: event.currentTarget.value } : l)) })} />
              </label>
              <label>
                <span>{L.linkUrl}</span>
                <input
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  value={link.url}
                  maxLength={limits.linkUrl}
                  onChange={(event) => setContent({ links: content.links.map((l, i) => (i === index ? { ...l, url: event.currentTarget.value } : l)) })}
                />
              </label>
              <button type="button" className="ids-link" onClick={() => setContent({ links: content.links.filter((_, i) => i !== index) })}>
                {L.linkRemove}
              </button>
            </li>
          ))}
        </ol>
        {content.links.length < limits.links ? (
          <button type="button" className="btn btn-line" onClick={() => setContent({ links: [...content.links, { label: '', url: 'https://' }] })}>
            {L.linkAdd}
          </button>
        ) : null}
      </Section>

      <Section title={L.languages} lead={fmt(L.languagesHint, { max: limits.languages })}>
        <fieldset className="ids-checks">
          <legend className="sr-only">{L.languages}</legend>
          {PROFILE_LANGUAGES.map((code) => {
            const on = content.languages.includes(code);
            const full = !on && content.languages.length >= limits.languages;
            return (
              <label key={code} className={on ? 'is-on' : undefined}>
                <input
                  type="checkbox"
                  checked={on}
                  disabled={full}
                  onChange={() => setContent({ languages: on ? content.languages.filter((c) => c !== code) : [...content.languages, code as ProfileLanguage] })}
                />
                <span>{props.canvasLabels.languages[code]}</span>
              </label>
            );
          })}
        </fieldset>
      </Section>

      <Section title={L.modules} lead={L.modulesLead}>
        <p className="ids-note ids-trust-note">{L.trustFixed}</p>
        <ol className="ids-modules">
          {modules.map((module, index) => {
            const name = N.module[module.id];
            const ok = available(module.id);
            return (
              <li key={module.id}>
                <div className="ids-module-top">
                  <strong>{name}</strong>
                  <span className="ids-move">
                    <button type="button" disabled={index === 0} aria-label={fmt(L.moveUp, { name })} onClick={() => move(index, -1)}>
                      ↑
                    </button>
                    <button type="button" disabled={index === modules.length - 1} aria-label={fmt(L.moveDown, { name })} onClick={() => move(index, 1)}>
                      ↓
                    </button>
                  </span>
                </div>
                {!ok ? (
                  <p className="ids-note">
                    {N.unavailable[module.id as keyof typeof N.unavailable]}{' '}
                    {props.createHref[module.id] ? <a href={props.createHref[module.id]}>{L.create}</a> : null}
                  </p>
                ) : null}
                <div className="ids-module-controls">
                  <Select
                    label={`${L.visibility}: ${name}`}
                    hideLabel
                    value={module.visibility}
                    options={VISIBILITIES.map((v) => ({ value: v, label: N.visibility[v] }))}
                    onChange={(visibility: Visibility) => setModules(modules.map((m) => (m.id === module.id ? { ...m, visibility } : m)))}
                  />
                  <label className="ids-inline">
                    <input type="checkbox" checked={module.collapsed} onChange={() => setModules(modules.map((m) => (m.id === module.id ? { ...m, collapsed: !m.collapsed } : m)))} />
                    {L.collapsed}
                  </label>
                </div>
              </li>
            );
          })}
        </ol>
        <Select
          label={L.featured}
          value={draft.layout.featured ?? ''}
          options={[{ value: '', label: L.noFeatured }, ...modules.map((m) => ({ value: m.id, label: N.module[m.id] }))]}
          onChange={(value) => set({ ...draft, layout: { ...draft.layout, featured: (value || null) as ProfileModuleId | null } })}
        />
      </Section>
    </>
  );
}

function TextField({
  label,
  hint,
  value,
  max,
  counter,
  multiline,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  max: number;
  counter: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="ids-text">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      {multiline ? (
        <textarea id={id} value={value} maxLength={max} rows={6} onChange={(event) => onChange(event.currentTarget.value)} aria-describedby={`${id}-hint`} />
      ) : (
        <input id={id} value={value} maxLength={max} onChange={(event) => onChange(event.currentTarget.value)} aria-describedby={`${id}-hint`} />
      )}
      <p id={`${id}-hint`} className="ids-note">
        {hint} <span className="ids-counter">{fmt(counter, { count: value.length, max })}</span>
      </p>
    </div>
  );
}

// --- Privacy ----------------------------------------------------------------------------

export function PrivacyPanel({ ctx }: { ctx: PanelContext }) {
  const { draft, set, props } = ctx;
  const { text: L, names: N } = props.labels;
  const twoWay = (['public', 'members'] as const).map((v) => ({ value: v, label: N.visibility[v] }));
  const threeWay = VISIBILITIES.map((v) => ({ value: v, label: N.visibility[v] }));
  return (
    <Section title={L.privacy} lead={L.privacyLead}>
      <dl className="ids-privacy">
        <div>
          <dt>{L.rowName}</dt>
          <dd>{L.rowNameValue}</dd>
        </div>
        <div>
          <dt>{L.rowTrust}</dt>
          <dd>{L.rowTrustValue}</dd>
        </div>
        <div>
          <dt>{L.rowPhoto}</dt>
          <dd>
            <Select label={L.rowPhoto} hideLabel value={draft.privacy.avatar} options={twoWay} onChange={(avatar) => set({ ...draft, privacy: { ...draft.privacy, avatar } })} />
          </dd>
        </div>
        <div>
          <dt>{L.rowCover}</dt>
          <dd>
            <Select label={L.rowCover} hideLabel value={draft.privacy.cover} options={twoWay} onChange={(cover) => set({ ...draft, privacy: { ...draft.privacy, cover } })} />
          </dd>
        </div>
        {draft.layout.modules.map((module) => (
          <div key={module.id}>
            <dt>{N.module[module.id]}</dt>
            <dd>
              <Select
                label={N.module[module.id]}
                hideLabel
                value={module.visibility}
                options={threeWay}
                onChange={(visibility: Visibility) => set({ ...draft, layout: { ...draft.layout, modules: draft.layout.modules.map((m) => (m.id === module.id ? { ...m, visibility } : m)) } })}
              />
            </dd>
          </div>
        ))}
      </dl>
      <ul className="ids-hints">
        {VISIBILITIES.map((v) => (
          <li key={v}>
            <strong>{N.visibility[v]}</strong> — {N.visibilityHint[v]}
          </li>
        ))}
      </ul>
      <p className="ids-note">{L.membersPhotoNote}</p>
      <p className="ids-note">{L.never}</p>
    </Section>
  );
}

// --- Preview and publish -----------------------------------------------------------------

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** What a publication would change, by what a member recognises. */
export function changesBetween(draft: IdentityConfig, published: IdentityConfig): StudioChangeKind[] {
  const a = draft.appearance;
  const b = published.appearance;
  const found: StudioChangeKind[] = [];
  if (a.avatar.media !== b.avatar.media || a.avatar.zoom !== b.avatar.zoom || !same(a.avatar.focus, b.avatar.focus) || a.avatar.shape !== b.avatar.shape) found.push('photo');
  if (!same(a.cover, b.cover) || !same(a.coverFocus, b.coverFocus) || a.coverDim !== b.coverDim) found.push('cover');
  if (!same(a.background, b.background) || !same(a.backgroundFocus, b.backgroundFocus) || a.backgroundDim !== b.backgroundDim) found.push('background');
  if (a.avatar.frame !== b.avatar.frame) found.push('frame');
  if (!same(a.decoration, b.decoration)) found.push('decoration');
  const lookKeys = ['surface', 'accent', 'card', 'opacity', 'border', 'radius', 'divider', 'typography', 'header', 'density'] as const;
  if (lookKeys.some((key) => a[key] !== b[key])) found.push('look');
  if (!same(draft.content, published.content)) found.push('content');
  // Order, folding and the highlight are presentation; who sees each section is privacy, reported on its own.
  const shape = (config: IdentityConfig) => config.layout.modules.map((m) => [m.id, m.collapsed]);
  if (!same(shape(draft), shape(published)) || draft.layout.featured !== published.layout.featured) found.push('modules');
  if (draft.layout.mode !== published.layout.mode) found.push('mode');
  if (!same(draft.privacy, published.privacy) || !same(draft.layout.modules.map((m) => m.visibility), published.layout.modules.map((m) => m.visibility))) found.push('privacy');
  return found;
}

export function PublishPanel({ ctx }: { ctx: PanelContext }) {
  const { draft, published, props } = ctx;
  const { text: L, names: N } = props.labels;
  const changes = changesBetween(draft, published);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  return (
    <>
      <Section title={L.changes}>
        {changes.length === 0 ? (
          <p className="ids-note">{L.changesNone}</p>
        ) : (
          <ul className="ids-changes">
            {changes.map((kind) => (
              <li key={kind}>{N.change[kind]}</li>
            ))}
          </ul>
        )}
        <p className="ids-note">{L.publishLead}</p>
        {!props.canPublish ? <p className="ids-note">{L.verifyFirst}</p> : null}
        <div className="ids-row">
          <button type="button" className="btn btn-gold" disabled={ctx.busy || changes.length === 0 || !props.canPublish} onClick={ctx.onPublish}>
            {L.publish}
          </button>
          {ctx.canDiscard ? (
            <button type="button" className="ids-link" disabled={ctx.busy} onClick={ctx.onDiscard}>
              {L.discard}
            </button>
          ) : null}
        </div>
      </Section>

      <Section title={L.presets} lead={L.presetsLead}>
        <form
          className="ids-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) ctx.presetAction('save', undefined, name.trim());
            setName('');
          }}
        >
          <label className="sr-only" htmlFor="ids-preset-name">
            {L.presetName}
          </label>
          <input id="ids-preset-name" value={name} maxLength={props.limits.presetName} placeholder={L.presetName} onChange={(event) => setName(event.currentTarget.value)} />
          <button type="submit" className="btn btn-line" disabled={ctx.busy || !name.trim() || ctx.presets.length >= props.limits.presets}>
            {L.presetSave}
          </button>
        </form>
        <p className="ids-note">{fmt(L.presetsCount, { count: ctx.presets.length, max: props.limits.presets })}</p>
        {ctx.presets.length === 0 ? (
          <p className="ids-note">{L.presetsEmpty}</p>
        ) : (
          <ul className="ids-presets">
            {ctx.presets.map((preset) => (
              <li key={preset.id}>
                {renaming?.id === preset.id ? (
                  <form
                    className="ids-row"
                    onSubmit={(event) => {
                      event.preventDefault();
                      ctx.presetAction('rename', preset, renaming.name.trim());
                      setRenaming(null);
                    }}
                  >
                    <label className="sr-only" htmlFor={`ids-rename-${preset.id}`}>
                      {L.presetName}
                    </label>
                    <input id={`ids-rename-${preset.id}`} value={renaming.name} maxLength={props.limits.presetName} onChange={(event) => setRenaming({ id: preset.id, name: event.currentTarget.value })} autoFocus />
                    <button type="submit" className="btn btn-line">
                      {L.presetRename}
                    </button>
                  </form>
                ) : (
                  <>
                    <strong>{preset.name}</strong>
                    <span className="ids-row">
                      <button type="button" className="ids-link" onClick={() => ctx.look({ ...preset.appearance })}>
                        {L.presetApply}
                      </button>
                      <button type="button" className="ids-link" onClick={() => setRenaming({ id: preset.id, name: preset.name })}>
                        {L.presetRename}
                      </button>
                      <button type="button" className="ids-link" disabled={ctx.presets.length >= props.limits.presets} onClick={() => ctx.presetAction('duplicate', preset)}>
                        {L.presetDuplicate}
                      </button>
                      <button type="button" className="ids-link" onClick={() => ctx.presetAction('delete', preset)}>
                        {L.presetDelete}
                      </button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
