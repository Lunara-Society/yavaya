import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { ANIMALS_RULES } from '@/config/business-rules';
import { SPECIES } from '@/config/animals';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { PlacePicker } from '@/ui/components/place-picker';
import { placePickerLabels } from '@/ui/components/place-labels';
import { SpeciesChoice } from '@/ui/animals/species-choice';
import { signInPath } from '@/server/auth/sign-in-path';
import { getLostFound } from '@/server/domains/animals/lost-found';
import { deleteLostFoundAction, editLostFoundAction } from '../../../actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The author's own lost or found post, to correct (a wrong species, the
 * description, the place, the date, the number) or to delete. Whether it is a
 * lost or a found animal, and its photos, stay as published.
 */
export default async function EditLostFoundPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(await signInPath());
  const found = await getLostFound(db(), { postId: id, viewerId: userId, viewerIsReviewer: false, locale });
  if (!found || !found.isAuthor) notFound();
  const { post, whatsappE164 } = found;
  const error = query.error && /^[a-z_.]+$/.test(query.error) ? query.error : null;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member} current="animals" tone="animals">
      <div className="wrap cm-column" style={{ padding: '28px var(--gutter) 56px' }}>
        <p>
          <Link href={`/animals/lost/${post.id}`}>← {post.name ?? t(`animals.species.${post.species}` as MessageKey)}</Link>
        </p>
        <h1 className="h-md">{t('animals.lost.edit_title')}</h1>
        {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}
        <form action={editLostFoundAction} className="mk-form" style={{ marginTop: 18 }}>
          <input type="hidden" name="postId" value={post.id} />
          <input type="hidden" name="kind" value={post.kind} />
          <SpeciesChoice label={t('animals.form.species')} current={post.species} options={SPECIES.map((value) => ({ value, label: t(`animals.species.${value}` as MessageKey) }))} />
          {post.kind === 'lost' ? (
            <label>
              {t('animals.lost.name')}
              <input name="name" maxLength={ANIMALS_RULES.nameMaxLength} defaultValue={post.name ?? ''} />
            </label>
          ) : null}
          <label>
            {t('animals.lost.description')}
            <textarea name="description" required minLength={ANIMALS_RULES.lostDescriptionMinLength} maxLength={ANIMALS_RULES.lostDescriptionMaxLength} defaultValue={post.description} />
          </label>
          <label>
            {t(post.kind === 'lost' ? 'animals.lost.seen_on_lost' : 'animals.lost.seen_on_found')}
            <input name="seenOn" type="date" required max={today} defaultValue={post.seenOn} />
          </label>
          <label>
            {t('animals.form.location')}
            <PlacePicker name="locationId" labels={placePickerLabels(t)} initial={found.locationId ?? undefined} required />
          </label>
          <label>
            {t('services.provider.whatsapp')}
            <input name="whatsapp" required inputMode="tel" defaultValue={whatsappE164 ?? ''} />
          </label>
          <button className="btn btn-gold" type="submit">
            {t('animals.lost.save')}
          </button>
        </form>

        <section id="delete" className="card" style={{ marginTop: 32, padding: 18 }}>
          <h2 className="h-sm">{t('animals.lost.delete_title')}</h2>
          <p className="muted">{t('animals.lost.delete_lead')}</p>
          <form action={deleteLostFoundAction} className="mk-form">
            <input type="hidden" name="postId" value={post.id} />
            <label className="go-check">
              <input type="checkbox" name="confirm" value="yes" required /> {t('animals.lost.delete_confirm')}
            </label>
            <button className="btn btn-line" type="submit">
              {t('animals.lost.delete')}
            </button>
          </form>
        </section>
      </div>
    </SiteShell>
  );
}
