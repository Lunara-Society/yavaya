import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { SANCTUARY_RULES } from '@/config/business-rules';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { ChurchForm } from '@/ui/sanctuary/parts';
import { placeOptions } from '@/server/domains/mercadito/service';
import { registerChurchAction } from '../actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('sanctuary.form.title_new'), robots: { index: false } };
}

export default async function RegisterChurchPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect('/login');
  const countries = await placeOptions(db(), locale);
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="sanctuary" tone="sanctuary">
      <section className="mk-head">
        <div className="wrap cm-column">
          <p>
            <Link href="/sanctuary">← {t('sanctuary.church.back')}</Link>
          </p>
          <h1>{t('sanctuary.form.title_new')}</h1>
          <p className="muted">{t('sanctuary.form.intro')}</p>
        </div>
      </section>
      <div className="wrap cm-column" style={{ paddingBottom: 56 }}>
        {error ? (
          <p className="mk-error">
            {t(error as MessageKey, { limit: SANCTUARY_RULES.maxChurchesPerOwner, min: SANCTUARY_RULES.descriptionMinLength, max: SANCTUARY_RULES.descriptionMaxLength })}
          </p>
        ) : null}
        <ChurchForm t={t} countries={countries} action={registerChurchAction} />
      </div>
    </SiteShell>
  );
}
