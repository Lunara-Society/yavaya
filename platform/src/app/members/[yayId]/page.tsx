import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { formatDate } from '@/ui/mercadito/format';
import { findPublicMember } from '@/server/domains/identity/profile';
import { publishedIdentity } from '@/server/domains/identity/studio';
import { loadModuleData, moduleHasContent } from '@/server/domains/identity/profile-modules';
import { buildTrustShield } from '@/server/domains/trust/shield';
import { publicTeamRole } from '@/server/domains/access/staff';
import { canSee, visibleModules, type ProfileModuleId, type ProfileViewer } from '@/config/identity-studio';
import { formatYayId } from '@/server/domains/identity/yay-id';
import { Icon } from '@/ui/site/icons';
import { ProfileCanvas } from '@/ui/identity/profile-canvas';
import { assetsFor, canvasLabels } from '@/ui/identity/labels';
import { ListingsSlot, ServicesSlot, StoreSlot, TrustSlot, WorkSlot } from '@/ui/identity/module-slots';
import type { MessageKey } from '@/i18n/dictionaries/es';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ yayId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { yayId } = await params;
  const member = await findPublicMember(db(), yayId);
  if (!member) return {};
  // Only what everyone may see: the name, and the headline the header shows to all.
  const identity = await publishedIdentity(db(), member.userId);
  return { title: member.displayName, ...(identity.content.headline ? { description: identity.content.headline } : {}) };
}

/**
 * A member's public profile — "the profile becomes the user's digital
 * identity" (Master Bible). It is drawn as its owner published it in the
 * Identity Studio, but only ever with what the viewer may see: every module
 * is filtered here, on the server, before anything about it is read, so a
 * members-only section is never even fetched for a visitor. The Trust Shield
 * and the badges are always shown, whatever the member chose.
 */
export default async function MemberProfilePage({ params }: Params) {
  const { yayId } = await params;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const profile = await findPublicMember(db(), yayId);
  if (!profile) notFound();

  const isOwner = userId === profile.userId;
  // The owner sees their profile as a signed-in member does; everything else is the Studio's preview.
  const viewer: ProfileViewer = userId ? 'member' : 'visitor';
  const config = await publishedIdentity(db(), profile.userId);
  const visible = visibleModules(config, viewer);

  const [shield, team, data] = await Promise.all([
    buildTrustShield(db(), profile.userId),
    publicTeamRole(db(), profile.userId),
    loadModuleData(db(), { userId: profile.userId, yayDigits: profile.yayDigits, locale, modules: visible }),
  ]);
  if (!shield) notFound();

  const filled = new Set<ProfileModuleId>(visible.filter((id) => moduleHasContent(id, config, data)));
  // A visitor is told plainly when the member keeps something for signed-in members — never what it is.
  const contentForMembers = config.layout.modules.some(
    (m) => m.visibility === 'members' && (m.id === 'about' || m.id === 'links' || m.id === 'languages') && moduleHasContent(m.id, config, data),
  );
  const photosForMembers =
    (config.privacy.avatar === 'members' && Boolean(config.appearance.avatar.media)) ||
    (config.privacy.cover === 'members' && (config.appearance.cover.kind === 'upload' || config.appearance.background.kind === 'upload'));
  const moreForMembers = viewer === 'visitor' && (contentForMembers || photosForMembers);
  const contact = config.layout.modules.find((m) => m.id === 'contact');

  const labels = canvasLabels(t, {
    displayName: profile.displayName,
    memberSince: t('profile.since', { date: formatDate(profile.memberSince, locale) }),
  });

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      {isOwner ? (
        <div className="wrap idp-bar">
          <Link className="btn btn-gold" href="/account/profile">
            {t('profile.customize')}
          </Link>
        </div>
      ) : null}
      <ProfileCanvas
        config={config}
        person={{
          displayName: profile.displayName,
          yayId: formatYayId(profile.yayDigits),
          team: team ? (
            <p className="team-badge">
              <span className="team-badge-heart">
                <Icon name="heart" />
              </span>
              {t(`staff.role.${team}` as MessageKey)} · {t('profile.team')}
            </p>
          ) : undefined,
        }}
        assets={assetsFor(config)}
        viewer={viewer}
        labels={labels}
        filled={filled}
        whatsapp={contact && canSee(contact.visibility, viewer) ? data.whatsapp : null}
        moreForMembers={moreForMembers}
        slots={{
          trust: <TrustSlot shield={shield} t={t} />,
          listings: filled.has('listings') ? <ListingsSlot listings={data.listings} t={t} locale={locale} /> : undefined,
          work: data.work ? <WorkSlot work={data.work} t={t} /> : undefined,
          services: data.services ? <ServicesSlot services={data.services} t={t} /> : undefined,
          store: data.store ? <StoreSlot store={data.store} t={t} /> : undefined,
        }}
      />
    </SiteShell>
  );
}
