import type { Metadata } from 'next';
import Link from 'next/link';
import type { MessageKey } from '@/i18n';
import { GUIDE_CHAPTERS, GUIDE_SECONDS, guideFiles, type GuideKey } from '@/config/guide';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { GuidePlayer, GuideVideoJsonLd } from '@/ui/site/guide-video';
import { GuideChapters } from '@/ui/site/guide-chapters';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('guide.meta_title'), description: t('guide.meta_description') };
}

/** Where each district's own video lives. */
const DISTRICT_PAGES: { key: Exclude<GuideKey, 'guia'>; href: string }[] = [
  { key: 'mercadito', href: '/mercadito' },
  { key: 'servicios', href: '/services' },
  { key: 'trabajo', href: '/work' },
  { key: 'yavayago', href: '/yavayago' },
  { key: 'comunidad', href: '/community' },
  { key: 'violeta', href: '/violeta' },
  { key: 'santuario', href: '/sanctuary' },
  { key: 'animales', href: '/animals' },
  { key: 'confianza', href: '/trust' },
];

function clock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The whole guide in one film, with chapters, and a door to each district's own video. */
export default async function GuidePage() {
  const { c, t, locale, language, theme, member } = await siteContext();
  const chapters = GUIDE_CHAPTERS.map((ch) => ({ label: t(`guide.chapter.${ch.key}` as MessageKey), at: ch.at, time: clock(ch.at) }));
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="guide">
      <section className="wrap gv-page">
        <p className="eyebrow">
          {t('guide.eyebrow')} · {t('guide.minutes', { minutes: Math.round(GUIDE_SECONDS.guia / 60) })}
        </p>
        <h1>{t('guide.title')}</h1>
        <p className="lead">{t('guide.lead')}</p>
        <GuideVideoJsonLd guideKey="guia" name={t('guide.title')} description={t('guide.meta_description')} />
        <div className="gv-theatre">
          <GuidePlayer guideKey="guia" t={t} locale={locale} id="guia-player" />
          <aside>
            <h2 className="gv-side-h">{t('guide.chapters')}</h2>
            <p className="muted gv-note">{t('guide.chapter_hint')}</p>
            <GuideChapters videoId="guia-player" chapters={chapters} />
          </aside>
        </div>
        <p className="muted gv-note">{t('guide.spoken')}</p>

        <h2 className="gv-section-h">{t('guide.per_district')}</h2>
        <p className="muted">{t('guide.per_district_lead')}</p>
        <ul className="gv-grid">
          {DISTRICT_PAGES.map((d) => (
            <li key={d.key}>
              <Link href={d.href} className="gv-card">
                <img src={guideFiles(d.key).poster} alt="" loading="lazy" width={640} height={360} />
                <span className="gv-card-t">{t(`guide.chapter.${d.key}` as MessageKey)}</span>
                <span className="muted">{t('guide.minutes', { minutes: Math.ceil(GUIDE_SECONDS[d.key] / 60) })}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="muted gv-fine">{t('guide.illustrative')}</p>
      </section>
    </SiteShell>
  );
}
