import type { CSSProperties, ReactNode } from 'react';
import {
  STUDIO_GRADIENTS,
  STUDIO_SOLIDS,
  canSee,
  studioPalette,
  type IdentityConfig,
  type ProfileModuleId,
  type ProfileViewer,
  type Visibility,
} from '@/config/identity-studio';
import { assetSrcSet, type IdentityAsset } from '@/config/identity-asset-types';

/**
 * A member's profile, drawn from their configuration.
 *
 * One component for both places a profile appears: the public page renders
 * it on the server with the published configuration, and the Studio renders
 * it live in the browser with the draft — so what a member previews is
 * exactly what visitors get. It holds no data of its own: the modules backed
 * by real activity (listings, work, services, store) and the Trust Shield
 * arrive as already-rendered `slots`, and every word arrives in `labels`.
 *
 * Nothing the member typed is ever treated as anything but text. Colours and
 * images come from the design vocabulary and the library by id; the member's
 * own photos only through the route that checks who may see them.
 */

export type CanvasAsset = Pick<IdentityAsset, 'id' | 'kind' | 'files' | 'focus' | 'format' | 'placement' | 'frameShape' | 'transparent'>;

export type CanvasLabels = {
  modules: Record<ProfileModuleId, string>;
  languages: Record<string, string>;
  memberSince: string;
  avatarAlt: string;
  contactWhatsapp: string;
  contactUnverified: string;
  linkOpensElsewhere: string;
  membersOnlyNote: string;
  /** Studio only: what an empty module says to its owner. */
  empty?: Partial<Record<ProfileModuleId, string>>;
  /** Studio only: who sees each section, shown on it in the owner's preview. */
  visibility?: Record<Visibility, string>;
};

export type CanvasPerson = {
  displayName: string;
  yayId: string;
  /** Already-rendered team badge, when the member is on Yavaya's team. */
  team?: ReactNode;
};

const PHOTO = (id: string) => `/api/identity/media/${id}`;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase() || '·';
}

/**
 * The site a link leads to, shown beside it so a visitor knows where they are
 * going — or null for a link that is not (yet) a whole https address, which
 * is never drawn. Saved links were checked by the server; this guards the
 * Studio's preview, where a link is drawn while it is still being typed.
 */
function linkHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.includes('.') ? parsed.hostname.replace(/^www\./, '') : null;
  } catch {
    return null;
  }
}

/** The links a profile can show: a label, and a whole https address. */
export function shownLinks(config: IdentityConfig): Array<{ label: string; url: string; host: string }> {
  return config.content.links.flatMap((link) => {
    const host = linkHost(link.url);
    return host && link.label.trim() ? [{ label: link.label, url: link.url, host }] : [];
  });
}

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** A picture filling its box, centred where its owner said. */
function Picture({
  asset,
  photo,
  focus,
  sizes,
  className,
  alt = '',
  eager,
}: {
  asset?: CanvasAsset | null;
  photo?: string | null;
  focus: { x: number; y: number };
  sizes: string;
  className: string;
  alt?: string;
  eager?: boolean;
}) {
  const position = `${focus.x}% ${focus.y}%`;
  if (photo) {
    // eslint-disable-next-line @next/next/no-img-element -- served by the visibility-checking route
    return <img className={className} src={PHOTO(photo)} alt={alt} style={{ objectPosition: position }} loading={eager ? 'eager' : 'lazy'} decoding="async" />;
  }
  if (!asset) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- library design with its own sizes
    <img
      className={className}
      src={asset.files[Math.min(1, asset.files.length - 1)]!.url}
      srcSet={asset.format === 'svg' ? undefined : assetSrcSet(asset)}
      sizes={sizes}
      alt={alt}
      style={{ objectPosition: position }}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
}

export type ProfileCanvasProps = {
  config: IdentityConfig;
  person: CanvasPerson;
  /** The designs this configuration uses, resolved by the caller from the library. */
  assets: Record<string, CanvasAsset>;
  viewer: ProfileViewer;
  labels: CanvasLabels;
  /** Rendered modules backed by real data, and the Trust Shield. */
  slots: Partial<Record<ProfileModuleId | 'trust', ReactNode>>;
  /** Modules with something to show; the rest are left out (the Studio shows them empty to their owner). */
  filled: ReadonlySet<ProfileModuleId>;
  whatsapp?: string | null;
  /** In the Studio: empty modules show their owner what they would hold. */
  preview?: boolean;
  /** Something is hidden from this visitor because it is for members. */
  moreForMembers?: boolean;
};

export function ProfileCanvas({ config, person, assets, viewer, labels, slots, filled, whatsapp, preview, moreForMembers }: ProfileCanvasProps) {
  const a = config.appearance;
  const palette = studioPalette(a);
  const showPhoto = canSee(config.privacy.avatar, viewer);
  const showCover = canSee(config.privacy.cover, viewer);

  const style = {
    '--idp-surface': hexToRgb(palette.surface),
    '--idp-alpha': a.card === 'glass' ? a.opacity / 100 : 1,
    '--idp-text': palette.text,
    '--idp-text2': palette.text2,
    '--idp-text3': palette.text3,
    '--idp-accent': palette.accent,
    '--idp-accent-ink': palette.accentInk,
    '--idp-veil': a.backgroundDim / 100,
    '--idp-cover-veil': a.coverDim / 100,
  } as CSSProperties;

  // Background: a design, a colour, a gradient, the member's photo, or Yavaya's own night.
  const bgAsset = a.background.kind === 'asset' ? assets[a.background.asset] : null;
  const bgPhoto = a.background.kind === 'upload' && showCover ? a.background.media : null;
  const bgStyle: CSSProperties =
    a.background.kind === 'solid'
      ? { background: STUDIO_SOLIDS[a.background.solid] }
      : a.background.kind === 'gradient'
        ? { background: STUDIO_GRADIENTS[a.background.gradient] }
        : {};

  const coverAsset = a.cover.kind === 'asset' ? assets[a.cover.asset] : null;
  const coverPhoto = a.cover.kind === 'upload' && showCover ? a.cover.media : null;
  const hasCover = a.header !== 'minimal' && a.cover.kind !== 'none' && (a.cover.kind !== 'upload' || showCover);
  const frame = a.avatar.frame ? assets[a.avatar.frame] : null;
  const decoration = a.decoration.asset ? assets[a.decoration.asset] : null;

  const modules = config.layout.modules.filter((m) => canSee(m.visibility, viewer) && (filled.has(m.id) || preview));

  return (
    <div
      className="idp"
      data-tone={palette.tone}
      data-card={a.card}
      data-border={a.border}
      data-radius={a.radius}
      data-divider={a.divider}
      data-type={a.typography}
      data-header={a.header}
      data-density={a.density}
      style={style}
    >
      <div className={`idp-bg${a.background.kind === 'default' ? ' is-default' : ''}`} style={bgStyle} aria-hidden="true">
        <Picture asset={bgAsset} photo={bgPhoto} focus={a.backgroundFocus} sizes="100vw" className="idp-bg-img" />
        <span className="idp-bg-veil" />
      </div>
      <div className="idp-wrap">
        <header className="idp-head">
          {hasCover ? (
            <div className="idp-cover">
              {a.cover.kind === 'default' ? (
                // eslint-disable-next-line @next/next/no-img-element -- Yavaya's own street at dusk, the profile's default cover
                <img
                  className="idp-cover-img"
                  src="/art/street-1600.webp"
                  srcSet="/art/street-960.webp 960w, /art/street-1600.webp 1600w, /art/street-2560.webp 2560w"
                  sizes="(min-width: 1200px) 1160px, 100vw"
                  alt=""
                  style={{ objectPosition: `${a.coverFocus.x}% ${a.coverFocus.y}%` }}
                  decoding="async"
                />
              ) : (
                <Picture asset={coverAsset} photo={coverPhoto} focus={a.coverFocus} sizes="(min-width: 1200px) 1160px, 100vw" className="idp-cover-img" eager />
              )}
              <span className="idp-cover-veil" aria-hidden="true" />
            </div>
          ) : (
            <div className="idp-cover is-plain" aria-hidden="true" />
          )}
          {/* Ornaments trim the top of the header, where they are seen on every screen and never cover words. */}
          {decoration ? <Decoration asset={decoration} placement={a.decoration.placement} intensity={a.decoration.intensity} /> : null}
          <div className="idp-id">
            <div className={`idp-avatar shape-${a.avatar.shape}${frame ? ' has-frame' : ''}`}>
              <div className="idp-avatar-clip">
                {a.avatar.media && showPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- served by the visibility-checking route
                  <img
                    src={PHOTO(a.avatar.media)}
                    alt={labels.avatarAlt}
                    style={{
                      objectPosition: `${a.avatar.focus.x}% ${a.avatar.focus.y}%`,
                      transform: a.avatar.zoom > 100 ? `scale(${a.avatar.zoom / 100})` : undefined,
                      transformOrigin: `${a.avatar.focus.x}% ${a.avatar.focus.y}%`,
                    }}
                    decoding="async"
                  />
                ) : (
                  <span className="idp-initials" aria-hidden="true">
                    {initials(person.displayName)}
                  </span>
                )}
              </div>
              {frame ? (
                // eslint-disable-next-line @next/next/no-img-element -- vector frame from the library
                <img className="idp-frame" src={frame.files[0]!.url} alt="" aria-hidden="true" />
              ) : null}
            </div>
            <div className="idp-names">
              <h1 className="idp-name">{person.displayName}</h1>
              <p className="idp-yay">
                <span>{person.yayId}</span> · <span>{labels.memberSince}</span>
              </p>
              {config.content.headline ? <p className="idp-headline">{config.content.headline}</p> : null}
              {person.team}
            </div>
          </div>
        </header>

        {/* Trust is never hidden and never moved: it comes first, whatever the member chose. */}
        {slots.trust ? <div className="idp-trust">{slots.trust}</div> : null}

        <div className="idp-modules">
          {modules.map((module) => {
            const empty = !filled.has(module.id);
            const body = renderModule(module.id, { config, labels, slots, whatsapp, empty });
            if (!body) return null;
            const featured = config.layout.featured === module.id;
            return (
              <details
                key={module.id}
                className={`idp-card idp-mod mod-${module.id}${featured ? ' is-featured' : ''}${empty ? ' is-empty' : ''}`}
                open={!module.collapsed}
              >
                <summary className="idp-mod-head">
                  <h2>{labels.modules[module.id]}</h2>
                  {preview && labels.visibility ? (
                    <span className="idp-vis" data-v={module.visibility}>
                      {labels.visibility[module.visibility]}
                    </span>
                  ) : null}
                </summary>
                <div className="idp-mod-body">{body}</div>
              </details>
            );
          })}
        </div>
        {moreForMembers ? <p className="idp-members-note">{labels.membersOnlyNote}</p> : null}
      </div>
    </div>
  );
}

function renderModule(
  id: ProfileModuleId,
  ctx: { config: IdentityConfig; labels: CanvasLabels; slots: ProfileCanvasProps['slots']; whatsapp?: string | null; empty: boolean },
): ReactNode {
  const { config, labels, slots } = ctx;
  if (ctx.empty) return labels.empty?.[id] ? <p className="idp-empty">{labels.empty[id]}</p> : null;
  switch (id) {
    case 'about':
      return (
        <div className="idp-about">
          {config.content.about.split('\n\n').map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      );
    case 'links': {
      const links = shownLinks(config);
      if (links.length === 0) return labels.empty?.links ? <p className="idp-empty">{labels.empty.links}</p> : null;
      return (
        <ul className="idp-links">
          {links.map((link, index) => (
            <li key={index}>
              {/* A member's link: never followed for ranking, never given this page as referrer or opener. */}
              <a href={link.url} rel="nofollow ugc noopener noreferrer" target="_blank">
                <span className="idp-link-label">{link.label}</span>
                <span className="idp-link-host">
                  {link.host}
                  <span className="sr-only"> ({labels.linkOpensElsewhere})</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      );
    }
    case 'languages':
      return (
        <ul className="idp-chips">
          {config.content.languages.map((code) => (
            <li key={code}>{labels.languages[code] ?? code}</li>
          ))}
        </ul>
      );
    case 'contact':
      if (!ctx.whatsapp) return null;
      return (
        <div className="idp-contact">
          <a className="idp-button" href={`https://wa.me/${ctx.whatsapp.replace(/[^\d]/g, '')}`} rel="nofollow noopener noreferrer" target="_blank">
            {labels.contactWhatsapp}
          </a>
          <p className="idp-note">{labels.contactUnverified}</p>
        </div>
      );
    default:
      return slots[id] ?? null;
  }
}

/**
 * An ornament on the header, at the strength the member chose: in its two top
 * corners, as a crest at the top centre, or as a trim along the top edge.
 * Decorative only, so hidden from screen readers.
 */
function Decoration({ asset, placement, intensity }: { asset: CanvasAsset; placement: string; intensity: number }) {
  const url = asset.files[0]!.url;
  const style = { '--idp-decor': intensity / 100 } as CSSProperties;
  if (placement === 'border') {
    return <div className="idp-decor is-border" style={{ ...style, backgroundImage: `url(${url})` }} aria-hidden="true" />;
  }
  if (placement === 'header') {
    return (
      <div className="idp-decor is-header" style={style} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- vector ornament */}
        <img src={url} alt="" />
      </div>
    );
  }
  return (
    <div className="idp-decor is-corners" style={style} aria-hidden="true">
      {(['tl', 'tr'] as const).map((corner) => (
        // eslint-disable-next-line @next/next/no-img-element -- vector ornament
        <img key={corner} className={`at-${corner}`} src={url} alt="" />
      ))}
    </div>
  );
}
