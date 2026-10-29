import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { ANIMALS_RULES, MEDIA_RULES } from '@/config/business-rules';
import { SPECIES } from '@/config/animals';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { PlacePicker } from '@/ui/components/place-picker';
import { placePickerLabels } from '@/ui/components/place-labels';
import { RoxiPrefill } from '@/ui/roxi/prefill';
import { KeepTyped } from '@/ui/components/keep-typed';
import { signInPath } from '@/server/auth/sign-in-path';
import { ImageLink } from '@/ui/components/image-link';
import { imageLinkLabels } from '@/ui/components/image-link-labels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

export default async function NewLostFoundPage({ searchParams }: { searchParams: Promise<{ kind?: string; error?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(await signInPath());
  const kind = query.kind === 'found' ? 'found' : 'lost';
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="animals" tone="animals">
      <div className="wrap cm-column" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href="/animals/lost">← {t('animals.lost.title')}</Link>
        </p>
        <h1 className="h-md">{t(kind === 'lost' ? 'animals.lost.post_lost' : 'animals.lost.post_found')}</h1>
        <p className="muted">{t(kind === 'lost' ? 'animals.lost.form_lead_lost' : 'animals.lost.form_lead_found')}</p>
        {error ? (
          <p className="mk-error">
            {t(error as MessageKey, { min: ANIMALS_RULES.lostMinPhotos, max: ANIMALS_RULES.lostMaxPhotos, limit: ANIMALS_RULES.lostMaxOpenPerMember, maxMegabytes: MEDIA_RULES.maxUploadBytes / 1024 / 1024 })}
          </p>
        ) : null}
        <form action="/api/animals/lost" method="post" encType="multipart/form-data" className="mk-form" style={{ marginTop: 18 }}>
          <RoxiPrefill form={kind === 'lost' ? 'lost_pet' : 'found_pet'} notice={t('roxi.prefill.notice')} />
          <KeepTyped form={kind === 'lost' ? 'lost_pet' : 'found_pet'} />
          <input type="hidden" name="kind" value={kind} />
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
          {kind === 'lost' ? (
            <label>
              {t('animals.lost.name')}
              <input name="name" maxLength={ANIMALS_RULES.nameMaxLength} />
            </label>
          ) : null}
          <label>
            {t('animals.lost.description')}
            <span className="hint">{t(kind === 'lost' ? 'animals.lost.description_hint_lost' : 'animals.lost.description_hint_found')}</span>
            <textarea name="description" required minLength={ANIMALS_RULES.lostDescriptionMinLength} maxLength={ANIMALS_RULES.lostDescriptionMaxLength} />
          </label>
          <label>
            {t(kind === 'lost' ? 'animals.lost.seen_on_lost' : 'animals.lost.seen_on_found')}
            <input name="seenOn" type="date" required max={today} defaultValue={today} />
          </label>
          <label>
            {t('animals.form.location')}
            <PlacePicker name="locationId" labels={placePickerLabels(t)} required />
          </label>
          <label>
            {t('services.provider.whatsapp')}
            <span className="hint">{t('animals.lost.whatsapp_hint')}</span>
            <input name="whatsapp" required inputMode="tel" placeholder="+505 8888 8888" />
          </label>
          <label>
            {t('animals.form.photos', { min: ANIMALS_RULES.lostMinPhotos, max: ANIMALS_RULES.lostMaxPhotos })}
            <input name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple required />
          </label>
          <ImageLink labels={imageLinkLabels(t)} max={ANIMALS_RULES.lostMaxPhotos} />
          <p className="an-warning">{t('animals.lost.ransom_warning')}</p>
          <button className="btn btn-gold" type="submit">
            {t('animals.lost.submit')}
          </button>
        </form>
      </div>
    </SiteShell>
  );
}
