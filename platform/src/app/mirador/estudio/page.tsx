import type { Metadata } from 'next';
import Link from 'next/link';
import { and, eq } from 'drizzle-orm';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import { miradorOffers, miradorPreferences, users } from '@/server/db/schema';
import { MIRADOR_RULES } from '@/config/business-rules';
import type { MessageKey } from '@/i18n';
import { signInPath } from '@/server/auth/sign-in-path';
import { miradorOpen } from '@/server/domains/mirador/access';
import { videosByIds } from '@/server/domains/mirador/feed';
import { myBlocks, savedIds } from '@/server/domains/mirador/social';
import { creatorTotals, myVideos } from '@/server/domains/mirador/videos';
import { incomingRequests, outgoingRequests } from '@/server/domains/mirador/offers';
import { maxCharsFor, voiceAvailable, voiceJobsFor, voicePrices } from '@/server/domains/mirador/voice';
import { verifiedHelperRoles } from '@/server/domains/aid/service';
import { getBalance } from '@/server/domains/tokens/service';
import { formatPrice } from '@/ui/mercadito/format';
import { offerLabels } from '@/ui/mirador/labels';
import { EMPTY_OFFER, type OfferDraft } from '@/ui/mirador/upload';
import { OfferEditor, RequestActions, VoiceForm } from '@/ui/mirador/studio-offers';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { PreferencesForm, UnblockButton, VideoActions } from '@/ui/mirador/studio-actions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

/**
 * A creator's studio (docs/mirador/README.md, "Creators"): their videos with
 * every status and its real numbers, what they saved, who they blocked, and
 * their say over Para ti. Numbers are counts of real rows, never estimates.
 */
export default async function StudioPage() {
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(await signInPath());
  if (!(await miradorOpen(db(), userId))) notFound();
  const [videos, totals, saved, blocks, [prefs], [me]] = await Promise.all([
    myVideos(db(), userId),
    creatorTotals(db(), userId),
    savedIds(db(), userId).then((ids) => videosByIds(db(), { ids, viewerId: userId, locale })),
    myBlocks(db(), userId),
    db().select().from(miradorPreferences).where(eq(miradorPreferences.userId, userId)).limit(1),
    db().select({ yayId: users.yayId }).from(users).where(eq(users.id, userId)).limit(1),
  ]);
  const ids = videos.map((video) => video.id);
  const voiceOn = voiceAvailable();
  const [offers, incoming, outgoing, jobs, prices, balance, roles] = await Promise.all([
    db().select().from(miradorOffers).where(and(eq(miradorOffers.creatorUserId, userId))),
    incomingRequests(db(), userId),
    outgoingRequests(db(), userId),
    voiceOn ? voiceJobsFor(db(), { userId, videoIds: ids }) : Promise.resolve([]),
    voicePrices(db()),
    getBalance(db(), userId),
    verifiedHelperRoles(db(), userId),
  ]);
  const offerOf = new Map(offers.map((offer) => [offer.videoId, offer]));
  // Newest first, so the first one met is the video's latest narration.
  const jobOf = new Map<string, (typeof jobs)[number]>();
  for (const job of jobs) if (!jobOf.has(job.videoId)) jobOf.set(job.videoId, job);
  const now = new Date();
  const when = (date: Date) =>
    date.toDateString() === now.toDateString() ? date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }) : date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const deal = (offer: (typeof offers)[number]) =>
    offer.kind === 'sale' && offer.priceMinor !== null ? formatPrice(offer.priceMinor, offer.currency, locale) : t(`mirador.feed.offer_${offer.kind === 'sale' ? 'free' : offer.kind}` as MessageKey);
  // A request on a call for help is an offer of help: it reads that way.
  const helpWord = (kind: string, key: 'incoming_line' | 'outgoing_line' | 'request_accepted' | 'request_declined') => (kind === 'need' ? (`mirador.studio.${key}_help` as MessageKey) : (`mirador.studio.${key}` as MessageKey));
  const draftOf = (offer: (typeof offers)[number] | undefined): OfferDraft =>
    offer
      ? { kind: offer.kind, category: offer.category, title: offer.title, price: offer.priceMinor !== null ? String(offer.priceMinor / 100) : '', unit: offer.unit ?? '', quantity: offer.quantity, ingredients: offer.ingredients ?? '', foodRules: false, pickupDetails: offer.pickupDetails, hours: EMPTY_OFFER.hours }
      : EMPTY_OFFER;
  // Refusals keep their placeholders; the client fills them from the refusal's details.
  const keep = { max: '{max}', count: '{count}', seconds: '{seconds}', required: '{required}', available: '{available}' };
  const errorsFor = (keys: string[]) => Object.fromEntries(keys.map((key) => [key, t(key as MessageKey, keep)]));
  const offerEditorLabels = {
    add: t('mirador.studio.offer_add'),
    change: t('mirador.studio.offer_change'),
    close: t('mirador.studio.offer_close'),
    confirm_close: t('mirador.studio.offer_confirm_close'),
    save: t('mirador.studio.offer_save'),
    cancel: t('mirador.upload.cancel'),
    error: t('mirador.feed.error'),
    errors: errorsFor(['kind', 'title', 'quantity', 'price', 'place', 'ingredients', 'food_rules', 'hours', 'too_many', 'quantity_promised', 'helpers_only', 'animal_food'].map((key) => `mirador.offer.error.${key}`)),
    offer: offerLabels(t),
  };
  const requestLabels = {
    accept: t('mirador.studio.request_accept'),
    decline: t('mirador.studio.request_decline'),
    cancel: t('mirador.studio.request_cancel'),
    confirm_cancel: t('mirador.studio.request_confirm_cancel'),
    error: t('mirador.feed.error'),
    errors: errorsFor(['mirador.offer.error.decided', 'mirador.offer.error.not_enough']),
  };
  const voiceLabels = (durationMs: number) => ({
    open: t('mirador.voice.open', { count: prices.short ?? 0 }),
    script: t('mirador.voice.script'),
    script_hint: t('mirador.voice.script_hint', { max: maxCharsFor(durationMs), seconds: Math.round(durationMs / 1000) }),
    counter: t('mirador.voice.counter', { count: '{count}', max: '{max}' }),
    starter: t('mirador.voice.starter'),
    language: t('mirador.voice.language'),
    lang_es: t('mirador.voice.lang_es'),
    lang_en: t('mirador.voice.lang_en'),
    volume: t('mirador.voice.volume'),
    volume_value: t('mirador.voice.volume_value', { percent: '{percent}' }),
    price: t('mirador.voice.price', { count: '{count}', balance: '{balance}' }),
    confirm: t('mirador.voice.confirm', { count: '{count}' }),
    not_enough: t('mirador.voice.not_enough'),
    buy: t('mirador.voice.buy'),
    note: t('mirador.voice.note'),
    started: t('mirador.voice.started'),
    cancel: t('mirador.upload.cancel'),
    error: t('mirador.feed.error'),
    errors: errorsFor([...['unavailable', 'short', 'running', 'already', 'too_long'].map((key) => `mirador.voice.error.${key}`), 'error.insufficient_tokens']),
  });
  /** A first draft of the narration from the video's own words: the member's caption, and the offer if there is one. */
  const starterFor = (caption: string, offer: (typeof offers)[number] | undefined) =>
    [caption.replace(/#/g, '').trim(), offer && offer.status === 'open' ? t(offer.kind === 'sale' ? 'mirador.voice.starter_sale' : 'mirador.voice.starter_free', { title: offer.title, deal: deal(offer) }) : '']
      .filter(Boolean)
      .join(' ');
  const n = (value: number) => new Intl.NumberFormat(locale).format(value);
  const statusTone = (status: string) => (status === 'ready' ? 'ok' : status === 'failed' || status === 'removed' ? 'bad' : undefined);
  const actionLabels = { publish: t('mirador.studio.publish'), unpublish: t('mirador.studio.unpublish'), remove: t('mirador.studio.remove'), confirm: t('mirador.studio.confirm_remove'), view: t('mirador.studio.view'), error: t('mirador.feed.error') };
  const stats: Array<[MessageKey, number]> = [
    ['mirador.studio.videos', totals.videos],
    ['mirador.studio.views', totals.views],
    ['mirador.studio.likes', totals.likes],
    ['mirador.studio.comments', totals.comments],
    ['mirador.studio.shares', totals.shares],
    ['mirador.studio.saves', totals.saves],
    ['mirador.studio.link_opens', totals.linkOpens],
    ['mirador.studio.followers', totals.followers],
  ];
  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <div className="ms-page">
        <div className="wrap">
          <p>
            <Link href="/mirador">← {t('mirador.nav')}</Link>
          </p>
          <h1>{t('mirador.studio.title')}</h1>
          <p className="mu-row">
            <Link className="mf-cta" href="/mirador/subir">
              {t('mirador.feed.upload')}
            </Link>
            {me ? (
              <Link className="mu-line" href={`/mirador/creador/${me.yayId}`}>
                {t('mirador.studio.my_page')}
              </Link>
            ) : null}
          </p>
          <dl className="ms-stats">
            {stats.map(([key, value]) => (
              <div key={key}>
                <dt>{t(key)}</dt>
                <dd>{n(value)}</dd>
              </div>
            ))}
          </dl>
          {totals.followersWeek > 0 ? <p className="muted">{t('mirador.studio.followers_week', { count: totals.followersWeek })}</p> : null}

          <h2>{t('mirador.studio.my_videos')}</h2>
          {videos.length === 0 ? (
            <p className="muted">{t('mirador.studio.none')}</p>
          ) : (
            <ul className="ms-list">
              {videos.map((video) => (
                <li key={video.id} className="ms-row">
                  {video.poster ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a poster from the media route
                    <img src={video.poster} alt="" loading="lazy" />
                  ) : (
                    <span className="ms-blank" />
                  )}
                  <div>
                    <p>
                      <span className="ms-badge" data-tone={statusTone(video.removedReason ? 'removed' : video.status)}>
                        {video.removedReason ? t(`mirador.studio.removed_${video.removedReason}` as MessageKey) : t(`mirador.status.${video.status}` as MessageKey)}
                      </span>{' '}
                      {video.status === 'ready' && !video.removedReason ? <span className="ms-badge">{video.published ? t('mirador.studio.public') : t('mirador.studio.private')}</span> : null}
                    </p>
                    <p>{video.caption || t('mirador.studio.no_caption')}</p>
                    {video.failureReason ? <p className="mu-error">{t(video.failureReason as MessageKey, { seconds: MIRADOR_RULES.maxDurationSeconds, mb: Math.round(MIRADOR_RULES.maxUploadBytes / 1024 / 1024), min: MIRADOR_RULES.minDurationSeconds })}</p> : null}
                    <p className="ms-numbers">
                      {t('mirador.studio.row_numbers', { views: n(video.counts.views), done: n(video.counts.completions), likes: n(video.counts.likes), comments: n(video.counts.comments), shares: n(video.counts.shares), opens: n(video.counts.linkOpens) })}
                    </p>
                    {video.status !== 'failed' && !video.removedReason ? <VideoActions id={video.id} published={video.published} ready={video.status === 'ready'} labels={actionLabels} /> : null}
                    {video.status !== 'failed' && !video.removedReason
                      ? (() => {
                          const offer = offerOf.get(video.id);
                          const open = offer && offer.status === 'open' && offer.availableUntil > now ? offer : undefined;
                          return (
                            <OfferEditor
                              videoId={video.id}
                              initial={draftOf(offer)}
                              summary={open ? t('mirador.studio.offer_summary', { title: open.title, deal: deal(open), count: open.remaining, time: when(open.availableUntil) }) : null}
                              labels={offerEditorLabels}
                              hoursList={MIRADOR_RULES.offerHours}
                              foodMaxHours={MIRADOR_RULES.foodMaxHours}
                              helper={roles.length > 0}
                            />
                          );
                        })()
                      : null}
                    {voiceOn && prices.short !== null && video.status === 'ready' && !video.removedReason && video.durationMs > 0
                      ? (() => {
                          const job = jobOf.get(video.id);
                          if (job?.status === 'charged') return <p className="ms-voice-state">{t('mirador.voice.running')}</p>;
                          if (job?.status === 'done') return <p className="ms-voice-state" data-tone="ok">{t('mirador.voice.done', { count: job.tokens })}</p>;
                          return (
                            <>
                              {job?.status === 'refunded' ? <p className="ms-voice-state" data-tone="bad">{t('mirador.voice.refunded', { count: job.tokens })}</p> : null}
                              <VoiceForm
                                videoId={video.id}
                                maxChars={maxCharsFor(video.durationMs)}
                                shortChars={MIRADOR_RULES.voiceShortChars}
                                prices={{ short: prices.short!, long: prices.long }}
                                balance={balance}
                                starter={starterFor(video.caption, offerOf.get(video.id))}
                                language={language === 'en' ? 'en' : 'es'}
                                labels={voiceLabels(video.durationMs)}
                              />
                            </>
                          );
                        })()
                      : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h2 id="pedidos">{t('mirador.studio.requests')}</h2>
          <p className="muted">{t('mirador.studio.requests_lead')}</p>
          <p className="mu-note">
            {roles.length ? t('mirador.studio.helper', { name: roles.map((role) => role.name).join(', ') }) : t('mirador.studio.helper_none')}{' '}
            <Link href="/mirador/organizacion">{t('mirador.studio.helper_link')}</Link>
          </p>
          <h3>{t('mirador.studio.incoming')}</h3>
          {incoming.length === 0 ? (
            <p className="muted">{t('mirador.studio.incoming_none')}</p>
          ) : (
            <ul className="ms-list ms-requests">
              {incoming.map((request) => (
                <li key={request.id} className="ms-request" data-status={request.status}>
                  <p>
                    <span className="ms-badge" data-tone={request.status === 'accepted' ? 'ok' : undefined}>
                      {request.status === 'pending' ? t('mirador.studio.request_pending') : t(helpWord(request.kind, 'request_accepted'))}
                    </span>{' '}
                    {t(helpWord(request.kind, 'incoming_line'), { name: request.name, count: request.quantity, title: request.title })}
                  </p>
                  {request.note ? <p className="ms-request-note">“{request.note}”</p> : null}
                  <p className="ms-numbers">
                    {when(request.createdAt)} · {t('mirador.studio.request_left', { count: request.remaining })} ·{' '}
                    <Link href={`/mirador/v/${request.videoId}`}>{t('mirador.studio.view')}</Link>
                  </p>
                  <RequestActions id={request.id} side="incoming" status={request.status} labels={request.kind === 'need' ? { ...requestLabels, accept: t('mirador.studio.request_accept_help') } : requestLabels} />
                </li>
              ))}
            </ul>
          )}
          <h3>{t('mirador.studio.outgoing')}</h3>
          {outgoing.length === 0 ? (
            <p className="muted">{t('mirador.studio.outgoing_none')}</p>
          ) : (
            <ul className="ms-list ms-requests">
              {outgoing.map((request) => (
                <li key={request.id} className="ms-request" data-status={request.status}>
                  <p>
                    <span className="ms-badge" data-tone={request.status === 'accepted' ? 'ok' : request.status === 'declined' ? 'bad' : undefined}>
                      {request.status === 'pending' ? t('mirador.studio.request_pending') : t(helpWord(request.kind, request.status === 'declined' ? 'request_declined' : 'request_accepted'))}
                    </span>{' '}
                    {t(helpWord(request.kind, 'outgoing_line'), { name: request.name, count: request.quantity, title: request.title })}
                  </p>
                  {request.status === 'accepted' ? (
                    <p className="ms-pickup">
                      <strong>{t(request.kind === 'need' ? 'mirador.studio.dropoff' : 'mirador.studio.pickup')}</strong> {request.pickupDetails || t('mirador.studio.pickup_ask')}
                    </p>
                  ) : null}
                  <p className="ms-numbers">
                    {when(request.createdAt)} · <Link href={`/mirador/v/${request.videoId}`}>{t('mirador.studio.view')}</Link>
                    {request.status === 'accepted' && request.whatsapp ? (
                      <>
                        {' · '}
                        <a href={`https://wa.me/${request.whatsapp.replace(/^\+/, '')}`} target="_blank" rel="noopener noreferrer">
                          {t('mirador.feed.want_whatsapp')}
                        </a>
                      </>
                    ) : null}
                  </p>
                  <RequestActions id={request.id} side="outgoing" status={request.status} labels={requestLabels} />
                </li>
              ))}
            </ul>
          )}

          <h2>{t('mirador.studio.saved')}</h2>
          {saved.length === 0 ? (
            <p className="muted">{t('mirador.studio.saved_none')}</p>
          ) : (
            <ul className="ms-grid">
              {saved.map((video) => (
                <li key={video.id}>
                  <Link href={`/mirador/v/${video.id}`} aria-label={video.caption.slice(0, 80) || video.creator.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a poster from the media route */}
                    <img src={video.media.poster} alt="" loading="lazy" />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <h2>{t('mirador.studio.for_you')}</h2>
          <p className="muted">{t('mirador.studio.for_you_text')}</p>
          <PreferencesForm
            interests={prefs?.interests ?? []}
            labels={{ interests: t('mirador.studio.interests'), hint: t('mirador.studio.interests_hint'), save: t('mirador.studio.save'), reset: t('mirador.studio.reset'), saved: t('mirador.studio.saved_ok'), reset_done: t('mirador.studio.reset_done') }}
          />

          <h2>{t('mirador.studio.blocked')}</h2>
          {blocks.length === 0 ? (
            <p className="muted">{t('mirador.studio.blocked_none')}</p>
          ) : (
            <ul className="ms-list">
              {blocks.map((person) => (
                <li key={person.id} className="mu-row">
                  <span>{person.name}</span>
                  <UnblockButton userId={person.id} label={t('mirador.studio.unblock')} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </SiteShell>
  );
}
