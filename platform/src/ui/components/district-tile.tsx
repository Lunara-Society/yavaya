import Link from 'next/link';
import type { DistrictDefinition } from '@/config/districts';
import type { MessageKey, Translator } from '@/i18n';

/**
 * A district entry point.
 *
 * The tile carries its district's colour world via `data-district`, so each
 * one already reads as a different place before its interior exists.
 *
 * A district that is not built is not a link. Showing a planned district is
 * honest; letting someone tap into an empty room is not.
 */
export function DistrictTile({
  district,
  t,
}: {
  district: DistrictDefinition;
  t: Translator;
}) {
  const available = district.status === 'available';
  const statusKey = `district.status.${district.status}` as MessageKey;

  const body = (
    <div
      data-district={district.key}
      className="surface-card flex h-full flex-col gap-2 p-4"
      style={{ borderLeft: '3px solid var(--accent)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight">{t(district.nameKey as MessageKey)}</h3>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold tracking-wide uppercase"
          style={
            available
              ? { backgroundColor: 'var(--accent-soft)', color: 'var(--accent-strong)' }
              : { border: '1px solid var(--surface-border-strong)', color: 'var(--text-muted)' }
          }
        >
          {t(statusKey)}
        </span>
      </div>

      <p className="text-sm text-[var(--text-secondary)]">{t(district.taglineKey as MessageKey)}</p>

      <p className="mt-auto pt-2 text-2xs text-[var(--text-muted)]">
        {t('district.phase', { phase: district.phase })}
        {available ? '' : ` · ${t('district.status.planned_note')}`}
      </p>
    </div>
  );

  if (!available) {
    return (
      <div aria-disabled="true" className="h-full opacity-80">
        {body}
      </div>
    );
  }

  return (
    <Link href={`/${district.slug}`} className="block h-full">
      {body}
    </Link>
  );
}
