import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { SPECIES } from '@/config/animals';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { LostCard } from '@/ui/animals/lost-card';
import { placeOptions } from '@/server/domains/mercadito/service';
import { listLostFound, myLostFound } from '@/server/domains/animals/lost-found';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('animals.lost.title'), description: t('animals.lost.lead') };
}

/** Lost and found. Public: a post nobody sees brings nobody home. */
export default async function LostFoundPage({ searchParams }: { searchParams: Promise<{ kind?: string; species?: string; place?: string; page?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const countries = await placeOptions(db(), locale);
  const place = countries.some((country) => country.code === query.place) ? query.place : undefined;
  const kind = query.kind === 'lost' || query.kind === 'found' ? query.kind : undefined;
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const [posts, mine] = await Promise.all([
    listLostFound(db(), { locale, kind, species: query.species, placeCode: place, page }),
    userId ? myLostFound(db(), { userId, locale }) : Promise.resolve([]),
  ]);
  const href = (next: { kind?: string; page?: number }) => {
    const search = new URLSearchParams();
    if (next.kind) search.set('kind', next.kind);
    if (query.species) search.set('species', query.species);
    if (place) search.set('place', place);
    if (next.page && next.page > 1) search.set('page', String(next.page));
    const text = search.toString();
    return text ? `/animals/lost?${text}` : '/animals/lost';
  };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="animals" tone="animals">
      <div className="wrap" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href="/animals">← {t('animals.back')}</Link>
        </p>
        <p className="eyebrow">{c.districts.animals.name}</p>
        <h1 className="h-md">{t('animals.lost.title')}</h1>
        <p className="lead">{t('animals.lost.lead')}</p>
        <div className="btn-row">
          <Link className="btn btn-gold" href={member ? '/animals/lost/new?kind=lost' : '/login'}>
            {t('animals.lost.post_lost')}
          </Link>
          <Link className="btn btn-line" href={member ? '/animals/lost/new?kind=found' : '/login'}>
            {t('animals.lost.post_found')}
          </Link>
        </div>
        <p className="an-warning">{t('animals.lost.ransom_warning')}</p>

        {mine.length > 0 ? (
          <section className="sc-section">
            <h2 className="sc-h">{t('animals.lost.mine')}</h2>
            <div className="an-grid">
              {mine.map((post) => (
                <LostCard key={post.id} post={post} t={t} locale={locale} />
              ))}
            </div>
          </section>
        ) : null}

        <section className="sc-section">
          <nav className="cm-tabs" aria-label={t('animals.lost.title')}>
            <Link href={href({})} aria-current={kind ? undefined : 'true'}>
              {t('community.square.all')}
            </Link>
            <Link href={href({ kind: 'lost' })} aria-current={kind === 'lost' ? 'true' : undefined}>
              {t('animals.lost.kind.lost')}
            </Link>
            <Link href={href({ kind: 'found' })} aria-current={kind === 'found' ? 'true' : undefined}>
              {t('animals.lost.kind.found')}
            </Link>
          </nav>
          <form className="sc-filter" action="/animals/lost">
            {kind ? <input type="hidden" name="kind" value={kind} /> : null}
            <label>
              <span className="sr-only">{t('animals.form.species')}</span>
              <select name="species" defaultValue={query.species ?? ''}>
                <option value="">{t('animals.filter.any_species')}</option>
                {SPECIES.map((value) => (
                  <option key={value} value={value}>
                    {t(`animals.species.${value}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">{t('animals.form.location')}</span>
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
          {posts.items.length === 0 ? (
            <div className="sc-empty">
              <p>{t('animals.lost.empty')}</p>
            </div>
          ) : (
            <div className="an-grid">
              {posts.items.map((post) => (
                <LostCard key={post.id} post={post} t={t} locale={locale} />
              ))}
            </div>
          )}
          {posts.page > 1 || posts.hasMore ? (
            <nav className="mk-pager">
              {posts.page > 1 ? (
                <Link className="btn btn-line" href={href({ kind, page: posts.page - 1 })}>
                  {t('mercadito.browse.previous')}
                </Link>
              ) : null}
              {posts.hasMore ? (
                <Link className="btn btn-line" href={href({ kind, page: posts.page + 1 })}>
                  {t('mercadito.browse.next')}
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      </div>
    </SiteShell>
  );
}
