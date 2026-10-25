import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey, Translator } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { hasPermission } from '@/server/domains/access/authorize';
import { currentSession } from '@/server/auth/context';
import { intlLocale } from '@/ui/mercadito/format';
import { siteStats, type VitalSummary } from '@/server/domains/stats/service';
import { METRIC_BANDS, type Metric } from '@/server/domains/stats/rules';
import { signInPath } from '@/server/auth/sign-in-path';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/** The periods offered, in days. 28 rather than 30: four whole weeks compare fairly. */
const PERIODS = [7, 28, 90] as const;

/** Sources with a name of their own; anything else is shown as its host. */
const NAMED_SOURCES = ['direct', 'google', 'facebook', 'instagram', 'whatsapp', 'tiktok', 'youtube', 'x', 'bing', 'duckduckgo', 'yahoo', 'linkedin', 'chatgpt'];

/**
 * The owner's visit statistics: how many people arrive, from where, on what
 * screen, how many go on to open an account and do something, and how fast
 * the pages are for them. roles.manage only (siteStats checks it again).
 *
 * Everything shown is a count of real visits, from Yavaya's own first-party
 * statistics (src/server/domains/stats); nothing is estimated or filled in.
 */
export default async function VisitsPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(await signInPath());
  const session = await currentSession();
  if (!session || !(await hasPermission(db(), userId, 'roles.manage'))) notFound();
  const asked = Number((await searchParams).dias);
  const days = (PERIODS as readonly number[]).includes(asked) ? asked : 28;
  const stats = await siteStats(db(), { userId, status: session.user.status }, { days });

  const intl = intlLocale(locale);
  const n = (value: number) => new Intl.NumberFormat(intl).format(value);
  const pct = (part: number, whole: number) => (whole ? new Intl.NumberFormat(intl, { style: 'percent', maximumFractionDigits: 0 }).format(part / whole) : '—');
  const dayLabel = (day: string, style: 'short' | 'long' = 'short') =>
    new Intl.DateTimeFormat(intl, style === 'short' ? { day: 'numeric', month: 'short', timeZone: 'UTC' } : { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

  // Every day of the period, including the quiet ones, so the chart's spacing is time.
  const byDay = new Map(stats.byDay.map((row) => [row.day, row]));
  const series: Array<{ day: string; views: number; visits: number }> = [];
  for (let d = new Date(`${stats.from}T12:00:00Z`); d.toISOString().slice(0, 10) <= stats.to; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = d.toISOString().slice(0, 10);
    series.push(byDay.get(day) ?? { day, views: 0, visits: 0 });
  }
  const peak = Math.max(1, ...series.map((row) => row.visits));
  const phoneViews = stats.devices.find((row) => row.device === 'phone')?.views ?? 0;
  const empty = stats.totals.views === 0;
  const funnel = [
    { key: 'visits', value: stats.funnel.visits },
    { key: 'accounts', value: stats.funnel.accounts },
    { key: 'verified', value: stats.funnel.verified },
    { key: 'acted', value: stats.funnel.acted },
  ] as const;
  const funnelMax = Math.max(1, ...funnel.map((step) => step.value));
  const sourceTotal = stats.sources.reduce((sum, row) => sum + row.visits, 0);
  const pageMax = Math.max(1, ...stats.pages.map((row) => row.views));
  const sourceName = (source: string) => (NAMED_SOURCES.includes(source) ? t(`stats.source.${source}` as MessageKey) : source);
  const startedLate = stats.countingSince && stats.countingSince > stats.from;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <section className="mk-head">
        <div className="wrap">
          <p className="eyebrow">
            <Link href="/admin">{t('stats.back')}</Link>
          </p>
          <h1>{t('stats.title')}</h1>
          <p className="lead mb0">{t('stats.lead')}</p>
        </div>
      </section>

      <div className="wrap vs" style={{ paddingBottom: 56 }}>
        <nav className="vs-periods" aria-label={t('stats.period_label')}>
          {PERIODS.map((p) => (
            <Link key={p} href={`/admin/visitas?dias=${p}`} aria-current={p === days ? 'page' : undefined}>
              {t('stats.period_days', { days: p })}
            </Link>
          ))}
          <span className="muted vs-range">
            {dayLabel(stats.from, 'long')} – {dayLabel(stats.to, 'long')}
          </span>
        </nav>

        {startedLate || !stats.countingSince ? (
          <p className="mk-banner" role="note">
            {stats.countingSince ? t('stats.counting_since', { date: dayLabel(stats.countingSince, 'long') }) : t('stats.counting_none')}
          </p>
        ) : null}

        <div className="vs-kpis">
          <div className="vs-kpi vs-kpi-hero">
            <span className="vs-kpi-label">{t('stats.kpi.visits')}</span>
            <span className="vs-kpi-value">{n(stats.totals.visits)}</span>
          </div>
          <div className="vs-kpi">
            <span className="vs-kpi-label">{t('stats.kpi.views')}</span>
            <span className="vs-kpi-value">{n(stats.totals.views)}</span>
          </div>
          <div className="vs-kpi">
            <span className="vs-kpi-label">{t('stats.kpi.per_visit')}</span>
            <span className="vs-kpi-value">{stats.totals.visits ? new Intl.NumberFormat(intl, { maximumFractionDigits: 1 }).format(stats.totals.views / stats.totals.visits) : '—'}</span>
          </div>
          <div className="vs-kpi">
            <span className="vs-kpi-label">{t('stats.kpi.phones')}</span>
            <span className="vs-kpi-value">{pct(phoneViews, stats.totals.views)}</span>
          </div>
        </div>

        <section className="card vs-card" aria-labelledby="vs-daily">
          <h2 id="vs-daily">{t('stats.daily.title')}</h2>
          {empty ? (
            <p className="muted mb0">{t('stats.empty')}</p>
          ) : (
            <>
              <div className="vs-cols-wrap">
                <span className="vs-axis-top" aria-hidden="true">
                  {n(peak)}
                </span>
                <ol className="vs-cols" style={{ ['--count' as string]: series.length }}>
                  {series.map((row) => {
                    const tip = t('stats.daily.tip', { day: dayLabel(row.day), visits: n(row.visits), views: n(row.views) });
                    return (
                      <li key={row.day} tabIndex={0} aria-label={tip} data-tip={tip}>
                        <span className="vs-col" style={{ height: `${(row.visits / peak) * 100}%` }} />
                      </li>
                    );
                  })}
                </ol>
                <div className="vs-axis-x" aria-hidden="true">
                  <span>{dayLabel(stats.from)}</span>
                  <span>{dayLabel(stats.to)}</span>
                </div>
              </div>
              <details className="vs-table-view">
                <summary>{t('stats.as_table')}</summary>
                <table className="vs-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('stats.col.day')}</th>
                      <th scope="col">{t('stats.col.visits')}</th>
                      <th scope="col">{t('stats.col.views')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {series.map((row) => (
                      <tr key={row.day}>
                        <td>{dayLabel(row.day)}</td>
                        <td>{n(row.visits)}</td>
                        <td>{n(row.views)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </section>

        <section className="card vs-card" aria-labelledby="vs-funnel">
          <h2 id="vs-funnel">{t('stats.funnel.title')}</h2>
          <p className="muted">{t('stats.funnel.note')}</p>
          <ol className="vs-bars">
            {funnel.map((step, i) => {
              const previous = i > 0 ? funnel[i - 1]!.value : 0;
              return (
                <li key={step.key}>
                  <span className="vs-bar-label">{t(`stats.funnel.${step.key}` as MessageKey)}</span>
                  <span className="vs-bar-track">
                    <span className="vs-bar" style={{ width: `${(step.value / funnelMax) * 100}%` }} />
                  </span>
                  <span className="vs-bar-value">
                    {n(step.value)}
                    {i > 0 && previous > 0 && step.value <= previous ? <span className="muted"> · {t('stats.funnel.of_previous', { share: pct(step.value, previous) })}</span> : null}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        <section className="card vs-card" aria-labelledby="vs-speed">
          <h2 id="vs-speed">{t('stats.speed.title')}</h2>
          <p className="muted">{t('stats.speed.lead')}</p>
          <ul className="vs-legend" aria-hidden="true">
            <li><span className="vs-sw vs-good" />✓ {t('stats.speed.good')}</li>
            <li><span className="vs-sw vs-mid" />! {t('stats.speed.mid')}</li>
            <li><span className="vs-sw vs-bad" />✕ {t('stats.speed.bad')}</li>
          </ul>
          <ul className="vs-speed">
            {stats.vitals.all.map((all) => (
              <SpeedRow key={all.metric} t={t} all={all} phone={stats.vitals.phone.find((v) => v.metric === all.metric)!} pct={pct} n={n} intl={intl} />
            ))}
          </ul>
          {stats.slowPages.length ? (
            <>
              <h3 className="vs-sub">{t('stats.speed.slow_pages')}</h3>
              <table className="vs-table">
                <thead>
                  <tr>
                    <th scope="col">{t('stats.col.page')}</th>
                    <th scope="col">{t('stats.col.slow_share')}</th>
                    <th scope="col">{t('stats.col.average')}</th>
                    <th scope="col">{t('stats.col.samples')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.slowPages.map((row) => (
                    <tr key={row.path}>
                      <td><code>{row.path}</code></td>
                      <td>{pct(row.poorShare, 1)}</td>
                      <td>{formatValue('LCP', row.average, intl)}</td>
                      <td>{n(row.samples)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </section>

        <div className="vs-split">
          <section className="card vs-card" aria-labelledby="vs-sources">
            <h2 id="vs-sources">{t('stats.sources.title')}</h2>
            {stats.sources.length === 0 ? (
              <p className="muted mb0">{t('stats.empty')}</p>
            ) : (
              <ol className="vs-bars vs-bars-compact">
                {stats.sources.map((row) => (
                  <li key={row.source}>
                    <span className="vs-bar-label">{sourceName(row.source)}</span>
                    <span className="vs-bar-track">
                      <span className="vs-bar" style={{ width: `${(row.visits / Math.max(1, stats.sources[0]!.visits)) * 100}%` }} />
                    </span>
                    <span className="vs-bar-value">
                      {n(row.visits)} <span className="muted">· {pct(row.visits, sourceTotal)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="card vs-card" aria-labelledby="vs-devices">
            <h2 id="vs-devices">{t('stats.devices.title')}</h2>
            {stats.devices.length === 0 ? (
              <p className="muted mb0">{t('stats.empty')}</p>
            ) : (
              <ol className="vs-bars vs-bars-compact">
                {stats.devices.map((row) => (
                  <li key={row.device}>
                    <span className="vs-bar-label">{t(`stats.device.${row.device}` as MessageKey)}</span>
                    <span className="vs-bar-track">
                      <span className="vs-bar" style={{ width: `${(row.views / Math.max(1, stats.totals.views)) * 100}%` }} />
                    </span>
                    <span className="vs-bar-value">{pct(row.views, stats.totals.views)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <section className="card vs-card" aria-labelledby="vs-pages">
          <h2 id="vs-pages">{t('stats.pages.title')}</h2>
          {stats.pages.length === 0 ? (
            <p className="muted mb0">{t('stats.empty')}</p>
          ) : (
            <table className="vs-table">
              <thead>
                <tr>
                  <th scope="col">{t('stats.col.page')}</th>
                  <th scope="col">{t('stats.col.views')}</th>
                  <th scope="col">{t('stats.col.entries')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.pages.map((row) => (
                  <tr key={row.path}>
                    <td>
                      <code>{row.path}</code>
                      <span className="vs-inline-bar" style={{ width: `${(row.views / pageMax) * 100}%` }} aria-hidden="true" />
                    </td>
                    <td>{n(row.views)}</td>
                    <td>{n(row.visits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <p className="muted vs-fine">{t('stats.privacy_note')}</p>
      </div>
    </SiteShell>
  );
}

/** A measure's value the way people say it: seconds for loading, milliseconds for a tap, a plain number for stability. */
function formatValue(metric: Metric, value: number, intl: string): string {
  if (metric === 'CLS') return new Intl.NumberFormat(intl, { maximumFractionDigits: 2 }).format(value);
  if (metric === 'INP') return `${new Intl.NumberFormat(intl, { maximumFractionDigits: 0 }).format(value)} ms`;
  return `${new Intl.NumberFormat(intl, { maximumFractionDigits: 1 }).format(value / 1000)} s`;
}

function SpeedRow({ t, all, phone, pct, n, intl }: { t: Translator; all: VitalSummary; phone: VitalSummary; pct: (a: number, b: number) => string; n: (v: number) => string; intl: string }) {
  const bands = METRIC_BANDS[all.metric];
  const threshold = all.metric === 'CLS' ? formatValue('CLS', bands.good, intl) : formatValue(all.metric, bands.good, intl);
  return (
    <li className="vs-speed-row">
      <div className="vs-speed-head">
        <strong>{t(`stats.metric.${all.metric}` as MessageKey)}</strong>
        <span className="muted">{t(`stats.metric.${all.metric}.what` as MessageKey, { good: threshold })}</span>
      </div>
      {all.samples === 0 ? (
        <p className="muted mb0">{t('stats.speed.no_samples')}</p>
      ) : (
        <>
          <div className="vs-stack" role="img" aria-label={t('stats.speed.aria', { good: pct(all.good, all.samples), mid: pct(all.needsImprovement, all.samples), bad: pct(all.poor, all.samples) })}>
            {all.good ? <span className="vs-good" style={{ flexGrow: all.good }} /> : null}
            {all.needsImprovement ? <span className="vs-mid" style={{ flexGrow: all.needsImprovement }} /> : null}
            {all.poor ? <span className="vs-bad" style={{ flexGrow: all.poor }} /> : null}
          </div>
          <p className="vs-speed-numbers mb0">
            <span>✓ {pct(all.good, all.samples)}</span>
            <span>! {pct(all.needsImprovement, all.samples)}</span>
            <span>✕ {pct(all.poor, all.samples)}</span>
            <span className="muted">{t('stats.speed.average', { value: formatValue(all.metric, all.average, intl) })}</span>
            <span className="muted">{t('stats.speed.samples', { count: n(all.samples) })}</span>
          </p>
          {phone.samples ? (
            <p className="muted vs-speed-phone mb0">
              {t('stats.speed.on_phones', { good: pct(phone.good, phone.samples), value: formatValue(all.metric, phone.average, intl) })}
            </p>
          ) : null}
        </>
      )}
    </li>
  );
}
