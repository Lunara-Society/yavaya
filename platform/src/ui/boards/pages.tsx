import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { db } from '@/server/db/client';
import type { MessageKey } from '@/i18n';
import { BOARD_RULES } from '@/config/business-rules';
import { BOARD_DISTRICTS, BOARD_KINDS, isSubdistrict, type BoardDistrict, type BoardKind } from '@/config/boards';
import { DISTRICTS } from '@/config/districts';
import { siteContext } from '@/ui/site/context';
import { SiteShell } from '@/ui/site/site-shell';
import { formatDate } from '@/ui/mercadito/format';
import { PlacePicker } from '@/ui/components/place-picker';
import { placePickerLabels } from '@/ui/components/place-labels';
import { loginHref } from '@/server/auth/return-path';
import { signInPath } from '@/server/auth/sign-in-path';
import { ANY_PLACE, browsePlace, widenWhenEmpty } from '@/server/place-choice';
import { WidenedNote } from '@/ui/site/widened-note';
import { alertHref, BOARD_REPORT_CATEGORIES, getBoardPost, listBoardPosts, markBoardAlertSeen, myBoardAlerts, myBoardPosts, subdistrictCounts, type BoardPostView } from '@/server/domains/boards/service';
import { closeBoardPostAction, deleteBoardAlertAction, reportBoardPostAction, saveBoardAlertAction } from '@/app/boards/actions';
import { mediaStorage } from '@/server/domains/media/storage';
import { MEDIA_RULES } from '@/config/business-rules';

/**
 * The pages of the six board districts. One set of pages, six districts:
 * `data-board` on the outer element is what gives each its own arrangement
 * (app/boards.css) — an address ledger for Hogar, route lines for Movilidad,
 * a harvest board for Campo, and so on. Every sentence is a dictionary key.
 */

const DOOR_LABEL: Record<string, MessageKey> = {
  '/services': 'district.services.name',
  '/mercadito': 'district.mercadito.name',
  '/work': 'district.works.name',
  '/yavayago': 'district.yavayago.name',
  '/yavayago/viajes': 'board.door.trips',
  '/roxi/negocio': 'board.door.ledger',
  '/violeta': 'nav.violeta',
};

const sub = (district: BoardDistrict, key: string) => `board.sub.${district}.${key}` as MessageKey;

const LIMITS: Record<string, Record<string, number>> = {
  'board.error.title': { min: BOARD_RULES.titleMinLength, max: BOARD_RULES.titleMaxLength },
  'board.error.body': { min: BOARD_RULES.bodyMinLength, max: BOARD_RULES.bodyMaxLength },
  'board.error.price': { max: BOARD_RULES.priceMaxLength },
  'board.error.too_many_open': { max: BOARD_RULES.maxOpenPerDistrict },
  'board.error.photo_count': { max: BOARD_RULES.maxPhotos },
  'board.error.too_many_alerts': { max: BOARD_RULES.maxAlertsPerDistrict },
  'media.error.too_large': { maxMegabytes: MEDIA_RULES.maxUploadBytes / 1024 / 1024 },
};

const safeKey = (value: string | undefined) => (value && /^[a-z_.]+$/.test(value) ? value : null);

type T = Awaited<ReturnType<typeof siteContext>>['t'];

function PostRow({ post, base, t, locale, own }: { post: BoardPostView; base: string; t: T; locale: string; own?: boolean }) {
  const state = post.status === 'open' && post.expired ? 'expired' : post.status;
  return (
    <li className="bd-post" data-kind={post.kind}>
      <Link href={`${base}/${post.id}`} className="bd-post-link" data-photo={post.photoIds[0] ? '' : undefined}>
        {post.photoIds[0] ? (
          // eslint-disable-next-line @next/next/no-img-element -- served already sized from /media
          <img className="bd-thumb" src={`/media/${post.photoIds[0]}`} alt="" loading="lazy" decoding="async" />
        ) : null}
        <span className="bd-post-kind">{t(`board.kind.${post.kind}` as MessageKey)}</span>
        <strong className="bd-post-title">{post.title}</strong>
        {post.priceText ? <span className="bd-post-price">{post.priceText}</span> : null}
        <span className="bd-post-meta">
          {t(sub(post.district, post.subdistrict))} · {post.placeName} · {formatDate(post.createdAt, locale)}
          {own ? ` · ${t(`board.status.${state}` as MessageKey)}` : ''}
        </span>
      </Link>
    </li>
  );
}

export async function boardTitle(district: BoardDistrict): Promise<{ title: string; description: string }> {
  const { t } = await siteContext();
  return { title: t(DISTRICTS[district].nameKey as MessageKey), description: t(DISTRICTS[district].taglineKey as MessageKey) };
}

export async function BoardHome({ district, searchParams }: { district: BoardDistrict; searchParams: Promise<{ sub?: string; kind?: string; q?: string; page?: string; mine?: string; place?: string; alert?: string; saved?: string; error?: string }> }) {
  const params = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  const def = BOARD_DISTRICTS[district];
  const base = `/${def.slug}`;
  const subdistrict = params.sub && isSubdistrict(district, params.sub) ? params.sub : undefined;
  const kind = (BOARD_KINDS as readonly string[]).includes(params.kind ?? '') ? (params.kind as BoardKind) : undefined;
  const query = params.q?.trim().slice(0, 80) || undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);
  const mine = params.mine === '1' && userId;
  if (params.mine === '1' && !userId) redirect(loginHref(`${base}?mine=1`));

  // The list follows the place in the header's location bar unless this page's own picker says otherwise;
  // when that place has nothing yet, it widens to its department and country, and says so.
  const { code: placeCode, link: placeLink } = await browsePlace(params.place, locale);
  // Arriving from an alert: what it had matched is no longer new.
  if (userId && params.alert && /^[0-9a-f-]{36}$/i.test(params.alert)) await markBoardAlertSeen(db(), { userId, id: params.alert });
  const alerts = mine ? await myBoardAlerts(db(), { userId: userId!, district }) : null;
  const error = safeKey(params.error);
  const [found, counts, own] = await Promise.all([
    mine ? null : widenWhenEmpty(placeCode, page, locale, (code) => listBoardPosts(db(), { district, subdistrict, kind, query, placeCode: code, viewerId: userId, page, locale })),
    subdistrictCounts(db(), district),
    mine ? myBoardPosts(db(), { district, userId: userId!, locale }) : null,
  ]);
  const feed = found?.result ?? null;
  const href = (given: { sub?: string; kind?: string; q?: string; page?: number }) => {
    const next = { ...given, place: placeLink };
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) if (value && !(key === 'page' && value === 1)) search.set(key, String(value));
    const text = search.toString();
    return text ? `${base}?${text}` : base;
  };
  const filtered = Boolean(subdistrict || kind || query || placeCode);
  const publish = userId ? `${base}/new${subdistrict ? `?sub=${subdistrict}` : ''}` : loginHref(`${base}/new`);

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <div className="bd" data-board={district} data-layout={DISTRICTS[district].theme.layout}>
        <section className="bd-hero">
          <div className="wrap">
            <p className="eyebrow">{t('nav.districts' as MessageKey)}</p>
            <h1>{t(DISTRICTS[district].nameKey as MessageKey)}</h1>
            <p className="lead">{t(`board.lead.${district}` as MessageKey)}</p>
            <div className="btn-row">
              <Link className="btn btn-gold" href={publish}>
                {t('board.publish')}
              </Link>
              {userId ? (
                <Link className="btn btn-line" href={mine ? base : `${base}?mine=1`}>
                  {mine ? t('board.all') : t('board.mine')}
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        <div className="wrap bd-layout">
          <aside className="bd-rail">
            <p className="bd-rail-title">{t('board.subdistricts')}</p>
            <nav className="bd-subs" aria-label={t('board.subdistricts')}>
              <Link href={href({ kind, q: query })} aria-current={subdistrict ? undefined : 'true'}>
                {t('board.all')}
              </Link>
              {def.subdistricts.map((key) => (
                <Link key={key} href={href({ sub: key, kind, q: query })} aria-current={subdistrict === key ? 'true' : undefined}>
                  <span>{t(sub(district, key))}</span>
                  {counts[key] ? <span className="bd-count">{counts[key]}</span> : null}
                </Link>
              ))}
            </nav>
          </aside>

          <div className="bd-main">
            {mine ? (
              <>
                <h2 className="h-md">{t('board.mine')}</h2>
                {error ? <p className="mk-error">{t(error as MessageKey, LIMITS[error] ?? {})}</p> : null}
                {params.saved === '1' ? <p className="bd-ok">{t('board.alert.saved')}</p> : null}
                {own!.length === 0 ? (
                  <div className="mk-empty">
                    <p>{t('board.mine_empty')}</p>
                    <Link className="btn btn-gold" href={publish}>
                      {t('board.publish')}
                    </Link>
                  </div>
                ) : (
                  <ul className="bd-list">
                    {own!.map((post) => (
                      <PostRow key={post.id} post={post} base={base} t={t} locale={locale} own />
                    ))}
                  </ul>
                )}
                <h2 className="h-md bd-alerts-title">{t('board.alert.title')}</h2>
                {alerts!.length === 0 ? (
                  <p className="muted">{t('board.alert.empty')}</p>
                ) : (
                  <ul className="bd-alerts">
                    {alerts!.map((alert) => (
                      <li key={alert.id}>
                        <span className="bd-alert-what">
                          {[alert.query ? `«${alert.query}»` : null, alert.subdistrict ? t(sub(district, alert.subdistrict)) : null, alert.kind ? t(`board.kind.${alert.kind}` as MessageKey) : null]
                            .filter(Boolean)
                            .join(' · ') || t('board.alert.everything')}
                          {alert.placeCode ? '' : ` · ${t('board.alert.anywhere')}`}
                          {alert.newCount > 0 ? <strong className="bd-count"> · {t('board.alert.new', { count: alert.newCount })}</strong> : null}
                        </span>
                        <span className="btn-row">
                          <Link className="btn btn-line" href={alertHref(alert)}>
                            {t('board.alert.open')}
                          </Link>
                          <form action={deleteBoardAlertAction}>
                            <input type="hidden" name="district" value={district} />
                            <input type="hidden" name="alertId" value={alert.id} />
                            <button className="btn btn-line" type="submit">
                              {t('board.alert.delete')}
                            </button>
                          </form>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <>
                <form className="bd-search" action={base} method="get" role="search">
                  {subdistrict ? <input type="hidden" name="sub" value={subdistrict} /> : null}
                  {kind ? <input type="hidden" name="kind" value={kind} /> : null}
                  <input name="q" type="search" defaultValue={query ?? ''} placeholder={t('board.search_placeholder')} aria-label={t('board.search')} maxLength={80} />
                  <button className="btn btn-line" type="submit">
                    {t('board.search')}
                  </button>
                  <details className="bd-place" open={Boolean(placeCode)}>
                    <summary>
                      {t('mercadito.browse.place_label')}: {placeCode ? t('mercadito.browse.place_chosen') : t('mercadito.browse.all_places')}
                    </summary>
                    <PlacePicker name="place" value="code" labels={placePickerLabels(t, { any: true })} initial={placeLink} anyValue={ANY_PLACE} />
                  </details>
                </form>
                <WidenedNote t={t} chosen={found!.chosen} widenedTo={found!.widenedTo} />
                <nav className="bd-kinds" aria-label={t('board.form.kind')}>
                  <Link href={href({ sub: subdistrict, q: query })} aria-current={kind ? undefined : 'true'}>
                    {t('board.kind.all')}
                  </Link>
                  {BOARD_KINDS.map((option) => (
                    <Link key={option} href={href({ sub: subdistrict, kind: option, q: query })} aria-current={kind === option ? 'true' : undefined}>
                      {t(`board.kind.${option}` as MessageKey)}
                    </Link>
                  ))}
                </nav>
                {feed!.items.length === 0 ? (
                  <div className="mk-empty">
                    <p>{filtered ? t('board.empty_filtered') : t('board.empty')}</p>
                    <Link className="btn btn-gold" href={publish}>
                      {t('board.publish')}
                    </Link>
                  </div>
                ) : (
                  <ul className="bd-list">
                    {feed!.items.map((post) => (
                      <PostRow key={post.id} post={post} base={base} t={t} locale={locale} />
                    ))}
                  </ul>
                )}
                {/* "Avísame": the filters on screen, kept as an alert. For members; a visitor is sent to sign in by the action. */}
                {userId ? (
                  <form action={saveBoardAlertAction} className="bd-alert-save">
                    <input type="hidden" name="district" value={district} />
                    <input type="hidden" name="sub" value={subdistrict ?? ''} />
                    <input type="hidden" name="kind" value={kind ?? ''} />
                    <input type="hidden" name="q" value={query ?? ''} />
                    <input type="hidden" name="place" value={placeCode ?? ''} />
                    <button className="btn btn-line" type="submit">
                      {t('board.alert.save')}
                    </button>
                    <span className="hint">{t('board.alert.save_hint')}</span>
                  </form>
                ) : null}
                {feed!.page > 1 || feed!.hasMore ? (
                  <nav className="mk-pager">
                    {feed!.page > 1 ? (
                      <Link className="btn btn-line" href={href({ sub: subdistrict, kind, q: query, page: feed!.page - 1 })}>
                        {t('mercadito.browse.previous')}
                      </Link>
                    ) : null}
                    {feed!.hasMore ? (
                      <Link className="btn btn-line" href={href({ sub: subdistrict, kind, q: query, page: feed!.page + 1 })}>
                        {t('mercadito.browse.next')}
                      </Link>
                    ) : null}
                  </nav>
                ) : null}
              </>
            )}
          </div>

          <aside className="bd-side">
            <p className="bd-notice">{t(def.notice as MessageKey)}</p>
            <p className="bd-rail-title">{t('board.doors')}</p>
            <ul className="bd-doors">
              {def.doors.map((path) => (
                <li key={path}>
                  <Link href={path}>{t(DOOR_LABEL[path]!)}</Link>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>
    </SiteShell>
  );
}

export async function BoardNew({ district, searchParams }: { district: BoardDistrict; searchParams: Promise<{ error?: string; sub?: string }> }) {
  const params = await searchParams;
  const { c, t, language, theme, member, userId } = await siteContext();
  if (!userId) redirect(await signInPath());
  const def = BOARD_DISTRICTS[district];
  const base = `/${def.slug}`;
  const error = safeKey(params.error);
  const initialSub = params.sub && isSubdistrict(district, params.sub) ? params.sub : '';

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <div className="bd" data-board={district}>
        <div className="wrap bd-column">
          <p>
            <Link href={base}>← {t(DISTRICTS[district].nameKey as MessageKey)}</Link>
          </p>
          <h1 className="h-md">{t('board.form.title')}</h1>
          <p className="muted">{t('board.form.free')}</p>
          {error ? <p className="mk-error">{t(error as MessageKey, LIMITS[error] ?? {})}</p> : null}
          {/* Posted to a route handler, not a Server Action: photos do not fit the action body limit. A plain form, so it works without JavaScript. */}
          <form action="/api/boards/posts" method="post" encType="multipart/form-data" className="mk-form" style={{ marginTop: 18 }}>
            <input type="hidden" name="district" value={district} />
            <label>
              {t('board.form.kind')}
              <select name="kind" required defaultValue="">
                <option value="" disabled>
                  {t('mercadito.form.choose')}
                </option>
                {BOARD_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`board.kind.${kind}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('board.form.subdistrict')}
              <select name="subdistrict" required defaultValue={initialSub}>
                <option value="" disabled>
                  {t('mercadito.form.choose')}
                </option>
                {def.subdistricts.map((key) => (
                  <option key={key} value={key}>
                    {t(sub(district, key))}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('board.form.headline')}
              <input name="title" required minLength={BOARD_RULES.titleMinLength} maxLength={BOARD_RULES.titleMaxLength} />
            </label>
            <label>
              {t('board.form.body')}
              <span className="hint">{t('board.form.body_hint')}</span>
              <textarea name="body" required minLength={BOARD_RULES.bodyMinLength} maxLength={BOARD_RULES.bodyMaxLength} />
            </label>
            <label>
              {t('board.form.price')}
              <span className="hint">{t('board.form.price_hint')}</span>
              <input name="priceText" maxLength={BOARD_RULES.priceMaxLength} />
            </label>
            <label>
              {t('board.form.location')}
              <PlacePicker name="locationId" labels={placePickerLabels(t)} required />
            </label>
            {/* Offered only while image storage is configured: no control that leads nowhere. */}
            {mediaStorage() ? (
              <label>
                {t('board.form.photos')}
                <span className="hint">{t('board.form.photos_hint', { max: BOARD_RULES.maxPhotos })}</span>
                <input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple />
              </label>
            ) : null}
            <p className="hint">{t('board.form.whatsapp_hint')}</p>
            <p className="bd-notice">{t(def.notice as MessageKey)}</p>
            <button className="btn btn-gold" type="submit">
              {t('board.form.submit')}
            </button>
          </form>
        </div>
      </div>
    </SiteShell>
  );
}

export async function BoardPost({ district, params, searchParams }: { district: BoardDistrict; params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; reported?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const { c, t, locale, language, theme, member, userId } = await siteContext();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const post = await getBoardPost(db(), { postId: id, viewerId: userId, locale });
  if (!post || post.district !== district) notFound();
  const def = BOARD_DISTRICTS[district];
  const base = `/${def.slug}`;
  const error = safeKey(query.error);
  const reported = query.reported && /^[A-Z0-9-]{4,20}$/.test(query.reported) ? query.reported : null;
  const state = post.status === 'open' && post.expired ? 'expired' : post.status;
  const profile = `/members/${post.author.yayId}`;
  const whatsapp = post.contact?.whatsapp ? `https://wa.me/${post.contact.whatsapp.replace(/^\+/, '')}?text=${encodeURIComponent(`Yavaya · ${post.title}`)}` : null;

  return (
    <SiteShell c={c} t={t} language={language} theme={theme} member={member}>
      <div className="bd" data-board={district}>
        <article className="wrap bd-column">
          <p>
            <Link href={`${base}?sub=${post.subdistrict}`}>
              ← {t(DISTRICTS[district].nameKey as MessageKey)} · {t(sub(district, post.subdistrict))}
            </Link>
          </p>
          {error ? <p className="mk-error">{t(error as MessageKey)}</p> : null}
          {reported ? <p className="bd-ok">{t('board.report.done', { code: reported })}</p> : null}
          <p className="bd-post-kind">{t(`board.kind.${post.kind}` as MessageKey)}</p>
          <h1 className="h-md">{post.title}</h1>
          {post.priceText ? <p className="bd-price">{post.priceText}</p> : null}
          <p className="muted">
            {post.placeName} · {formatDate(post.createdAt, locale)} ·{' '}
            {state === 'open' ? t('board.post.until', { date: formatDate(post.expiresAt, locale) }) : t(`board.status.${state}` as MessageKey)}
          </p>
          {post.photoIds.length > 0 ? (
            <div className="bd-photos">
              {post.photoIds.map((id) => (
                // eslint-disable-next-line @next/next/no-img-element -- served already sized from /media
                <img key={id} src={`/media/${id}`} alt="" loading="lazy" decoding="async" />
              ))}
            </div>
          ) : null}
          <div className="bd-body">
            {post.body.split(/\n{2,}/).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
          <p className="bd-author">
            {t('board.post.by')} <Link href={profile}>{post.author.displayName}</Link>
          </p>

          {post.isAuthor ? (
            <div className="card bd-box">
              <p>{t('board.post.yours')}</p>
              <p className="hint">{t('board.post.add_whatsapp')}</p>
              {post.status === 'open' ? (
                <form action={closeBoardPostAction}>
                  <input type="hidden" name="postId" value={post.id} />
                  <input type="hidden" name="district" value={district} />
                  <button className="btn btn-line" type="submit">
                    {t('board.post.close')}
                  </button>
                </form>
              ) : null}
            </div>
          ) : post.contact ? (
            <div className="card bd-box">
              <p className="bd-rail-title">{t('board.post.contact')}</p>
              <div className="btn-row">
                {whatsapp ? (
                  <a className="btn btn-gold" href={whatsapp} rel="noopener noreferrer" target="_blank">
                    {t('board.post.whatsapp')}
                  </a>
                ) : null}
                <Link className="btn btn-line" href={profile}>
                  {t('board.post.profile')}
                </Link>
              </div>
              {whatsapp ? null : <p className="hint">{t('board.post.no_whatsapp')}</p>}
            </div>
          ) : (
            <div className="card bd-box">
              <p>{t('board.post.sign_in_contact')}</p>
              <Link className="btn btn-gold" href={loginHref(`${base}/${post.id}`)}>
                {t('board.post.sign_in')}
              </Link>
            </div>
          )}

          <p className="bd-notice">{t(def.notice as MessageKey)}</p>

          {post.contact ? (
            <details className="bd-report">
              <summary>{t('mercadito.report.title')}</summary>
              <form action={reportBoardPostAction} className="mk-form">
                <input type="hidden" name="postId" value={post.id} />
                <input type="hidden" name="district" value={district} />
                <label>
                  {t('mercadito.report.category')}
                  <select name="category" required defaultValue="">
                    <option value="" disabled>
                      {t('mercadito.form.choose')}
                    </option>
                    {BOARD_REPORT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {t(`mercadito.report.category.${category}` as MessageKey)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('mercadito.report.details')}
                  <textarea name="description" maxLength={1000} />
                </label>
                <button className="btn btn-line" type="submit">
                  {t('mercadito.report.submit')}
                </button>
              </form>
            </details>
          ) : null}
        </article>
      </div>
    </SiteShell>
  );
}
