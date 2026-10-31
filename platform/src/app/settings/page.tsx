import type { Metadata } from 'next';
import { preferenceDefault } from '@/server/domains/notifications/service';
import Link from 'next/link';
import { LOCATION_PRIVACY } from '@/config/business-rules';
import { AppShell } from '@/ui/components/app-shell';
import { SegmentedControl } from '@/ui/components/segmented-control';
import { CapabilityBadge } from '@/ui/components/capability-badge';
import { shellContext } from '@/ui/shell-context';
import type { MessageKey } from '@/i18n';
import { db } from '@/server/db/client';
import { currentSession } from '@/server/auth/context';
import { activeSessions, describeDevice } from '@/server/auth/session';
import { twoStepAvailable, twoStepStatus } from '@/server/domains/identity/two-step';
import { nameChangeQuote } from '@/server/domains/identity/display-name';
import { getBalance } from '@/server/domains/tokens/service';
import { ChangeNameForm, ChangePasswordForm, SignOutOthersForm } from './security-forms';
import {
  readLocationPrecision,
  readNotificationPreferences,
  setLanguageAction,
  setLocationPrecisionAction,
  setNotificationPreferenceAction,
  setThemeAction,
  signOutAction,
} from './actions';
import { loginHref } from '@/server/auth/return-path';

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
  const { t, locale, language, theme, member, userId } = await shellContext();

  const [notificationPrefs, locationPrecision] = userId
    ? await Promise.all([readNotificationPreferences(userId), readLocationPrecision(userId)])
    : [[], LOCATION_PRIVACY.defaultLevel];

  const session = userId ? await currentSession() : null;
  const [twoStep, devices] = session
    ? await Promise.all([twoStepStatus(db(), session.user.userId), activeSessions(db(), session.user.userId)])
    : [null, []];
  // What the next name change costs, and the balance to pay it; no form when a paid change is switched off.
  const nameQuote = session
    ? await Promise.all([nameChangeQuote(db(), session.user.userId), getBalance(db(), session.user.userId)]).then(([quote, balance]) =>
        quote.freeLeft > 0 || quote.cost !== null ? { ...quote, balance } : null,
      )
    : null;
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  const preferenceFor = (category: string, channel: string): boolean =>
    notificationPrefs.find((row) => row.category === category && row.channel === channel)?.enabled ??
    preferenceDefault(category, channel);

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
            {nameQuote ? (
              <ChangeNameForm
                current={member.displayName}
                labels={{
                  label: t('settings.name.label'),
                  note:
                    nameQuote.freeLeft > 0
                      ? t('settings.name.free')
                      : t('settings.name.paid', { cost: nameQuote.cost ?? 0, balance: nameQuote.balance }),
                  submit: nameQuote.freeLeft > 0 ? t('settings.name.submit') : t('settings.name.submit_paid', { cost: nameQuote.cost ?? 0 }),
                  hint: t('settings.name.hint'),
                }}
              />
            ) : null}
            <form action={signOutAction} className="mt-4">
              <button type="submit" className="min-h-touch w-full rounded-xl border px-4 font-medium">
                {t('auth.sign_out')}
              </button>
            </form>
          </div>
        ) : (
          <SignInPrompt t={t} />
        )}
        {member && twoStep && (twoStep.enabled || twoStepAvailable()) ? (
          <div id="two-step" className="surface-card mt-3 p-4">
            <h3 className="font-semibold">{t('two_step.title')}</h3>
            {twoStep.enabled ? (
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                {t('two_step.settings.on', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(twoStep.enabledAt) })}{' '}
                {t('two_step.settings.recovery_left', { count: twoStep.recoveryLeft })}
              </p>
            ) : (
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{t('two_step.settings.off_lead')}</p>
            )}
            <Link
              href="/settings/dos-pasos"
              className="mt-3 flex min-h-touch items-center justify-center rounded-xl px-4 text-sm font-medium"
              style={twoStep.enabled ? { border: '1px solid var(--line)' } : { backgroundColor: 'var(--accent)', color: 'var(--accent-contrast-text)' }}
            >
              {twoStep.enabled ? t('two_step.settings.manage') : t('two_step.settings.turn_on')}
            </Link>
          </div>
        ) : null}
        {member ? (
          <div className="surface-card mt-3 p-4">
            <h3 className="mb-3 font-semibold">{t('settings.password.title')}</h3>
            <ChangePasswordForm labels={{ current: t('settings.password.current'), next: t('settings.password.new'), submit: t('settings.password.submit') }} />
            <p className="mt-3 text-xs text-[var(--text-secondary)]">{t('settings.password.google_hint')}</p>
          </div>
        ) : null}
        {member && session ? (
          <div className="surface-card mt-3 p-4">
            <h3 className="font-semibold">{t('settings.sessions.title')}</h3>
            <ul className="mt-3 space-y-2">
              {devices.map((device) => {
                const named = describeDevice(device.userAgent);
                const name = [named.browser, named.system].filter(Boolean).join(' · ') || t('settings.sessions.unknown_device');
                return (
                  <li key={device.id} className="rounded-lg border px-3 py-2 text-sm">
                    <span className="font-medium">{name}</span>
                    {device.id === session.sessionId ? <span className="ml-2 text-xs text-[var(--accent)]">{t('settings.sessions.this_device')}</span> : null}
                    <span className="block text-xs text-[var(--text-secondary)]">{t('settings.sessions.last_active', { when: when.format(device.lastUsedAt) })}</span>
                  </li>
                );
              })}
            </ul>
            {devices.length > 1 ? <SignOutOthersForm label={t('settings.sessions.sign_out_others')} /> : null}
          </div>
        ) : null}
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
          href={loginHref('/settings')}
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
// Only categories something actually sends. Orders, tokens and nearby
// activity send nothing yet, so they have no switch: a toggle for news that
// never comes is a control that leads nowhere.
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
    category: 'services',
    channel: 'in_app',
    labelKey: 'settings.notify.services',
    detailKey: 'settings.notify.services_detail',
  },
  {
    category: 'work',
    channel: 'in_app',
    labelKey: 'settings.notify.work',
    detailKey: 'settings.notify.work_detail',
  },
  {
    category: 'sanctuary',
    channel: 'in_app',
    labelKey: 'settings.notify.sanctuary',
    detailKey: 'settings.notify.sanctuary_detail',
  },
  {
    category: 'daily',
    channel: 'in_app',
    labelKey: 'settings.notify.daily',
    detailKey: 'settings.notify.daily_detail',
  },
  {
    category: 'animals',
    channel: 'in_app',
    labelKey: 'settings.notify.animals',
    detailKey: 'settings.notify.animals_detail',
  },
  {
    category: 'yavayago',
    channel: 'in_app',
    labelKey: 'settings.notify.yavayago',
    detailKey: 'settings.notify.yavayago_detail',
  },
  {
    category: 'moderation',
    channel: 'in_app',
    labelKey: 'settings.notify.moderation',
    detailKey: 'settings.notify.moderation_detail',
  },
  {
    category: 'digest',
    channel: 'email',
    labelKey: 'settings.notify.digest',
    detailKey: 'settings.notify.digest_detail',
  },
  {
    category: 'marketing',
    channel: 'email',
    labelKey: 'settings.notify.marketing',
    detailKey: 'settings.notify.marketing_detail',
  },
];
