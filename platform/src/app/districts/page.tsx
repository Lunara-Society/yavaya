import type { Metadata } from 'next';
import { districtList } from '@/config/districts';
import { AppShell } from '@/ui/components/app-shell';
import { DistrictTile } from '@/ui/components/district-tile';
import { shellContext } from '@/ui/shell-context';

export const metadata: Metadata = { title: 'Districts' };

export default async function DistrictsPage() {
  const { t, language, theme, member } = await shellContext();

  const byPhase = new Map<number, typeof districtList>();
  for (const district of districtList) {
    byPhase.set(district.phase, [...(byPhase.get(district.phase) ?? []), district]);
  }

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <h1 className="text-2xl font-semibold tracking-tight">{t('districts.title')}</h1>
      <p className="mt-1 text-[var(--text-secondary)]">{t('districts.subtitle')}</p>

      {[...byPhase.entries()]
        .sort(([a], [b]) => a - b)
        .map(([phase, districts]) => (
          <section key={phase} className="mt-8">
            <h2 className="text-2xs font-semibold tracking-[0.16em] text-[var(--text-muted)] uppercase">
              {t('district.phase', { phase })}
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {districts.map((district) => (
                <li key={district.key}>
                  <DistrictTile district={district} t={t} />
                </li>
              ))}
            </ul>
          </section>
        ))}
    </AppShell>
  );
}
