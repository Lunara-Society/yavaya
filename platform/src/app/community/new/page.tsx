import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { COMMUNITY_RULES } from '@/config/business-rules';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { placeOptions } from '@/server/domains/mercadito/service';
import { NEIGHBOUR_KINDS } from '@/server/domains/community/service';
import { createPostAction } from '../actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('community.form.title'), robots: { index: false } };
}

const LIMITS: Record<string, { min: number; max: number }> = {
  'community.error.title': { min: COMMUNITY_RULES.titleMinLength, max: COMMUNITY_RULES.titleMaxLength },
  'community.error.body': { min: COMMUNITY_RULES.bodyMinLength, max: COMMUNITY_RULES.bodyMaxLength },
};

/** A plain form: posting works without JavaScript, on any phone. */
export default async function NewPostPage({ searchParams }: { searchParams: Promise<{ error?: string; kind?: string }> }) {
  const params = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const countries = await placeOptions(db(), locale);
  const error = params.error && /^[a-z_.]+$/.test(params.error) ? params.error : null;
  // A prayer request is written here too, but presented as the Sanctuary's.
  const prayer = params.kind === 'prayer';
  const initialKind = (NEIGHBOUR_KINDS as readonly string[]).includes(params.kind ?? '') ? params.kind : '';
  const home = prayer ? '/sanctuary/prayer' : '/community';

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current={prayer ? 'sanctuary' : 'community'} tone={prayer ? 'sanctuary' : 'community'}>
      <div className="wrap cm-column" style={{ padding: '32px var(--gutter) 56px' }}>
        <p>
          <Link href={home}>← {prayer ? t('sanctuary.prayer.back') : t('community.post.back')}</Link>
        </p>
        <h1 className="h-md">{prayer ? t('sanctuary.prayer.form_title') : t('community.form.title')}</h1>
        <p className="muted">{t('community.form.free')}</p>
        {error ? <p className="mk-error">{t(error as MessageKey, LIMITS[error] ?? {})}</p> : null}
        <form action={createPostAction} className="mk-form" style={{ marginTop: 18 }}>
          {prayer ? (
            <input type="hidden" name="kind" value="prayer" />
          ) : (
            <label>
              {t('community.form.kind')}
              <select name="kind" required defaultValue={initialKind}>
                <option value="" disabled>
                  {t('mercadito.form.choose')}
                </option>
                {NEIGHBOUR_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`community.kind.${kind}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {t('community.form.headline')}
            <input name="title" required minLength={COMMUNITY_RULES.titleMinLength} maxLength={COMMUNITY_RULES.titleMaxLength} />
          </label>
          <label>
            {t('community.form.body')}
            <span className="hint">{t('community.form.body_hint')}</span>
            <textarea name="body" required minLength={COMMUNITY_RULES.bodyMinLength} maxLength={COMMUNITY_RULES.bodyMaxLength} />
          </label>
          <label>
            {t('community.form.location_optional')}
            <select name="locationId" defaultValue="">
              <option value="">—</option>
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
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontWeight: 600 }}>
            <input type="checkbox" name="anonymous" style={{ width: 'auto', marginTop: 4 }} />
            <span>
              {t('community.form.anonymous')}
              <span className="hint" style={{ display: 'block' }}>
                {t('community.form.anonymous_hint')}
              </span>
            </span>
          </label>
          <button className="btn btn-gold" type="submit">
            {t('community.form.submit')}
          </button>
        </form>
      </div>
    </SiteShell>
  );
}
