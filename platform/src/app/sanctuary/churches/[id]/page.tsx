import type { Metadata } from 'next';
import { JsonLd } from '@/ui/site/json-ld';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { serverEnv } from '@/config/env';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { PageScene } from '@/ui/site/art';
import { WordCard, whenText } from '@/ui/sanctuary/parts';
import { whatsappLink } from '@/server/domains/mercadito/rules';
import { getChurch, listDevotionals } from '@/server/domains/sanctuary/service';
import { ReportForm } from '@/ui/sanctuary/report-form';
import { followAction } from '../../actions';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; reported?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return {};
  const { locale } = await siteContext();
  const church = await getChurch(db(), { churchId: id, viewerId: null, locale });
  return church ? { title: church.name, description: church.description.slice(0, 160) } : { robots: { index: false } };
}

export default async function ChurchPage({ params, searchParams }: Params) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const church = await getChurch(db(), { churchId: id, viewerId: userId, locale });
  if (!church) notFound();
  const words = church.status === 'approved' ? await listDevotionals(db(), { locale, churchId: church.id, limit: 10 }) : [];
  const isOwner = church.ownerUserId === userId;
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const pageUrl = `${serverEnv().APP_URL.replace(/\/$/, '')}/sanctuary/churches/${church.id}`;
  const byDay = [0, 1, 2, 3, 4, 5, 6]
    .map((day) => ({ day, services: church.services.filter((service) => service.weekday === day) }))
    .filter((group) => group.services.length > 0);

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="sanctuary" tone="sanctuary">
      {church.status === 'approved' ? (
        // What the page already shows, in a form search engines read: so a
        // search for a church in a city can find it.
        <JsonLd
          data={{
            '@context': 'https://schema.org',
            '@type': 'Church',
            name: church.name,
            url: pageUrl,
            description: church.description.slice(0, 300),
            address: { '@type': 'PostalAddress', ...(church.address ? { streetAddress: church.address } : {}), addressLocality: church.placeName },
            ...(church.whatsappE164 ? { telephone: church.whatsappE164 } : {}),
          }}
        />
      ) : null}
      <section className="sc-church-hero">
        <PageScene name="sanctuary-church" className="sc-church-hero-photo" />
        <div className="wrap">
          <p>
            <Link href="/sanctuary">← {t('sanctuary.church.back')}</Link>
          </p>
          <div className="eyebrow">{church.denomination ?? t('sanctuary.title')}</div>
          <h1>{church.name}</h1>
          <p className="lead">{church.placeName}</p>
          {church.status === 'approved' ? <p className="sc-verified">✓ {t('sanctuary.verified')}</p> : null}
        </div>
      </section>

      <div className="wrap sc-page">
        <div className="sc-main">
          {church.status !== 'approved' ? (
            <div className="mk-banner" role="status">
              <strong>{t(`sanctuary.status.${church.status}` as MessageKey)}.</strong>{' '}
              {church.status === 'pending'
                ? t('sanctuary.status.pending_text')
                : church.status === 'rejected'
                  ? t('sanctuary.status.rejected_text', { note: church.reviewNote ?? '' })
                  : t('sanctuary.status.suspended_text', { note: church.reviewNote ?? '' })}
            </div>
          ) : null}
          {query.reported ? (
            <p className="mk-banner" role="status">
              {t('sanctuary.report.done', { code: query.reported.slice(0, 16) })}
            </p>
          ) : null}
          {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}

          <p className="sc-description">{church.description}</p>

          <section className="sc-section" aria-labelledby="words">
            <h2 id="words" className="sc-h">
              {t('sanctuary.church.words')}
            </h2>
            {words.length === 0 ? (
              <p className="muted">{t('sanctuary.church.no_words')}</p>
            ) : (
              <div className="sc-words">
                {words.map((word) => (
                  <WordCard key={word.id} word={word} t={t} locale={locale} />
                ))}
              </div>
            )}
          </section>

          {church.status === 'approved' && member && !isOwner ? (
            <details className="card sc-section">
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('sanctuary.report.title')}</summary>
              <ReportForm churchId={church.id} t={t} />
            </details>
          ) : null}
        </div>

        <aside className="sc-side">
          <section className="card sc-card">
            <h2 className="sc-h-sm">{t('sanctuary.church.services')}</h2>
            {byDay.length === 0 ? (
              <p className="muted">{t('sanctuary.church.no_services')}</p>
            ) : (
              <dl className="sc-times">
                {byDay.map((group) => (
                  <div key={group.day}>
                    <dt>{t(`sanctuary.weekday.${group.day}` as MessageKey)}</dt>
                    {group.services.map((service, i) => (
                      <dd key={i}>
                        <span className="sc-time">{service.startTime}</span> {service.title}
                      </dd>
                    ))}
                  </div>
                ))}
              </dl>
            )}
            {church.next ? <p className="sc-next">{t('sanctuary.next', { when: whenText(t, church.next) })}</p> : null}
            {byDay.length > 0 ? <p className="muted sc-hint">{t('sanctuary.local_time')}</p> : null}
            {church.address ? (
              <p className="sc-address">
                <span className="muted">{t('sanctuary.church.address')}:</span> {church.address}
              </p>
            ) : null}
          </section>

          <section className="card sc-card">
            {church.streamUrl ? (
              <>
                <a className="btn btn-gold" href={church.streamUrl} target="_blank" rel="noopener noreferrer nofollow">
                  ▶ {t('sanctuary.church.watch')}
                </a>
                <p className="muted sc-hint">{t('sanctuary.church.watch_note')}</p>
              </>
            ) : null}
            {isOwner ? (
              <Link className="btn btn-line" href={`/sanctuary/manage/${church.id}`}>
                {t('sanctuary.church.manage')}
              </Link>
            ) : church.status !== 'approved' ? null : !member ? (
              <Link className="btn btn-line" href="/login">
                {t('sanctuary.church.sign_in')}
              </Link>
            ) : (
              <>
                <form action={followAction}>
                  <input type="hidden" name="churchId" value={church.id} />
                  <button className={church.followedByViewer ? 'btn btn-line' : 'btn btn-gold'} type="submit">
                    {church.followedByViewer ? t('sanctuary.church.unfollow') : t('sanctuary.church.follow')}
                  </button>
                </form>
                {church.whatsappE164 ? (
                  <a className="btn mk-wa" href={whatsappLink(church.whatsappE164, t('sanctuary.church.whatsapp_message', { url: pageUrl }))} target="_blank" rel="noopener noreferrer">
                    {t('sanctuary.church.whatsapp')}
                  </a>
                ) : null}
              </>
            )}
            {church.status === 'approved' ? (
              <p className="muted sc-hint">
                {church.followerCount === 1 ? t('sanctuary.church.followers_one', { count: 1 }) : t('sanctuary.church.followers', { count: church.followerCount })}
              </p>
            ) : null}
          </section>
        </aside>
      </div>
    </SiteShell>
  );
}
