import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { WORK_FIELDS } from '@/config/work';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { DistrictScene } from '@/ui/site/art';
import { PostCard } from '@/ui/work/parts';
import { placeOptions } from '@/server/domains/mercadito/service';
import { getProfile, listPosts } from '@/server/domains/work/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.districts.work.name, description: c.pages.work.description };
}

/** The work board. Public: a job nobody sees fills nobody's table. Applying takes an account and a profile. */
export default async function WorkBoard({ searchParams }: { searchParams: Promise<{ field?: string; kind?: string; place?: string; remote?: string; page?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const countries = await placeOptions(db(), locale);
  const place = countries.some((country) => country.code === query.place) ? query.place : undefined;
  const field = (WORK_FIELDS as readonly string[]).includes(query.field ?? '') ? query.field : undefined;
  const kind = query.kind === 'job' || query.kind === 'project' ? query.kind : undefined;
  const remote = query.remote === '1';
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const [posts, profile] = await Promise.all([listPosts(db(), { locale, field, kind, placeCode: place, remoteOnly: remote, page }), userId ? getProfile(db(), userId) : Promise.resolve(null)]);
  const href = (to: number) => {
    const search = new URLSearchParams();
    if (field) search.set('field', field);
    if (kind) search.set('kind', kind);
    if (place) search.set('place', place);
    if (remote) search.set('remote', '1');
    if (to > 1) search.set('page', String(to));
    const text = search.toString();
    return text ? `/work?${text}` : '/work';
  };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="work" tone="work">
      <section className="cm-head">
        <div className="cm-head-art" aria-hidden="true">
          <DistrictScene id="work" priority />
        </div>
        <div className="wrap">
          <p className="eyebrow">{c.districts.work.name}</p>
          <h1>{t('work.board.title')}</h1>
          <p className="lead">{t('work.board.lead')}</p>
          <div className="btn-row">
            <Link className="btn btn-gold" href={member ? '/work/profile' : '/login'}>
              {profile ? t('work.board.my_profile') : t('work.board.create_profile')}
            </Link>
            <Link className="btn btn-line" href={member ? '/work/posts/new' : '/login'}>
              {t('work.board.post')}
            </Link>
            {member ? (
              <Link className="btn btn-line" href="/work/mine">
                {t('work.board.mine')}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <div className="wrap" style={{ paddingBottom: 56 }}>
        <div className="wk-principles">
          <p>
            <strong>{t('work.principle.pay_title')}</strong> {t('work.principle.pay_text')}
          </p>
          <p>
            <strong>{t('work.principle.fee_title')}</strong> {t('work.principle.fee_text')}
          </p>
          <p className="muted mb0">{t('work.principle.free_now')}</p>
        </div>

        <form className="sc-filter" action="/work">
          <label>
            <span className="sr-only">{t('work.form.field')}</span>
            <select name="field" defaultValue={field ?? ''}>
              <option value="">{t('work.filter.any_field')}</option>
              {WORK_FIELDS.map((value) => (
                <option key={value} value={value}>
                  {t(`work.field.${value}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">{t('work.form.kind')}</span>
            <select name="kind" defaultValue={kind ?? ''}>
              <option value="">{t('work.filter.any_kind')}</option>
              <option value="job">{t('work.kind.job')}</option>
              <option value="project">{t('work.kind.project')}</option>
            </select>
          </label>
          <label>
            <span className="sr-only">{t('work.form.location')}</span>
            <select name="place" defaultValue={place ?? ''}>
              <option value="">{t('sanctuary.churches.any_place')}</option>
              {countries.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.name}
                </option>
              ))}
            </select>
          </label>
          <label className="wk-check">
            <input type="checkbox" name="remote" value="1" defaultChecked={remote} /> {t('work.filter.remote')}
          </label>
          <button className="btn btn-line" type="submit">
            {t('sanctuary.churches.filter')}
          </button>
        </form>

        {posts.items.length === 0 ? (
          <div className="sc-empty">
            <p>{t('work.board.empty')}</p>
          </div>
        ) : (
          <div className="sv-list">
            {posts.items.map((post) => (
              <PostCard key={post.id} post={post} t={t} locale={locale} />
            ))}
          </div>
        )}
        {posts.page > 1 || posts.hasMore ? (
          <nav className="mk-pager">
            {posts.page > 1 ? (
              <Link className="btn btn-line" href={href(posts.page - 1)}>
                {t('mercadito.browse.previous')}
              </Link>
            ) : null}
            {posts.hasMore ? (
              <Link className="btn btn-line" href={href(posts.page + 1)}>
                {t('mercadito.browse.next')}
              </Link>
            ) : null}
          </nav>
        ) : null}
        <p className="center mt">
          <Link href="/work/about">{t('work.board.how')}</Link>
        </p>
      </div>
    </SiteShell>
  );
}
