import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { DistrictScene } from '@/ui/site/art';
import { PostCard } from '@/ui/community/post-card';
import { listPosts, POST_KINDS, type PostKind } from '@/server/domains/community/service';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.districts.community.name, description: c.pages.community.description };
}

/**
 * The town square — "stories, people, less transactional" (Master Bible).
 * One calm column, not a grid. Members only: what is posted here is often
 * someone's hardest week.
 */
export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ kind?: string; page?: string }> }) {
  const params = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const kind = (POST_KINDS as readonly string[]).includes(params.kind ?? '') ? (params.kind as PostKind) : undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const feed = userId ? await listPosts(db(), { viewerId: userId, kind, page, locale }) : null;
  const href = (next: { kind?: string; page?: number }) => {
    const search = new URLSearchParams();
    if (next.kind) search.set('kind', next.kind);
    if (next.page && next.page > 1) search.set('page', String(next.page));
    const text = search.toString();
    return text ? `/community?${text}` : '/community';
  };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="community" tone="community">
      <section className="cm-head">
        <div className="cm-head-art" aria-hidden="true">
          <DistrictScene id="community" priority />
        </div>
        <div className="wrap cm-column">
          <p className="eyebrow">{c.districts.community.name}</p>
          <h1>{t('community.square.title')}</h1>
          <p className="lead">{t('community.square.lead')}</p>
          <div className="btn-row">
            {member ? (
              <Link className="btn btn-gold" href="/community/new">
                {t('community.square.new')}
              </Link>
            ) : null}
            <Link className="btn btn-line" href="/sanctuary">
              ✝ {t('nav.sanctuary')}
            </Link>
          </div>
        </div>
      </section>

      <div className="wrap cm-column" style={{ paddingBottom: 56 }}>
        {!feed ? (
          <div className="cm-gate card">
            <p>{t('community.square.members_only')}</p>
            <div className="btn-row">
              <Link className="btn btn-gold" href="/login">
                {t('community.square.sign_in')}
              </Link>
              <Link className="btn btn-line" href="/register">
                {t('auth.submit_register')}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <nav className="cm-tabs" aria-label={t('community.form.kind')}>
              <Link href={href({})} aria-current={kind ? undefined : 'true'}>
                {t('community.square.all')}
              </Link>
              {POST_KINDS.map((option) => (
                <Link key={option} href={href({ kind: option })} aria-current={kind === option ? 'true' : undefined}>
                  {t(`community.kind.${option}` as MessageKey)}
                </Link>
              ))}
            </nav>
            {feed.items.length === 0 ? (
              <div className="mk-empty">
                <p>{t('community.square.empty')}</p>
                <Link className="btn btn-gold" href="/community/new">
                  {t('community.square.new')}
                </Link>
              </div>
            ) : (
              <div className="cm-feed">
                {feed.items.map((post) => (
                  <PostCard key={post.id} post={post} t={t} locale={locale} />
                ))}
              </div>
            )}
            {feed.page > 1 || feed.hasMore ? (
              <nav className="mk-pager">
                {feed.page > 1 ? (
                  <Link className="btn btn-line" href={href({ kind, page: feed.page - 1 })}>
                    {t('mercadito.browse.previous')}
                  </Link>
                ) : null}
                {feed.hasMore ? (
                  <Link className="btn btn-line" href={href({ kind, page: feed.page + 1 })}>
                    {t('mercadito.browse.next')}
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </>
        )}
        <p className="center mt">
          <Link href="/community/about">{t('community.square.how')}</Link>
        </p>
      </div>
    </SiteShell>
  );
}
