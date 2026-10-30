'use client';

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_APPEARANCE, type IdentityAppearance, type IdentityConfig, type ProfileModuleId, type ProfileViewer } from '@/config/identity-studio';
import { shrinkImage } from '@/ui/components/shrink-image';
import { ProfileCanvas, shownLinks, type CanvasAsset } from '../profile-canvas';
import { deletePresetAction, discardDraftAction, favoriteAction, publishAction, renamePresetAction, saveDraftAction, savePresetAction } from '@/app/account/profile/actions';
import { Choice } from './controls';
import { AppearancePanel, BackgroundsPanel, changesBetween, LayoutPanel, PrivacyPanel, PublishPanel, type PanelContext, type PhotoSlot } from './panels';
import type { GalleryTab } from './gallery';
import type { StudioArea, StudioPreset, StudioProps } from './types';

type Notice = { kind: 'ok' | 'error' | 'conflict'; text: string } | null;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The same profile, whatever order its keys were written in. A copy kept on
 * this device was serialized by the browser and the server's by the server;
 * comparing them as text found a "difference" in every profile, so the
 * recovery prompt showed even with nothing to recover.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}
const sameProfile = (a: unknown, b: unknown) => same(canonical(a), canonical(b));

/** A copy kept on this device must at least have the shape of a profile before it is offered back. */
function looksLikeConfig(value: unknown): value is IdentityConfig {
  const v = value as IdentityConfig | null;
  return Boolean(v && v.v === 1 && v.appearance && v.content && Array.isArray(v.layout?.modules) && v.privacy);
}

/**
 * If the preview ever fails to draw, the controls and the member's draft stay
 * — the failure is confined to the preview, which tries again on the next change.
 */
class PreviewBoundary extends Component<{ message: string; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? <p className="ids-notice is-error">{this.props.message}</p> : this.props.children;
  }
}

/**
 * Identity Studio — "Personalizar mi perfil".
 *
 * The member edits a draft and sees it at once in a live preview drawn by the
 * same component as their public profile. Nothing leaves the draft until they
 * save it (only they see it) or publish it (everyone sees it, as they chose).
 * Unsaved work is also kept on this device, so a lost connection or a closed
 * tab costs nothing, and every save names the version it started from, so two
 * open windows can never silently overwrite each other.
 */
export function IdentityStudio(props: StudioProps) {
  const L = props.labels.text;
  const [draft, setDraft] = useState<IdentityConfig>(props.initial.draft);
  const [history, setHistory] = useState<IdentityConfig[]>([]);
  const [saved, setSaved] = useState({
    config: props.initial.draft,
    revision: props.initial.revision,
    onServer: props.initial.unpublished,
  });
  const [published, setPublished] = useState({
    config: props.initial.published,
    ever: props.initial.everPublished,
  });
  const [busy, setBusy] = useState<null | 'save' | 'publish' | 'discard' | 'preset'>(null);
  const [uploading, setUploading] = useState<PhotoSlot | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [area, setArea] = useState<StudioArea>('appearance');
  const [sheet, setSheet] = useState(false);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [viewer, setViewer] = useState<ProfileViewer>('owner');
  const [version, setVersion] = useState<'draft' | 'published'>('draft');
  const [favorites, setFavorites] = useState(props.initial.favorites);
  const [presets, setPresets] = useState<StudioPreset[]>(props.presets);
  const [galleryTab, setGalleryTab] = useState<GalleryTab>('backgrounds');
  const [recovery, setRecovery] = useState<IdentityConfig | null>(null);

  const dirty = !same(draft, saved.config);
  const unpublished = !same(draft, published.config);

  // --- This device's copy of unsaved work -------------------------------------------------
  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(props.storageKey) ?? 'null') as { config?: unknown } | null;
      if (!stored) return;
      // Offered back only when it differs from what the server already holds, draft or published.
      if (looksLikeConfig(stored.config) && !sameProfile(stored.config, props.initial.draft) && !sameProfile(stored.config, props.initial.published)) {
        setRecovery(stored.config);
      } else {
        window.localStorage.removeItem(props.storageKey);
      }
    } catch {
      // A private window or a full storage: there is simply nothing to recover.
    }
  }, [props.storageKey, props.initial.draft, props.initial.published]);

  useEffect(() => {
    if (recovery) return;
    const timer = window.setTimeout(() => {
      try {
        if (dirty) window.localStorage.setItem(props.storageKey, JSON.stringify({ config: draft, at: Date.now() }));
        else window.localStorage.removeItem(props.storageKey);
      } catch {
        // Nothing to do: the draft is still on screen.
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [draft, dirty, recovery, props.storageKey]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    // Links inside the site change page without unloading it, so the browser's own warning never comes:
    // a member who tapped the menu lost their edits without a word. Ask first.
    const leave = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.hasAttribute('download')) return;
      const to = new URL(link.href, window.location.href);
      if (to.origin !== window.location.origin || (to.pathname === window.location.pathname && to.search === window.location.search)) return;
      if (!window.confirm(L.leaveWarning)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', leave, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', leave, true);
    };
  }, [dirty, L.leaveWarning]);

  /** Saved or published: what this device kept is no longer needed, and neither is the offer to restore it. */
  const settled = () => {
    setRecovery(null);
    try {
      window.localStorage.removeItem(props.storageKey);
    } catch {
      // nothing kept
    }
  };

  // --- Changing the draft ---------------------------------------------------------------------
  const set = (next: IdentityConfig) => {
    setHistory((past) => [...past.slice(-39), draft]);
    setDraft(next);
    setVersion('draft');
  };
  const look = (patch: Partial<IdentityAppearance>) => set({ ...draft, appearance: { ...draft.appearance, ...patch } });
  const undo = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory(history.slice(0, -1));
    setDraft(previous);
  };

  const failed = (result: { code: string; message: string }) =>
    setNotice(result.code === 'conflict' ? { kind: 'conflict', text: L.conflict } : { kind: 'error', text: result.message });

  async function save() {
    setBusy('save');
    setNotice(null);
    try {
      const result = await saveDraftAction(draft, saved.revision);
      if (result.ok) {
        setSaved({ config: draft, revision: result.revision, onServer: true });
        settled();
        setNotice({ kind: 'ok', text: L.saved });
      } else failed(result);
    } catch {
      setNotice({ kind: 'error', text: L.network });
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setBusy('publish');
    setNotice(null);
    try {
      const result = await publishAction(draft, saved.revision);
      if (result.ok) {
        setSaved({ config: draft, revision: result.revision, onServer: false });
        setPublished({ config: draft, ever: true });
        settled();
        setNotice({ kind: 'ok', text: L.published });
      } else failed(result);
    } catch {
      setNotice({ kind: 'error', text: L.network });
    } finally {
      setBusy(null);
    }
  }

  async function discard() {
    if (!window.confirm(L.confirmDiscard)) return;
    setBusy('discard');
    setNotice(null);
    try {
      const result = await discardDraftAction(saved.revision);
      if (result.ok) {
        setHistory([]);
        setDraft(published.config);
        setSaved({
          config: published.config,
          revision: result.revision,
          onServer: false,
        });
        settled();
        setNotice({ kind: 'ok', text: L.discarded });
      } else failed(result);
    } catch {
      setNotice({ kind: 'error', text: L.network });
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    if (!window.confirm(L.confirmReset)) return;
    // The look goes back to Yavaya's; the member's photo stays theirs.
    look({
      ...DEFAULT_APPEARANCE,
      avatar: {
        ...DEFAULT_APPEARANCE.avatar,
        media: draft.appearance.avatar.media,
      },
    });
  }

  async function upload(slot: PhotoSlot, file: File) {
    setUploading(slot);
    setNotice(null);
    try {
      const form = new FormData();
      form.set('slot', slot);
      form.set('photo', await shrinkImage(file), file.name.replace(/\.\w+$/, '') + '.jpg');
      const response = await fetch('/api/identity/upload', {
        method: 'POST',
        body: form,
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        id?: string;
        message?: string;
      } | null;
      if (!body?.ok || !body.id) {
        setNotice({ kind: 'error', text: body?.message ?? L.network });
        return;
      }
      const a = draft.appearance;
      if (slot === 'avatar')
        look({
          avatar: {
            ...a.avatar,
            media: body.id,
            zoom: 100,
            focus: { x: 50, y: 50 },
          },
        });
      if (slot === 'cover')
        look({
          cover: { kind: 'upload', media: body.id },
          coverFocus: { x: 50, y: 50 },
        });
      if (slot === 'background')
        look({
          background: { kind: 'upload', media: body.id },
          backgroundFocus: { x: 50, y: 50 },
        });
    } catch {
      setNotice({ kind: 'error', text: L.network });
    } finally {
      setUploading(null);
    }
  }

  async function favorite(id: string, on: boolean) {
    const before = favorites;
    setFavorites(on ? [id, ...favorites] : favorites.filter((f) => f !== id));
    try {
      const result = await favoriteAction(id, on);
      if (result.ok) setFavorites(result.favorites);
      else {
        setFavorites(before);
        failed(result);
      }
    } catch {
      setFavorites(before);
      setNotice({ kind: 'error', text: L.network });
    }
  }

  async function presetAction(action: 'save' | 'rename' | 'duplicate' | 'delete', preset?: StudioPreset, name?: string) {
    if (action === 'delete' && !window.confirm(L.confirmDeletePreset)) return;
    setBusy('preset');
    setNotice(null);
    try {
      const result =
        action === 'save'
          ? await savePresetAction(name ?? '', draft.appearance)
          : action === 'rename'
            ? await renamePresetAction(preset!.id, name ?? '')
            : action === 'duplicate'
              ? await savePresetAction(`${preset!.name} ${L.copySuffix}`.slice(0, props.limits.presetName), preset!.appearance)
              : await deletePresetAction(preset!.id);
      if (result.ok) setPresets(result.presets as StudioPreset[]);
      else failed(result);
    } catch {
      setNotice({ kind: 'error', text: L.network });
    } finally {
      setBusy(null);
    }
  }

  // --- The preview ----------------------------------------------------------------------------
  const shownConfig = version === 'published' ? published.config : draft;
  const catalogById = useMemo(() => new Map(props.catalog.map((item) => [item.id, item])), [props.catalog]);
  const assets = useMemo(() => {
    const a = shownConfig.appearance;
    const ids = [a.background.kind === 'asset' ? a.background.asset : null, a.cover.kind === 'asset' ? a.cover.asset : null, a.avatar.frame, a.decoration.asset];
    const found: Record<string, CanvasAsset> = {};
    for (const id of ids) {
      const item = id ? catalogById.get(id) : undefined;
      if (item) found[item.id] = item;
    }
    return found;
  }, [shownConfig, catalogById]);
  const filled = useMemo(() => {
    const set = new Set<ProfileModuleId>(props.districtFilled);
    if (shownConfig.content.about.trim()) set.add('about');
    if (shownLinks(shownConfig).length) set.add('links');
    if (shownConfig.content.languages.length) set.add('languages');
    if (props.whatsapp) set.add('contact');
    return set;
  }, [shownConfig, props.districtFilled, props.whatsapp]);

  // The computer preview is drawn at a real desktop width and scaled to fit, so its layout is the real one.
  const frame = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [stageHeight, setStageHeight] = useState<number | undefined>(undefined);
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (device !== 'desktop' || !frame.current) return;
    const measure = () => {
      const width = frame.current?.clientWidth ?? 1180;
      const next = Math.min(1, width / 1180);
      setScale(next);
      setStageHeight(stage.current ? stage.current.scrollHeight * next : undefined);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame.current);
    if (stage.current) observer.observe(stage.current);
    return () => observer.disconnect();
  }, [device, shownConfig, viewer]);

  const changes = changesBetween(draft, published.config);
  const status = dirty ? L.statusUnsaved : saved.onServer ? L.statusSaved : !published.ever ? L.statusNever : unpublished ? L.statusUnpublished : L.statusPublished;

  const ctx: PanelContext = {
    draft,
    published: published.config,
    set,
    look,
    props,
    upload,
    uploading,
    favorites,
    onFavorite: favorite,
    galleryTab,
    setGalleryTab,
    presets,
    presetAction,
    busy: busy !== null,
    onPublish: publish,
    onDiscard: discard,
    canDiscard: saved.onServer || dirty,
  };

  const areas: Array<{ id: StudioArea; label: string; mark: string }> = [
    { id: 'appearance', label: L.areaAppearance, mark: '◐' },
    { id: 'backgrounds', label: L.areaBackgrounds, mark: '▦' },
    { id: 'layout', label: L.areaLayout, mark: '☰' },
    { id: 'privacy', label: L.areaPrivacy, mark: '◎' },
    { id: 'publish', label: L.areaPublish, mark: '✓' },
  ];
  const open = (next: StudioArea) => {
    setArea(next);
    setSheet(true);
  };

  return (
    <div className="ids" data-sheet={sheet ? 'open' : 'closed'}>
      <header className="ids-top">
        <div className="ids-title">
          <h1>{L.title}</h1>
          <p className="ids-status" role="status">
            <span className={`ids-dot${dirty ? ' is-dirty' : ''}`} aria-hidden="true" />
            {status}
          </p>
        </div>
        <div className="ids-actions">
          <button type="button" className="btn btn-line" onClick={undo} disabled={history.length === 0}>
            {L.undo}
          </button>
          <button type="button" className="btn btn-line" onClick={save} disabled={!dirty || busy !== null} aria-busy={busy === 'save'}>
            {busy === 'save' ? L.saving : L.save}
          </button>
          {/* The same action as the Publish panel's button: this one used to open the panel, and read as publishing. */}
          <button type="button" className="btn btn-gold" onClick={publish} disabled={busy !== null || changes.length === 0 || !props.canPublish} aria-busy={busy === 'publish'}>
            {busy === 'publish' ? L.publishing : L.publish}
          </button>
          <details className="ids-menu">
            <summary className="btn btn-line">{L.more}</summary>
            <div>
              <a href={props.publicHref}>{L.viewPublic}</a>
              <button type="button" onClick={reset}>
                {L.reset}
              </button>
              <button type="button" onClick={discard} disabled={!ctx.canDiscard || busy !== null}>
                {L.discard}
              </button>
            </div>
          </details>
        </div>
      </header>

      {notice ? (
        <div className={`ids-notice is-${notice.kind}`} role={notice.kind === 'ok' ? 'status' : 'alert'}>
          <span>{notice.text}</span>
          {notice.kind === 'conflict' ? (
            <button type="button" className="btn btn-line" onClick={() => window.location.reload()}>
              {L.reload}
            </button>
          ) : null}
        </div>
      ) : null}
      {recovery ? (
        <div className="ids-notice is-recover" role="status">
          <span>{L.recovered}</span>
          <button
            type="button"
            className="btn btn-line"
            onClick={() => {
              set(recovery);
              setRecovery(null);
            }}
          >
            {L.recoverKeep}
          </button>
          <button
            type="button"
            className="ids-link"
            onClick={() => {
              setRecovery(null);
              try {
                window.localStorage.removeItem(props.storageKey);
              } catch {
                // nothing kept
              }
            }}
          >
            {L.recoverDrop}
          </button>
        </div>
      ) : null}
      {!props.canPublish ? <p className="ids-notice is-info">{L.verifyFirst}</p> : null}

      <div className="ids-body">
        <nav className="ids-nav" aria-label={L.areas}>
          {areas.map((item) => (
            <button key={item.id} type="button" aria-current={area === item.id ? 'true' : undefined} onClick={() => open(item.id)}>
              <span aria-hidden="true">{item.mark}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <section className="ids-preview" aria-label={L.preview}>
          <div className="ids-preview-bar">
            <Choice
              legend={L.device}
              value={device}
              options={[
                { value: 'desktop', label: L.desktop },
                { value: 'mobile', label: L.mobile },
              ]}
              onChange={setDevice}
            />
            <Choice
              legend={L.viewAs}
              value={viewer}
              options={[
                {
                  value: 'owner',
                  label: props.labels.names.visibility.private,
                },
                {
                  value: 'member',
                  label: props.labels.names.visibility.members,
                },
                {
                  value: 'visitor',
                  label: props.labels.names.visibility.public,
                },
              ]}
              onChange={setViewer}
            />
            <Choice
              legend={L.version}
              value={version}
              options={[
                { value: 'draft', label: L.versionDraft },
                { value: 'published', label: L.versionPublished },
              ]}
              onChange={setVersion}
            />
          </div>
          <p className="ids-note ids-preview-hint">{viewer === 'owner' ? L.hintOwner : viewer === 'member' ? L.hintMember : L.hintVisitor}</p>
          <div ref={frame} className={`ids-frame is-${device}`} style={device === 'desktop' && stageHeight ? { height: stageHeight } : undefined}>
            <div ref={stage} className="ids-stage" style={device === 'desktop' ? { width: 1180, transform: `scale(${scale})` } : undefined} inert>
              <PreviewBoundary key={JSON.stringify(shownConfig)} message={L.previewFailed}>
                <ProfileCanvas
                  config={shownConfig}
                  person={props.person}
                  assets={assets}
                  viewer={viewer}
                  labels={props.canvasLabels}
                  slots={props.slots}
                  filled={filled}
                  whatsapp={props.whatsapp}
                  preview={viewer === 'owner'}
                />
              </PreviewBoundary>
            </div>
          </div>
        </section>

        <aside className="ids-panel" aria-label={areas.find((item) => item.id === area)?.label}>
          <div className="ids-panel-head">
            <h2>{areas.find((item) => item.id === area)?.label}</h2>
            <button type="button" className="ids-close" onClick={() => setSheet(false)}>
              {L.closeSheet}
            </button>
          </div>
          {area === 'appearance' ? <AppearancePanel ctx={ctx} /> : null}
          {area === 'backgrounds' ? <BackgroundsPanel ctx={ctx} /> : null}
          {area === 'layout' ? <LayoutPanel ctx={ctx} /> : null}
          {area === 'privacy' ? <PrivacyPanel ctx={ctx} /> : null}
          {area === 'publish' ? <PublishPanel ctx={ctx} /> : null}
        </aside>
      </div>
    </div>
  );
}
