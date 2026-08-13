import type { Metadata } from 'next';
import { getTranslator } from '@/i18n/server';
import { serverEnv } from '@/config/env';
import { AppShell } from '@/ui/components/app-shell';
import { listProviderAvailability } from '@/server/domains/payments/service';

export const metadata: Metadata = { title: 'Status' };
export const dynamic = 'force-dynamic';

/**
 * Platform status.
 *
 * This page exists so nobody — user, operator or engineer — has to guess what
 * Yavaya can actually do right now. Subsystems report built or not built;
 * integrations report configured or not. Nothing here is aspirational.
 */
export default async function StatusPage() {
  const { t } = await getTranslator();
  const env = serverEnv();

  const subsystems: Array<{ name: string; built: boolean; note: string }> = [
    { name: 'Identity & YAY ID', built: true, note: 'Registration, permanent 8-digit identifier, verification challenges.' },
    { name: 'Authentication & sessions', built: true, note: 'scrypt passwords, hashed session tokens, rotation, revocation.' },
    { name: 'Authorization (RBAC)', built: true, note: 'Server-side roles and permissions; admin granted by backend bootstrap.' },
    { name: 'Geography', built: true, note: 'Region → country → state → city hierarchy; 7 launch countries seeded.' },
    { name: 'Anti-duplication & risk scoring', built: true, note: 'Layered signals, weighted score, human review — no single-signal bans.' },
    { name: '72-hour new-account monitoring', built: true, note: 'Monitoring window, stricter limits, graduation to standard trust.' },
    { name: 'Audit log', built: true, note: 'Append-only, hash-chained, database-enforced immutability.' },
    { name: 'Token ledger', built: true, note: 'Atomic, exactly-once charges; treasury; starter grants; reward caps.' },
    { name: 'Reputation engine', built: true, note: 'Configurable rules, idempotent events, cooldowns and daily caps.' },
    { name: 'Trust Shield', built: true, note: 'Derived public summary with a hard privacy boundary.' },
    { name: 'Rate limiting', built: true, note: 'Server-side counters, per bucket and subject.' },
    { name: 'Moderation & enforcement', built: false, note: 'Schema in place; reporting flows and queue arrive in Phase 1.' },
    { name: 'Districts', built: false, note: 'Registry and theming in place; district experiences are Phase 1+.' },
    { name: 'Payments', built: false, note: 'Provider-agnostic interface in place; no working integration yet.' },
  ];

  const integrations: Array<{ name: string; configured: boolean; detail: string }> = [
    {
      name: 'Email delivery',
      configured: env.EMAIL_PROVIDER !== 'unconfigured',
      detail: 'Verification codes and receipts.',
    },
    {
      name: 'SMS delivery',
      configured: env.SMS_PROVIDER !== 'unconfigured',
      detail: 'Phone verification.',
    },
    {
      name: 'Identity documents (KYC)',
      configured: env.KYC_PROVIDER !== 'unconfigured',
      detail: 'Driver applications and identity verification.',
    },
    {
      name: 'Media storage',
      configured: env.MEDIA_STORAGE_PROVIDER !== 'unconfigured',
      detail: 'Listing photos, avatars, evidence.',
    },
    {
      name: 'IP geolocation',
      configured: env.GEOIP_PROVIDER !== 'unconfigured',
      detail: 'Coarse location suggestion; manual selection always available.',
    },
    ...listProviderAvailability().map((provider) => ({
      name: `Payments — ${provider.key}`,
      configured: provider.available,
      detail: provider.reason ?? 'Ready.',
    })),
  ];

  return (
    <AppShell t={t}>
      <h1 className="text-2xl font-semibold tracking-tight">{t('status.title')}</h1>
      <p className="mt-1 text-[var(--text-secondary)]">{t('status.subtitle')}</p>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Subsystems</h2>
        <ul className="mt-3 divide-y rounded-xl border">
          {subsystems.map((item) => (
            <li key={item.name} className="flex items-start gap-3 p-3.5">
              <StateBadge ok={item.built} okLabel={t('status.built')} offLabel={t('status.not_built')} />
              <div className="min-w-0">
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-[var(--text-secondary)]">{item.note}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold tracking-tight">Integrations</h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">{t('status.integration_note')}</p>
        <ul className="mt-3 divide-y rounded-xl border">
          {integrations.map((item) => (
            <li key={item.name} className="flex items-start gap-3 p-3.5">
              <StateBadge
                ok={item.configured}
                okLabel={t('status.configured')}
                offLabel={t('status.unconfigured')}
              />
              <div className="min-w-0">
                <p className="font-medium">{item.name}</p>
                <p className="text-sm text-[var(--text-secondary)]">{item.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}

/** State is conveyed by the word first; colour only reinforces it. */
function StateBadge({ ok, okLabel, offLabel }: { ok: boolean; okLabel: string; offLabel: string }) {
  return (
    <span
      className="mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-2xs font-semibold tracking-wide uppercase"
      style={
        ok
          ? { borderColor: 'var(--color-positive)', color: 'var(--color-positive)' }
          : { borderColor: 'var(--surface-border-strong)', color: 'var(--text-muted)' }
      }
    >
      {ok ? okLabel : offLabel}
    </span>
  );
}
