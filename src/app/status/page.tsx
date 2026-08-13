import type { Metadata } from 'next';
import { CAPABILITY_STATES, type Capability } from '@/config/capabilities';
import { AppShell } from '@/ui/components/app-shell';
import { CapabilityBadge } from '@/ui/components/capability-badge';
import { shellContext } from '@/ui/shell-context';
import { allCapabilities } from '@/server/domains/platform/capability';
import type { MessageKey, Translator } from '@/i18n';

export const metadata: Metadata = { title: 'Status' };
export const dynamic = 'force-dynamic';

/**
 * Platform status.
 *
 * This page exists so nobody — member, operator or engineer — has to guess what
 * Yavaya can actually do. Every capability declares one of four states and this
 * page renders it verbatim. Nothing here is aspirational, and nothing that is
 * only partly built is allowed to read as finished.
 */
export default async function StatusPage() {
  const { t, language, theme, member } = await shellContext();
  const capabilities = allCapabilities();

  const counts = Object.fromEntries(
    CAPABILITY_STATES.map((state) => [
      state,
      capabilities.filter((capability) => capability.state === state).length,
    ]),
  ) as Record<(typeof CAPABILITY_STATES)[number], number>;

  const groups: Array<{ key: Capability['group']; titleKey: MessageKey }> = [
    { key: 'platform', titleKey: 'status.group.platform' },
    { key: 'trust', titleKey: 'status.group.trust' },
    { key: 'district', titleKey: 'status.group.district' },
    { key: 'integration', titleKey: 'status.group.integration' },
  ];

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <h1 className="text-2xl font-semibold tracking-tight">{t('status.title')}</h1>
      <p className="mt-1 text-[var(--text-secondary)]">{t('status.subtitle')}</p>

      <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CAPABILITY_STATES.map((state) => (
          <li key={state} className="surface-card p-3">
            <p className="text-2xl font-semibold tabular-nums">{counts[state]}</p>
            <div className="mt-1">
              <CapabilityBadge state={state} t={t} />
            </div>
          </li>
        ))}
      </ul>

      <section className="surface-card mt-6 p-4">
        <h2 className="text-sm font-semibold">{t('status.legend')}</h2>
        <dl className="mt-3 space-y-2 text-sm">
          {CAPABILITY_STATES.map((state) => (
            <div key={state} className="flex gap-3">
              <dt className="shrink-0">
                <CapabilityBadge state={state} t={t} />
              </dt>
              <dd className="text-[var(--text-secondary)]">
                {t(`capability.state.${state}.explain` as MessageKey)}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {groups.map((group) => {
        const rows = capabilities.filter((capability) => capability.group === group.key);
        if (rows.length === 0) return null;

        return (
          <section key={group.key} className="mt-8">
            <h2 className="text-lg font-semibold tracking-tight">{t(group.titleKey)}</h2>
            <ul className="mt-3 divide-y rounded-xl border">
              {rows.map((capability) => (
                <CapabilityRow key={capability.key} capability={capability} t={t} />
              ))}
            </ul>
          </section>
        );
      })}

      <p className="mt-8 text-sm text-[var(--text-secondary)]">{t('status.integration_note')}</p>
    </AppShell>
  );
}

function CapabilityRow({ capability, t }: { capability: Capability; t: Translator }) {
  return (
    <li className="p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{t(capability.nameKey as MessageKey)}</p>
          <p className="text-sm text-[var(--text-secondary)]">
            {t(capability.detailKey as MessageKey)}
          </p>
        </div>
        <CapabilityBadge state={capability.state} t={t} />
      </div>

      {capability.blockedBy ? (
        // Operator-facing detail: what would have to change. Left untranslated
        // because it names configuration keys and documentation paths.
        <p className="mt-2 border-l-2 pl-3 text-2xs text-[var(--text-muted)]">
          {capability.blockedBy}
        </p>
      ) : null}
    </li>
  );
}
