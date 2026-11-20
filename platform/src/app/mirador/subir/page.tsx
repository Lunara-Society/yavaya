import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { MIRADOR_RULES } from '@/config/business-rules';
import { signInPath } from '@/server/auth/sign-in-path';
import { mediaStorage } from '@/server/domains/media/storage';
import { miradorOpen } from '@/server/domains/mirador/access';
import { linkChoices } from '@/server/domains/mirador/links';
import { verifiedHelperRoles } from '@/server/domains/aid/service';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { PlacePicker } from '@/ui/components/place-picker';
import { placePickerLabels } from '@/ui/components/place-labels';
import { MiradorUpload } from '@/ui/mirador/upload';
import { uploadLabels } from '@/ui/mirador/labels';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/** Putting a video on Mirador: choose it, say what it is, where, and what it links to. */
export default async function MiradorUploadPage() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(await signInPath());
  if (!(await miradorOpen(db(), userId))) notFound();
  const [choices, roles] = await Promise.all([linkChoices(db(), userId), verifiedHelperRoles(db(), userId)]);
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <div className="mu-page">
        <div className="wrap">
          <h1>{t('mirador.upload.title')}</h1>
          {/* No control that leads nowhere: without video storage there is no upload to offer. */}
          {mediaStorage()?.multipart ? (
            <MiradorUpload
              labels={uploadLabels(t)}
              choices={choices}
              maxSeconds={MIRADOR_RULES.maxDurationSeconds}
              maxBytes={MIRADOR_RULES.maxUploadBytes}
              maxPhotos={MIRADOR_RULES.maxPhotos}
              offerHours={MIRADOR_RULES.offerHours}
              foodMaxHours={MIRADOR_RULES.foodMaxHours}
              helper={roles.length > 0}
              placePicker={<PlacePicker name="locationId" labels={placePickerLabels(t)} />}
              locale={locale}
            />
          ) : (
            <p className="muted">{t('mirador.error.unavailable')}</p>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
