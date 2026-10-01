import type { Metadata } from 'next';

/**
 * Every page here carries a plain title: a browser tab, a history list or a
 * shared screen should say "Yavaya" and nothing about this space. Never
 * indexed, and no referrer leaves for the quick-exit page.
 */
export const VIOLETA_METADATA: Metadata = {
  title: { absolute: 'Yavaya' },
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};
