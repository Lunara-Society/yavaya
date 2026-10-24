'use client';

import { usePathname } from 'next/navigation';
import { useLayoutEffect } from 'react';
import { themeAttributeAt } from '@/config/preferences';

/**
 * Keeps `<html data-theme>` right as the member moves between pages. The root
 * layout sets it on the first load, but layouts persist across client-side
 * navigation, so without this a visit that starts on Santuario would carry its
 * candlelight onto every page after it, and one that arrives there from the
 * home page would stay dark. Runs before paint, so neither shows.
 */
export function ThemeKeeper({ chosen }: { chosen: 'light' | 'dark' | null }) {
  const pathname = usePathname();
  useLayoutEffect(() => {
    const value = themeAttributeAt(pathname, chosen);
    const html = document.documentElement;
    if (value) html.setAttribute('data-theme', value);
    else html.removeAttribute('data-theme');
  }, [pathname, chosen]);
  return null;
}
