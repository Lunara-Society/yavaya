import Link from 'next/link';
import { districtList } from '@/config/districts';
import { NEW_USER_RULES, TOKEN_RULES } from '@/config/business-rules';
import { AppShell } from '@/ui/components/app-shell';
import { DistrictTile } from '@/ui/components/district-tile';
import { shellContext } from '@/ui/shell-context';

/**
 * Yavaya home.
 *
 * Deliberately honest: districts are shown with their real status, and nothing
 * here claims activity, membership numbers or transactions that do not exist.
 * When there is real activity, the live feed replaces the explanatory panel —
 * it is never filled with invented events in the meantime.
 */
export default async function HomePage() {
  const { t, language, theme, member } = await shellContext();

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <section className="pt-4">
        <p className="text-2xs font-semibold tracking-[0.18em] text-[var(--accent)] uppercase">
          {t('brand.tagline')}
        </p>
        <h1 className="mt-3 text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          {t('brand.name')}
        </h1>
        <p className="mt-3 max-w-prose text-[var(--text-secondary)]">{t('brand.description')}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/register"
            className="inline-flex min-h-touch items-center rounded-xl px-5 font-medium"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast-text)' }}
          >
            {t('auth.submit_register')}
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-touch items-center rounded-xl border px-5 font-medium"
          >
            {t('auth.submit_login')}
          </Link>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold tracking-tight">{t('districts.title')}</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{t('districts.subtitle')}</p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {districtList.map((district) => (
            <li key={district.key}>
              <DistrictTile district={district} t={t} />
            </li>
          ))}
        </ul>
      </section>

      <section className="surface-card mt-10 p-5">
        <h2 className="text-lg font-semibold tracking-tight">{t('tokens.name')}</h2>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('tokens.description')}</p>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li>
            {t('tokens.starter_grant', {
              perDay: TOKEN_RULES.starterGrantPerDay,
              days: TOKEN_RULES.starterGrantDays,
              max: TOKEN_RULES.starterGrantMaximum,
            })}
          </li>
          <li>{t('tokens.cost_publish', { cost: TOKEN_RULES.defaultPublishCost })}</li>
        </ul>
      </section>

      <section className="mt-6 rounded-xl border px-4 py-3 text-sm text-[var(--text-secondary)]">
        {t('auth.monitoring_notice', { hours: NEW_USER_RULES.monitoringWindowHours })}
      </section>
    </AppShell>
  );
}
