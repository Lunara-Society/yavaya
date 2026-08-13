import type { CapabilityState } from '@/config/capabilities';
import { stateLabelKey } from '@/config/capabilities';
import type { MessageKey, Translator } from '@/i18n';

/**
 * Renders a capability's state.
 *
 * The word is the signal; colour only reinforces it. A user who cannot
 * distinguish the colours, or is reading in bright sunlight, still gets the
 * whole message.
 *
 * There is no "looks fine" state. Anything not REAL says so.
 */
export function CapabilityBadge({ state, t }: { state: CapabilityState; t: Translator }) {
  const style = STATE_STYLES[state];

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold tracking-wide uppercase"
      style={{ borderColor: style.border, color: style.text }}
    >
      <span aria-hidden="true">{style.glyph}</span>
      {t(stateLabelKey(state) as MessageKey)}
    </span>
  );
}

const STATE_STYLES: Record<CapabilityState, { border: string; text: string; glyph: string }> = {
  REAL: { border: 'var(--color-positive)', text: 'var(--color-positive)', glyph: '✓' },
  DEMO: { border: 'var(--color-info)', text: 'var(--color-info)', glyph: '◑' },
  MOCK: { border: 'var(--color-critical)', text: 'var(--color-critical)', glyph: '✕' },
  REQUIRES_CONFIGURATION: {
    border: 'var(--color-caution)',
    text: 'var(--color-caution)',
    glyph: '⚙',
  },
};

/**
 * The marker attached to demo content wherever it appears.
 *
 * Demo rows are registered, excluded from every statistic, barred from
 * generating notifications, and expire — but a user should also be able to see
 * at a glance that what they are looking at is not real.
 */
export function DemoMarker({ t }: { t: Translator }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-bold tracking-widest uppercase"
      style={{ backgroundColor: 'var(--color-info)', color: 'var(--surface-raised)' }}
      title={t('demo.explanation')}
    >
      {t('demo.badge')}
    </span>
  );
}
