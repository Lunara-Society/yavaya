import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { PageHero } from '@/ui/site/blocks';
import { ChurchRow, WordCard } from '@/ui/sanctuary/parts';
import { placeOptions } from '@/server/domains/mercadito/service';
import { followedChurches, listChurches, listDevotionals } from '@/server/domains/sanctuary/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('sanctuary.title'), description: t('sanctuary.lead') };
}

/**
 * Sanctuary, inside Community. Open to everyone to read: a church's words
 * and service times are meant to be found. Following a church, writing to
 * it, and registering one take an account.
 */
export default async function SanctuaryPage({ searchParams }: { searchParams: Promise<{ q?: string; place?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const countries = await placeOptions(db(), locale);
  const place = countries.some((country) => country.code === query.place) ? query.place : undefined;
  const search = (query.q ?? '').trim().slice(0, 80) || undefined;

  const [words, churches, mine, mineWords] = await Promise.all([
    listDevotionals(db(), { locale, limit: 6 }),
    listChurches(db(), { locale, placeCode: place, query: search }),
    userId ? followedChurches(db(), { userId, locale }) : Promise.resolve([]),
    userId ? listDevotionals(db(), { locale, followedBy: userId, limit: 3 }) : Promise.resolve([]),
  ]);
  const yours = new Set(mineWords.map((word) => word.id));
  const others = words.filter((word) => !yours.has(word.id));

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="sanctuary" tone="sanctuary">
      <PageHero eyebrow={t('sanctuary.eyebrow')} title={t('sanctuary.title')} lead={t('sanctuary.lead')} photo="sanctuary" />

      <div className="wrap sc-page">
        <div className="sc-main">
          <section aria-labelledby="today">
            <h2 id="today" className="sc-h">
              {t('sanctuary.today.title')}
            </h2>
            <p className="muted sc-honest">{t('sanctuary.honest')}</p>
            {mineWords.length > 0 ? (
              <>
                <p className="sc-sub">{t('sanctuary.today.yours')}</p>
                <div className="sc-words">
                  {mineWords.map((word) => (
                    <WordCard key={word.id} word={word} t={t} locale={locale} />
                  ))}
                </div>
              </>
            ) : null}
            {others.length === 0 && mineWords.length === 0 ? (
              <div className="sc-empty">
                <p>{t('sanctuary.today.empty')}</p>
              </div>
            ) : (
              <div className="sc-words">
                {others.map((word) => (
                  <WordCard key={word.id} word={word} t={t} locale={locale} />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="churches" className="sc-section">
            <h2 id="churches" className="sc-h">
              {t('sanctuary.churches.title')}
            </h2>
            <p className="muted">{t('sanctuary.churches.lead')}</p>
            <form className="sc-filter" action="/sanctuary">
              <label>
                <span className="sr-only">{t('sanctuary.churches.search')}</span>
                <input name="q" placeholder={t('sanctuary.churches.search')} defaultValue={search ?? ''} maxLength={80} />
              </label>
              <label>
                <span className="sr-only">{t('sanctuary.churches.place')}</span>
                <select name="place" defaultValue={place ?? ''}>
                  <option value="">{t('sanctuary.churches.any_place')}</option>
                  {countries.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-line" type="submit">
                {t('sanctuary.churches.filter')}
              </button>
            </form>
            {churches.length === 0 ? (
              <div className="sc-empty">
                <p>{t('sanctuary.churches.empty')}</p>
                <Link className="btn btn-gold" href={member ? '/sanctuary/register' : '/login'}>
                  {t('sanctuary.register.cta')}
                </Link>
              </div>
            ) : (
              <div className="sc-churches">
                {churches.map((church) => (
                  <ChurchRow key={church.id} church={church} t={t} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="sc-side">
          <section className="card sc-card">
            <h2 className="sc-h-sm">{t('sanctuary.mine.title')}</h2>
            {mine.length === 0 ? (
              <p className="muted">{t('sanctuary.mine.none')}</p>
            ) : (
              <div className="sc-churches compact">
                {mine.map((church) => (
                  <ChurchRow key={church.id} church={church} t={t} />
                ))}
              </div>
            )}
            {mine.some((church) => church.next) ? <p className="muted sc-hint">{t('sanctuary.local_time')}</p> : null}
          </section>

          <section className="card sc-card sc-prayer">
            <h2 className="sc-h-sm">{t('sanctuary.prayer_wall.title')}</h2>
            <p>{t('sanctuary.prayer_wall.text')}</p>
            <Link className="btn btn-line" href="/sanctuary/prayer">
              {t('sanctuary.prayer_wall.cta')}
            </Link>
          </section>

          <section className="card sc-card">
            <div className="btn-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <Link className="btn btn-gold" href={member ? '/sanctuary/register' : '/login'}>
                {t('sanctuary.register.cta')}
              </Link>
              {member ? (
                <Link className="btn btn-line" href="/sanctuary/manage">
                  {t('sanctuary.manage.cta')}
                </Link>
              ) : null}
            </div>
            <p className="muted sc-hint">{t('sanctuary.form.intro')}</p>
          </section>
        </aside>
      </div>
    </SiteShell>
  );
}
