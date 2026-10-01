import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { ANIMALS_RULES, MEDIA_RULES } from '@/config/business-rules';
import { RESCUER_KINDS, SEXES, SIZES, SPECIES } from '@/config/animals';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { AnimalCard } from '@/ui/animals/parts';
import { placeOptions } from '@/server/domains/mercadito/service';
import { getRescuer, rescuerListings } from '@/server/domains/animals/service';
import { rescuerAction } from '../actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('animals.rescuer.title'), robots: { index: false } };
}

/**
 * For rescuers: apply to be one, and once approved, publish animals and see
 * who wants to adopt them. A reviewer approves every rescuer, because the
 * easiest way to sell puppies here would be to call yourself a rescuer.
 */
export default async function RescuerPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const [rescuer, countries] = await Promise.all([getRescuer(db(), userId), placeOptions(db(), locale)]);
  const listings = rescuer?.status === 'approved' ? await rescuerListings(db(), { userId, locale }) : [];
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const errorParams = {
    min: ANIMALS_RULES.minPhotos,
    max: ANIMALS_RULES.maxPhotos,
    limit: ANIMALS_RULES.maxActiveListingsPerRescuer,
    maxMegabytes: MEDIA_RULES.maxUploadBytes / 1024 / 1024,
  };
  const PlaceSelect = ({ value }: { value?: string }) => (
    <select name="locationId" required defaultValue={value ?? ''}>
      <option value="" disabled>
        {t('mercadito.form.choose')}
      </option>
      {countries.map((country) => (
        <optgroup key={country.code} label={country.name}>
          {country.places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="animals" tone="animals">
      <div className="wrap cm-column" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href="/animals">← {t('animals.back')}</Link>
        </p>
        <h1 className="h-md">{t('animals.rescuer.title')}</h1>
        <p className="lead">{t('animals.rescuer.lead')}</p>
        {query.saved ? <p className="mk-banner" role="status">{t('animals.rescuer.saved')}</p> : null}
        {error ? <p className="mk-error">{t(error as MessageKey, errorParams)}</p> : null}
        {rescuer ? (
          <div className={rescuer.status === 'approved' ? 'an-result pass' : 'an-result'} role="status">
            <strong>{t(`animals.rescuer.status.${rescuer.status}` as MessageKey)}</strong>
            {rescuer.reviewNote && rescuer.status !== 'approved' ? <p className="mb0">{rescuer.reviewNote}</p> : null}
          </div>
        ) : null}

        {rescuer?.status === 'approved' ? (
          <>
            <section className="sc-section">
              <h2 className="sc-h">{t('animals.rescuer.my_animals')}</h2>
              {listings.length === 0 ? (
                <p className="muted">{t('animals.rescuer.no_animals')}</p>
              ) : (
                <div className="an-grid">
                  {listings.map((animal) => (
                    <AnimalCard key={animal.id} animal={animal} t={t} footer={animal.pending > 0 ? t('animals.rescuer.pending_applications', { count: animal.pending }) : undefined} />
                  ))}
                </div>
              )}
            </section>
            <section id="publish" className="sc-section">
              <h2 className="sc-h">{t('animals.rescuer.publish')}</h2>
              <p className="muted">{t('animals.rescuer.publish_lead')}</p>
              <form action="/api/animals/listings" method="post" encType="multipart/form-data" className="mk-form">
                <label>
                  {t('animals.form.species')}
                  <select name="species" required defaultValue="">
                    <option value="" disabled>
                      {t('mercadito.form.choose')}
                    </option>
                    {SPECIES.map((value) => (
                      <option key={value} value={value}>
                        {t(`animals.species.${value}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('animals.form.name')}
                  <input name="name" required maxLength={ANIMALS_RULES.nameMaxLength} />
                </label>
                <label>
                  {t('animals.form.sex')}
                  <select name="sex" required defaultValue="">
                    <option value="" disabled>
                      {t('mercadito.form.choose')}
                    </option>
                    {SEXES.map((value) => (
                      <option key={value} value={value}>
                        {t(`animals.sex.${value}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('animals.form.size')}
                  <select name="size" required defaultValue="">
                    <option value="" disabled>
                      {t('mercadito.form.choose')}
                    </option>
                    {SIZES.map((value) => (
                      <option key={value} value={value}>
                        {t(`animals.size.${value}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('animals.form.age')}
                  <span className="hint">{t('animals.form.age_hint')}</span>
                  <input name="ageMonths" type="number" inputMode="numeric" min={0} max={360} />
                </label>
                <fieldset className="sv-checks">
                  <legend>{t('animals.form.health')}</legend>
                  <label>
                    <input type="checkbox" name="sterilised" /> {t('animals.health.sterilised')}
                  </label>
                  <label>
                    <input type="checkbox" name="vaccinated" /> {t('animals.health.vaccinated')}
                  </label>
                  <label>
                    <input type="checkbox" name="dewormed" /> {t('animals.health.dewormed')}
                  </label>
                </fieldset>
                <label>
                  {t('animals.form.description')}
                  <span className="hint">{t('animals.form.description_hint')}</span>
                  <textarea name="description" required minLength={ANIMALS_RULES.descriptionMinLength} maxLength={ANIMALS_RULES.descriptionMaxLength} />
                </label>
                <label>
                  {t('animals.form.temperament')}
                  <input name="temperament" maxLength={ANIMALS_RULES.notesMaxLength} />
                </label>
                <label>
                  {t('animals.form.health_notes')}
                  <input name="healthNotes" maxLength={ANIMALS_RULES.notesMaxLength} />
                </label>
                <label>
                  {t('animals.form.location')}
                  <PlaceSelect value={rescuer.locationId} />
                </label>
                <label>
                  {t('animals.form.photos', { min: ANIMALS_RULES.minPhotos, max: ANIMALS_RULES.maxPhotos })}
                  <input name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple required />
                </label>
                <button className="btn btn-gold" type="submit">
                  {t('animals.rescuer.publish_submit')}
                </button>
              </form>
            </section>
          </>
        ) : null}

        <section className="sc-section">
          <h2 className="sc-h">{rescuer ? t('animals.rescuer.profile') : t('animals.rescuer.apply')}</h2>
          {rescuer?.status === 'suspended' ? null : (
            <form action={rescuerAction} className="mk-form">
              <label>
                {t('animals.rescuer.kind')}
                <select name="kind" required defaultValue={rescuer?.kind ?? ''}>
                  <option value="" disabled>
                    {t('mercadito.form.choose')}
                  </option>
                  {RESCUER_KINDS.map((value) => (
                    <option key={value} value={value}>
                      {t(`animals.rescuer.kind.${value}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('animals.rescuer.name')}
                <input name="name" required minLength={ANIMALS_RULES.rescuerNameMinLength} maxLength={ANIMALS_RULES.rescuerNameMaxLength} defaultValue={rescuer?.name ?? ''} />
              </label>
              <label>
                {t('animals.rescuer.about')}
                <span className="hint">{t('animals.rescuer.about_hint')}</span>
                <textarea name="about" required minLength={ANIMALS_RULES.rescuerAboutMinLength} maxLength={ANIMALS_RULES.rescuerAboutMaxLength} defaultValue={rescuer?.about ?? ''} />
              </label>
              <label>
                {t('animals.form.location')}
                <PlaceSelect value={rescuer?.locationId} />
              </label>
              <label>
                {t('services.provider.whatsapp')}
                <span className="hint">{t('animals.rescuer.whatsapp_hint')}</span>
                <input name="whatsapp" required inputMode="tel" placeholder="+505 8888 8888" defaultValue={rescuer?.whatsappE164 ?? ''} />
              </label>
              <p className="muted">{t('animals.rescuer.review_note')}</p>
              <button className="btn btn-gold" type="submit">
                {rescuer ? t('services.provider.save') : t('animals.rescuer.apply_submit')}
              </button>
            </form>
          )}
        </section>
      </div>
    </SiteShell>
  );
}
