import Svg, { Path } from 'react-native-svg';
import { color } from './tokens';

/**
 * Yavaya's icon set (Chapter 03): original line icons on a 24 grid, 1.5 stroke,
 * round joins. Drawn for this app; no third-party icon font.
 */
export const ICONS = {
  mic: 'M12 4a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V7a3 3 0 0 0-3-3zM6 11.5a6 6 0 0 0 12 0M12 17.5V20M9 20h6',
  micOff: 'M9 9v3a3 3 0 0 0 5.1 2.1M15 10.5V7a3 3 0 0 0-5.8-1.1M6 11.5a6 6 0 0 0 9.9 4.6M18 11.5a6 6 0 0 1-.4 2.1M12 17.5V20M9 20h6M4 4l16 16',
  keyboard: 'M3.5 7h17v10h-17zM7 10h1M10 10h1M13 10h1M16 10h1M7 13.5h10',
  send: 'M4 12 20 5l-4 15-4-6.5zM12 13.5 20 5',
  home: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20',
  map: 'M9 5 4 7v12l5-2 6 2 5-2V5l-5 2-6-2zM9 5v12M15 7v12',
  bell: 'M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
  back: 'M14.5 5.5 8 12l6.5 6.5',
  close: 'M6 6l12 12M18 6 6 18',
  roxi: 'M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 8.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z',
  grid: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
  settings: 'M4 7h11M18 7h2M4 17h4M11 17h9M15 5v4M8 15v4',
  check: 'M5 12.5 10 17l9-10',
  alert: 'M12 4 21 19H3zM12 10v4M12 17h.01',
  chevron: 'M9.5 6 15.5 12l-6 6',
  sound: 'M4 10v4h4l5 4V6L8 10zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11',
  haptic: 'M9 4h6v16H9zM5 8v8M19 8v8',
  location: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  lab: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
  external: 'M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4',
  market: 'M4 9h16l-1.5 9.5a1 1 0 0 1-1 .5h-11a1 1 0 0 1-1-.5zM8 9l4-5 4 5',
  go: 'M4 15h10l3-4h3M7 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM9 11h5l-2-4H9',
  tool: 'M14 6a4 4 0 0 0 4.5 5.5L11 19a2 2 0 0 1-3-3l7.5-7.5A4 4 0 0 1 14 6z',
  work: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  people: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3.5 19a5.5 5.5 0 0 1 11 0M16 11a2.5 2.5 0 1 0 0-5M17 14a4.5 4.5 0 0 1 3.5 5',
  candle: 'M10 10h4v10h-4zM12 4c1.5 1.5 1.5 3.5 0 4-1.5-.5-1.5-2.5 0-4z',
  paw: 'M8 16c0-3 8-3 8 0 0 2-8 2-8 0zM7 11a1.5 2 0 1 0 0-.01zM17 11a1.5 2 0 1 0 0-.01zM10 7.5a1.5 2 0 1 0 0-.01zM14 7.5a1.5 2 0 1 0 0-.01z',
  house: 'M4 12 12 5l8 7M6 10.5V19h12v-8.5',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7',
  pulse: 'M3 12h4l2-5 4 10 2-5h6',
  book: 'M5 5h6a1 1 0 0 1 1 1v13a2 2 0 0 0-2-2H5zM19 5h-6a1 1 0 0 0-1 1v13a2 2 0 0 1 2-2h5z',
  store: 'M4 9l1.5-4h13L20 9M4 9h16v10H4zM10 19v-5h4v5',
  leaf: 'M5 19C5 10 11 5 19 5c0 8-5 14-14 14zM5 19l7-7',
  signal: 'M12 19v-4M8.5 15.5a5 5 0 0 1 7 0M6 12.5a8.5 8.5 0 0 1 12 0M3.5 9.5a12 12 0 0 1 17 0',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 24, tint = color.text, strokeWidth = 1.5 }: { name: IconName | string; size?: number; tint?: string; strokeWidth?: number }) {
  const d = (ICONS as Record<string, string>)[name] ?? ICONS.roxi;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={d} stroke={tint} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
