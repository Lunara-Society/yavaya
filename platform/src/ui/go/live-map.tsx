'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import { GO_DEMO, demoFrame, offsetPoint, type DemoFrame, type GeoPoint } from '@/config/go-demo';
import type { MyDelivery, PublicMapSummary, PublicStorePin } from '@/server/domains/go/live-map';
import { loadMapLibre, pin, STYLE } from './map';

/**
 * YavayaGo's public live map (/yavayago/mapa).
 *
 * Three things on one map, kept apart on purpose:
 *  - the public picture: approved stores and counts, for anyone;
 *  - the member's own delivery, if they have one: the same authorised
 *    tracking endpoint as their order page, which checks on the server that
 *    they are its customer;
 *  - the demonstration: a made-up delivery drawn in this browser only
 *    (config/go-demo.ts), labelled as simulated for as long as it shows,
 *    and never sent to or stored by the server.
 *
 * Each status the panel shows is measured, not assumed: the map counts as
 * ready when the map library says it loaded; the live data as connected when
 * the last request for it succeeded; a driver's point as live only while it
 * is fresh. A map that draws is not taken as proof that tracking works.
 */

const LABEL_KEYS = [
  'aria', 'statusTitle',
  'labelMap', 'mapLoading', 'mapReady', 'mapFailed', 'mapFailedLong', 'retry',
  'labelProvider', 'providerOk', 'providerTrouble', 'providerDown',
  'labelData', 'dataLive', 'dataRetrying', 'dataOffline',
  'labelDeliveries', 'deliveriesNone', 'deliveriesCount', 'activeHeadline',
  'labelDrivers', 'driversCount', 'driversFew',
  'labelStores', 'storesCount', 'storesNone',
  'emptyTitle', 'emptyText', 'seeDemo', 'privacy', 'howTitle', 'how1', 'how2', 'how3',
  'zoomIn', 'zoomOut', 'recenter', 'storeOpen', 'storeClosed', 'storeView',
  'demoBanner', 'demoMode', 'demoExit', 'demoPause', 'demoResume', 'demoRestart', 'demoEta', 'demoNote',
  'demoPhase.to_pickup', 'demoPhase.at_pickup', 'demoPhase.to_dropoff', 'demoPhase.delivered', 'demoPickup', 'demoDropoff', 'demoDriver',
  'labelTracking', 'yourOrder', 'yourTrip', 'trackLive', 'trackStale', 'trackWaiting', 'trackNoDriver', 'trackEnded', 'trackRetrying', 'openDelivery',
  'driverActive', 'driverLink', 'storeOwner', 'storeLink', 'agoSeconds', 'agoMinutes',
] as const;

export type LiveMapLabels = Record<(typeof LABEL_KEYS)[number], string>;

type Props = {
  /** Where the map opens: the member's own place, or the first city Yavaya serves. */
  start: GeoPoint;
  /** The launch city's centre, which the demonstration's route is drawn from; null when no city is set. */
  demoCenter: GeoPoint | null;
  initial: PublicMapSummary;
  mine: MyDelivery[];
  driverActive: boolean;
  storeOwner: boolean;
  pollSeconds: number;
  trackingPollSeconds: number;
  startInDemo: boolean;
  labels: LiveMapLabels;
};

type Tracking = {
  status: string;
  store: GeoPoint & { name: string };
  dropoff: GeoPoint | null;
  driver: (GeoPoint & { accuracy: number | null; heading: number | null; ageSeconds: number; live: boolean }) | null;
};

const CLOSED = new Set(['delivered', 'cancelled', 'rejected', 'completed', 'expired']);
/** A map that has not drawn in this long is reported as not loaded, with a way to try again. */
const LOAD_TIMEOUT_MS = 20_000;
/** Tile errors in this window mean the map provider is struggling, and the panel says so. */
const TILE_TROUBLE_WINDOW_MS = 30_000;
const TILE_TROUBLE_COUNT = 3;

const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));

function ago(labels: LiveMapLabels, seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return s < 90 ? fill(labels.agoSeconds, { n: s }) : fill(labels.agoMinutes, { n: Math.round(s / 60) });
}

function lineFeature(points: GeoPoint[]) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: points.map((p) => [p.longitude, p.latitude]) },
  };
}

/** The part of the demo route already travelled: the corners passed, then where the driver is now. */
function travelled(center: GeoPoint, frame: DemoFrame): GeoPoint[] {
  const points: GeoPoint[] = [];
  let left = frame.covered;
  for (let i = 0; i < GO_DEMO.route.length - 1; i += 1) {
    const from = GO_DEMO.route[i]!;
    const to = GO_DEMO.route[i + 1]!;
    points.push(offsetPoint(center, from));
    const length = Math.hypot(to.east - from.east, to.north - from.north);
    if (left <= length) break;
    left -= length;
  }
  points.push(offsetPoint(center, frame.at));
  return points;
}

function labelledPin(kind: 'store' | 'home' | 'driver', label: string): HTMLElement {
  const element = pin(kind);
  element.setAttribute('role', 'img');
  element.setAttribute('aria-label', label);
  return element;
}

export function LiveMap({ start, demoCenter, initial, mine, driverActive, storeOwner, pollSeconds, trackingPollSeconds, startInDemo, labels }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const libRef = useRef<Awaited<ReturnType<typeof loadMapLibre>> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [tileTrouble, setTileTrouble] = useState(false);
  const tileErrors = useRef<number[]>([]);

  const [summary, setSummary] = useState(initial);
  const [feed, setFeed] = useState<'live' | 'retrying' | 'offline'>('live');
  const [updatedAt, setUpdatedAt] = useState(() => Date.parse(initial.generatedAt));
  // Starts at the figures' own time so the server and the browser render the same words; the clock runs after.
  const [now, setNow] = useState(() => Date.parse(initial.generatedAt));

  const [mode, setMode] = useState<'live' | 'demo'>(startInDemo && demoCenter ? 'demo' : 'live');
  const [frame, setFrame] = useState<DemoFrame>(() => demoFrame(0));
  const [running, setRunning] = useState(true);
  const elapsed = useRef(0);
  const demoDriver = useRef<Marker | null>(null);

  const own = mine.find((delivery) => delivery.carried) ?? mine[0] ?? null;
  const [track, setTrack] = useState<{ view: Tracking | null; state: 'waiting' | 'ok' | 'retrying' | 'ended' }>({ view: null, state: 'waiting' });

  // A fresh copy of the same stores every poll must not rebuild the markers (and close an open card).
  const storesKey = useMemo(() => JSON.stringify(summary.stores), [summary.stores]);

  // --- The map itself ----------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let loaded = false;
    setMapState('loading');
    const timeout = window.setTimeout(() => {
      if (!loaded && !cancelled) setMapState('failed');
    }, LOAD_TIMEOUT_MS);
    (async () => {
      let maplibre: Awaited<ReturnType<typeof loadMapLibre>>;
      try {
        maplibre = await loadMapLibre();
      } catch {
        if (!cancelled) setMapState('failed');
        return;
      }
      if (cancelled || !container.current) return;
      libRef.current = maplibre;
      const center = mode === 'demo' && demoCenter ? demoCenter : start;
      const instance = new maplibre.Map({
        container: container.current,
        style: `${window.location.origin}${STYLE}`,
        center: [center.longitude, center.latitude],
        zoom: 13,
        attributionControl: { compact: true },
      });
      mapRef.current = instance;
      instance.on('load', () => {
        loaded = true;
        window.clearTimeout(timeout);
        if (!cancelled) setMapState('ready');
      });
      instance.on('error', () => {
        if (!loaded) return;
        // A few failed tiles in a short time: the provider is struggling. Said, not hidden.
        const t = Date.now();
        tileErrors.current = [...tileErrors.current.filter((at) => t - at < TILE_TROUBLE_WINDOW_MS), t];
        if (tileErrors.current.length >= TILE_TROUBLE_COUNT) setTileTrouble(true);
      });
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is rebuilt only by "Reintentar"; everything else changes layers on the same map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // The provider warning clears once tiles stop failing for a while.
  useEffect(() => {
    if (!tileTrouble) return;
    const timer = window.setInterval(() => {
      const t = Date.now();
      tileErrors.current = tileErrors.current.filter((at) => t - at < TILE_TROUBLE_WINDOW_MS);
      if (tileErrors.current.length === 0) setTileTrouble(false);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [tileTrouble]);

  // --- The public picture, kept fresh ----------------------------------------------------------
  const poll = useCallback(async () => {
    if (navigator.onLine === false) {
      setFeed('offline');
      return;
    }
    try {
      const response = await fetch('/api/go/live-map', { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const next = (await response.json()) as PublicMapSummary;
      setSummary(next);
      setUpdatedAt(Date.parse(next.generatedAt));
      setFeed('live');
    } catch {
      // The last figures stay, with their age; the next poll tries again.
      setFeed('retrying');
    }
  }, []);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => void poll(), pollSeconds * 1000);
    const clock = window.setInterval(() => setNow(Date.now()), 5_000);
    const offline = () => setFeed('offline');
    const online = () => void poll();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(clock);
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, [poll, pollSeconds]);

  // --- Stores on the map (live mode only) ---------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const maplibre = libRef.current;
    if (mapState !== 'ready' || !map || !maplibre || mode !== 'live') return;
    const stores = JSON.parse(storesKey) as PublicStorePin[];
    const markers: Marker[] = stores.map((store) => {
      const state = store.isOpen ? labels.storeOpen : labels.storeClosed;
      const element = labelledPin('store', `${store.name} · ${state}`);
      element.classList.toggle('is-closed', !store.isOpen);
      // Built from text nodes, never HTML: a store's name is the store's own words.
      const card = document.createElement('div');
      card.className = 'lm-popup';
      const name = document.createElement('strong');
      name.textContent = store.name;
      const meta = document.createElement('span');
      meta.textContent = `${store.placeName} · ${state}`;
      const link = document.createElement('a');
      link.href = `/yavayago/stores/${store.id}`;
      link.textContent = labels.storeView;
      card.append(name, meta, link);
      return new maplibre.Marker({ element })
        .setLngLat([store.longitude, store.latitude])
        .setPopup(new maplibre.Popup({ offset: 20, closeButton: true }).setDOMContent(card))
        .addTo(map);
    });
    return () => {
      for (const marker of markers) marker.remove();
    };
  }, [mapState, mode, storesKey, labels.storeOpen, labels.storeClosed, labels.storeView]);

  // --- The member's own delivery (live mode only) -------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const maplibre = libRef.current;
    if (mapState !== 'ready' || !map || !maplibre || mode !== 'live' || !own?.carried) return;
    let cancelled = false;
    let timer: number | null = null;
    let driver: Marker | null = null;
    let store: Marker | null = null;
    let home: Marker | null = null;
    let framed = false;
    const stop = () => {
      if (timer !== null) window.clearInterval(timer);
      timer = null;
    };
    const tick = async () => {
      const response = await fetch(own.trackingUrl, { cache: 'no-store' }).catch(() => null);
      if (cancelled) return;
      if (response && (response.status === 404 || response.status === 401)) {
        // No longer this member's to follow (finished, cancelled, signed out): stop asking.
        setTrack({ view: null, state: 'ended' });
        stop();
        return;
      }
      if (!response?.ok) {
        // Lost connection: keep the last point, say it is not being refreshed, and try again.
        setTrack((current) => ({ ...current, state: 'retrying' }));
        return;
      }
      const view = (await response.json()) as Tracking;
      if (cancelled) return;
      if (!store) store = new maplibre.Marker({ element: pin('store') }).setLngLat([view.store.longitude, view.store.latitude]).addTo(map);
      if (view.dropoff && !home) home = new maplibre.Marker({ element: pin('home') }).setLngLat([view.dropoff.longitude, view.dropoff.latitude]).addTo(map);
      if (view.driver) {
        const at: [number, number] = [view.driver.longitude, view.driver.latitude];
        if (!driver) driver = new maplibre.Marker({ element: pin('driver') }).setLngLat(at).addTo(map);
        else driver.setLngLat(at);
        // An old point is drawn faded and labelled with its age, never as live.
        driver.getElement().classList.toggle('stale', !view.driver.live);
      } else if (driver) {
        driver.remove();
        driver = null;
      }
      if (!framed) {
        framed = true;
        const bounds = new maplibre.LngLatBounds();
        for (const p of [view.store, ...(view.dropoff ? [view.dropoff] : []), ...(view.driver ? [view.driver] : [])]) bounds.extend([p.longitude, p.latitude]);
        map.fitBounds(bounds, { padding: 70, maxZoom: 16, duration: 600 });
      }
      const ended = CLOSED.has(view.status);
      setTrack({ view, state: ended ? 'ended' : 'ok' });
      if (ended) stop();
    };
    void tick();
    timer = window.setInterval(() => void tick(), trackingPollSeconds * 1000);
    return () => {
      cancelled = true;
      stop();
      driver?.remove();
      store?.remove();
      home?.remove();
    };
  }, [mapState, mode, own?.carried, own?.trackingUrl, trackingPollSeconds]);

  // --- The demonstration --------------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const maplibre = libRef.current;
    if (mapState !== 'ready' || !map || !maplibre || mode !== 'demo' || !demoCenter) return;
    const points = GO_DEMO.route.map((step) => offsetPoint(demoCenter, step));
    const first = points[0]!;
    const pickupPoint = points[GO_DEMO.pickupIndex]!;
    const last = points[points.length - 1]!;
    map.addSource('demo-route', { type: 'geojson', data: lineFeature(points) });
    map.addSource('demo-done', { type: 'geojson', data: lineFeature([first, first]) });
    map.addLayer({ id: 'demo-route', type: 'line', source: 'demo-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#f3dc8a', 'line-width': 4, 'line-opacity': 0.35, 'line-dasharray': [1.5, 1.5] } });
    map.addLayer({ id: 'demo-done', type: 'line', source: 'demo-done', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#d4af37', 'line-width': 5 } });
    const pickup = new maplibre.Marker({ element: labelledPin('store', labels.demoPickup) }).setLngLat([pickupPoint.longitude, pickupPoint.latitude]).addTo(map);
    const dropoff = new maplibre.Marker({ element: labelledPin('home', labels.demoDropoff) }).setLngLat([last.longitude, last.latitude]).addTo(map);
    const driverElement = labelledPin('driver', labels.demoDriver);
    driverElement.classList.add('is-demo');
    demoDriver.current = new maplibre.Marker({ element: driverElement }).setLngLat([first.longitude, first.latitude]).addTo(map);
    const bounds = new maplibre.LngLatBounds();
    for (const p of points) bounds.extend([p.longitude, p.latitude]);
    map.fitBounds(bounds, { padding: 70, maxZoom: 16, duration: 700 });
    // Drawn where playback stands (0 on entering; kept when the map is rebuilt).
    const current = demoFrame(elapsed.current);
    const at = offsetPoint(demoCenter, current.at);
    demoDriver.current.setLngLat([at.longitude, at.latitude]);
    (map.getSource('demo-done') as GeoJSONSource | undefined)?.setData(lineFeature(travelled(demoCenter, current)));
    setFrame(current);

    return () => {
      pickup.remove();
      dropoff.remove();
      demoDriver.current?.remove();
      demoDriver.current = null;
      for (const id of ['demo-done', 'demo-route']) if (map.getLayer(id)) map.removeLayer(id);
      for (const id of ['demo-done', 'demo-route']) if (map.getSource(id)) map.removeSource(id);
    };
  }, [mapState, mode, demoCenter, labels.demoPickup, labels.demoDropoff, labels.demoDriver]);

  // Playback: smooth, or in one-second steps for those who asked for less motion.
  useEffect(() => {
    const map = mapRef.current;
    if (mapState !== 'ready' || !map || mode !== 'demo' || !demoCenter || !running) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const began = performance.now() - elapsed.current * 1000;
    let frameId = 0;
    let stepTimer = 0;
    let lastShown = -1;
    const advance = (): boolean => {
      const seconds = (performance.now() - began) / 1000;
      elapsed.current = seconds;
      const next = demoFrame(seconds);
      const at = offsetPoint(demoCenter, next.at);
      demoDriver.current?.setLngLat([at.longitude, at.latitude]);
      (map.getSource('demo-done') as GeoJSONSource | undefined)?.setData(lineFeature(travelled(demoCenter, next)));
      // The panel's words change a few times a second, not every frame.
      if (seconds - lastShown > 0.25 || next.phase === 'delivered') {
        lastShown = seconds;
        setFrame(next);
      }
      if (next.phase === 'delivered') {
        setRunning(false);
        return false;
      }
      return true;
    };
    if (reduced) {
      stepTimer = window.setInterval(() => {
        if (!advance()) window.clearInterval(stepTimer);
      }, 1_000);
    } else {
      const loop = () => {
        if (advance()) frameId = requestAnimationFrame(loop);
      };
      frameId = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(frameId);
      window.clearInterval(stepTimer);
    };
  }, [mapState, mode, demoCenter, running]);

  // --- Controls ------------------------------------------------------------------------------
  const recenter = () => {
    const map = mapRef.current;
    const maplibre = libRef.current;
    if (!map || !maplibre) return;
    const fit = (points: GeoPoint[], maxZoom = 15) => {
      if (points.length === 0) {
        map.flyTo({ center: [start.longitude, start.latitude], zoom: 13 });
        return;
      }
      if (points.length === 1) {
        map.flyTo({ center: [points[0]!.longitude, points[0]!.latitude], zoom: 14 });
        return;
      }
      const bounds = new maplibre.LngLatBounds();
      for (const p of points) bounds.extend([p.longitude, p.latitude]);
      map.fitBounds(bounds, { padding: 70, maxZoom, duration: 600 });
    };
    if (mode === 'demo' && demoCenter) fit(GO_DEMO.route.map((step) => offsetPoint(demoCenter, step)), 16);
    else if (track.view) fit([track.view.store, ...(track.view.dropoff ? [track.view.dropoff] : []), ...(track.view.driver ? [track.view.driver] : [])], 16);
    else if (summary.stores.length > 0) fit(summary.stores, 14);
    else fit([]);
  };

  const enterDemo = () => {
    elapsed.current = 0;
    setFrame(demoFrame(0));
    setRunning(true);
    setMode('demo');
    window.history.replaceState(null, '', '/yavayago/mapa?demo=1');
  };
  const exitDemo = () => {
    setRunning(false);
    setMode('live');
    window.history.replaceState(null, '', '/yavayago/mapa');
    mapRef.current?.flyTo({ center: [start.longitude, start.latitude], zoom: 13 });
  };
  const restartDemo = () => {
    elapsed.current = 0;
    setFrame(demoFrame(0));
    setRunning(true);
  };

  // --- What the panel says -------------------------------------------------------------------
  const sinceUpdate = ago(labels, (now - updatedAt) / 1000);
  const dataText = feed === 'live' ? fill(labels.dataLive, { ago: sinceUpdate }) : feed === 'retrying' ? fill(labels.dataRetrying, { ago: sinceUpdate }) : labels.dataOffline;
  const mapText = mapState === 'ready' ? labels.mapReady : mapState === 'loading' ? labels.mapLoading : labels.mapFailed;
  const providerText = mapState === 'failed' ? labels.providerDown : tileTrouble ? labels.providerTrouble : mapState === 'ready' ? labels.providerOk : labels.mapLoading;
  const openStores = summary.stores.filter((store) => store.isOpen).length;
  const driversText = 'count' in summary.driversOnline ? fill(labels.driversCount, { count: summary.driversOnline.count }) : fill(labels.driversFew, { count: summary.driversOnline.fewerThan });
  const trackText = !own
    ? null
    : track.state === 'ended'
      ? labels.trackEnded
      : !own.carried
        ? labels.trackNoDriver
        : track.state === 'retrying'
          ? labels.trackRetrying
          : track.view?.driver
            ? fill(track.view.driver.live ? labels.trackLive : labels.trackStale, { ago: ago(labels, track.view.driver.ageSeconds) })
            : labels.trackWaiting;
  const pct = Math.round((frame.covered / frame.total) * 100);
  const phaseText = labels[`demoPhase.${frame.phase}`];

  return (
    <div className={`lm${mode === 'demo' ? ' is-demo' : ''}`} data-map={mapState} data-mode={mode}>
      <div className="lm-map-area">
        <div ref={container} className="lm-map" role="application" aria-label={labels.aria} />
        {mode === 'demo' ? (
          <p className="lm-demo-banner" role="note">
            {labels.demoBanner}
          </p>
        ) : null}
        <div className="lm-controls">
          <button type="button" onClick={() => mapRef.current?.zoomIn()} aria-label={labels.zoomIn} title={labels.zoomIn} disabled={mapState !== 'ready'}>
            <span aria-hidden="true">+</span>
          </button>
          <button type="button" onClick={() => mapRef.current?.zoomOut()} aria-label={labels.zoomOut} title={labels.zoomOut} disabled={mapState !== 'ready'}>
            <span aria-hidden="true">−</span>
          </button>
          <button type="button" onClick={recenter} aria-label={labels.recenter} title={labels.recenter} disabled={mapState !== 'ready'}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            </svg>
          </button>
        </div>
        {mode === 'live' && summary.activeDeliveries === 0 && !own && demoCenter && mapState === 'ready' ? (
          // On a phone the panel is below the map: the map itself says it is empty, and where the demonstration is.
          <p className="lm-chip">
            <span>{labels.deliveriesNone}</span>
            <button type="button" onClick={enterDemo}>
              {labels.seeDemo}
            </button>
          </p>
        ) : null}
        {mapState === 'failed' ? (
          <div className="lm-failed" role="alert">
            <p>{labels.mapFailedLong}</p>
            <button type="button" className="btn btn-gold" onClick={() => setAttempt((n) => n + 1)}>
              {labels.retry}
            </button>
          </div>
        ) : null}
      </div>

      <aside className="lm-panel" aria-label={labels.statusTitle}>
        {mode === 'demo' ? (
          <section className="lm-card lm-demo">
            <p className="lm-demo-tag">{labels.demoMode}</p>
            <h2 aria-live="polite">{phaseText}</h2>
            <div className="lm-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={phaseText}>
              <span style={{ width: `${pct}%` }} />
            </div>
            {frame.phase !== 'delivered' ? <p className="lm-eta">{fill(labels.demoEta, { minutes: frame.etaMinutes })}</p> : null}
            <div className="lm-actions">
              {frame.phase === 'delivered' ? (
                <button type="button" className="btn btn-gold" onClick={restartDemo}>
                  {labels.demoRestart}
                </button>
              ) : (
                <button type="button" className="btn btn-line" onClick={() => setRunning((on) => !on)} aria-pressed={!running}>
                  {running ? labels.demoPause : labels.demoResume}
                </button>
              )}
              <button type="button" className="btn btn-line" onClick={exitDemo}>
                {labels.demoExit}
              </button>
            </div>
            <p className="lm-note">{labels.demoNote}</p>
          </section>
        ) : (
          <>
            {own ? (
              <section className="lm-card lm-own">
                <h2>{fill(own.kind === 'order' ? labels.yourOrder : labels.yourTrip, { code: own.code })}</h2>
                <p role="status" aria-live="polite">
                  {trackText}
                </p>
                <a className="btn btn-gold" href={own.href}>
                  {labels.openDelivery}
                </a>
              </section>
            ) : null}
            {summary.activeDeliveries === 0 ? (
              <section className="lm-card lm-empty">
                <h2>{labels.emptyTitle}</h2>
                <p>{labels.emptyText}</p>
                {demoCenter ? (
                  <button type="button" className="btn btn-gold" onClick={enterDemo}>
                    {labels.seeDemo}
                  </button>
                ) : null}
              </section>
            ) : (
              <section className="lm-card">
                <h2>{fill(labels.activeHeadline, { count: summary.activeDeliveries })}</h2>
                <p className="lm-note">{labels.privacy}</p>
                {demoCenter ? (
                  <button type="button" className="btn btn-line" onClick={enterDemo}>
                    {labels.seeDemo}
                  </button>
                ) : null}
              </section>
            )}
            {driverActive ? (
              <p className="lm-card lm-role">
                {labels.driverActive} <a href="/yavayago/driver">{labels.driverLink}</a>
              </p>
            ) : null}
            {storeOwner ? (
              <p className="lm-card lm-role">
                {labels.storeOwner} <a href="/yavayago/store">{labels.storeLink}</a>
              </p>
            ) : null}
          </>
        )}

        <section className="lm-card lm-status">
          <h2 className="lm-status-h">{labels.statusTitle}</h2>
          <dl>
            <div>
              <dt>{labels.labelMap}</dt>
              <dd className={`is-${mapState}`}>{mapText}</dd>
            </div>
            <div>
              <dt>{labels.labelProvider}</dt>
              <dd className={mapState === 'failed' ? 'is-failed' : tileTrouble ? 'is-warn' : `is-${mapState}`}>{providerText}</dd>
            </div>
            <div>
              <dt>{labels.labelData}</dt>
              <dd className={feed === 'live' ? 'is-ready' : 'is-warn'} role="status" aria-live="polite">
                {dataText}
              </dd>
            </div>
            <div>
              <dt>{labels.labelDeliveries}</dt>
              <dd>{summary.activeDeliveries === 0 ? labels.deliveriesNone : fill(labels.deliveriesCount, { count: summary.activeDeliveries })}</dd>
            </div>
            <div>
              <dt>{labels.labelDrivers}</dt>
              <dd>{driversText}</dd>
            </div>
            <div>
              <dt>{labels.labelStores}</dt>
              <dd>{summary.stores.length === 0 ? labels.storesNone : fill(labels.storesCount, { count: summary.stores.length, open: openStores })}</dd>
            </div>
            {own ? (
              <div>
                <dt>{labels.labelTracking}</dt>
                <dd className={track.view?.driver?.live && track.state === 'ok' ? 'is-ready' : 'is-warn'}>{trackText}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <details className="lm-card lm-how">
          <summary>{labels.howTitle}</summary>
          <ol>
            <li>{labels.how1}</li>
            <li>{labels.how2}</li>
            <li>{labels.how3}</li>
          </ol>
          <p className="lm-note">{labels.privacy}</p>
        </details>
      </aside>
    </div>
  );
}
