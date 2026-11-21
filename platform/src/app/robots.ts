import type { MetadataRoute } from 'next';
import { siteUrl } from '@/server/seo';

/**
 * What search engines may crawl. Everything public is open; what belongs to
 * a member (account, notifications, settings), what is private by design
 * (Espacio Violeta, the staff area) and machine endpoints are not.
 */
// Read at request time, so the address is the live one, not the build machine's.
export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        // A page's English address (`?lang=en`) is crawlable; other query strings (filters, sort orders) are not.
        allow: ['/', '/*?lang='],
        // `/login` covers the password reset (/login/nueva-clave); the old `/reset` address never existed.
        disallow: ['/account', '/admin', '/api/', '/violeta', '/notifications', '/settings', '/login', '/register', '/verify', '/*/mine', '/*/new', '/*/publish', '/*?*'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
