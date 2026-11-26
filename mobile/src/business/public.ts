import { SERVER_URL } from '../core/env';
import { getJson } from './api';

/** Real, public data the native shell can show today (no account needed). */
export type LiveItem = { id: string; text: string; district?: string; placeName?: string; at?: string };
export type GoStore = { id: string; name: string; category: string; isOpen: boolean; latitude: number; longitude: number; placeName: string };
export type GoLiveMap = { generatedAt: string; stores: GoStore[]; activeDeliveries: number; driversOnline: { fewerThan?: number; count?: number } };
export type Place = { id: string; code: string; level: string; name: string; context: string; kind: string };

export const fetchLive = () => getJson<{ items: LiveItem[] }>(`${SERVER_URL}/api/live`).then((r) => r.items ?? []);
export const fetchGoMap = () => getJson<GoLiveMap>(`${SERVER_URL}/api/go/live-map`);
export const searchPlaces = (q: string) =>
  getJson<{ places: Place[] }>(`${SERVER_URL}/api/places?q=${encodeURIComponent(q)}`).then((r) => r.places ?? []);
