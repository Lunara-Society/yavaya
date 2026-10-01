import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { ANIMALS_RULES } from '@/config/business-rules';
import { COMMITMENTS, HOME_TYPES, SLEEPS, TENURES, YES_NO_NA } from '@/config/animals';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { facts } from '@/ui/animals/parts';
import { getAnimal, getCertificate } from '@/server/domains/animals/service';
import { applyAction } from '../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The adoption application. Long on purpose: a rescuer deciding where an
 * animal will live for the next fifteen years needs to know the home. Only
 * for members holding the welfare certificate.
 */
export default async function ApplyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const certificate = await getCertificate(db(), userId);
  if (!certificate) redirect(`/animals/learn?next=${id}`);
  const found = await getAnimal(db(), { listingId: id, viewerId: userId, viewerIsReviewer: false, locale });
  if (!found) notFound();
  if (found.isRescuer || found.myApplication || found.animal.status !== 'available') redirect(`/animals/${id}`);
  const { animal } = found;
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const min = ANIMALS_RULES.answerMinLength;
  const max = ANIMALS_RULES.answerMaxLength;

  const Choice = ({ name, label, options, prefix }: { name: string; label: MessageKey; options: readonly string[]; prefix: string }) => (
    <label>
      {t(label)}
      <select name={name} required defaultValue="">
        <option value="" disabled>
          {t('mercadito.form.choose')}
        </option>
        {options.map((option) => (
          <option key={option} value={option}>
            {t(`${prefix}.${option}` as MessageKey)}
          </option>
        ))}
      </select>
    </label>
  );
  const Open = ({ name, label, hint }: { name: string; label: MessageKey; hint?: MessageKey }) => (
    <label>
      {t(label)}
      {hint ? <span className="hint">{t(hint)}</span> : null}
      <textarea name={name} required minLength={min} maxLength={max} style={{ minHeight: 70 }} />
    </label>
  );

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="animals" tone="animals">
      <div className="wrap cm-column" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href={`/animals/${animal.id}`}>← {animal.name}</Link>
        </p>
        <h1 className="h-md">{t('animals.apply.title', { name: animal.name })}</h1>
        <p className="muted">{facts(t, animal)} · {animal.rescuerName}</p>
        <p>{t('animals.apply.lead')}</p>
        {error ? <p className="mk-error">{t(error as MessageKey, { min, max, limit: ANIMALS_RULES.maxOpenApplicationsPerMember })}</p> : null}

        <form action={applyAction} className="mk-form" style={{ marginTop: 18 }}>
          <input type="hidden" name="listingId" value={animal.id} />
          <h2 className="sc-h-sm">{t('animals.apply.section_home')}</h2>
          <Choice name="homeType" label="animals.apply.home_type" options={HOME_TYPES} prefix="animals.apply.home_type" />
          <Choice name="tenure" label="animals.apply.tenure" options={TENURES} prefix="animals.apply.tenure" />
          <Choice name="landlordAllows" label="animals.apply.landlord" options={YES_NO_NA} prefix="animals.answer" />
          <Choice name="fencedYard" label="animals.apply.fenced" options={YES_NO_NA} prefix="animals.answer" />

          <h2 className="sc-h-sm">{t('animals.apply.section_family')}</h2>
          <Open name="household" label="animals.apply.household" hint="animals.apply.household_hint" />
          <label>
            <span>
              <input type="checkbox" name="allAgree" required /> {t('animals.apply.all_agree')}
            </span>
          </label>
          <Open name="otherAnimals" label="animals.apply.other_animals" hint="animals.apply.other_animals_hint" />
          <Choice name="otherAnimalsSterilised" label="animals.apply.other_sterilised" options={YES_NO_NA} prefix="animals.answer" />

          <h2 className="sc-h-sm">{t('animals.apply.section_care')}</h2>
          <Open name="experience" label="animals.apply.experience" />
          <label>
            {t('animals.apply.hours_alone')}
            <input name="hoursAlone" type="number" inputMode="numeric" min={0} max={24} required />
          </label>
          <Choice name="sleepsWhere" label="animals.apply.sleeps" options={SLEEPS} prefix="animals.apply.sleeps" />
          <Open name="vetPlan" label="animals.apply.vet_plan" hint="animals.apply.vet_plan_hint" />
          <Open name="whyAdopt" label="animals.apply.why" />

          <h2 className="sc-h-sm">{t('animals.apply.section_commitments')}</h2>
          <p className="muted">{t('animals.apply.commitments_lead')}</p>
          <fieldset className="sv-checks">
            {COMMITMENTS.map((key) => (
              <label key={key}>
                <input type="checkbox" name="commitments" value={key} required /> {t(`animals.commitment.${key}` as MessageKey)}
              </label>
            ))}
          </fieldset>
          <p className="muted">{t('animals.apply.privacy')}</p>
          <button className="btn btn-gold" type="submit">
            {t('animals.apply.submit')}
          </button>
        </form>
      </div>
    </SiteShell>
  );
}
