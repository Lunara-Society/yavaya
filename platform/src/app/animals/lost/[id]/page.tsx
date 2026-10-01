import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { formatDate } from '@/ui/mercadito/format';
import { LostCard } from '@/ui/animals/lost-card';
import { whatsappLink } from '@/server/domains/mercadito/rules';
import { hasPermission } from '@/server/domains/access/authorize';
import { ANIMALS_REPORT_CATEGORIES } from '@/server/domains/animals/service';
import { getLostFound } from '@/server/domains/animals/lost-found';
import { closeLostFoundAction, reportLostFoundAction } from '../../actions';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; published?: string; reported?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return {};
  const { t, locale } = await siteContext();
  const found = await getLostFound(db(), { postId: id, viewerId: null, viewerIsReviewer: false, locale });
  if (!found) return { robots: { index: false } };
  return { title: `${t(`animals.lost.kind.${found.post.kind}` as MessageKey)} · ${found.post.placeName}`, description: found.post.description.slice(0, 160) };
}

export default async function LostFoundPostPage({ params, searchParams }: Params) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const reviewer = userId ? await hasPermission(db(), userId, 'adoptions.review') : false;
  const found = await getLostFound(db(), { postId: id, viewerId: userId, viewerIsReviewer: reviewer, locale });
  if (!found) notFound();
  const { post, photos, isAuthor, whatsappE164, matches, authorName } = found;
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const seen = formatDate(new Date(`${post.seenOn}T12:00:00Z`), locale);

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="animals" tone="animals">
      <div className="wrap" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href="/animals/lost">← {t('animals.lost.title')}</Link>
        </p>
        {query.published ? <p className="mk-banner" role="status">{t('animals.lost.published')}</p> : null}
        {query.reported ? <p className="mk-banner" role="status">{t('services.report.done', { code: query.reported.slice(0, 16) })}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}
        <div className="an-detail">
          <div className="an-gallery">
            {photos.map((photo, index) => (
              // eslint-disable-next-line @next/next/no-img-element -- served from /media, pre-sized
              <img key={photo} src={`/media/${photo}`} alt="" loading={index === 0 ? 'eager' : 'lazy'} decoding="async" />
            ))}
          </div>
          <div>
            <p className={post.kind === 'lost' ? 'an-status-line an-lost-text' : 'an-status-line'}>
              {t(`animals.lost.kind.${post.kind}` as MessageKey)}
              {post.status !== 'open' ? ` · ${t(`animals.lost.status.${post.status}` as MessageKey)}` : ''}
            </p>
            <h1 className="h-md">{post.name ?? t(`animals.species.${post.species}` as MessageKey)}</h1>
            <p className="an-facts">
              {t(`animals.species.${post.species}` as MessageKey)} · {post.placeName} · {t(post.kind === 'lost' ? 'animals.lost.since' : 'animals.lost.found_on', { date: seen })}
            </p>
            <p className="cm-body">{post.description}</p>
            <p className="sv-meta">{t('animals.lost.posted_by', { name: authorName, date: formatDate(post.createdAt, locale) })}</p>

            <div className="an-apply-box card">
              {isAuthor ? (
                post.status === 'open' ? (
                  <div className="btn-row">
                    <form action={closeLostFoundAction}>
                      <input type="hidden" name="postId" value={post.id} />
                      <input type="hidden" name="outcome" value="reunited" />
                      <button className="btn btn-gold" type="submit">
                        {t('animals.lost.reunited')}
                      </button>
                    </form>
                    <form action={closeLostFoundAction}>
                      <input type="hidden" name="postId" value={post.id} />
                      <input type="hidden" name="outcome" value="closed" />
                      <button className="btn btn-line" type="submit">
                        {t('animals.lost.close')}
                      </button>
                    </form>
                  </div>
                ) : (
                  <p className="mb0">{t(`animals.lost.status.${post.status}` as MessageKey)}</p>
                )
              ) : whatsappE164 && post.status === 'open' ? (
                <>
                  <a className="btn mk-wa" href={whatsappLink(whatsappE164, t(post.kind === 'lost' ? 'animals.lost.whatsapp_lost' : 'animals.lost.whatsapp_found'))} target="_blank" rel="noopener noreferrer">
                    {t('animals.lost.contact')}
                  </a>
                  <p className="an-warning" style={{ marginTop: 12 }}>
                    {t('animals.lost.ransom_warning')}
                  </p>
                </>
              ) : post.status === 'open' ? (
                <>
                  <p>{t('animals.lost.sign_in_to_contact')}</p>
                  <Link className="btn btn-gold" href="/login">
                    {t('community.square.sign_in')}
                  </Link>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {matches.length > 0 ? (
          <section id="matches" className="sc-section">
            <h2 className="sc-h">{t(post.kind === 'lost' ? 'animals.lost.matches_lost' : 'animals.lost.matches_found')}</h2>
            <div className="an-grid">
              {matches.map((match) => (
                <LostCard key={match.id} post={match} t={t} locale={locale} />
              ))}
            </div>
          </section>
        ) : null}

        {member && !isAuthor ? (
          <details className="card sc-section">
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('animals.report.title')}</summary>
            <form action={reportLostFoundAction} className="mk-form" style={{ marginTop: 12, maxWidth: 'none' }}>
              <input type="hidden" name="postId" value={post.id} />
              <label>
                {t('services.report.category')}
                <select name="category" required defaultValue="">
                  <option value="" disabled>
                    {t('mercadito.form.choose')}
                  </option>
                  {ANIMALS_REPORT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {t(`animals.report.category.${category}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('services.report.description')}
                <textarea name="description" maxLength={1000} style={{ minHeight: 70 }} />
              </label>
              <button className="btn btn-line" type="submit">
                {t('services.report.submit')}
              </button>
            </form>
          </details>
        ) : null}
      </div>
    </SiteShell>
  );
}
