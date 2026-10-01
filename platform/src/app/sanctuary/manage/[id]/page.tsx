import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { SANCTUARY_RULES } from '@/config/business-rules';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { dateText } from '@/ui/sanctuary/parts';
import { churchDevotionalsForOwner, getChurch, localDate } from '@/server/domains/sanctuary/service';
import { publishDevotionalAction, withdrawDevotionalAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DONE = ['submitted', 'saved', 'saved_review', 'published', 'withdrawn'] as const;
type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; done?: string }> };

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A church's own desk: its review status, its words for the day, its details. */
export default async function ManageChurchPage({ params, searchParams }: Params) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const church = await getChurch(db(), { churchId: id, viewerId: userId, locale });
  if (!church || church.ownerUserId !== userId) notFound();
  const words = await churchDevotionalsForOwner(db(), { churchId: church.id, ownerUserId: userId });
  const today = localDate(church.timezone);
  const R = SANCTUARY_RULES;
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const done = (DONE as readonly string[]).includes(query.done ?? '') ? query.done : null;
  const doneKey: Record<string, MessageKey> = {
    submitted: 'sanctuary.form.submitted',
    saved: 'sanctuary.form.saved',
    saved_review: 'sanctuary.form.saved_review',
    published: 'sanctuary.manage.published',
    withdrawn: 'sanctuary.manage.withdrawn',
  };

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="sanctuary" tone="sanctuary">
      <section className="mk-head">
        <div className="wrap cm-column">
          <p>
            <Link href="/sanctuary/manage">← {t('sanctuary.manage.title')}</Link>
          </p>
          <h1>{church.name}</h1>
          <p>
            <span className={`sc-status sc-status-${church.status}`}>{t(`sanctuary.status.${church.status}` as MessageKey)}</span>{' '}
            <span className="muted">{church.placeName}</span>
          </p>
          <div className="btn-row">
            <Link className="btn btn-line" href={`/sanctuary/manage/${church.id}/edit`}>
              {t('sanctuary.manage.edit')}
            </Link>
            <Link className="btn btn-line" href={`/sanctuary/churches/${church.id}`}>
              {t('sanctuary.manage.view')}
            </Link>
          </div>
        </div>
      </section>

      <div className="wrap cm-column" style={{ paddingBottom: 56 }}>
        {done ? (
          <p className="mk-banner" role="status">
            {t(doneKey[done]!)}
          </p>
        ) : null}
        {error ? (
          <p className="mk-error">
            {t(error as MessageKey, { limit: R.maxDevotionalsPerChurchPerDay, back: R.devotionalDaysBack, ahead: R.devotionalDaysAhead })}
          </p>
        ) : null}
        {church.status === 'pending' ? <p className="muted">{t('sanctuary.status.pending_text')}</p> : null}
        {church.status === 'rejected' ? <p className="mk-error">{t('sanctuary.status.rejected_text', { note: church.reviewNote ?? '' })}</p> : null}
        {church.status === 'suspended' ? <p className="mk-error">{t('sanctuary.status.suspended_text', { note: church.reviewNote ?? '' })}</p> : null}

        <section id="publish" className="card sc-section">
          <h2 className="sc-h-sm">{t('sanctuary.manage.publish_title')}</h2>
          {church.status !== 'approved' ? (
            <p className="muted">{t('sanctuary.manage.only_approved')}</p>
          ) : (
            <>
              <p className="muted">{t('sanctuary.manage.publish_intro', { limit: R.maxDevotionalsPerChurchPerDay })}</p>
              <form action={publishDevotionalAction} className="mk-form">
                <input type="hidden" name="churchId" value={church.id} />
                <div className="sc-two">
                  <label>
                    {t('sanctuary.manage.date')}
                    <input name="forDate" type="date" required defaultValue={today} min={addDays(today, -R.devotionalDaysBack)} max={addDays(today, R.devotionalDaysAhead)} />
                  </label>
                  <label>
                    {t('sanctuary.manage.scripture')}
                    <input name="scripture" maxLength={R.scriptureMaxLength} placeholder={t('sanctuary.manage.scripture_ph')} />
                  </label>
                </div>
                <label>
                  {t('sanctuary.manage.word_title')}
                  <input name="title" required minLength={R.devotionalTitleMinLength} maxLength={R.devotionalTitleMaxLength} />
                </label>
                <label>
                  {t('sanctuary.manage.body')}
                  <textarea name="body" required minLength={R.devotionalBodyMinLength} maxLength={R.devotionalBodyMaxLength} style={{ minHeight: 200 }} />
                </label>
                <div className="btn-row">
                  <button className="btn btn-gold" type="submit">
                    {t('sanctuary.manage.publish')}
                  </button>
                </div>
              </form>
            </>
          )}
        </section>

        <section id="words" className="sc-section">
          <h2 className="sc-h-sm">{t('sanctuary.manage.words')}</h2>
          {words.length === 0 ? (
            <p className="muted">{t('sanctuary.manage.no_words')}</p>
          ) : (
            <ul className="sc-owner-words">
              {words.map((word) => (
                <li key={word.id}>
                  <span>
                    <span className="sc-date">{dateText(word.forDate, locale)}</span> {word.title}
                  </span>
                  <form action={withdrawDevotionalAction}>
                    <input type="hidden" name="churchId" value={church.id} />
                    <input type="hidden" name="devotionalId" value={word.id} />
                    <button className="btn btn-line btn-sm" type="submit">
                      {t('sanctuary.manage.withdraw')}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </SiteShell>
  );
}
