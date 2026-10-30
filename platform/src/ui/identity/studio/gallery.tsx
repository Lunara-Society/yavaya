'use client';

import { useMemo, useState } from 'react';
import type { IdentityAppearance } from '@/config/identity-studio';
import type { CatalogItem } from './types';
import type { StudioLabels } from './labels';
import { fmt, Select } from './controls';

export type GalleryTab = 'backgrounds' | 'covers' | 'frames' | 'decorations' | 'professional' | 'favorites';

const PAGE = 24;

/** Lower case without accents, so "manana" finds "mañana" and "cafe" finds "café". */
const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function inTab(item: CatalogItem, tab: GalleryTab, favorites: ReadonlySet<string>): boolean {
  switch (tab) {
    case 'backgrounds':
      return item.kind === 'background' && item.collection !== 'professional';
    case 'covers':
      return item.kind === 'cover';
    case 'frames':
      return item.kind === 'frame';
    case 'decorations':
      return item.kind === 'decoration';
    case 'professional':
      return item.collection === 'professional';
    case 'favorites':
      return favorites.has(item.id);
  }
}

/**
 * The library, a page at a time: only thumbnails load, lazily, and only
 * the first page of them until the member asks for more. Choosing a design
 * puts it straight into the draft, so the preview shows it at once —
 * nothing is published until the member publishes.
 */
export function Gallery({
  catalog,
  labels,
  tab,
  onTab,
  favorites,
  onFavorite,
  appearance,
  onApply,
}: {
  catalog: CatalogItem[];
  labels: StudioLabels;
  tab: GalleryTab;
  onTab: (tab: GalleryTab) => void;
  favorites: string[];
  onFavorite: (id: string, on: boolean) => void;
  appearance: IdentityAppearance;
  onApply: (item: CatalogItem, slot: 'background' | 'cover' | 'frame' | 'decoration') => void;
}) {
  const L = labels.text;
  const N = labels.names;
  const [query, setQuery] = useState('');
  const [color, setColor] = useState('');
  const [style, setStyle] = useState('');
  const [shown, setShown] = useState(PAGE);
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const inThisTab = useMemo(() => catalog.filter((item) => inTab(item, tab, favoriteSet)), [catalog, tab, favoriteSet]);
  const styles = useMemo(() => [...new Set(inThisTab.map((item) => item.style))], [inThisTab]);
  const colors = useMemo(() => [...new Set(inThisTab.flatMap((item) => item.colors))], [inThisTab]);
  const results = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    return inThisTab.filter((item) => {
      if (color && !item.colors.includes(color as never)) return false;
      if (style && item.style !== style) return false;
      if (words.length === 0) return true;
      const haystack = fold([item.name, item.desc, ...item.tags].join(' '));
      return words.every((word) => haystack.includes(word));
    });
  }, [inThisTab, query, color, style]);

  const applied = new Set(
    [
      appearance.background.kind === 'asset' ? appearance.background.asset : null,
      appearance.cover.kind === 'asset' ? appearance.cover.asset : null,
      appearance.avatar.frame,
      appearance.decoration.asset,
    ].filter(Boolean),
  );

  const tabs: Array<{ id: GalleryTab; label: string }> = [
    { id: 'backgrounds', label: L.tabBackgrounds },
    { id: 'covers', label: L.tabCovers },
    { id: 'frames', label: L.tabFrames },
    { id: 'decorations', label: L.tabDecorations },
    { id: 'professional', label: L.tabProfessional },
    { id: 'favorites', label: L.tabFavorites },
  ];
  const change = (next: GalleryTab) => {
    onTab(next);
    setColor('');
    setStyle('');
    setShown(PAGE);
  };

  return (
    <section className="ids-gallery" aria-label={L.gallery}>
      <div className="ids-tabs" role="group" aria-label={L.gallery}>
        {tabs.map((item) => (
          <button key={item.id} type="button" aria-pressed={item.id === tab} onClick={() => change(item.id)}>
            {item.label}
          </button>
        ))}
      </div>
      <div className="ids-filters">
        <input
          type="search"
          className="ids-search"
          placeholder={L.gallerySearch}
          aria-label={L.gallerySearch}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setShown(PAGE);
          }}
        />
        <Select
          label={L.galleryColor}
          hideLabel
          value={color}
          options={[{ value: '', label: L.galleryAnyColor }, ...colors.map((id) => ({ value: id, label: N.color[id as keyof typeof N.color] ?? id }))]}
          onChange={(value) => {
            setColor(value);
            setShown(PAGE);
          }}
        />
        {styles.length > 1 ? (
          <Select
            label={L.galleryStyle}
            hideLabel
            value={style}
            options={[{ value: '', label: L.galleryAnyStyle }, ...styles.map((id) => ({ value: id, label: N.style[id] ?? id }))]}
            onChange={(value) => {
              setStyle(value);
              setShown(PAGE);
            }}
          />
        ) : null}
      </div>
      <p className="ids-count" role="status">
        {fmt(L.galleryCount, { count: results.length })}
      </p>
      {results.length === 0 ? (
        <p className="ids-empty">{tab === 'favorites' && !query && !color && !style ? L.galleryNoFavorites : L.galleryEmpty}</p>
      ) : (
        <ul className={`ids-grid${tab === 'frames' || tab === 'decorations' ? ' is-square' : ''}`}>
          {results.slice(0, shown).map((item) => {
            const isFavorite = favoriteSet.has(item.id);
            const isApplied = applied.has(item.id);
            const actions: Array<{ slot: 'background' | 'cover' | 'frame' | 'decoration'; label: string }> =
              item.kind === 'frame'
                ? [{ slot: 'frame', label: L.useFrame }]
                : item.kind === 'decoration'
                  ? [{ slot: 'decoration', label: L.useDecoration }]
                  : item.kind === 'cover'
                    ? [
                        { slot: 'cover', label: L.useAsCover },
                        { slot: 'background', label: L.useAsBackground },
                      ]
                    : [
                        { slot: 'background', label: L.useAsBackground },
                        { slot: 'cover', label: L.useAsCover },
                      ];
            return (
              <li key={item.id} className={isApplied ? 'is-applied' : undefined}>
                <button type="button" className="ids-thumb" onClick={() => onApply(item, actions[0]!.slot)} aria-label={`${actions[0]!.label}: ${item.name}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- library thumbnail */}
                  <img src={item.thumb} alt={item.desc} loading="lazy" decoding="async" width={item.kind === 'frame' || item.kind === 'decoration' ? 160 : 240} height={item.kind === 'frame' || item.kind === 'decoration' ? 160 : 135} />
                  {isApplied ? <span className="ids-badge">{L.inUse}</span> : null}
                </button>
                <div className="ids-card-text">
                  <strong>{item.name}</strong>
                  <button
                    type="button"
                    className={`ids-heart${isFavorite ? ' is-on' : ''}`}
                    aria-pressed={isFavorite}
                    aria-label={`${isFavorite ? L.unfavorite : L.favorite}: ${item.name}`}
                    onClick={() => onFavorite(item.id, !isFavorite)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2Z" />
                    </svg>
                  </button>
                </div>
                {actions.length > 1 ? (
                  <button type="button" className="ids-secondary" onClick={() => onApply(item, actions[1]!.slot)}>
                    {actions[1]!.label}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {results.length > shown ? (
        <button type="button" className="ids-more" onClick={() => setShown((count) => count + PAGE)}>
          {L.galleryMore}
        </button>
      ) : null}
    </section>
  );
}
