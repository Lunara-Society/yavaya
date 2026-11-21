import type { MetadataRoute } from 'next';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { siteUrl } from '@/server/seo';
import { PAGE_PATHS } from '@/ui/site/blocks';
import { DISTRICTS } from '@/config/districts';
import { BOARD_DISTRICT_KEYS } from '@/config/boards';
import { lookEnabled } from '@/server/domains/platform/looks';

/**
 * Every public page Google should know about: the site's own pages, every
 * district that is open (read from the register, so a district that opens is
 * listed without touching this file), and the real public content behind them
 * — approved churches, published listings, animals waiting for a home, lost
 * and found posts, open job posts, open posts on the board districts and
 * approved YavayaGo stores.
 *
 * Demo content is never listed (CLAUDE.md: it is excluded from everything
 * real), nor anything private, expired or under review.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 3600;

type Row = { id: string; updated_at: string | Date; district?: string };

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
  /*
   * The site's own pages carry no lastmod: they have no date of their own to give, and stamping the time of the
   * request made every URL "changed" on every fetch, which teaches crawlers to ignore the field. Content rows keep
   * theirs (their real updated_at). Each page names its English address (`?lang=en`, middleware.ts).
   */
  const withEnglish = (url: string) => ({ languages: { es: url, en: `${url}${url.includes('?') ? '&' : '?'}lang=en` } });
  // Open districts are as important as the original ones: the board districts (Hogar … Diáspora) were missing here.
  const districtPaths = Object.values(DISTRICTS).filter((d) => d.status === 'available').map((d) => `/${d.slug}`);
  const important = new Set(['/', '/districts', ...districtPaths]);
  const pages: MetadataRoute.Sitemap = [...new Set([...Object.values(PAGE_PATHS), ...districtPaths, '/cerca'])].map((path) => ({
    url: `${base}${path === '/' ? '' : path}`,
    changeFrequency: important.has(path) ? 'daily' : 'weekly',
    priority: path === '/' ? 1 : important.has(path) ? 0.9 : 0.6,
    alternates: withEnglish(`${base}${path === '/' ? '' : path}`),
  }));
  // Mirador, while its switch has it open to everyone (otherwise the page does not exist for visitors).
  const mirador = await lookEnabled(db(), 'mirador').catch(() => false);
  if (mirador) pages.push({ url: `${base}/mirador`, changeFrequency: 'daily', priority: 0.8, alternates: withEnglish(`${base}/mirador`) });
  // Not the prayer wall: it is for members only and marked noindex, so listing it only contradicted itself.
  pages.push(
    ...['/mercadito/about', '/services/about', '/work/about', '/yavayago/about', '/yavayago/viajes', '/community/about', '/animals/about', '/animals/learn', '/animals/lost'].map((path) => ({
      url: `${base}${path}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
      alternates: withEnglish(`${base}${path}`),
    })),
  );

  const [listings, churches, animals, lost, posts, stores, boards] = await Promise.all([
    rows(sql`select l.id, l.updated_at from mercadito_listings l where l.status = 'published' and ${notDemo('l')} order by l.updated_at desc limit 5000`),
    rows(sql`select c.id, c.updated_at from sanctuary_churches c where c.status = 'approved' and ${notDemo('c')} limit 5000`),
    rows(sql`select a.id, a.updated_at from animals_listings a where a.status = 'available' and ${notDemo('a')} limit 5000`),
    rows(sql`select f.id, f.updated_at from animals_lost_found f where f.status = 'open' and ${notDemo('f')} limit 5000`),
    rows(sql`select p.id, p.updated_at from work_posts p where p.status = 'open' and p.expires_at > now() and ${notDemo('p')} limit 5000`),
    rows(sql`select s.id, s.updated_at from go_stores s where s.status = 'approved' and ${notDemo('s')} limit 5000`),
    rows(sql`select b.id, b.district, b.updated_at from board_posts b where b.status = 'open' and b.expires_at > now() and ${notDemo('b')} order by b.updated_at desc limit 5000`),
  ]);
  const boardDistricts = new Set<string>(BOARD_DISTRICT_KEYS);
  const entries = (list: Row[], prefix: string, priority: number) =>
    list.map((row) => ({ url: `${base}${prefix}/${row.id}`, lastModified: new Date(row.updated_at), changeFrequency: 'weekly' as const, priority }));

  return [
    ...pages,
    ...entries(listings, '/mercadito', 0.6),
    ...entries(churches, '/sanctuary/churches', 0.7),
    ...entries(animals, '/animals', 0.6),
    ...entries(lost, '/animals/lost', 0.6),
    ...entries(posts, '/work/posts', 0.6),
    ...entries(stores, '/yavayago/stores', 0.6),
    ...boards
      .filter((row) => row.district && boardDistricts.has(row.district))
      .map((row) => ({ url: `${base}/${row.district}/${row.id}`, lastModified: new Date(row.updated_at), changeFrequency: 'weekly' as const, priority: 0.5 })),
  ];
}
