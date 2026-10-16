'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PlacePicker, type PickedPlace, type PlacePickerLabels } from '@/ui/components/place-picker';

export type LocationBarLabels = {
  label: string;
  everywhere: string;
  title: string;
  intro: string;
  useLocation: string;
  locating: string;
  locationFailed: string;
  countries: string;
  close: string;
  privacy: string;
  picker: PlacePickerLabels;
};

type Choice = { code: string; name: string; context: string } | null;

/**
 * "Where are you?" — one tap from every page.
 *
 * The choice is a cookie the browser writes itself (see server/place-choice),
 * then the page is refreshed so every district list re-renders around it.
 * "Use my location" asks the browser for a position once, turns it into the
 * nearest town on the server, and keeps only that town.
 */
export function LocationBar({
  labels,
  initial,
  countries,
  cookieName,
  maxAgeSeconds,
}: {
  labels: LocationBarLabels;
  initial: Choice;
  countries: Array<{ code: string; name: string }>;
  cookieName: string;
  maxAgeSeconds: number;
}) {
  const router = useRouter();
  const [choice, setChoice] = useState<Choice>(initial);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => setChoice(initial), [initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    const onClick = (event: MouseEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const save = (next: Choice) => {
    const secure = window.location.protocol === 'https:' ? '; secure' : '';
    document.cookie = next
      ? `${cookieName}=${encodeURIComponent(next.code)}; path=/; max-age=${maxAgeSeconds}; samesite=lax${secure}`
      : `${cookieName}=; path=/; max-age=0; samesite=lax${secure}`;
    setChoice(next);
    setOpen(false);
    setFailed(false);
    // An explicit ?place= on the current page would hide the new choice; drop it.
    const url = new URL(window.location.href);
    if (url.searchParams.has('place') || url.searchParams.has('city')) {
      url.searchParams.delete('place');
      url.searchParams.delete('city');
      url.searchParams.delete('page');
      router.replace(url.pathname + (url.search || ''));
    }
    router.refresh();
  };

  const fromPicked = (place: PickedPlace | null) => (place ? { code: place.code, name: place.name, context: place.context } : null);

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setFailed(true);
      return;
    }
    setLocating(true);
    setFailed(false);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          // Rounded to about a kilometre before it leaves the device: enough to find a town, no more.
          const lat = position.coords.latitude.toFixed(2);
          const lon = position.coords.longitude.toFixed(2);
          const response = await fetch(`/api/places?near=${lat},${lon}`, { cache: 'no-store' });
          const data = (await response.json()) as { places: PickedPlace[] };
          const place = data.places[0];
          if (place) save(fromPicked(place));
          else setFailed(true);
        } catch {
          setFailed(true);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setFailed(true);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  };

  return (
    <div className="locbar" ref={panel}>
      <button
        type="button"
        className={`chip locbar-chip${choice ? ' is-set' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${labels.label}: ${choice?.name ?? labels.everywhere}`}
        onClick={() => setOpen((value) => !value)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="10" r="2.6" fill="currentColor" />
        </svg>
        <span className="locbar-name">{choice?.name ?? labels.everywhere}</span>
      </button>
      {open ? (
        <div className="locbar-panel" role="dialog" aria-label={labels.title}>
          <div className="locbar-top">
            <strong>{labels.title}</strong>
            <button type="button" className="locbar-x" aria-label={labels.close} onClick={() => setOpen(false)}>
              ×
            </button>
          </div>
          <p className="locbar-intro">{labels.intro}</p>
          <PlacePicker name="_place" value="code" labels={labels.picker} onChange={(place) => place && save(fromPicked(place))} />
          <button type="button" className="btn btn-line locbar-gps" onClick={locate} disabled={locating}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3.2" fill="currentColor" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="1.8" />
              <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
            </svg>
            {locating ? labels.locating : labels.useLocation}
          </button>
          {failed ? <p className="locbar-fail" role="alert">{labels.locationFailed}</p> : null}
          <div className="menu-label">{labels.countries}</div>
          <div className="locbar-countries">
            <button type="button" className={`chip${choice ? '' : ' is-on'}`} onClick={() => save(null)}>
              {labels.everywhere}
            </button>
            {countries.map((country) => (
              <button
                key={country.code}
                type="button"
                className={`chip${choice?.code === country.code ? ' is-on' : ''}`}
                onClick={() => save({ code: country.code, name: country.name, context: '' })}
              >
                {country.name}
              </button>
            ))}
          </div>
          <p className="locbar-privacy">{labels.privacy}</p>
        </div>
      ) : null}
    </div>
  );
}
