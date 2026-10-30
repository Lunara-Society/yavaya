import type { ReactNode } from 'react';
import type { IdentityAppearance, IdentityConfig, ProfileModuleId } from '@/config/identity-studio';
import type { IdentityAsset } from '@/config/identity-asset-types';
import type { ThemeAppearance } from '@/config/identity-themes';
import type { CanvasAsset, CanvasLabels } from '../profile-canvas';
import type { StudioLabels } from './labels';
import type { ImageLinkLabels } from '@/ui/components/image-link';

/** A design as the gallery shows it: the canvas's fields, its filters, and its words. */
export type CatalogItem = CanvasAsset &
  Pick<IdentityAsset, 'collection' | 'style' | 'colors' | 'thumb' | 'width' | 'height' | 'tags'> & { name: string; desc: string };

/** A theme: a whole look at once. It never carries a member's own photo. */
export type StudioTheme = { id: string; name: string; appearance: ThemeAppearance };

export type StudioPreset = { id: string; name: string; appearance: IdentityAppearance };

export type StudioArea = 'appearance' | 'backgrounds' | 'layout' | 'privacy' | 'publish';

export type StudioProps = {
  initial: {
    draft: IdentityConfig;
    published: IdentityConfig;
    revision: number;
    everPublished: boolean;
    unpublished: boolean;
    favorites: string[];
  };
  presets: StudioPreset[];
  catalog: CatalogItem[];
  themes: StudioTheme[];
  person: { displayName: string; yayId: string; team?: ReactNode };
  canvasLabels: CanvasLabels;
  /** Rendered on the server: the Trust Shield and the modules backed by real activity. */
  slots: Partial<Record<ProfileModuleId | 'trust', ReactNode>>;
  /** District modules that have something real to show. */
  districtFilled: ProfileModuleId[];
  whatsapp: string | null;
  /** Where to create what a module is missing. */
  createHref: Partial<Record<ProfileModuleId, string>>;
  canUpload: boolean;
  canPublish: boolean;
  labels: StudioLabels;
  /** The photo-from-a-link field, as on Mercadito. */
  linkLabels: ImageLinkLabels;
  limits: {
    headline: number;
    about: number;
    links: number;
    linkLabel: number;
    linkUrl: number;
    languages: number;
    presets: number;
    presetName: number;
    uploadMb: number;
  };
  publicHref: string;
  /** This device's recovery copy is kept under this key. */
  storageKey: string;
};
