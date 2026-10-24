import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { GuideVideo } from '@/ui/site/guide-video';
import { DistrictScene } from '@/ui/site/art';
import { Icon, type IconName } from '@/ui/site/icons';
import { PostCard } from '@/ui/community/post-card';
import { Rotulo } from '@/ui/site/rotulo';
import { listPosts, NEIGHBOUR_KINDS, type PostKind } from '@/server/domains/community/service';

export const dynamic = 'force-dynamic';

const KIND_ICON: Partial<Record<PostKind, IconName>> = { help_request: 'hands', help_offer: 'heart', family_support: 'house' };

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.districts.community.name, description: c.pages.community.description };
}

/**
 * The town square — "stories, people, less transactional" (Master Bible).
 * One calm column for the conversation, with the kinds of post beside it
 * rather than above it. Members only: what is posted here is often
 * someone's hardest week.
 */
export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ kind?: string; page?: string }> }) {
  const params = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  // The prayer wall moved to the Sanctuary; old links follow it there.
  if (params.kind === 'prayer') redirect('/sanctuary/prayer');
  const kind = (NEIGHBOUR_KINDS as readonly string[]).includes(params.kind ?? '') ? (params.kind as PostKind) : undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const feed = userId ? await listPosts(db(), { viewerId: userId, kind, kinds: NEIGHBOUR_KINDS, page, locale }) : null;
  const href = (next: { kind?: string; page?: number }) => {
    const search = new URLSearchParams();
    if (next.kind) search.set('kind', next.kind);
    if (next.page && next.page > 1) search.set('page', String(next.page));
    const text = search.toString();
    return text ? `/community?${text}` : '/community';
  };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="community" tone="community">
      {/* Comunidad's own shape: a town square. The photograph runs edge to
          edge with the title in the middle of it, and below, three columns as
          on a square: what people come here for, the conversation itself,
          and the doors to the Sanctuary and Espacio Violeta. */}
      <section className="sq-hero">
        <Rotulo id="community" className="barrio-sign" />
        <div className="sq-hero-photo" aria-hidden="true">
          <DistrictScene id="community" priority sizes="100vw" />
        </div>
        <div className="wrap sq-hero-in">
          <p className="eyebrow">{c.districts.community.name}</p>
          <h1>{t('community.square.title')}</h1>
          <p className="lead">{t('community.square.lead')}</p>
          {member ? (
            <div className="btn-row">
              <Link className="btn btn-gold" href="/community/new">
                {t('community.square.new')}
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <div className="wrap sq-layout">
        <aside className="sq-rail">
          <p className="sq-rail-title">{t('community.side.kinds')}</p>
          {feed ? (
            <nav className="sq-kinds" aria-label={t('community.form.kind')}>
              <Link href={href({})} aria-current={kind ? undefined : 'true'}>
                <Icon name="community" />
                {t('community.square.all')}
              </Link>
              {NEIGHBOUR_KINDS.map((option) => (
                <Link key={option} href={href({ kind: option })} aria-current={kind === option ? 'true' : undefined}>
                  <Icon name={KIND_ICON[option] ?? 'community'} />
                  {t(`community.kind.${option}` as MessageKey)}
                </Link>
              ))}
            </nav>
          ) : (
            <ul className="sq-kinds">
              {NEIGHBOUR_KINDS.map((option) => (
                <li key={option}>
                  <Icon name={KIND_ICON[option] ?? 'community'} />
                  {t(`community.kind.${option}` as MessageKey)}
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="sq-feed">
          {!feed ? (
            <div className="cm-gate card sq-gate">
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
              {feed.items.length === 0 ? (
                <div className="mk-empty sq-empty">
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
        </div>

        <aside className="sq-side">
          <p className="sq-rail-title">{t('community.side.title')}</p>
          <Link className="sq-door sq-door-sanctuary" href="/sanctuary">
            <Icon name="sanctuary" />
            <span>
              <strong>{t('nav.sanctuary')}</strong>
              <span>{c.districts.sanctuary.tagline}</span>
            </span>
          </Link>
          <Link className="sq-door sq-door-violeta" href="/violeta">
            <Icon name="shield" />
            <span>
              <strong>{t('nav.violeta')}</strong>
              <span>{t('community.side.violeta')}</span>
            </span>
          </Link>
        </aside>
      </div>

      <div className="wrap gv-end" style={{ paddingBottom: 56 }}>
        <GuideVideo guideKey="comunidad" title={t('guide.watch_title', { name: c.nav.community })} t={t} locale={locale} />
        <p className="center mt">
          <Link href="/community/about">{t('community.square.how')}</Link>
        </p>
      </div>
    </SiteShell>
  );
}
