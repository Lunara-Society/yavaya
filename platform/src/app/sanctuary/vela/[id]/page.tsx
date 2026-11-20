import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { candleView, candlesLastDay } from '@/server/domains/sanctuary/candles';
import { CandleShrine } from '@/ui/sanctuary/candle';
import { candleCount, candleFilm } from '@/ui/sanctuary/candle-film';
import { CandleReport } from '@/ui/sanctuary/candle-report';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const { t, locale } = await siteContext();
  const candle = await candleView(db(), { id, locale });
  if (!candle) return { title: t('sanctuary.candle.page_title'), robots: { index: false } };
  const title = candle.forName ? t('sanctuary.candle.meta_title_named', { name: candle.forName }) : t('sanctuary.candle.meta_title');
  const description = candle.prayer.length > 160 ? `${candle.prayer.slice(0, 157)}…` : candle.prayer;
  // Its own preview card for WhatsApp; the link itself is private, so nothing here is for search engines.
  return { title, description, robots: { index: false }, openGraph: { title, description, images: [{ url: `/sanctuary/vela/${candle.id}/image`, width: 1200, height: 630 }] } };
}

/**
 * The page a candle is sent to (docs/sanctuary/CANDLE.md). It needs no
 * account: the person it was lit for may not have one. It lights itself once
 * — the light comes down from the prayer of the day it was lit and catches
 * the wick — then burns until its time; burned out, it rests, and says when
 * it burned.
 */
export default async function CandlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { c, t, locale, language, theme, member } = await siteContext();
  const candle = await candleView(db(), { id, locale });
  if (!candle) notFound();
  const count = await candlesLastDay(db());
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="sanctuary" tone="sanctuary">
      <section className="vela-page">
        <div className="wrap vela-wrap">
          <CandleShrine
            film={candleFilm(language)}
            prayer={candle.prayer}
            prayerLabel={t('sanctuary.candle.prayer_of_day')}
            burning={candle.burning}
            label={t('sanctuary.candle.stage')}
            lead={
              candle.wordsHidden ? null : (
                <>
                  <p className="vela-from">{candle.from ? t('sanctuary.candle.received_from', { name: candle.from }) : t('sanctuary.candle.received_anon')}</p>
                  {candle.forName ? <p className="vela-for">{t('sanctuary.candle.for_line', { name: candle.forName })}</p> : null}
                </>
              )
            }
          >
            <div className="vela-words">
              {candle.wordsHidden ? <p className="vela-hidden">{t('sanctuary.candle.hidden')}</p> : candle.intention ? <p className="vela-intention">“{candle.intention}”</p> : null}
              <p className="vela-when">{candle.burning ? t('sanctuary.candle.burns_until', { date: date(candle.burnsUntil) }) : t('sanctuary.candle.burned', { from: date(candle.litAt), until: date(candle.burnsUntil) })}</p>
            </div>
          </CandleShrine>
          <div className="vela-form vela-next">
            <Link className="vela-light" href="/sanctuary/vela">
              {t('sanctuary.candle.light_yours')}
            </Link>
            <Link className="vela-line" href="/sanctuary/prayer">
              {t('sanctuary.candle.ask_prayer')}
            </Link>
          </div>
          {count > 0 ? <p className="vela-count">{candleCount(t, count)}</p> : null}
          {candle.wordsHidden ? null : (
            <CandleReport id={candle.id} labels={{ report: t('sanctuary.candle.report'), confirm: t('sanctuary.candle.report_confirm'), done: t('sanctuary.candle.reported'), error: t('sanctuary.candle.error.generic') }} />
          )}
        </div>
      </section>
    </SiteShell>
  );
}
