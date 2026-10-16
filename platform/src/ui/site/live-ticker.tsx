'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

type Item = { id: string; text: string; district: string | null; href: string | null; local: boolean; at: string };

type Rules = {
  firstDelaySeconds: number;
  showSeconds: number;
  gapSecondsBusy: number;
  gapSecondsQuiet: number;
  repeatAfterMinutes: number;
  refreshSeconds: number;
  snoozeMinutes: number;
};

export type LiveTickerLabels = {
  label: string;
  region: string;
  snooze: string;
  resume: string;
  close: string;
  nearby: string;
  agoNow: string;
  agoMinutes: string;
  agoHours: string;
};

/**
 * Something new happened, and where: one message at a time, now and then.
 *
 * The pacing is deliberately unhurried (LIVE_FEED_RULES): a first message a
 * few seconds after the page opens, each shown for a few seconds, then a
 * pause that is shorter when a lot is happening and longer when little is.
 * A message seen once comes back only after a while, and only if nothing
 * newer has taken its place. Nothing is ever shown that did not happen:
 * with no events, there are no messages and no pill.
 *
 * Pausing hides messages for a while; the small "En vivo" pill stays, and
 * tapping it brings them back at once. Both choices live in this browser.
 *
 * Never shown in Espacio Violeta, where a message about elsewhere would be an
 * intrusion, nor in administration or sign-in.
 */
const QUIET_PATHS = ['/violeta', '/admin', '/login', '/register', '/verify'];
const SEEN_KEY = 'yav_live_seen';
const SNOOZE_KEY = 'yav_live_snooze';

function readStore<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStore(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or storage full: messages still work, they just may repeat sooner.
  }
}

export function LiveTicker({ place, rules, labels }: { place: string | null; rules: Rules; labels: LiveTickerLabels }) {
  const pathname = usePathname();
  const quiet = QUIET_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const [items, setItems] = useState<Item[]>([]);
  const [shown, setShown] = useState<Item | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [snoozed, setSnoozed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const itemsRef = useRef<Item[]>([]);
  itemsRef.current = items;

  // Fetch now and every couple of minutes while the page is open and visible.
  useEffect(() => {
    if (quiet) return;
    let alive = true;
    const load = () => {
      if (document.hidden) return;
      fetch(`/api/live${place ? `?place=${encodeURIComponent(place)}` : ''}`)
        .then((response) => (response.ok ? response.json() : { items: [] }))
        .then((data: { items: Item[] }) => alive && setItems(data.items))
        .catch(() => {});
    };
    load();
    const every = window.setInterval(load, rules.refreshSeconds * 1000);
    return () => {
      alive = false;
      window.clearInterval(every);
    };
  }, [place, quiet, rules.refreshSeconds]);

  useEffect(() => {
    setSnoozed(readStore<number>(SNOOZE_KEY, 0) > Date.now());
  }, []);

  /** The next message: unseen first (nearby before far), else one not seen for a while. */
  const pick = useCallback((): Item | null => {
    const seen = readStore<Record<string, number>>(SEEN_KEY, {});
    const repeatMs = rules.repeatAfterMinutes * 60_000;
    const fresh = itemsRef.current.filter((item) => !seen[item.id]);
    if (fresh.length > 0) return fresh.find((item) => item.local) ?? fresh[0]!;
    const due = itemsRef.current
      .filter((item) => Date.now() - (seen[item.id] ?? 0) > repeatMs)
      .sort((a, b) => (seen[a.id] ?? 0) - (seen[b.id] ?? 0));
    return due[0] ?? null;
  }, [rules.repeatAfterMinutes]);

  // The rhythm: wait, show, wait, show.
  useEffect(() => {
    if (quiet || snoozed || items.length === 0) return;
    const gap = () => (items.length >= 4 ? rules.gapSecondsBusy : rules.gapSecondsQuiet) * 1000;
    const showNext = () => {
      const next = pick();
      if (next) {
        const seen = readStore<Record<string, number>>(SEEN_KEY, {});
        seen[next.id] = Date.now();
        // Forget ids older than a day so the store stays small.
        for (const [id, at] of Object.entries(seen)) if (Date.now() - at > 86_400_000) delete seen[id];
        writeStore(SEEN_KEY, seen);
        setLeaving(false);
        setShown(next);
        timer.current = window.setTimeout(() => {
          setLeaving(true);
          timer.current = window.setTimeout(() => {
            setShown(null);
            timer.current = window.setTimeout(showNext, gap());
          }, 450);
        }, rules.showSeconds * 1000);
      } else {
        timer.current = window.setTimeout(showNext, gap());
      }
    };
    timer.current = window.setTimeout(showNext, shown ? gap() : rules.firstDelaySeconds * 1000);
    return () => window.clearTimeout(timer.current);
    // Restart the rhythm only when there is news, or when pausing or resuming.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length > 0, snoozed, quiet, pick]);

  if (quiet || items.length === 0) return null;

  const ago = (iso: string) => {
    const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
    if (minutes < 2) return labels.agoNow;
    if (minutes < 60) return labels.agoMinutes.replace('{count}', String(minutes));
    return labels.agoHours.replace('{count}', String(Math.round(minutes / 60)));
  };

  const snooze = () => {
    writeStore(SNOOZE_KEY, Date.now() + rules.snoozeMinutes * 60_000);
    window.clearTimeout(timer.current);
    setShown(null);
    setSnoozed(true);
  };
  const resume = () => {
    writeStore(SNOOZE_KEY, 0);
    // Renewed on request: everything may be shown again, starting now.
    writeStore(SEEN_KEY, {});
    setSnoozed(false);
    const next = itemsRef.current.find((item) => item.local) ?? itemsRef.current[0] ?? null;
    if (next) {
      setLeaving(false);
      setShown(next);
    }
  };

  return (
    <div className="live" role="region" aria-label={labels.region}>
      {shown ? (
        <div className={`live-toast${leaving ? ' is-leaving' : ''}`} data-district={shown.district ?? undefined} role="status" aria-live="polite">
          <span className="live-dot" aria-hidden="true" />
          <div className="live-body">
            <span className="live-meta">
              {labels.label}
              {shown.local ? ` · ${labels.nearby}` : ''} · {ago(shown.at)}
            </span>
            {shown.href ? (
              <Link href={shown.href} className="live-text">
                {shown.text}
              </Link>
            ) : (
              <span className="live-text">{shown.text}</span>
            )}
          </div>
          <button type="button" className="live-x" aria-label={labels.snooze} title={labels.snooze} onClick={snooze}>
            ×
          </button>
        </div>
      ) : (
        <button type="button" className={`live-pill${snoozed ? ' is-paused' : ''}`} onClick={resume} aria-label={labels.resume} title={labels.resume}>
          <span className="live-dot" aria-hidden="true" />
          {labels.label}
        </button>
      )}
    </div>
  );
}
