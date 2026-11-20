'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeedVideo } from '@/server/domains/mirador/feed';
import { formatPrice } from '@/ui/mercadito/format';

/**
 * Mirador's feed (docs/mirador/README.md, "The feed"): one video per screen,
 * swiped up and down, the one in view playing and the others still.
 *
 * Built for a mid-range Android on a slow connection first:
 * - only the video in view and the next one have a <video> at all; the rest
 *   are their poster, so the phone never fetches what nobody is watching;
 * - the one in view preloads, the next only its first bytes (metadata);
 * - on a slow connection or with data saver on, the 360p encoding plays;
 * - with reduced motion asked for, nothing starts by itself: a tap plays;
 * - sound starts off (browsers refuse autoplay with sound) and, once the
 *   member turns it on, stays on for the rest of the visit.
 *
 * The video is the screen; the controls are few, at the edges, and every
 * one is a real button with a name for screen readers.
 */

export type FeedLabels = Record<
  | 'like' | 'unlike' | 'comments' | 'save' | 'unsave' | 'share' | 'more' | 'follow' | 'following' | 'sound_on' | 'sound_off' | 'play' | 'pause'
  | 'ai' | 'why_title' | 'why_none' | 'report' | 'block' | 'blocked' | 'close' | 'send' | 'reply' | 'comment_placeholder' | 'no_comments' | 'remove'
  | 'sign_in' | 'copied' | 'copy_link' | 'whatsapp' | 'report_title' | 'report_sent' | 'report_note' | 'loading' | 'error' | 'empty_title' | 'empty_text'
  | 'upload' | 'back' | 'needs_place' | 'choose_place' | 'views' | 'end' | 'data_saver' | 'brand'
  | 'want' | 'want_title' | 'want_quantity' | 'want_note' | 'want_send' | 'want_sent' | 'want_pending' | 'want_accepted' | 'want_whatsapp' | 'want_whatsapp_message' | 'want_less' | 'want_more'
  | 'offer_left' | 'offer_sold_out' | 'offer_closed' | 'offer_until' | 'offer_free' | 'offer_contribution' | 'offer_donation' | 'offer_food_notice' | 'offer_pay_note' | 'offer_ingredients' | 'captions'
  | 'offer_animals' | 'offer_need' | 'offer_needed' | 'offer_verified' | 'offer_complete' | 'help' | 'help_title' | 'help_quantity' | 'help_send' | 'help_sent' | 'help_pending' | 'help_accepted' | 'help_note',
  string
> & {
  tabs: Record<string, string>;
  why: Record<string, string>;
  action: Record<string, string>;
  reportCategories: Record<string, string>;
  errors: Record<string, string>;
  districts: Record<string, string>;
};

type Props = {
  initial: FeedVideo[];
  next: number | null;
  tab: string;
  tabs: readonly string[];
  needsPlace?: boolean;
  signedIn: boolean;
  loginHref: string;
  openComments?: boolean;
  /** A single video's page: no tabs, and the feed after it is Para ti. */
  single?: boolean;
  labels: FeedLabels;
  locale: string;
};

type Sheet = { kind: 'comments' | 'share' | 'more' | 'report' | 'why' | 'want'; video: FeedVideo } | null;

const compact = (n: number, locale: string) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

function post(url: string, body: unknown, method = 'POST') {
  return fetch(url, { method, credentials: 'same-origin', keepalive: true, headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body) })
    .then(async (response) => ({ ok: response.ok, status: response.status, body: (await response.json().catch(() => null)) as Record<string, unknown> | null }))
    .catch(() => ({ ok: false, status: 0, body: null }));
}

function slowConnection(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return Boolean(connection?.saveData) || /(^|-)2g|3g/.test(connection?.effectiveType ?? '');
}

export function MiradorFeed(props: Props) {
  const { labels, locale } = props;
  const [items, setItems] = useState(props.initial);
  const [next, setNext] = useState(props.next);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(props.openComments && props.initial[0] ? { kind: 'comments', video: props.initial[0] } : null);
  const [toast, setToast] = useState<string | null>(null);
  const [low, setLow] = useState(false);
  const [still, setStill] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const videos = useRef(new Map<string, HTMLVideoElement>());
  const loading = useRef(false);
  const watch = useRef<{ id: string; ms: number; last: number | null; replay: boolean } | null>(null);
  /** With reduced motion, the video the member tapped to play: every other one waits for its own tap. */
  const tapped = useRef<string | null>(null);

  useEffect(() => {
    setLow(slowConnection());
    setStill(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    try {
      if (sessionStorage.getItem('mirador.sound') === 'on') setMuted(false);
    } catch {
      /* private mode: sound starts off, as it does for everyone */
    }
  }, []);

  const flash = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  /** How long the video in view was watched, sent when the viewer moves on (or leaves the page). */
  const report = useCallback(() => {
    const w = watch.current;
    if (!w || w.ms < 500) return;
    void post(`/api/mirador/videos/${w.id}`, { action: 'view', watchedMs: Math.round(w.ms), replay: w.replay });
    w.ms = 0;
    w.replay = true;
  }, []);

  // Which video is in view: the one most of the screen shows.
  useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: [0.6] },
    );
    for (const child of root.querySelectorAll('[data-index]')) observer.observe(child);
    return () => observer.disconnect();
  }, [items.length]);

  // Play the one in view, pause the rest; count what was watched of the one before.
  useEffect(() => {
    const current = items[active];
    if (watch.current && watch.current.id !== current?.id) report();
    if (current && watch.current?.id !== current.id) watch.current = { id: current.id, ms: 0, last: null, replay: false };
    for (const [id, element] of videos.current) {
      if (id === current?.id) {
        element.muted = muted;
        // Reduced motion is only known after the first paint: a video that started before then is stopped.
        if (still && tapped.current !== id) element.pause();
        else if (!paused) void element.play().catch(() => setPaused(true));
      } else {
        element.pause();
        if (element.currentTime > 0 && Math.abs(items.findIndex((item) => item.id === id) - active) > 1) element.currentTime = 0;
      }
    }
  }, [active, items, muted, paused, still, report]);

  useEffect(() => {
    const leave = () => {
      if (document.visibilityState === 'hidden') report();
    };
    document.addEventListener('visibilitychange', leave);
    window.addEventListener('pagehide', report);
    return () => {
      document.removeEventListener('visibilitychange', leave);
      window.removeEventListener('pagehide', report);
    };
  }, [report]);

  // Near the end of what it has, the feed asks for a few more.
  useEffect(() => {
    if (next === null || loading.current || active < items.length - 3) return;
    loading.current = true;
    const tab = props.single ? 'para_ti' : props.tab;
    void fetch(`/api/mirador/feed?tab=${tab}&offset=${next}`, { credentials: 'same-origin', headers: { accept: 'application/json' } })
      .then((response) => response.json())
      .then((body: { items?: FeedVideo[]; next?: number | null }) => {
        const seen = new Set(items.map((item) => item.id));
        setItems((current) => [...current, ...(body.items ?? []).filter((item) => !seen.has(item.id))]);
        setNext(body.next ?? null);
      })
      .catch(() => setNext(null))
      .finally(() => {
        loading.current = false;
      });
  }, [active, items, next, props.single, props.tab]);

  const go = (step: number) => {
    const target = scroller.current?.querySelector<HTMLElement>(`[data-index="${Math.max(0, Math.min(items.length - 1, active + step))}"]`);
    target?.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
  };

  const needMember = () => {
    if (props.signedIn) return false;
    window.location.href = props.loginHref;
    return true;
  };

  const update = (id: string, change: (video: FeedVideo) => FeedVideo) => {
    setItems((current) => current.map((video) => (video.id === id ? change(video) : video)));
    setSheet((current) => (current && current.video.id === id ? { ...current, video: change(current.video) } : current));
  };

  async function toggleLike(video: FeedVideo) {
    if (needMember()) return;
    const on = !video.liked;
    update(video.id, (v) => ({ ...v, liked: on, counts: { ...v.counts, likes: Math.max(0, v.counts.likes + (v.own ? 0 : on ? 1 : -1)) } }));
    const result = await post(`/api/mirador/videos/${video.id}`, { action: on ? 'like' : 'unlike' });
    if (!result.ok) update(video.id, (v) => ({ ...v, liked: !on, counts: { ...v.counts, likes: video.counts.likes } }));
  }

  async function toggleSave(video: FeedVideo) {
    if (needMember()) return;
    const on = !video.saved;
    update(video.id, (v) => ({ ...v, saved: on, counts: { ...v.counts, saves: Math.max(0, v.counts.saves + (v.own ? 0 : on ? 1 : -1)) } }));
    const result = await post(`/api/mirador/videos/${video.id}`, { action: on ? 'save' : 'unsave' });
    if (!result.ok) update(video.id, (v) => ({ ...v, saved: !on, counts: { ...v.counts, saves: video.counts.saves } }));
  }

  async function follow(video: FeedVideo) {
    if (needMember()) return;
    const on = !video.following;
    setItems((current) => current.map((v) => (v.creator.id === video.creator.id ? { ...v, following: on } : v)));
    const result = await post(`/api/mirador/creators/${video.creator.id}`, { action: on ? 'follow' : 'unfollow' });
    if (!result.ok) setItems((current) => current.map((v) => (v.creator.id === video.creator.id ? { ...v, following: !on } : v)));
  }

  async function share(video: FeedVideo) {
    const url = `${window.location.origin}/mirador/v/${video.id}`;
    const title = video.caption.split('\n')[0]?.slice(0, 80) || labels.brand;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ url, title });
        void post(`/api/mirador/videos/${video.id}`, { action: 'share' });
        update(video.id, (v) => ({ ...v, counts: { ...v.counts, shares: v.counts.shares + (v.own ? 0 : 1) } }));
        return;
      } catch {
        return; // the member closed the share sheet: nothing was shared
      }
    }
    setSheet({ kind: 'share', video });
  }

  const toggleSound = () => {
    setMuted((value) => {
      try {
        sessionStorage.setItem('mirador.sound', value ? 'on' : 'off');
      } catch {
        /* nothing to remember it in */
      }
      return !value;
    });
  };

  const tapVideo = (video: FeedVideo) => {
    const element = videos.current.get(video.id);
    if (!element) return;
    if (element.paused) {
      tapped.current = video.id;
      setPaused(false);
      void element.play().catch(() => undefined);
    } else {
      setPaused(true);
      element.pause();
    }
  };

  return (
    <div className="mf" data-low={low ? '' : undefined}>
      <header className="mf-top">
        <a className="mf-back" href="/" aria-label={labels.back}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        {props.single ? (
          <span className="mf-brand">{labels.brand}</span>
        ) : (
          <nav className="mf-tabs" aria-label={labels.brand}>
            {props.tabs.map((tab) => (
              <a key={tab} href={tab === 'para_ti' ? '/mirador' : `/mirador?tab=${tab}`} aria-current={tab === props.tab ? 'page' : undefined}>
                {labels.tabs[tab]}
              </a>
            ))}
          </nav>
        )}
        <a className="mf-upload" href={props.signedIn ? '/mirador/subir' : props.loginHref} aria-label={labels.upload}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </a>
      </header>

      <div
        className="mf-scroller"
        ref={scroller}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'PageDown') {
            event.preventDefault();
            go(1);
          } else if (event.key === 'ArrowUp' || event.key === 'PageUp') {
            event.preventDefault();
            go(-1);
          }
        }}
      >
        {items.length === 0 ? (
          <section className="mf-empty">
            <h1>{props.needsPlace ? labels.needs_place : labels.empty_title}</h1>
            <p>{props.needsPlace ? '' : labels.empty_text}</p>
            <a className="mf-cta" href={props.needsPlace ? '/cerca' : props.signedIn ? '/mirador/subir' : props.loginHref}>
              {props.needsPlace ? labels.choose_place : labels.upload}
            </a>
          </section>
        ) : null}
        {items.map((video, index) => {
          const near = index >= active - 1 && index <= active + 1;
          const isActive = index === active;
          const portrait = video.height >= video.width;
          return (
            <article key={video.id} className="mf-item" data-index={index} aria-label={video.caption.slice(0, 120) || video.creator.name}>
              <div className="mf-stage" data-fit={portrait ? 'cover' : 'contain'} onClick={() => tapVideo(video)} onDoubleClick={() => !video.liked && void toggleLike(video)}>
                {near ? (
                  <video
                    ref={(element) => {
                      if (element) videos.current.set(video.id, element);
                      else videos.current.delete(video.id);
                    }}
                    src={low ? video.media.low : video.media.high}
                    poster={video.media.poster}
                    playsInline
                    loop
                    muted={muted}
                    preload={isActive ? 'auto' : 'metadata'}
                    autoPlay={false}
                    crossOrigin={video.captions ? 'anonymous' : undefined}
                    onTimeUpdate={(event) => {
                      const w = watch.current;
                      if (!w || w.id !== video.id) return;
                      const t = event.currentTarget.currentTime;
                      if (w.last !== null && t > w.last && t - w.last < 2) w.ms += (t - w.last) * 1000;
                      if (w.last !== null && t + 0.5 < w.last) {
                        // Looped back to the start: what was watched counts, and the next pass is a replay.
                        report();
                      }
                      w.last = t;
                    }}
                  >
                    {/* The narration's captions, shown by default: a muted feed is read, not heard. */}
                    {video.captions ? <track kind="captions" src={video.captions} srcLang={locale} label={labels.captions} default /> : null}
                  </video>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- a poster from the media route, sized by the encoder
                  <img src={video.media.poster} alt="" loading="lazy" decoding="async" />
                )}
                {isActive && (paused || still) ? (
                  <span className="mf-play" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="56" height="56">
                      <path d="M8 5v14l11-7z" fill="currentColor" />
                    </svg>
                  </span>
                ) : null}
              </div>

              <div className="mf-rail">
                <div className="mf-creator">
                  <a href={`/mirador/creador/${video.creator.yayId}`} className="mf-avatar" aria-label={video.creator.name}>
                    {video.creator.avatar ? (
                      // eslint-disable-next-line @next/next/no-img-element -- a member's photo from the media route
                      <img src={video.creator.avatar} alt="" width={44} height={44} loading="lazy" />
                    ) : (
                      <span>{video.creator.name.slice(0, 1).toUpperCase()}</span>
                    )}
                  </a>
                  {!video.own && !video.following ? (
                    <button type="button" className="mf-follow" onClick={() => void follow(video)} aria-label={`${labels.follow} ${video.creator.name}`}>
                      +
                    </button>
                  ) : null}
                </div>
                <button type="button" className="mf-btn" aria-pressed={video.liked} aria-label={video.liked ? labels.unlike : labels.like} onClick={() => void toggleLike(video)}>
                  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
                    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill={video.liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  </svg>
                  <span>{compact(video.counts.likes, locale)}</span>
                </button>
                <button type="button" className="mf-btn" aria-label={labels.comments} onClick={() => setSheet({ kind: 'comments', video })}>
                  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
                    <path d="M4 5h16v11H9l-5 4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  </svg>
                  <span>{compact(video.counts.comments, locale)}</span>
                </button>
                <button type="button" className="mf-btn" aria-pressed={video.saved} aria-label={video.saved ? labels.unsave : labels.save} onClick={() => void toggleSave(video)}>
                  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
                    <path d="M6 4h12v16l-6-4-6 4z" fill={video.saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  </svg>
                  <span>{compact(video.counts.saves, locale)}</span>
                </button>
                <button type="button" className="mf-btn" aria-label={labels.share} onClick={() => void share(video)}>
                  <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true">
                    <path d="M14 5l6 6-6 6M20 11H10a6 6 0 0 0-6 6v1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span>{compact(video.counts.shares, locale)}</span>
                </button>
                <button type="button" className="mf-btn mf-btn-small" aria-label={muted ? labels.sound_on : labels.sound_off} onClick={toggleSound}>
                  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                    <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
                    {muted ? <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /> : <path d="M16 8a5 5 0 0 1 0 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
                  </svg>
                </button>
                <button type="button" className="mf-btn mf-btn-small" aria-label={labels.more} onClick={() => setSheet({ kind: 'more', video })}>
                  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
                    <circle cx="5" cy="12" r="1.8" fill="currentColor" />
                    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
                    <circle cx="19" cy="12" r="1.8" fill="currentColor" />
                  </svg>
                </button>
              </div>

              <div className="mf-info">
                <p className="mf-who">
                  <a href={`/mirador/creador/${video.creator.yayId}`}>{video.creator.name}</a>
                  {video.place ? <span> · {video.place}</span> : null}
                  {video.source === 'ai' ? <span className="mf-ai">{labels.ai}</span> : null}
                </p>
                {video.caption ? <p className="mf-caption">{video.caption}</p> : null}
                {video.offer ? <OfferChip video={video} labels={labels} locale={locale} onWant={() => (props.signedIn ? setSheet({ kind: 'want', video }) : (window.location.href = props.loginHref))} /> : null}
                {video.link && !video.offer ? (
                  <a
                    className="mf-action"
                    href={video.link.url}
                    onClick={() => {
                      void post(`/api/mirador/videos/${video.id}`, { action: 'link' });
                    }}
                  >
                    <span className="mf-action-what">{labels.action[video.link.action]}</span>
                    <span className="mf-action-title">{video.link.title || labels.districts[video.link.district] || ''}</span>
                    {video.link.price ? <span className="mf-action-price">{formatPrice(video.link.price.minor, video.link.price.currency, locale)}</span> : null}
                  </a>
                ) : null}
              </div>
            </article>
          );
        })}
        {items.length > 0 && next === null ? <p className="mf-end">{labels.end}</p> : null}
      </div>

      {low ? <p className="mf-saver">{labels.data_saver}</p> : null}
      {toast ? (
        <p className="mf-toast" role="status">
          {toast}
        </p>
      ) : null}
      {sheet ? <SheetView sheet={sheet} close={() => setSheet(null)} labels={labels} locale={locale} signedIn={props.signedIn} loginHref={props.loginHref} flash={flash} update={update} setSheet={setSheet} onBlocked={(creatorId) => setItems((current) => current.filter((video) => video.creator.id !== creatorId))} /> : null}
    </div>
  );
}

type Comment = { id: string; parentId: string | null; body: string; createdAt: string; author: { name: string; yayId: string }; own: boolean; canRemove: boolean };

function SheetView(props: {
  sheet: NonNullable<Sheet>;
  close: () => void;
  labels: FeedLabels;
  locale: string;
  signedIn: boolean;
  loginHref: string;
  flash: (text: string) => void;
  update: (id: string, change: (video: FeedVideo) => FeedVideo) => void;
  setSheet: (sheet: Sheet) => void;
  onBlocked: (creatorId: string) => void;
}) {
  const { sheet, labels } = props;
  const video = sheet.video;
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panel.current?.focus();
    const key = (event: KeyboardEvent) => event.key === 'Escape' && props.close();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [props]);

  useEffect(() => {
    if (sheet.kind !== 'comments') return;
    void fetch(`/api/mirador/videos/${video.id}/comments`, { credentials: 'same-origin', headers: { accept: 'application/json' } })
      .then((response) => response.json())
      .then((body: { comments?: Comment[] }) => setComments(body.comments ?? []))
      .catch(() => setComments([]));
  }, [sheet.kind, video.id]);

  async function send() {
    if (!props.signedIn) {
      window.location.href = props.loginHref;
      return;
    }
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    const result = await post(`/api/mirador/videos/${video.id}/comments`, { body: draft, parentId: replyTo?.id ?? null });
    setBusy(false);
    if (!result.ok) {
      setError(labels.error);
      return;
    }
    setDraft('');
    setReplyTo(null);
    setComments((result.body?.comments as Comment[]) ?? comments);
    props.update(video.id, (v) => ({ ...v, counts: { ...v.counts, comments: v.counts.comments + 1 } }));
  }

  async function remove(comment: Comment) {
    const result = await post(`/api/mirador/comments/${comment.id}`, {}, 'DELETE');
    if (result.ok) {
      setComments((current) => (current ?? []).filter((c) => c.id !== comment.id));
      props.update(video.id, (v) => ({ ...v, counts: { ...v.counts, comments: Math.max(0, v.counts.comments - 1) } }));
    }
  }

  async function sendReport() {
    if (!category || busy) return;
    setBusy(true);
    const result = await post(`/api/mirador/videos/${video.id}/report`, { category, description: note });
    setBusy(false);
    if (result.ok) {
      props.flash(labels.report_sent);
      props.close();
    } else setError(labels.error);
  }

  async function block() {
    if (!props.signedIn) {
      window.location.href = props.loginHref;
      return;
    }
    const result = await post(`/api/mirador/creators/${video.creator.id}`, { action: 'block' });
    if (result.ok) {
      props.onBlocked(video.creator.id);
      props.flash(labels.blocked);
      props.close();
    }
  }

  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/mirador/v/${video.id}`;
  const roots = (comments ?? []).filter((c) => !c.parentId);
  const replies = (id: string) => (comments ?? []).filter((c) => c.parentId === id);
  const title =
    sheet.kind === 'comments' ? labels.comments : sheet.kind === 'share' ? labels.share : sheet.kind === 'report' ? labels.report_title : sheet.kind === 'why' ? labels.why_title : sheet.kind === 'want' ? (sheet.video.offer?.kind === 'need' ? labels.help_title : labels.want_title) : labels.more;

  const line = (c: Comment) => (
    <li key={c.id} className="mf-comment" data-reply={c.parentId ? '' : undefined}>
      <p>
        <a href={`/mirador/creador/${c.author.yayId}`}>{c.author.name}</a> {c.body}
      </p>
      <p className="mf-comment-meta">
        <time dateTime={c.createdAt}>{new Date(c.createdAt).toLocaleDateString(props.locale, { day: 'numeric', month: 'short' })}</time>
        {!c.parentId ? (
          <button type="button" onClick={() => setReplyTo(c)}>
            {labels.reply}
          </button>
        ) : null}
        {c.canRemove ? (
          <button type="button" onClick={() => void remove(c)}>
            {labels.remove}
          </button>
        ) : null}
      </p>
    </li>
  );

  return (
    <div className="mf-sheet-back" onClick={props.close}>
      <div className="mf-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel} onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={props.close} aria-label={labels.close}>
            ×
          </button>
        </header>

        {sheet.kind === 'comments' ? (
          <>
            <ul className="mf-comments">
              {comments === null ? <li className="mf-muted">{labels.loading}</li> : null}
              {comments && roots.length === 0 ? <li className="mf-muted">{labels.no_comments}</li> : null}
              {roots.map((c) => [line(c), ...replies(c.id).map(line)])}
            </ul>
            <form
              className="mf-compose"
              onSubmit={(event) => {
                event.preventDefault();
                void send();
              }}
            >
              {replyTo ? (
                <button type="button" className="mf-replying" onClick={() => setReplyTo(null)}>
                  {labels.reply}: {replyTo.author.name} ×
                </button>
              ) : null}
              <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={props.signedIn ? labels.comment_placeholder : labels.sign_in} maxLength={500} aria-label={labels.comment_placeholder} onFocus={() => !props.signedIn && (window.location.href = props.loginHref)} />
              <button type="submit" disabled={busy || !draft.trim()}>
                {labels.send}
              </button>
            </form>
          </>
        ) : null}

        {sheet.kind === 'share' ? (
          <div className="mf-options">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${video.caption.slice(0, 120)} ${url}`.trim())}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => void post(`/api/mirador/videos/${video.id}`, { action: 'share' })}
            >
              {labels.whatsapp}
            </a>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => props.flash(labels.copied));
                void post(`/api/mirador/videos/${video.id}`, { action: 'share' });
              }}
            >
              {labels.copy_link}
            </button>
          </div>
        ) : null}

        {sheet.kind === 'more' ? (
          <div className="mf-options">
            <button type="button" onClick={() => props.setSheet({ kind: 'why', video })}>
              {labels.why_title}
            </button>
            {!video.own ? (
              <>
                <button type="button" onClick={() => (props.signedIn ? props.setSheet({ kind: 'report', video }) : (window.location.href = props.loginHref))}>
                  {labels.report}
                </button>
                <button type="button" onClick={() => void block()}>
                  {labels.block} {video.creator.name}
                </button>
              </>
            ) : null}
            <p className="mf-muted">
              {compact(video.counts.views, props.locale)} {labels.views}
            </p>
          </div>
        ) : null}

        {sheet.kind === 'why' ? (
          <div className="mf-options">
            {video.why.length ? (
              <ul className="mf-why">
                {video.why.map((reason) => (
                  <li key={reason}>{labels.why[reason]}</li>
                ))}
              </ul>
            ) : (
              <p>{labels.why_none}</p>
            )}
          </div>
        ) : null}

        {sheet.kind === 'want' && video.offer ? <WantForm video={video} labels={labels} locale={props.locale} close={props.close} flash={props.flash} update={props.update} /> : null}

        {sheet.kind === 'report' ? (
          <form
            className="mf-report"
            onSubmit={(event) => {
              event.preventDefault();
              void sendReport();
            }}
          >
            {Object.entries(labels.reportCategories).map(([key, text]) => (
              <label key={key}>
                <input type="radio" name="category" value={key} checked={category === key} onChange={() => setCategory(key)} /> {text}
              </label>
            ))}
            <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} placeholder={labels.report_note} aria-label={labels.report_note} />
            <button type="submit" disabled={!category || busy}>
              {labels.send}
            </button>
          </form>
        ) : null}
        {error ? <p className="mf-error">{error}</p> : null}
      </div>
    </div>
  );
}

/** What a video offers, under its caption: the deal, how many are left, until when, and "Lo quiero". */
function OfferChip({ video, labels, locale, onWant }: { video: FeedVideo; labels: FeedLabels; locale: string; onWant: () => void }) {
  const offer = video.offer!;
  const until = new Date(offer.until).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  const sameDay = new Date(offer.until).toDateString() === new Date().toDateString();
  const need = offer.kind === 'need';
  const deal =
    offer.kind === 'sale' && offer.price
      ? formatPrice(offer.price.minor, offer.price.currency, locale)
      : { free: labels.offer_free, contribution: labels.offer_contribution, donation: labels.offer_donation, animals: labels.offer_animals, need: labels.offer_need, sale: '' }[offer.kind];
  const soldOut = offer.open && offer.remaining === 0;
  const left = (need ? labels.offer_needed : labels.offer_left).replace('{count}', String(offer.remaining));
  return (
    <div className="mf-offer" data-kind={offer.kind}>
      <div className="mf-offer-text">
        {offer.verified ? <span className="mf-offer-verified">{labels.offer_verified.replace('{name}', offer.verified.name)}</span> : null}
        <span className="mf-offer-title">{offer.title}</span>
        <span className="mf-offer-deal">
          {deal}
          {offer.unit ? ` / ${offer.unit}` : ''}
        </span>
        <span className="mf-offer-meta">
          {!offer.open ? labels.offer_closed : soldOut ? (need ? labels.offer_complete : labels.offer_sold_out) : `${left} · ${labels.offer_until.replace('{time}', sameDay ? until : new Date(offer.until).toLocaleDateString(locale, { weekday: 'short', hour: 'numeric' }))}`}
        </span>
      </div>
      {video.own ? null : offer.mine ? (
        <button type="button" className="mf-want is-mine" onClick={onWant}>
          {offer.mine.status === 'accepted' ? (need ? labels.help_accepted : labels.want_accepted) : need ? labels.help_pending : labels.want_pending}
        </button>
      ) : offer.open && offer.remaining > 0 ? (
        <button type="button" className="mf-want" onClick={onWant}>
          {need ? labels.help : labels.want}
        </button>
      ) : null}
    </div>
  );
}

/** "Lo quiero": how many, a word for the creator, the food notice, and the creator's WhatsApp if they share it. */
function WantForm({ video, labels, locale, close, flash, update }: { video: FeedVideo; labels: FeedLabels; locale: string; close: () => void; flash: (text: string) => void; update: (id: string, change: (video: FeedVideo) => FeedVideo) => void }) {
  const offer = video.offer!;
  const [quantity, setQuantity] = useState(offer.mine?.quantity ?? 1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/mirador/v/${video.id}`;
  const whatsapp = offer.whatsapp ? `https://wa.me/${offer.whatsapp.replace(/^\+/, '')}?text=${encodeURIComponent(labels.want_whatsapp_message.replace('{title}', offer.title).replace('{count}', String(quantity)).replace('{url}', url))}` : null;
  async function send() {
    setBusy(true);
    setError(null);
    const result = await post(`/api/mirador/videos/${video.id}/want`, { quantity, note });
    setBusy(false);
    if (!result.ok) {
      const message = typeof result.body?.error === 'string' ? labels.errors[result.body.error] : undefined;
      const details = (result.body?.details ?? {}) as Record<string, unknown>;
      return setError(message ? message.replace(/\{(\w+)\}/g, (all, key: string) => (key in details ? String(details[key]) : all)) : labels.error);
    }
    update(video.id, (v) => ({ ...v, offer: v.offer ? { ...v.offer, mine: { id: String(result.body?.id), status: 'pending', quantity } } : v.offer }));
    flash((offer.kind === 'need' ? labels.help_sent : labels.want_sent).replace('{name}', video.creator.name));
    close();
  }
  return (
    <form
      className="mf-report"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <p>
        <strong>{offer.title}</strong>
        {offer.price && offer.kind === 'sale' ? ` · ${formatPrice(offer.price.minor, offer.price.currency, locale)}` : ''}
      </p>
      {offer.ingredients ? (
        <p className="mf-muted">
          {labels.offer_ingredients}: {offer.ingredients}
        </p>
      ) : null}
      {offer.food && offer.kind !== 'need' ? <p className="mf-notice">{labels.offer_food_notice}</p> : null}
      {offer.kind === 'sale' || offer.kind === 'contribution' ? <p className="mf-muted">{labels.offer_pay_note}</p> : null}
      {offer.kind === 'need' ? <p className="mf-muted">{labels.help_note}</p> : null}
      <label className="mf-qty">
        {offer.kind === 'need' ? labels.help_quantity : labels.want_quantity}
        <span>
          <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label={labels.want_less}>
            −
          </button>
          <output aria-live="polite">{quantity}</output>
          <button type="button" onClick={() => setQuantity((q) => Math.min(offer.remaining || 1, q + 1))} aria-label={labels.want_more}>
            +
          </button>
        </span>
      </label>
      <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={200} placeholder={labels.want_note} aria-label={labels.want_note} />
      <button type="submit" disabled={busy || offer.mine?.status === 'accepted'}>
        {offer.kind === 'need' ? labels.help_send : labels.want_send}
      </button>
      {whatsapp ? (
        <a className="mf-wa" href={whatsapp} target="_blank" rel="noopener noreferrer">
          {labels.want_whatsapp}
        </a>
      ) : null}
      {error ? <p className="mf-error">{error}</p> : null}
    </form>
  );
}

