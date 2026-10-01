import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { PageScene } from '@/ui/site/art';
import { WordCard } from '@/ui/sanctuary/parts';
import { ReportForm } from '@/ui/sanctuary/report-form';
import { getDevotional } from '@/server/domains/sanctuary/service';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Params = { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; reported?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  if (!UUID.test(id)) return {};
  const { locale } = await siteContext();
  const word = await getDevotional(db(), { id, locale });
  return word ? { title: word.title, description: word.body.slice(0, 160) } : { robots: { index: false } };
}

/** One prayer or word, read in full, in a quiet column. */
export default async function WordPage({ params, searchParams }: Params) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { c, t, locale, language, theme, member } = await siteContext();
  const word = await getDevotional(db(), { id, locale });
  if (!word) notFound();
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="sanctuary" tone="sanctuary">
      <section className="sc-word-hero">
        <PageScene name="sanctuary-word" className="sc-word-hero-photo" />
      </section>
      <div className="wrap cm-column sc-reading">
        <p>
          <Link href="/sanctuary">← {t('sanctuary.church.back')}</Link>
        </p>
        {query.reported ? (
          <p className="mk-banner" role="status">
            {t('sanctuary.report.done', { code: query.reported.slice(0, 16) })}
          </p>
        ) : null}
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}
        <WordCard word={word} t={t} locale={locale} full />
        {member ? (
          <details className="card sc-section">
            <summary style={{ cursor: 'pointer', fontWeight: 700 }}>{t('sanctuary.report.title_word')}</summary>
            <ReportForm churchId={word.church.id} devotionalId={word.id} t={t} />
          </details>
        ) : null}
      </div>
    </SiteShell>
  );
}
