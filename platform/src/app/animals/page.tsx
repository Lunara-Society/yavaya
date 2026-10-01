import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { SIZES, SPECIES } from '@/config/animals';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { DistrictScene } from '@/ui/site/art';
import { Icon } from '@/ui/site/icons';
import { AnimalCard } from '@/ui/animals/parts';
import { placeOptions } from '@/server/domains/mercadito/service';
import { getCertificate, getRescuer, listAnimals } from '@/server/domains/animals/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.districts.animals.name, description: c.pages.animals.description };
}

/**
 * Animales. Three doors, in the order that matters: learn, adopt, rescue.
 * The animals are public — the more people see them, the sooner they go
 * home — but adopting one takes the certificate and an application.
 */
export default async function AnimalsHome({ searchParams }: { searchParams: Promise<{ species?: string; size?: string; place?: string; page?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const countries = await placeOptions(db(), locale);
  const place = countries.some((country) => country.code === query.place) ? query.place : undefined;
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const [animals, certificate, rescuer] = await Promise.all([
    listAnimals(db(), { locale, species: query.species, size: query.size, placeCode: place, page }),
    userId ? getCertificate(db(), userId) : Promise.resolve(null),
    userId ? getRescuer(db(), userId) : Promise.resolve(null),
  ]);
  const href = (to: number) => {
    const search = new URLSearchParams();
    if (query.species) search.set('species', query.species);
    if (query.size) search.set('size', query.size);
    if (place) search.set('place', place);
    if (to > 1) search.set('page', String(to));
    const text = search.toString();
    return text ? `/animals?${text}` : '/animals';
  };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="animals" tone="animals">
      <section className="cm-head">
        <div className="cm-head-art" aria-hidden="true">
          <DistrictScene id="animals" priority />
        </div>
        <div className="wrap">
          <p className="eyebrow">{c.districts.animals.name}</p>
          <h1>{t('animals.home.title')}</h1>
          <p className="lead">{t('animals.home.lead')}</p>
        </div>
      </section>

      <div className="wrap" style={{ paddingBottom: 56 }}>
        <div className="an-doors">
          <Link className="an-door" href="/animals/learn">
            <span className="an-door-icon" aria-hidden="true">
              <Icon name="book" />
            </span>
            <strong>1 · {t('animals.home.learn')}</strong>
            <span>{certificate ? t('animals.home.learn_done') : t('animals.home.learn_text')}</span>
          </Link>
          <a className="an-door" href="#adopt">
            <span className="an-door-icon" aria-hidden="true">
              <Icon name="heart" />
            </span>
            <strong>2 · {t('animals.home.adopt')}</strong>
            <span>{t('animals.home.adopt_text')}</span>
          </a>
          <Link className="an-door" href={member ? '/animals/rescuer' : '/login'}>
            <span className="an-door-icon" aria-hidden="true">
              <Icon name="hands" />
            </span>
            <strong>3 · {t('animals.home.rescue')}</strong>
            <span>{rescuer ? t(`animals.rescuer.status.${rescuer.status}` as MessageKey) : t('animals.home.rescue_text')}</span>
          </Link>
        </div>
        {member ? (
          <p className="center">
            <Link href="/animals/mine">{t('animals.mine.title')}</Link>
          </p>
        ) : null}

        <section id="adopt" className="sc-section">
          <h2 className="sc-h">{t('animals.home.looking')}</h2>
          <form className="sc-filter" action="/animals">
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
              <span className="sr-only">{t('animals.form.size')}</span>
              <select name="size" defaultValue={query.size ?? ''}>
                <option value="">{t('animals.filter.any_size')}</option>
                {SIZES.map((value) => (
                  <option key={value} value={value}>
                    {t(`animals.size.${value}` as MessageKey)}
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
          {animals.items.length === 0 ? (
            <div className="sc-empty">
              <p>{t('animals.home.empty')}</p>
              <Link className="btn btn-line" href={member ? '/animals/rescuer' : '/login'}>
                {t('animals.home.rescue')}
              </Link>
            </div>
          ) : (
            <div className="an-grid">
              {animals.items.map((animal) => (
                <AnimalCard key={animal.id} animal={animal} t={t} />
              ))}
            </div>
          )}
          {animals.page > 1 || animals.hasMore ? (
            <nav className="mk-pager">
              {animals.page > 1 ? (
                <Link className="btn btn-line" href={href(animals.page - 1)}>
                  {t('mercadito.browse.previous')}
                </Link>
              ) : null}
              {animals.hasMore ? (
                <Link className="btn btn-line" href={href(animals.page + 1)}>
                  {t('mercadito.browse.next')}
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>

        <section className="card an-report-abuse">
          <h2 className="sc-h-sm">{t('animals.abuse.title')}</h2>
          <p className="mb0">{t('animals.abuse.text')}</p>
        </section>
        <p className="center mt">
          <Link href="/animals/about">{t('animals.home.how')}</Link>
        </p>
      </div>
    </SiteShell>
  );
}
