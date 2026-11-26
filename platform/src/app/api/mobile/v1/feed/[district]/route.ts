import { NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { getTranslator } from '@/i18n/server';
import { currentSession } from '@/server/auth/context';
import { browseListings } from '@/server/domains/mercadito/service';
import { listPosts as listWorkPosts } from '@/server/domains/work/service';
import { listAnimals } from '@/server/domains/animals/service';
import { listPosts as listCommunityPosts, NEIGHBOUR_KINDS } from '@/server/domains/community/service';
import { siteUrl } from '@/server/seo';
import { HTTP } from '../../http';

export const dynamic = 'force-dynamic';

/**
 * One district's newest items for the app's native screens, in one shape:
 * exactly what the district's own page lists, from the same domain function
 * and with the same visibility (Comunidad answers only a signed-in member, as
 * its page does). Read only; acting on an item opens its real page.
 */
export type FeedItem = {
  id: string;
  title: string;
  /** The line under the title: a price, a pay, a place. */
  detail: string;
  place: string | null;
  image: string | null;
  /** The item's page on the website, opened inside the app. */
  path: string;
  featured: boolean;
  at: string;
};

const MAX_PAGE = 50;
const BODY_PREVIEW = 140;

function money(minor: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(minor / 100);
  } catch {
    return `${currency} ${Math.round(minor / 100)}`;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ district: string }> }) {
  const { district } = await params;
  const url = new URL(request.url);
  const page = Math.max(1, Math.min(Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1, MAX_PAGE));
  const query = url.searchParams.get('q')?.trim().slice(0, 80) || undefined;
  const { locale } = await getTranslator();
  const base = siteUrl();
  const media = (id: string | null) => (id ? `${base}/media/${id}` : null);
  const headers = { 'Cache-Control': 'private, max-age=30' };

  if (district === 'mercadito') {
    const result = await browseListings(db(), { query, page, locale });
    const items: FeedItem[] = result.items.map((item) => ({
      id: item.id,
      title: item.title,
      detail: money(item.priceMinor, item.currencyCode, locale),
      place: item.placeName,
      image: media(item.coverMediaId),
      path: `/mercadito/${item.id}`,
      featured: item.featured,
      at: item.publishedAt.toISOString(),
    }));
    return NextResponse.json({ items, hasMore: result.hasMore, page: result.page }, { headers });
  }
  if (district === 'work') {
    const result = await listWorkPosts(db(), { locale, page });
    const items: FeedItem[] = result.items.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.payText,
      place: item.placeName,
      image: null,
      path: `/work/posts/${item.id}`,
      featured: false,
      at: item.createdAt.toISOString(),
    }));
    return NextResponse.json({ items, hasMore: result.hasMore, page: result.page }, { headers });
  }
  if (district === 'animals') {
    const result = await listAnimals(db(), { locale, page });
    const items: FeedItem[] = result.items.map((item) => ({
      id: item.id,
      title: item.name,
      detail: item.rescuerName,
      place: item.placeName,
      image: media(item.photoId),
      path: `/animals/${item.id}`,
      featured: false,
      at: item.createdAt.toISOString(),
    }));
    return NextResponse.json({ items, hasMore: result.hasMore, page: result.page }, { headers });
  }
  if (district === 'community') {
    const session = await currentSession();
    if (!session) return NextResponse.json({ items: [], hasMore: false, page, signedOut: true }, { headers: { 'Cache-Control': 'private, no-store' } });
    const result = await listCommunityPosts(db(), { viewerId: session.user.userId, kinds: NEIGHBOUR_KINDS, page, locale });
    const items: FeedItem[] = result.items.map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.body.slice(0, BODY_PREVIEW),
      place: item.placeName,
      image: null,
      path: `/community/${item.id}`,
      featured: false,
      at: item.createdAt.toISOString(),
    }));
    return NextResponse.json({ items, hasMore: result.hasMore, page: result.page }, { headers: { 'Cache-Control': 'private, no-store' } });
  }
  return NextResponse.json({ error: 'district' }, { status: HTTP.notFound });
}
