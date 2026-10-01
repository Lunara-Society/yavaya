import type { Metadata } from 'next';
import Link from 'next/link';
import { LOCATION_PRIVACY } from '@/config/business-rules';
import { AppShell } from '@/ui/components/app-shell';
import { SegmentedControl } from '@/ui/components/segmented-control';
import { CapabilityBadge } from '@/ui/components/capability-badge';
import { shellContext } from '@/ui/shell-context';
import type { MessageKey } from '@/i18n';
import {
  readLocationPrecision,
  readNotificationPreferences,
  setLanguageAction,
  setLocationPrecisionAction,
  setNotificationPreferenceAction,
  setThemeAction,
  signOutAction,
} from './actions';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

/**
 * Settings.
 *
 * Language and appearance work for everyone, signed in or not. Notification
 * and location preferences need somewhere to store them, so they ask for
 * sign-in rather than pretending to save.
 */
export default async function SettingsPage() {
  const { t, language, theme, member, userId } = await shellContext();

  const [notificationPrefs, locationPrecision] = userId
    ? await Promise.all([readNotificationPreferences(userId), readLocationPrecision(userId)])
    : [[], LOCATION_PRIVACY.defaultLevel];

  const preferenceFor = (category: string, channel: string): boolean =>
    notificationPrefs.find((row) => row.category === category && row.channel === channel)?.enabled ??
    // Newer categories are on unless switched off; the delivery side agrees.
    ['community', 'mercadito', 'sanctuary'].includes(category);

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
      <p className="mt-1 text-[var(--text-secondary)]">{t('settings.subtitle')}</p>

      {/* --- Language ------------------------------------------------------ */}
      <Section id="language" title={t('common.language')} state="REAL" t={t}>
        <SegmentedControl
          action={setLanguageAction}
          name="language"
          legend={t('common.language')}
          current={language}
          options={[
            { value: 'auto', label: t('common.language.auto') },
            { value: 'es', label: t('common.language.es') },
            { value: 'en', label: t('common.language.en') },
          ]}
        />
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {t('common.language.auto_hint')}
        </p>
      </Section>

      {/* --- Appearance ---------------------------------------------------- */}
      <Section id="appearance" title={t('common.theme')} state="REAL" t={t}>
        <SegmentedControl
          action={setThemeAction}
          name="theme"
          legend={t('common.theme')}
          current={theme}
          options={[
            { value: 'system', label: t('common.theme.system') },
            { value: 'light', label: t('common.theme.light') },
            { value: 'dark', label: t('common.theme.dark') },
          ]}
        />
        <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('common.theme.system_hint')}</p>
      </Section>

      {/* --- Notifications -------------------------------------------------- */}
      <Section id="notifications" title={t('settings.notifications')} state="REAL" t={t}>
        {member ? (
          <ul className="divide-y rounded-xl border">
            {NOTIFICATION_ROWS.map((row) => {
              const enabled = preferenceFor(row.category, row.channel);
              return (
                <li
                  key={`${row.category}:${row.channel}`}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">{t(row.labelKey)}</p>
                    <p className="text-sm text-[var(--text-secondary)]">{t(row.detailKey)}</p>
                  </div>
                  <form action={setNotificationPreferenceAction} className="shrink-0">
                    <input type="hidden" name="category" value={row.category} />
                    <input type="hidden" name="channel" value={row.channel} />
                    <input type="hidden" name="enabled" value={enabled ? 'false' : 'true'} />
                    <button
                      type="submit"
                      aria-pressed={enabled}
                      className="min-h-touch rounded-xl border px-4 text-sm font-medium"
                      style={
                        enabled
                          ? { borderColor: 'var(--accent)', color: 'var(--accent)' }
                          : { color: 'var(--text-muted)' }
                      }
                    >
                      {enabled ? t('common.on') : t('common.off')}
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <SignInPrompt t={t} />
        )}
      </Section>

      {/* --- Location ------------------------------------------------------- */}
      <Section id="location" title={t('settings.location')} state="REAL" t={t}>
        <p className="mb-3 text-sm text-[var(--text-secondary)]">{t('settings.location.explain')}</p>
        {member ? (
          <>
            <SegmentedControl
              action={setLocationPrecisionAction}
              name="precision"
              legend={t('settings.location')}
              current={locationPrecision}
              options={LOCATION_PRIVACY.levels.map((level) => ({
                value: level,
                label: t(`settings.location.${level}` as MessageKey),
              }))}
            />
            <p className="mt-2 text-sm text-[var(--text-secondary)]">
              {t('settings.location.gps_note')}
            </p>
          </>
        ) : (
          <SignInPrompt t={t} />
        )}
      </Section>

      {/* --- Account and security -------------------------------------------- */}
      <Section id="security" title={t('settings.security')} state="REAL" t={t}>
        {member ? (
          <div className="surface-card p-4">
            <p className="font-mono text-sm tracking-wider text-[var(--text-secondary)]">
              {member.yayId}
            </p>
            <p className="mt-0.5 font-medium">{member.displayName}</p>
            <p className="mt-2 text-sm text-[var(--text-secondary)]">{t('auth.yay_id_explained')}</p>
            <form action={signOutAction} className="mt-4">
              <button type="submit" className="min-h-touch w-full rounded-xl border px-4 font-medium">
                {t('auth.sign_out')}
              </button>
            </form>
          </div>
        ) : (
          <SignInPrompt t={t} />
        )}
      </Section>

      <p className="mt-8 text-sm text-[var(--text-secondary)]">
        {t('settings.status_pointer')}{' '}
        <Link href="/status" className="font-medium underline underline-offset-4">
          {t('status.title')}
        </Link>
      </p>
    </AppShell>
  );
}

function Section({
  id,
  title,
  state,
  t,
  children,
}: {
  id: string;
  title: string;
  state: 'REAL' | 'DEMO' | 'MOCK' | 'REQUIRES_CONFIGURATION';
  t: Awaited<ReturnType<typeof shellContext>>['t'];
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-8 scroll-mt-20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <CapabilityBadge state={state} t={t} />
      </div>
      {children}
    </section>
  );
}

function SignInPrompt({ t }: { t: Awaited<ReturnType<typeof shellContext>>['t'] }) {
  return (
    <div className="rounded-xl border px-4 py-4">
      <p className="text-sm text-[var(--text-secondary)]">{t('settings.sign_in_required')}</p>
      <div className="mt-3 flex gap-2">
        <Link
          href="/login"
          className="flex min-h-touch flex-1 items-center justify-center rounded-xl px-4 text-sm font-medium"
          style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast-text)' }}
        >
          {t('auth.submit_login')}
        </Link>
        <Link
          href="/register"
          className="flex min-h-touch flex-1 items-center justify-center rounded-xl border px-4 text-sm font-medium"
        >
          {t('auth.submit_register')}
        </Link>
      </div>
    </div>
  );
}

/**
 * The notification controls offered today.
 *
 * Only in-app and email are listed: push and SMS have no delivery integration,
 * and offering a switch that cannot deliver would be a promise Yavaya can't
 * keep. They appear here once their capability is REAL.
 */
const NOTIFICATION_ROWS: Array<{
  category: string;
  channel: string;
  labelKey: MessageKey;
  detailKey: MessageKey;
}> = [
  {
    category: 'account',
    channel: 'in_app',
    labelKey: 'settings.notify.account',
    detailKey: 'settings.notify.account_detail',
  },
  {
    category: 'community',
    channel: 'in_app',
    labelKey: 'settings.notify.community',
    detailKey: 'settings.notify.community_detail',
  },
  {
    category: 'mercadito',
    channel: 'in_app',
    labelKey: 'settings.notify.mercadito',
    detailKey: 'settings.notify.mercadito_detail',
  },
  {
    category: 'sanctuary',
    channel: 'in_app',
    labelKey: 'settings.notify.sanctuary',
    detailKey: 'settings.notify.sanctuary_detail',
  },
  {
    category: 'orders',
    channel: 'in_app',
    labelKey: 'settings.notify.orders',
    detailKey: 'settings.notify.orders_detail',
  },
  {
    category: 'moderation',
    channel: 'in_app',
    labelKey: 'settings.notify.moderation',
    detailKey: 'settings.notify.moderation_detail',
  },
  {
    category: 'tokens',
    channel: 'in_app',
    labelKey: 'settings.notify.tokens',
    detailKey: 'settings.notify.tokens_detail',
  },
  {
    category: 'live_activity',
    channel: 'in_app',
    labelKey: 'settings.notify.live_activity',
    detailKey: 'settings.notify.live_activity_detail',
  },
  {
    category: 'marketing',
    channel: 'email',
    labelKey: 'settings.notify.marketing',
    detailKey: 'settings.notify.marketing_detail',
  },
];
