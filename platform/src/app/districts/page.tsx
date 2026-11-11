import type { Metadata } from 'next';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import Link from 'next/link';
import type { MessageKey } from '@/i18n';
import { DistrictsBody } from '@/ui/site/pages';
import { BOARD_DISTRICTS, BOARD_DISTRICT_KEYS } from '@/config/boards';
import '../boards.css';

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.pages.districts.title, description: c.pages.districts.description };
}

export default async function Page() {
  const { c, t, language, theme, member } = await siteContext();
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="districts">
      <DistrictsBody
        c={c}
        more={
          <section className="section">
            <div className="wrap">
              <h2 className="h-md">{t('board.more.title')}</h2>
              <p className="lead">{t('board.more.lead')}</p>
              <ul className="bd-list bd-more">
                {BOARD_DISTRICT_KEYS.map((key) => (
                  <li key={key} data-more={key}>
                    <Link className="bd-post-link" href={`/${BOARD_DISTRICTS[key].slug}`}>
                      <strong className="bd-post-title">{t(`district.${key}.name` as MessageKey)}</strong>
                      <span className="bd-post-meta">{t(`district.${key}.tagline` as MessageKey)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        }
      />
    </SiteShell>
  );
}
