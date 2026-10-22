import 'server-only';
import { isNull } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { demoContent } from '@/server/db/schema';
import { browseListings } from '@/server/domains/mercadito/service';
import { listPosts } from '@/server/domains/work/service';
import { listAnimals } from '@/server/domains/animals/service';
import { browseStores } from '@/server/domains/go/service';

/**
 * "Oportunidades recientes" on the home page: the newest things anyone may
 * see without an account.
 *
 * Each kind comes through its own district's public listing, so the home page
 * applies exactly the rules the district page does — open listings only,
 * approved rescuers and stores only, expired job posts gone. Requests for
 * help (Servicios, Comunidad) are for members only and are never shown here,
 * and registered demo rows are left out: this is a list of what is real, and
 * an empty list is said to be empty.
 */
export type Opportunity = {
  kind: 'listing' | 'job' | 'animal' | 'store';
  id: string;
  href: string;
  title: string;
  /** What the card says under the title: a Mercadito category, a work field, a species, a shop category. */
  topic: string;
  /** Mercadito only: the asking price. */
  price: { minor: number; currency: string } | null;
  /** Trabajo only: what the post says it pays, as the employer wrote it. */
  payText: string | null;
  placeName: string;
  at: Date;
  photoId: string | null;
};

export async function recentOpportunities(executor: Executor, params: { locale: string; limit: number }): Promise<Opportunity[]> {
  const [listings, posts, animals, stores, demo] = await Promise.all([
    browseListings(executor, { locale: params.locale, page: 1 }),
    listPosts(executor, { locale: params.locale, page: 1 }),
    listAnimals(executor, { locale: params.locale, page: 1 }),
    browseStores(executor, {}),
    executor.select({ id: demoContent.subjectId }).from(demoContent).where(isNull(demoContent.removedAt)),
  ]);
  // Matched by id alone, as notifications match them: ids are UUIDs, unique across tables, and nothing yet fixes the
  // subject_type a district registers its demo rows under — a type mismatch must not let a demo row through.
  const isDemo = new Set(demo.map((row) => row.id));

  const all: Opportunity[] = [
    ...listings.items
      .filter((l) => !isDemo.has(l.id))
      .map((l) => ({
        kind: 'listing' as const,
        id: l.id,
        href: `/mercadito/${l.id}`,
        title: l.title,
        topic: l.category,
        price: { minor: l.priceMinor, currency: l.currencyCode },
        payText: null,
        placeName: l.placeName,
        at: l.publishedAt ?? new Date(0),
        photoId: l.coverMediaId,
      })),
    ...posts.items
      .filter((p) => !isDemo.has(p.id))
      .map((p) => ({
        kind: 'job' as const,
        id: p.id,
        href: `/work/posts/${p.id}`,
        title: p.title,
        topic: p.field,
        price: null,
        payText: p.payText,
        placeName: p.placeName,
        at: p.createdAt,
        photoId: null,
      })),
    ...animals.items
      .filter((a) => !isDemo.has(a.id))
      .map((a) => ({
        kind: 'animal' as const,
        id: a.id,
        href: `/animals/${a.id}`,
        title: a.name,
        topic: a.species,
        price: null,
        payText: null,
        placeName: a.placeName,
        at: a.createdAt,
        photoId: a.photoId,
      })),
    ...stores
      .filter((s) => !isDemo.has(s.id))
      .map((s) => ({
        kind: 'store' as const,
        id: s.id,
        href: `/yavayago/stores/${s.id}`,
        title: s.name,
        topic: s.category,
        price: null,
        payText: null,
        placeName: s.placeName,
        at: s.createdAt,
        photoId: s.photoMediaId,
      })),
  ];
  return all.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, params.limit);
}
