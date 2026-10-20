import 'server-only';
import type { MessageKey, Translator } from '@/i18n';
import { allCapabilities } from '@/server/domains/platform/capability';

/**
 * What works today, from the same register /status renders, as a few lines
 * Roxi reads at the start of every conversation. Measured now rather than
 * written into the knowledge base, so Roxi never offers what is switched off
 * (a payment provider without keys, SMS deferred) or misses what was just
 * switched on.
 */
export function roxiPlatformStatus(t: Translator): string {
  const byState = new Map<string, string[]>();
  for (const capability of allCapabilities()) {
    const names = byState.get(capability.state) ?? [];
    names.push(t(capability.nameKey as MessageKey));
    byState.set(capability.state, names);
  }
  const line = (state: string, label: string) => (byState.get(state)?.length ? `${label}: ${byState.get(state)!.join('; ')}.` : null);
  return [
    line('REAL', 'Working now'),
    line('REQUIRES_CONFIGURATION', 'Built but not available yet'),
    line('DEMO', 'Demo only (test mode, not real)'),
    line('MOCK', 'Not working (stand-in)'),
  ]
    .filter(Boolean)
    .join('\n');
}
