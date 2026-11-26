import { getJson } from './api';

/**
 * A district's newest items, exactly as its website page lists them
 * (platform: /api/mobile/v1/feed/[district]). Never invented: an empty
 * district shows as empty.
 */
export type FeedItem = {
  id: string;
  title: string;
  detail: string;
  place: string | null;
  image: string | null;
  path: string;
  featured: boolean;
  at: string;
};

export type Feed = { items: FeedItem[]; hasMore: boolean; page: number; signedOut?: boolean };

/** The districts the server lists natively today; the rest open their website screen. */
export const FEED_DISTRICTS = ['mercadito', 'work', 'animals', 'community'] as const;
export type FeedDistrict = (typeof FEED_DISTRICTS)[number];

export const hasFeed = (id: string): id is FeedDistrict => (FEED_DISTRICTS as readonly string[]).includes(id);

export async function fetchFeed(district: FeedDistrict, page = 1, q?: string): Promise<Feed> {
  const query = new URLSearchParams({ page: String(page) });
  if (q) query.set('q', q);
  return getJson<Feed>(`/api/mobile/v1/feed/${district}?${query.toString()}`);
}

/** "hace 3 h", in Spanish, from an ISO date; the server's clock is the reference. */
export function ago(iso: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `hace ${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}
