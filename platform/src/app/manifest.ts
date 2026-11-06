import type { MetadataRoute } from 'next';
import { db } from '@/server/db/client';
import { lookEnabled } from '@/server/domains/platform/looks';

// Read per request: the icons follow the owner's "logo" switch.
export const dynamic = 'force-dynamic';

/** Lets Yavaya be added to a phone's home screen with its own name and icon. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const p = (await lookEnabled(db(), 'logo')) ? '/logo-' : '/';
  return {
    name: 'Yavaya — El hogar digital de Centroamérica',
    short_name: 'Yavaya',
    description: 'Compra, vende, trabaja, pide ayuda y pertenece — con una sola cuenta y una sola reputación.',
    start_url: '/',
    display: 'standalone',
    background_color: '#071b22',
    theme_color: '#071b22',
    lang: 'es',
    icons: [
      { src: `${p}icon-192.png`, sizes: '192x192', type: 'image/png' },
      { src: `${p}icon-512.png`, sizes: '512x512', type: 'image/png' },
      { src: `${p}icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
