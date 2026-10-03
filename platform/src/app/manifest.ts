import type { MetadataRoute } from 'next';

/** Lets Yavaya be added to a phone's home screen with its own name and icon. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Yavaya — El hogar digital de Centroamérica',
    short_name: 'Yavaya',
    description: 'Compra, vende, trabaja, pide ayuda y pertenece — con una sola cuenta y una sola reputación.',
    start_url: '/',
    display: 'standalone',
    background_color: '#081120',
    theme_color: '#081120',
    lang: 'es',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
