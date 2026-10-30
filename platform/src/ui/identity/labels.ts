import 'server-only';
import type { MessageKey, Translator } from '@/i18n';
import { PROFILE_LANGUAGES, PROFILE_MODULES, type ProfileModuleId } from '@/config/identity-studio';
import { identityAsset, type IdentityAsset } from '@/config/identity-assets';
import type { CanvasAsset, CanvasLabels } from './profile-canvas';
import type { IdentityConfig } from '@/config/identity-studio';

/** The canvas's words, resolved on the server so the browser carries no dictionary. */
export function canvasLabels(t: Translator, params: { displayName: string; memberSince: string }): CanvasLabels {
  return {
    modules: Object.fromEntries(PROFILE_MODULES.map((id) => [id, t(`profile.module.${id}` as MessageKey)])) as Record<ProfileModuleId, string>,
    languages: Object.fromEntries(PROFILE_LANGUAGES.map((code) => [code, t(`profile.language.${code}` as MessageKey)])),
    memberSince: params.memberSince,
    avatarAlt: t('profile.avatar_alt', { name: params.displayName }),
    contactWhatsapp: t('profile.contact.whatsapp'),
    contactUnverified: t('profile.contact.unverified'),
    linkOpensElsewhere: t('profile.link_elsewhere'),
    membersOnlyNote: t('profile.members_only_note'),
  };
}

/** Only what the canvas needs of a design. */
export function canvasAsset(asset: IdentityAsset): CanvasAsset {
  return {
    id: asset.id,
    kind: asset.kind,
    files: asset.files,
    focus: asset.focus,
    format: asset.format,
    placement: asset.placement,
    transparent: asset.transparent,
    ...(asset.frameShape ? { frameShape: asset.frameShape } : {}),
  };
}

/** The designs one configuration uses, resolved from the library — nothing else is sent. */
export function assetsFor(config: IdentityConfig): Record<string, CanvasAsset> {
  const a = config.appearance;
  const ids = [
    a.background.kind === 'asset' ? a.background.asset : null,
    a.cover.kind === 'asset' ? a.cover.asset : null,
    a.avatar.frame,
    a.decoration.asset,
  ];
  const found: Record<string, CanvasAsset> = {};
  for (const id of ids) {
    const asset = identityAsset(id);
    if (asset) found[asset.id] = canvasAsset(asset);
  }
  return found;
}
