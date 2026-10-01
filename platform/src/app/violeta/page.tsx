import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { shellContext } from '@/ui/shell-context';
import { MEMBER_PLEDGES, PROFESSIONAL_PLEDGES, PROFESSIONS } from '@/config/safe-space';
import { SAFE_SPACE_RULES } from '@/config/business-rules';
import { getMember, professionalEligible, safeSpaceAvailable } from '@/server/domains/safe-space/service';
import { ErrorNote, VioletaShell } from '@/ui/violeta/parts';
import { VIOLETA_METADATA } from './meta';
import { joinAction } from './actions';

export const dynamic = 'force-dynamic';
export const metadata = VIOLETA_METADATA;

const PROMISES = ['name', 'sealed', 'private', 'silent', 'erase', 'exit'] as const;

/** The door: what this space is, what it promises and what it cannot. */
export default async function VioletaDoor({ searchParams }: { searchParams: Promise<{ error?: string; left?: string }> }) {
  const query = await searchParams;
  const { t, userId } = await shellContext();
  const available = safeSpaceAvailable();
  const member = available && userId ? await getMember(db(), userId) : null;
  if (member?.status === 'active' && !query.error) redirect('/violeta/sala');
  const canBeProfessional = available && userId && !member ? await professionalEligible(db(), userId) : false;

  return (
    <VioletaShell t={t} active={null}>
      <div className="vt-door">
        <p className="eyebrow">{t('violeta.door.eyebrow')}</p>
        <h1 className="h-md">{t('violeta.door.title')}</h1>
        <p className="lead">{t('violeta.door.lead')}</p>
        {query.left ? <p className="mk-banner" role="status">{t('violeta.door.left')}</p> : null}
        <ErrorNote t={t} error={query.error} />

        <p className="vt-danger">{t('violeta.door.danger')}</p>

        <h2 className="vt-h">{t('violeta.door.promises_title')}</h2>
        <ul className="vt-list">
          {PROMISES.map((key) => (
            <li key={key}>
              <strong>{t(`violeta.promise.${key}.title` as MessageKey)}</strong> {t(`violeta.promise.${key}.text` as MessageKey, { days: SAFE_SPACE_RULES.roomRetentionDays, private_days: SAFE_SPACE_RULES.threadRetentionDays })}
            </li>
          ))}
        </ul>

        <h2 className="vt-h">{t('violeta.door.limits_title')}</h2>
        <ul className="vt-list muted">
          <li>{t('violeta.limit.account')}</li>
          <li>{t('violeta.limit.encryption')}</li>
          <li>{t('violeta.limit.women')}</li>
          <li>{t('violeta.limit.not_emergency')}</li>
          <li>{t('violeta.limit.device')}</li>
        </ul>

        {!available ? (
          <p className="mk-error">{t('violeta.error.unavailable')}</p>
        ) : member?.status === 'banned' ? (
          query.error ? null : <p className="mk-error">{t('violeta.error.banned')}</p>
        ) : !userId ? (
          <p className="btn-row">
            <Link className="btn btn-gold" href="/login?next=/violeta">
              {t('violeta.door.sign_in')}
            </Link>
            <Link className="btn btn-line" href="/register">
              {t('violeta.door.register')}
            </Link>
          </p>
        ) : (
          <>
            <form action={joinAction} className="mk-form vt-join">
              <input type="hidden" name="kind" value="member" />
              <h2 className="vt-h">{t('violeta.join.title')}</h2>
              <fieldset className="sv-checks">
                {MEMBER_PLEDGES.map((pledge) => (
                  <label key={pledge}>
                    <input type="checkbox" name="pledge" value={pledge} required /> {t(`violeta.pledge.${pledge}` as MessageKey)}
                  </label>
                ))}
              </fieldset>
              <button className="btn btn-gold" type="submit">
                {t('violeta.join.submit')}
              </button>
            </form>

            <section className="vt-pro-door">
              <h2 className="vt-h">{t('violeta.join.pro_title')}</h2>
              {canBeProfessional ? (
                <form action={joinAction} className="mk-form">
                  <input type="hidden" name="kind" value="professional" />
                  <label>
                    {t('violeta.join.profession')}
                    <select name="profession" required defaultValue="">
                      <option value="" disabled>
                        —
                      </option>
                      {PROFESSIONS.map((p) => (
                        <option key={p} value={p}>
                          {t(`violeta.profession.${p}` as MessageKey)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <fieldset className="sv-checks">
                    {PROFESSIONAL_PLEDGES.map((pledge) => (
                      <label key={pledge}>
                        <input type="checkbox" name="pledge" value={pledge} required /> {t(`violeta.pledge.${pledge}` as MessageKey)}
                      </label>
                    ))}
                  </fieldset>
                  <button className="btn btn-line" type="submit">
                    {t('violeta.join.pro_submit')}
                  </button>
                </form>
              ) : (
                <p className="muted">
                  {t('violeta.join.pro_requirement')} <Link href="/services/provider">{t('violeta.join.pro_link')}</Link>
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </VioletaShell>
  );
}
