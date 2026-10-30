import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { users } from '@/server/db/schema';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { Icon } from '@/ui/site/icons';
import { signInPath } from '@/server/auth/sign-in-path';
import { listPresets, studioState } from '@/server/domains/identity/studio';
import { loadModuleData, moduleHasContent } from '@/server/domains/identity/profile-modules';
import { buildTrustShield } from '@/server/domains/trust/shield';
import { publicTeamRole } from '@/server/domains/access/staff';
import { mediaStorageAvailability } from '@/server/domains/media/storage';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { MEDIA_RULES, PROFILE_STUDIO_RULES } from '@/config/business-rules';
import { MODULE_SOURCE, PROFILE_MODULES, type ProfileModuleId } from '@/config/identity-studio';
import { IDENTITY_ASSETS } from '@/config/identity-assets';
import { IDENTITY_THEMES } from '@/config/identity-themes';
import { formatDate } from '@/ui/mercadito/format';
import { canvasAsset, canvasLabels } from '@/ui/identity/labels';
import { ListingsSlot, ServicesSlot, StoreSlot, TrustSlot, WorkSlot } from '@/ui/identity/module-slots';
import { studioLabels } from '@/ui/identity/studio/labels';
import { IdentityStudio } from '@/ui/identity/studio/studio';
import type { CatalogItem } from '@/ui/identity/studio/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('profile.customize'), robots: { index: false } };
}

/** Where a member goes to give an empty district module something real to show. */
const CREATE_HREF: Partial<Record<ProfileModuleId, string>> = {
  listings: '/mercadito/publish',
  work: '/work/profile',
  services: '/services/provider',
  store: '/yavayago/store',
  // The WhatsApp number buyers use is kept with the member's Mercadito listings.
  contact: '/mercadito/mine',
};

/**
 * Identity Studio — "Personalizar mi perfil".
 *
 * Everything the Studio shows is assembled here, on the server, for the
 * member who is signed in and no one else: their draft and published
 * profile, their saved looks, and the real activity behind each module,
 * already rendered. The browser receives words, ids and pictures — never a
 * dictionary, a query, or another member's data.
 */
export default async function IdentityStudioPage() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId || !member) redirect(await signInPath());

  const [user] = await db()
    .select({ displayName: users.displayName, createdAt: users.createdAt, yayDigits: users.yayId, status: users.status })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) redirect(await signInPath());

  const [state, presets, shield, team, data] = await Promise.all([
    studioState(db(), userId),
    listPresets(db(), userId),
    buildTrustShield(db(), userId),
    publicTeamRole(db(), userId),
    // Every module, as visitors would see its content: the preview must not show more than the profile will.
    loadModuleData(db(), { userId, yayDigits: user.yayDigits, locale, modules: [...PROFILE_MODULES] }),
  ]);
  if (!shield) redirect(await signInPath());

  const active = user.status === 'active';
  const districtFilled = PROFILE_MODULES.filter((id) => MODULE_SOURCE[id] === 'district' && moduleHasContent(id, state.draft, data));

  const catalog: CatalogItem[] = IDENTITY_ASSETS.filter((asset) => asset.status === 'published').map((asset) => ({
    ...canvasAsset(asset),
    collection: asset.collection,
    style: asset.style,
    colors: asset.colors,
    thumb: asset.thumb,
    width: asset.width,
    height: asset.height,
    tags: asset.tags,
    name: t(`identity.asset.${asset.id}` as MessageKey),
    desc: t(`identity.asset.${asset.id}.desc` as MessageKey),
  }));

  const labels = canvasLabels(t, {
    displayName: user.displayName,
    memberSince: t('profile.since', { date: formatDate(user.createdAt, locale) }),
  });
  // Shown only to the owner, in the preview: what an empty part would hold, and where to fill it.
  labels.empty = {
    about: t('studio.empty.about'),
    links: t('studio.empty.links'),
    languages: t('studio.empty.languages'),
    contact: t('studio.unavailable.contact'),
    listings: t('studio.unavailable.listings'),
    work: t('studio.unavailable.work'),
    services: t('studio.unavailable.services'),
    store: t('studio.unavailable.store'),
  };
  labels.visibility = { public: t('studio.visibility.public'), members: t('studio.visibility.members'), private: t('studio.visibility.private') };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <noscript>
        <p className="wrap ids-noscript">{t('studio.noscript')}</p>
      </noscript>
      <IdentityStudio
        initial={{
          draft: state.draft,
          published: state.published,
          revision: state.revision,
          everPublished: state.everPublished,
          unpublished: state.unpublished,
          favorites: state.favorites,
        }}
        presets={presets.map(({ id, name, appearance }) => ({ id, name, appearance }))}
        catalog={catalog}
        themes={IDENTITY_THEMES.map((item) => ({ id: item.id, name: t(`studio.theme.${item.id}` as MessageKey), appearance: item.appearance }))}
        person={{
          displayName: user.displayName,
          yayId: formatYayId(user.yayDigits),
          team: team ? (
            <p className="team-badge">
              <span className="team-badge-heart">
                <Icon name="heart" />
              </span>
              {t(`staff.role.${team}` as MessageKey)} · {t('profile.team')}
            </p>
          ) : undefined,
        }}
        canvasLabels={labels}
        slots={{
          trust: <TrustSlot shield={shield} t={t} />,
          listings: data.listings.length ? <ListingsSlot listings={data.listings} t={t} locale={locale} /> : undefined,
          work: data.work ? <WorkSlot work={data.work} t={t} /> : undefined,
          services: data.services ? <ServicesSlot services={data.services} t={t} /> : undefined,
          store: data.store ? <StoreSlot store={data.store} t={t} /> : undefined,
        }}
        districtFilled={districtFilled}
        whatsapp={data.whatsapp}
        createHref={CREATE_HREF}
        canUpload={active && mediaStorageAvailability().available}
        canPublish={active}
        labels={studioLabels(t)}
        limits={{
          headline: PROFILE_STUDIO_RULES.headlineMaxLength,
          about: PROFILE_STUDIO_RULES.aboutMaxLength,
          links: PROFILE_STUDIO_RULES.maxLinks,
          linkLabel: PROFILE_STUDIO_RULES.linkLabelMaxLength,
          linkUrl: PROFILE_STUDIO_RULES.linkUrlMaxLength,
          languages: PROFILE_STUDIO_RULES.maxLanguages,
          presets: PROFILE_STUDIO_RULES.maxPresets,
          presetName: PROFILE_STUDIO_RULES.presetNameMaxLength,
          uploadMb: Math.floor(MEDIA_RULES.maxUploadBytes / (1024 * 1024)),
        }}
        publicHref={`/members/${formatYayId(user.yayDigits)}`}
        storageKey={`yv-studio-${user.yayDigits}`}
      />
    </SiteShell>
  );
}
