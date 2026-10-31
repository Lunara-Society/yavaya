import type { Metadata } from 'next';
import { db } from '@/server/db/client';
import type { CapabilityState } from '@/config/capabilities';
import type { MessageKey } from '@/i18n';
import { allCapabilities } from '@/server/domains/platform/capability';
import { activeDemoCount } from '@/server/domains/platform/demo';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { TransparencyBody } from '@/ui/site/pages';
import type { SiteState } from '@/ui/site/blocks';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { c } = await siteContext();
  return { title: c.pages.transparency.title, description: c.pages.transparency.description };
}

const STYLE: Record<CapabilityState, SiteState> = { REAL: 'live', DEMO: 'dev', MOCK: 'dev', REQUIRES_CONFIGURATION: 'off' };

/*
 * The claims this page makes about what works are not written here: they are
 * read, at request time, from the same capability register /status renders,
 * so the two pages cannot drift apart again (they did: one said tracking and
 * activity were live while the other hedged). The rows chosen are the ones a
 * reader of a transparency page asks about first.
 */
const HIGHLIGHTS = ['live_activity', 'site_stats', 'live_tracking', 'live_map', 'live_map_demo', 'moderation'];

export default async function Page() {
  const { c, t, language, theme, member } = await siteContext();
  const capabilities = allCapabilities();
  const count = (state: CapabilityState) => capabilities.filter((capability) => capability.state === state).length;
  const demoItems = await activeDemoCount(db());
  const byKey = new Map(capabilities.map((capability) => [capability.key, capability]));
  const rows = HIGHLIGHTS.flatMap((key) => {
    const capability = byKey.get(key);
    if (!capability) return [];
    return [
      {
        key,
        name: t(capability.nameKey as MessageKey),
        detail: t(capability.detailKey as MessageKey),
        state: STYLE[capability.state],
        label: t(`capability.state.${capability.state}` as MessageKey),
        evidence: capability.evidenceKey ? t(capability.evidenceKey as MessageKey) : undefined,
      },
    ];
  });
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="transparency">
      <TransparencyBody
        c={c}
        now={{
          eyebrow: t('transparency.now.eyebrow'),
          title: t('transparency.now.title'),
          lead: t('transparency.now.lead'),
          counts: t('transparency.now.counts', { real: count('REAL'), demo: count('DEMO'), mock: count('MOCK'), pending: count('REQUIRES_CONFIGURATION') }),
          demo: demoItems === 0 ? t('transparency.now.demo_none') : t('transparency.now.demo_some', { count: demoItems }),
          statusLink: t('transparency.now.status_link'),
          evidenceLabel: t('status.evidence_label'),
          rows,
        }}
      />
    </SiteShell>
  );
}
