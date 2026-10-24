import type { Viewport } from 'next';
import './barrio.css';

/**
 * Santuario's own stylesheet (barrio.css), loaded only on Santuario's pages.
 * The browser's own bar takes the chapel's ivory too; the light theme itself
 * is set by the root layout (config/preferences.ts, isCandlelit).
 */
export const viewport: Viewport = { themeColor: '#fbf6ea' };

export default function SanctuaryLayout({ children }: { children: React.ReactNode }) {
  return children;
}
