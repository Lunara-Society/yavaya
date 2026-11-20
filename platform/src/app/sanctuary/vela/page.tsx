import type { Metadata } from 'next';
import Link from 'next/link';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { dailyLight } from '@/i18n/daily';
import { SANCTUARY_RULES } from '@/config/business-rules';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { loginHref } from '@/server/auth/return-path';
import { currentLightDate, memberTimezone } from '@/server/domains/sanctuary/daily';
import { candlesLastDay } from '@/server/domains/sanctuary/candles';
import { CandleLighter, CandleStage, type CandleLabels } from '@/ui/sanctuary/candle';
import { candleCount, candleFilm } from '@/ui/sanctuary/candle-film';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('sanctuary.candle.page_title'), description: t('sanctuary.candle.cta_text'), robots: { index: false } };
}

const LABEL_KEYS = [
  'today', 'for_label', 'for_placeholder', 'intention_label', 'intention_placeholder', 'anonymous', 'light', 'lighting', 'lit_title', 'lit_text', 'for_line',
  'send', 'send_video', 'copy', 'copied', 'whatsapp', 'view', 'another', 'share_title', 'share_text', 'share_text_named', 'stage',
] as const;
const ERRORS = ['sanctuary.candle.error.link', 'sanctuary.candle.error.account', 'sanctuary.candle.error.too_many', 'error.unauthenticated'] as const;

/**
 * "Encender una vela por alguien" (docs/sanctuary/CANDLE.md): the day's
 * prayer above an unlit candle; who it is for; the light comes down and the
 * candle catches; then it is sent with the phone's own share sheet. Members
 * light candles; anyone may look.
 */
export default async function CandleLightingPage() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const timezone = userId ? await memberTimezone(db(), userId) : null;
  const prayer = dailyLight(currentLightDate(timezone), ['prayer'], locale).text;
  const count = await candlesLastDay(db());
  const film = candleFilm(language);
  const labels: CandleLabels = {
    ...(Object.fromEntries(LABEL_KEYS.map((key) => [key, t(`sanctuary.candle.${key}` as MessageKey, { name: '{name}', days: '{days}' })])) as Record<(typeof LABEL_KEYS)[number], string>),
    error: t('sanctuary.candle.error.generic'),
    errors: Object.fromEntries(ERRORS.map((key) => [key, t(key as MessageKey)])),
  };
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="sanctuary" tone="sanctuary">
      <section className="vela-page">
        <div className="wrap vela-wrap">
          <p className="vela-back">
            <Link href="/sanctuary/prayer">← {t('sanctuary.prayer.title')}</Link>
          </p>
          <h1 className="vela-title">{t('sanctuary.candle.page_title')}</h1>
          <p className="vela-lead">{t('sanctuary.candle.cta_text')}</p>
          {userId ? (
            <CandleLighter film={film} prayer={prayer} labels={labels} days={SANCTUARY_RULES.candleBurnDays} />
          ) : (
            <div className="vela">
              <CandleStage film={film} prayer={prayer} prayerLabel={labels.today} phase="unlit" label={labels.stage} />
              <div className="vela-form">
                <Link className="vela-light" href={loginHref('/sanctuary/vela')}>
                  {t('sanctuary.candle.sign_in')}
                </Link>
                <Link className="vela-line" href={loginHref('/sanctuary/vela', '/register')}>
                  {t('auth.submit_register')}
                </Link>
              </div>
            </div>
          )}
          {count > 0 ? <p className="vela-count">{candleCount(t, count)}</p> : null}
        </div>
      </section>
    </SiteShell>
  );
}
