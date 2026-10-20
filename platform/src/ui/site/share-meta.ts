import type { Metadata } from 'next';

/**
 * Title, description and link-preview card for a page about one thing — a
 * listing, a store, an animal. On WhatsApp the preview *is* the pitch: the
 * photo, the name and the price are what make someone tap. Without this a
 * shared listing showed the generic Yavaya card.
 *
 * `openGraph` is replaced, not merged, when a page sets it, so the site-wide
 * fields from the root layout are repeated here.
 */
export function previewMetadata(params: { title: string; description: string; imageId?: string | null; alt?: string }): Metadata {
  const description = params.description.replace(/\s+/g, ' ').trim().slice(0, 160);
  const image = params.imageId
    ? { url: `/media/${params.imageId}/preview`, width: 1200, height: 630, alt: params.alt ?? params.title }
    : { url: '/og.jpg', width: 1200, height: 630, alt: 'Yavaya — El hogar digital de Centroamérica' };
  return {
    title: params.title,
    description,
    openGraph: { type: 'website', siteName: 'Yavaya', locale: 'es_LA', alternateLocale: ['en_US'], title: params.title, description, images: [image] },
    twitter: { card: 'summary_large_image', title: params.title, description, images: [image.url] },
  };
}
