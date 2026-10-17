import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { Icon } from '@/ui/site/icons';
import type { MessageKey } from '@/i18n/dictionaries/es';
import { markWelcomeSeen, welcomeFor } from '@/server/domains/access/welcome';
import { PUBLIC_TEAM_ROLES } from '@/server/domains/access/staff';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('welcome.meta') };
}

// Fixed positions and timings: the confetti is decoration, so it is the same
// on every render and never depends on anything the member sent.
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 13) % 40) / 10,
  duration: 5 + ((i * 7) % 5),
  hue: ['rose', 'gold', 'lilac', 'mint', 'sky'][i % 5]!,
  shape: i % 3 === 0 ? 'heart' : i % 3 === 1 ? 'dot' : 'star',
}));

/**
 * The welcome for someone just named to the team: their name, their badge,
 * what the role lets them do, and a note from the people who chose them.
 * Shown once after sign-in (see `loginAction`), and reachable again from the
 * notification any time. Seeing it marks the welcome as seen.
 */
export default async function WelcomePage() {
  const { c, t, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const welcome = await welcomeFor(db(), userId);
  if (!welcome) redirect('/');
  await markWelcomeSeen(db(), userId);

  const role = welcome.roles.find((key) => key !== 'admin') ?? welcome.roles[0]!;
  const roleName = t(`staff.role.${role}` as MessageKey);
  const roleWhat = t(`staff.role.${role}.what` as MessageKey);
  const name = welcome.displayName.split(/\s+/)[0] ?? welcome.displayName;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <div className="wl-page">
        <div className="wl-confetti" aria-hidden="true">
          {CONFETTI.map((piece, i) => (
            <span
              key={i}
              className={`wl-bit wl-${piece.shape} wl-${piece.hue}`}
              style={{ left: `${piece.left}%`, animationDelay: `${piece.delay}s`, animationDuration: `${piece.duration}s` }}
            />
          ))}
        </div>

        <section className="wl-card">
          <p className="wl-eyebrow">{t('welcome.eyebrow')}</p>

          <div className="wl-badge" role="img" aria-label={t('welcome.badge_label', { role: roleName })}>
            <span className="wl-badge-ring" />
            <span className="wl-badge-core">
              <Icon name="heart" />
            </span>
            <span className="wl-badge-ribbon">{roleName}</span>
          </div>

          <h1 className="wl-title">{t('welcome.title', { name })}</h1>
          <p className="wl-lead">{t('welcome.lead', { role: roleName })}</p>

          <div className="wl-note">
            <p>{t('welcome.note_1', { name })}</p>
            <p>{t('welcome.note_2')}</p>
            <p className="wl-sign">{t('welcome.signature')}</p>
          </div>

          <div className="wl-can">
            <h2>{t('welcome.can_title')}</h2>
            <p>
              <Icon name="check" /> {t('welcome.can', { what: roleWhat })}
            </p>
            {(PUBLIC_TEAM_ROLES as readonly string[]).includes(role) ? (
              <p>
                <Icon name="star" /> {t('welcome.badge_public')}
              </p>
            ) : null}
          </div>

          <div className="wl-actions">
            <Link className="btn btn-gold" href="/admin">
              {t('welcome.cta_panel')}
            </Link>
            <Link className="btn btn-line" href={`/members/${welcome.yayId}`}>
              {t('welcome.cta_profile')}
            </Link>
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
