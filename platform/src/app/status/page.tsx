import type { Metadata } from 'next';
import { CAPABILITY_STATES, type Capability, type CapabilityState } from '@/config/capabilities';
import { allCapabilities } from '@/server/domains/platform/capability';
import type { MessageKey } from '@/i18n';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { StatusBody, type StatusRow } from '@/ui/site/pages';
import type { SiteState } from '@/ui/site/blocks';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.pages.status.title, description: c.pages.status.description };
}

/**
 * Platform status.
 *
 * Rendered straight from the capability register, with integrations measured
 * from the environment at request time. Nothing here is aspirational, and
 * nothing that is only partly built is allowed to read as finished.
 */
const STYLE: Record<CapabilityState, SiteState> = {
  REAL: 'live',
  DEMO: 'dev',
  MOCK: 'dev',
  REQUIRES_CONFIGURATION: 'off',
};

export default async function StatusPage() {
  const { c, t, language, theme, member } = await siteContext();
  const capabilities = allCapabilities();

  const groups: Array<{ key: Capability['group']; titleKey: MessageKey }> = [
    { key: 'platform', titleKey: 'status.group.platform' },
    { key: 'trust', titleKey: 'status.group.trust' },
    { key: 'district', titleKey: 'status.group.district' },
    { key: 'integration', titleKey: 'status.group.integration' },
  ];

  const rows = (group: Capability['group']): StatusRow[] =>
    capabilities
      .filter((capability) => capability.group === group)
      .map((capability) => ({
        key: capability.key,
        name: t(capability.nameKey as MessageKey),
        detail: t(capability.detailKey as MessageKey),
        state: STYLE[capability.state],
        label: t(`capability.state.${capability.state}` as MessageKey),
        note: capability.state === 'REAL' ? undefined : capability.blockedBy,
      }));

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="status">
      <StatusBody
        c={c}
        groups={groups
          .map((g) => ({ title: t(g.titleKey), rows: rows(g.key) }))
          .filter((g) => g.rows.length > 0)}
        legend={CAPABILITY_STATES.map((state) => ({
          state: STYLE[state],
          label: t(`capability.state.${state}` as MessageKey),
          explain: t(`capability.state.${state}.explain` as MessageKey),
        }))}
      />
    </SiteShell>
  );
}
