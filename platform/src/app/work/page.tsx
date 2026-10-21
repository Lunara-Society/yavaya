import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { WORK_FIELDS } from '@/config/work';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { GuideVideo } from '@/ui/site/guide-video';
import { DistrictScene } from '@/ui/site/art';
import { PostCard } from '@/ui/work/parts';
import { getProfile, listPosts } from '@/server/domains/work/service';
import { PlacePicker } from '@/ui/components/place-picker';
import { placePickerLabels } from '@/ui/components/place-labels';
import { ANY_PLACE, browsePlace } from '@/server/place-choice';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.districts.work.name, description: c.pages.work.description };
}

/** The work board. Public: a job nobody sees fills nobody's table. Applying takes an account and a profile. */
export default async function WorkBoard({ searchParams }: { searchParams: Promise<{ field?: string; kind?: string; place?: string; remote?: string; page?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const { code: place, link: placeLink } = await browsePlace(query.place, locale);
  const field = (WORK_FIELDS as readonly string[]).includes(query.field ?? '') ? query.field : undefined;
  const kind = query.kind === 'job' || query.kind === 'project' ? query.kind : undefined;
  const remote = query.remote === '1';
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);
  const [posts, profile] = await Promise.all([listPosts(db(), { locale, field, kind, placeCode: place, remoteOnly: remote, page }), userId ? getProfile(db(), userId) : Promise.resolve(null)]);
  const href = (to: number) => {
    const search = new URLSearchParams();
    if (field) search.set('field', field);
    if (kind) search.set('kind', kind);
    if (placeLink) search.set('place', placeLink);
    if (remote) search.set('remote', '1');
    if (to > 1) search.set('page', String(to));
    const text = search.toString();
    return text ? `/work?${text}` : '/work';
  };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="work" tone="work">
      {/* Trabajo's own shape: a job board. A banner with the search right in
          it, as people look for work by searching first; then the offers in
          one long list, with the board's rules pinned beside them. */}
      <section className="wk-hero">
        <div className="wk-hero-art" aria-hidden="true">
          <DistrictScene id="work" priority sizes="(min-width: 900px) 60vw, 100vw" />
        </div>
        <div className="wrap wk-hero-in">
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
          <form className="sc-filter wk-search" action="/work" role="search">
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
              <PlacePicker name="place" value="code" labels={placePickerLabels(t, { any: true })} initial={placeLink} anyValue={ANY_PLACE} />
            </label>
            <label className="wk-check">
              <input type="checkbox" name="remote" value="1" defaultChecked={remote} /> {t('work.filter.remote')}
            </label>
            <button className="btn btn-gold" type="submit">
              {t('sanctuary.churches.filter')}
            </button>
          </form>
        </div>
      </section>

      <div className="wrap wk-layout">
        <div className="wk-list">
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
        </div>
        <aside className="wk-side">
          <div className="wk-principles wk-rules">
            <p>
              <strong>{t('work.principle.pay_title')}</strong> {t('work.principle.pay_text')}
            </p>
            <p>
              <strong>{t('work.principle.fee_title')}</strong> {t('work.principle.fee_text')}
            </p>
            <p>
              <strong>{t('work.principle.verified_title')}</strong> {t('work.principle.verified_text')}
            </p>
            <p className="muted mb0">{t('work.principle.free_now')}</p>
          </div>
        </aside>
      </div>

      <div className="wrap gv-end" style={{ paddingBottom: 56 }}>
        <GuideVideo guideKey="trabajo" title={t('guide.watch_title', { name: c.nav.work })} t={t} locale={locale} />
        <p className="center mt">
          <Link href="/work/about">{t('work.board.how')}</Link>
        </p>
      </div>
    </SiteShell>
  );
}
