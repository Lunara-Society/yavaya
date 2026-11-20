import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { MIRADOR_RULES } from '@/config/business-rules';
import { signInPath } from '@/server/auth/sign-in-path';
import { miradorOpen } from '@/server/domains/mirador/access';
import { AID_KINDS, myOrganisation, verifiedHelperRoles } from '@/server/domains/aid/service';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { PlacePicker } from '@/ui/components/place-picker';
import { placePickerLabels } from '@/ui/components/place-labels';
import { organisationAction } from '../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/**
 * For food banks, soup kitchens and shelters (docs/mirador/README.md,
 * "Offers"): apply to be checked, so the organisation can ask for food given
 * "para comedores" and ask the neighbourhood for help. A reviewer approves
 * each one, as Santuario does churches and Animales does rescuers.
 */
export default async function OrganisationPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const query = await searchParams;
  const { c, t, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(await signInPath());
  if (!(await miradorOpen(db(), userId))) notFound();
  const [org, roles] = await Promise.all([myOrganisation(db(), userId), verifiedHelperRoles(db(), userId)]);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const limits = { min: MIRADOR_RULES.organisationAboutMinLength, max: MIRADOR_RULES.organisationAboutMaxLength };
  const others = roles.filter((role) => role.kind !== 'organisation');
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <div className="mu-page">
        <div className="wrap">
          <p>
            <Link href="/mirador/estudio">← {t('mirador.studio.title')}</Link>
          </p>
          <h1>{t('aid.title')}</h1>
          <p className="muted">{t('aid.lead')}</p>
          {others.length ? <p className="mu-note">{t('aid.already', { name: others.map((role) => role.name).join(', ') })}</p> : null}
          {query.saved ? (
            <p className="mu-status" role="status">
              {t('aid.saved')}
            </p>
          ) : null}
          {error ? (
            <p className="mu-error" role="alert">
              {t(error as MessageKey, limits)}
            </p>
          ) : null}
          {org ? (
            <p className="ms-badge" data-tone={org.status === 'approved' ? 'ok' : org.status === 'pending' ? undefined : 'bad'}>
              {t(`aid.status.${org.status}` as MessageKey)}
            </p>
          ) : null}
          {org?.reviewNote && org.status !== 'approved' ? <p className="muted">{org.reviewNote}</p> : null}
          {org?.status === 'suspended' ? null : (
            <form action={organisationAction} className="mu-form">
              <label className="mu-field">
                {t('aid.kind')}
                <select name="kind" required defaultValue={org?.kind ?? ''}>
                  <option value="" disabled>
                    {t('mercadito.form.choose')}
                  </option>
                  {AID_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`aid.kind.${kind}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mu-field">
                {t('aid.name')}
                <input name="name" required minLength={MIRADOR_RULES.organisationNameMinLength} maxLength={MIRADOR_RULES.organisationNameMaxLength} defaultValue={org?.name ?? ''} />
              </label>
              <label className="mu-field">
                {t('aid.about')}
                <textarea name="about" required rows={4} minLength={MIRADOR_RULES.organisationAboutMinLength} maxLength={MIRADOR_RULES.organisationAboutMaxLength} defaultValue={org?.about ?? ''} />
                <small>{t('aid.about_hint', limits)}</small>
              </label>
              <label className="mu-field">
                {t('aid.registration')}
                <input name="registration" maxLength={MIRADOR_RULES.organisationRegistrationMaxLength} defaultValue={org?.registration ?? ''} />
                <small>{t('aid.registration_hint')}</small>
              </label>
              <div className="mu-field">
                <span>{t('aid.place')}</span>
                <PlacePicker name="locationId" labels={placePickerLabels(t)} initial={org?.locationId} required />
              </div>
              <label className="mu-field">
                {t('aid.whatsapp')}
                <input name="whatsapp" required inputMode="tel" placeholder="+505 8888 8888" defaultValue={org?.whatsappE164 ?? ''} />
                <small>{t('aid.whatsapp_hint')}</small>
              </label>
              <p className="mu-note">{t('aid.review_note')}</p>
              <button className="mf-cta" type="submit">
                {org ? t('aid.save') : t('aid.submit')}
              </button>
            </form>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
