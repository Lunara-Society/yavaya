import type { MetadataRoute } from 'next';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { siteUrl } from '@/server/seo';
import { PAGE_PATHS } from '@/ui/site/blocks';

/**
 * Every public page Google should know about: the site's own pages, and the
 * real public content behind them — approved churches, published listings,
 * animals waiting for a home, lost and found posts, open job posts.
 *
 * Demo content is never listed (CLAUDE.md: it is excluded from everything
 * real), nor anything private, expired or under review.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

type Row = { id: string; updated_at: string | Date };

const notDemo = (table: string) => sql.raw(`not exists (select 1 from demo_content d where d.subject_id = ${table}.id::text and d.removed_at is null)`);

async function rows(query: ReturnType<typeof sql>): Promise<Row[]> {
  try {
    return (await db().execute(query)) as unknown as Row[];
  } catch (error) {
    // A sitemap without dynamic entries is better than no sitemap at all.
    console.error('sitemap query failed:', error instanceof Error ? error.message : error);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();
  const important = new Set(['/', '/districts', '/mercadito', '/services', '/work', '/sanctuary', '/animals', '/community']);
  const pages: MetadataRoute.Sitemap = [...new Set(Object.values(PAGE_PATHS))].map((path) => ({
    url: `${base}${path === '/' ? '' : path}`,
    lastModified: now,
    changeFrequency: important.has(path) ? 'daily' : 'weekly',
    priority: path === '/' ? 1 : important.has(path) ? 0.9 : 0.6,
  }));
  pages.push(
    ...['/mercadito/about', '/services/about', '/work/about', '/animals/about', '/animals/learn', '/animals/lost', '/sanctuary/prayer'].map((path) => ({
      url: `${base}${path}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  );

  const [listings, churches, animals, lost, posts] = await Promise.all([
    rows(sql`select l.id, l.updated_at from mercadito_listings l where l.status = 'published' and ${notDemo('l')} order by l.updated_at desc limit 5000`),
    rows(sql`select c.id, c.updated_at from sanctuary_churches c where c.status = 'approved' and ${notDemo('c')} limit 5000`),
    rows(sql`select a.id, a.updated_at from animals_listings a where a.status = 'available' and ${notDemo('a')} limit 5000`),
    rows(sql`select f.id, f.updated_at from animals_lost_found f where f.status = 'open' and ${notDemo('f')} limit 5000`),
    rows(sql`select p.id, p.updated_at from work_posts p where p.status = 'open' and p.expires_at > now() and ${notDemo('p')} limit 5000`),
  ]);
  const entries = (list: Row[], prefix: string, priority: number) =>
    list.map((row) => ({ url: `${base}${prefix}/${row.id}`, lastModified: new Date(row.updated_at), changeFrequency: 'weekly' as const, priority }));

  return [
    ...pages,
    ...entries(listings, '/mercadito', 0.6),
    ...entries(churches, '/sanctuary/churches', 0.7),
    ...entries(animals, '/animals', 0.6),
    ...entries(lost, '/animals/lost', 0.6),
    ...entries(posts, '/work/posts', 0.6),
  ];
}
