'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Map as MapLibreMap, Marker } from 'maplibre-gl';

/**
 * YavayaGo's maps. One component, four jobs:
 *  - `pick`: choose a point (a store's door, a customer's drop-off). Writes
 *    two hidden inputs so the surrounding form works as a plain form.
 *  - `view`: show the store and the drop-off.
 *  - `track`: the customer's live view of their driver.
 *  - `drive`: the driver's view, which also shares the phone's position for
 *    the order they hold — and only while this page is open.
 *
 * Tiles, fonts and icons come from /api/map on this origin, never from a
 * tile server directly (see that route). The library's worker is served from
 * /maplibre/<version>/, a copy of the package's own file.
 */

export const MAPLIBRE_VERSION = '6.11.2';
const STYLE = '/api/map/styles/dark';

type Point = { latitude: number; longitude: number };

type Labels = Record<string, string>;

type Props =
  | { mode: 'pick'; initial: Point; zoom?: number; name: string; labels: Labels; follow?: { select: string; points: Record<string, Point> } }
  | { mode: 'view'; store: Point; dropoff?: Point | null; labels: Labels }
  | { mode: 'track'; orderId: string; pollSeconds: number; driverPhoto: string | null; labels: Labels }
  | { mode: 'drive'; orderId: string; store: Point; dropoff: Point | null; minIntervalSeconds: number; labels: Labels };

type Tracking = {
  status: string;
  store: Point & { name: string };
  dropoff: Point | null;
  driver: (Point & { accuracy: number | null; heading: number | null; ageSeconds: number; live: boolean }) | null;
};

async function loadMapLibre() {
  const maplibre = await import('maplibre-gl');
  maplibre.setWorkerUrl(`/maplibre/${MAPLIBRE_VERSION}/maplibre-gl-worker.mjs`);
  return maplibre;
}

function pin(kind: 'store' | 'home' | 'driver' | 'me', photo?: string | null): HTMLElement {
  const element = document.createElement('div');
  element.className = `go-pin go-pin-${kind}`;
  if (photo) {
    const img = document.createElement('img');
    img.src = photo;
    img.alt = '';
    element.appendChild(img);
  }
  return element;
}

const CLOSED = new Set(['delivered', 'cancelled', 'rejected']);

export function GoMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const locate = useRef<(() => void) | null>(null);
  const router = useRouter();
  const [picked, setPicked] = useState<Point | null>(props.mode === 'pick' ? props.initial : null);
  const [note, setNote] = useState<string | null>(null);
  const [age, setAge] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;
    let watch: number | null = null;
    let wakeLock: { release: () => Promise<void> } | null = null;

    (async () => {
      const maplibre = await loadMapLibre();
      if (cancelled || !container.current) return;
      const center = props.mode === 'pick' ? props.initial : props.mode === 'track' ? null : props.store;
      const instance = new maplibre.Map({
        container: container.current,
        style: `${window.location.origin}${STYLE}`,
        center: center ? [center.longitude, center.latitude] : [-87.2, 14.1],
        zoom: props.mode === 'pick' ? (props.zoom ?? 15) : 14,
        attributionControl: { compact: true },
        cooperativeGestures: false,
      });
      map.current = instance;
      instance.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');

      const fit = (points: Point[]) => {
        if (points.length === 0) return;
        if (points.length === 1) {
          instance.easeTo({ center: [points[0]!.longitude, points[0]!.latitude], zoom: 15 });
          return;
        }
        const bounds = new maplibre.LngLatBounds();
        for (const p of points) bounds.extend([p.longitude, p.latitude]);
        instance.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 600 });
      };

      if (props.mode === 'pick') {
        const marker = new maplibre.Marker({ element: pin('home'), draggable: true }).setLngLat([props.initial.longitude, props.initial.latitude]).addTo(instance);
        const set = (lng: number, lat: number) => {
          marker.setLngLat([lng, lat]);
          setPicked({ latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)) });
        };
        if (props.follow) {
          // When the form's city changes, the map goes there: a pin left in the
          // default city would put the store somewhere it is not.
          const follow = props.follow;
          const select = container.current.closest('form')?.querySelector<HTMLSelectElement>(`select[name="${follow.select}"]`);
          select?.addEventListener('change', () => {
            const point = follow.points[select.value];
            if (!point) return;
            set(point.longitude, point.latitude);
            instance.flyTo({ center: [point.longitude, point.latitude], zoom: 14 });
          });
        }
        marker.on('dragend', () => {
          const p = marker.getLngLat();
          set(p.lng, p.lat);
        });
        instance.on('click', (event) => set(event.lngLat.lng, event.lngLat.lat));
        locate.current = () => {
          if (!navigator.geolocation) return setNote(props.labels.noGeolocation ?? null);
          navigator.geolocation.getCurrentPosition(
            (position) => {
              set(position.coords.longitude, position.coords.latitude);
              instance.easeTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 17 });
              setNote(null);
            },
            () => setNote(props.labels.locationDenied ?? null),
            { enableHighAccuracy: true, timeout: 15_000 },
          );
        };
        return;
      }

      if (props.mode === 'view') {
        new maplibre.Marker({ element: pin('store') }).setLngLat([props.store.longitude, props.store.latitude]).addTo(instance);
        if (props.dropoff) new maplibre.Marker({ element: pin('home') }).setLngLat([props.dropoff.longitude, props.dropoff.latitude]).addTo(instance);
        instance.on('load', () => fit([props.store, ...(props.dropoff ? [props.dropoff] : [])]));
        return;
      }

      if (props.mode === 'drive') {
        new maplibre.Marker({ element: pin('store') }).setLngLat([props.store.longitude, props.store.latitude]).addTo(instance);
        if (props.dropoff) new maplibre.Marker({ element: pin('home') }).setLngLat([props.dropoff.longitude, props.dropoff.latitude]).addTo(instance);
        instance.on('load', () => fit([props.store, ...(props.dropoff ? [props.dropoff] : [])]));
        let me: Marker | null = null;
        let lastSent = 0;
        let framed = false;
        if (!navigator.geolocation) {
          setNote(props.labels.noGeolocation ?? null);
          return;
        }
        try {
          // Keep the screen on while sharing; a locked phone stops reporting.
          wakeLock = await (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null;
        } catch {
          wakeLock = null;
        }
        watch = navigator.geolocation.watchPosition(
          async (position) => {
            const point = { latitude: position.coords.latitude, longitude: position.coords.longitude };
            if (!me) me = new maplibre.Marker({ element: pin('me') }).setLngLat([point.longitude, point.latitude]).addTo(instance);
            else me.setLngLat([point.longitude, point.latitude]);
            if (!framed) {
              framed = true;
              fit([point, props.store, ...(props.dropoff ? [props.dropoff] : [])]);
            }
            const now = Date.now();
            if (now - lastSent < props.minIntervalSeconds * 1000) return;
            lastSent = now;
            const response = await fetch('/api/go/position', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orderId: props.orderId, ...point, accuracy: position.coords.accuracy ?? null, heading: position.coords.heading ?? null }),
            }).catch(() => null);
            if (response?.status === 404) {
              // The order is no longer theirs to report on: stop at once.
              if (watch !== null) navigator.geolocation.clearWatch(watch);
              router.refresh();
              return;
            }
            setNote(response?.ok ? props.labels.sharing ?? null : props.labels.offline ?? null);
          },
          () => setNote(props.labels.locationDenied ?? null),
          { enableHighAccuracy: true, maximumAge: 2_000, timeout: 20_000 },
        );
        return;
      }

      // track
      let driver: Marker | null = null;
      let store: Marker | null = null;
      let home: Marker | null = null;
      let framed = false;
      let lastStatus: string | null = null;
      const poll = async () => {
        const response = await fetch(`/api/go/orders/${props.orderId}/tracking`, { cache: 'no-store' }).catch(() => null);
        if (!response?.ok || cancelled) return;
        const data = (await response.json()) as Tracking;
        if (!store) store = new maplibre.Marker({ element: pin('store') }).setLngLat([data.store.longitude, data.store.latitude]).addTo(instance);
        if (data.dropoff && !home) home = new maplibre.Marker({ element: pin('home') }).setLngLat([data.dropoff.longitude, data.dropoff.latitude]).addTo(instance);
        if (data.driver) {
          const at: [number, number] = [data.driver.longitude, data.driver.latitude];
          if (!driver) driver = new maplibre.Marker({ element: pin('driver', props.driverPhoto) }).setLngLat(at).addTo(instance);
          else {
            // Glide to the new point instead of jumping.
            const from = driver.getLngLat();
            const started = performance.now();
            const step = (t: number) => {
              const k = Math.min(1, (t - started) / 900);
              driver?.setLngLat([from.lng + (at[0] - from.lng) * k, from.lat + (at[1] - from.lat) * k]);
              if (k < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }
          driver.getElement().classList.toggle('stale', !data.driver.live);
          setAge(data.driver.ageSeconds);
        } else if (driver) {
          driver.remove();
          driver = null;
          setAge(null);
        }
        if (!framed) {
          framed = true;
          fit([data.store, ...(data.dropoff ? [data.dropoff] : []), ...(data.driver ? [data.driver] : [])]);
        }
        if (lastStatus !== null && lastStatus !== data.status) router.refresh();
        lastStatus = data.status;
        if (CLOSED.has(data.status) && timer) {
          clearInterval(timer);
          timer = null;
        }
      };
      instance.on('load', () => {
        void poll();
        timer = setInterval(() => void poll(), props.pollSeconds * 1000);
      });
    })();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (watch !== null) navigator.geolocation.clearWatch(watch);
      void wakeLock?.release().catch(() => undefined);
      map.current?.remove();
      map.current = null;
    };
    // The map is built once per page; props are fixed for its life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="go-map-wrap">
      <div ref={container} className={`go-map go-map-${props.mode}`} role="application" aria-label={props.labels.aria} />
      {props.mode === 'pick' ? (
        <>
          <input type="hidden" name={`${props.name}Latitude`} value={picked?.latitude ?? ''} />
          <input type="hidden" name={`${props.name}Longitude`} value={picked?.longitude ?? ''} />
          <div className="go-map-bar">
            <button
              type="button"
              className="btn btn-line"
              onClick={() => locate.current?.()}
            >
              {props.labels.useMyLocation}
            </button>
            <span className="hint muted">{props.labels.pickHint}</span>
          </div>
        </>
      ) : null}
      {props.mode === 'track' && age !== null ? <p className="go-map-age muted">{(props.labels.seen ?? '').replace('{seconds}', String(age))}</p> : null}
      {note ? (
        <p className="go-map-note" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
