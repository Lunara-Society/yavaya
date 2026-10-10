/**
 * Website icons: stroke-based, `currentColor`, so they follow the theme and
 * the district tone with no extra files or requests. Bodies are static strings
 * written here, never user input, which is what makes the inner-HTML render
 * below safe.
 */
const BODIES = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  pulse: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
  mercadito: '<path d="M3 9l2-5h14l2 5"/><path d="M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3"/><path d="M5 12v8h14v-8"/><path d="M10 20v-5h4v5"/>',
  yavayago: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17h5l3-7h3l1 4"/><path d="M11 10H8"/><path d="M14 10l-2-4h-2"/>',
  work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  community: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M15 14.5c.6-.3 1.3-.5 2-.5 2.2 0 4 1.8 4 4v2"/>',
  services: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/><path d="M17 3v2M21 7h-2"/>',
  sanctuary: '<path d="M12 2v4M10 4h4"/><path d="M6 21V11l6-5 6 5v10"/><path d="M3 21h18"/><path d="M10 21v-4a2 2 0 0 1 4 0v4"/>',
  animals: '<circle cx="6" cy="10" r="2"/><circle cx="10" cy="5.5" r="2"/><circle cx="14" cy="5.5" r="2"/><circle cx="18" cy="10" r="2"/><path d="M12 11c-3 0-5.5 4-5.5 6.5 0 1.7 1.3 2.5 2.8 2.5 1.2 0 1.8-.6 2.7-.6s1.5.6 2.7.6c1.5 0 2.8-.8 2.8-2.5C17.5 15 15 11 12 11z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 16.5c.6-1.6 2-2.5 3.5-2.5s2.9.9 3.5 2.5M15 10h3M15 13.5h3"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 9.5h3.7a1.8 1.8 0 0 1 0 3.5h-2.4a1.8 1.8 0 0 0 0 3.5h3.7"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9.5v5M18 9.5v5"/>',
  scale: '<path d="M12 4v16M7 20h10M5 7h14"/><path d="M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0z"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  map: '<path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5"/>',
  hands: '<path d="M7 11l3-3a2 2 0 0 1 3 0l4 4"/><path d="M3 13l4-2 5 5a1.6 1.6 0 0 1-2.3 2.3L7 15.6"/><path d="M21 13l-4-1-4 4"/>',
  pray: '<path d="M12 3v5M9 10.5l3-2.5 3 2.5M8 21l1-7 3-3 3 3 1 7"/>',
  house: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-5h4v5h5V10"/>',
  car: '<path d="M5 16l1.5-5.5A2 2 0 0 1 8.4 9h7.2a2 2 0 0 1 1.9 1.5L19 16"/><rect x="3" y="16" width="18" height="4" rx="1.5"/><circle cx="7.5" cy="18" r=".6"/><circle cx="16.5" cy="18" r=".6"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5L15 12l-3-3z"/>',
  shirt: '<path d="M8 3l-5 3 2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
  sofa: '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3"/><path d="M2 12a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2z"/><path d="M5 17v2M19 17v2"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M20.5 9.5 16 10M17 20l-2.5-5.5M7 20l2.5-5.5M3.5 9.5 8 10"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.4"/>',
  food: '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M8 7c0-1.5 1-2 1-3.5M12 7c0-1.5 1-2 1-3.5M16 7c0-1.5 1-2 1-3.5"/>',
  basket: '<path d="M3 10h18l-2 10H5z"/><path d="M8 10l4-6 4 6"/>',
  store: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v11H4z"/><path d="M9 20v-6h6v6"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  megaphone: '<path d="M3 10v4h3l7 4V6L6 10z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.3-1.7-1.3-3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.3 17 3 12 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7" r="1"/>',
  medical: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>',
  school: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  storm: '<path d="M7 17a5 5 0 1 1 1-9.9A6 6 0 0 1 19 9a4 4 0 0 1-1 8"/><path d="M12 13l-2 4h4l-2 4"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12C12 8 9 5 4 5c0 4 3 7 8 7zM12 12c0-3 2.5-6 7-6 0 3.5-2.5 6-7 6z"/>',
} as const;

export type IconName = keyof typeof BODIES;

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      dangerouslySetInnerHTML={{ __html: BODIES[name] }}
    />
  );
}

/**
 * The Yavaya seal: the circular gold badge with the volcano, the lake and the
 * colonial town. It is a painting, so it ships as images rather than a
 * drawing: public/brand/seal-*.webp at four sizes (the browser picks by
 * display size), cut out of the owner's artwork with a transparent
 * background. The favicon, app icons and share card are made from the same file.
 */
export function Mark({ size = 34, priority }: { size?: number; priority?: boolean }) {
  return (
    <img
      className="brand-mark"
      src="/brand/seal-192.webp"
      srcSet="/brand/seal-96.webp 96w, /brand/seal-192.webp 192w, /brand/seal-384.webp 384w, /brand/seal-768.webp 768w"
      sizes={`${size}px`}
      width={size}
      height={size}
      alt=""
      decoding="async"
      // The home page's seal spins into place on arrival; it must be there to be seen.
      fetchPriority={priority ? 'high' : undefined}
    />
  );
}

/**
 * The Yavaya token: a gold coin with a teal enamel ring. Filled, not a line
 * icon, so it reads as something of value at any size.
 */
export function TokenCoin({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="tkc-face" cx="38%" cy="32%" r="75%">
          <stop offset="0" stopColor="#fff6c8" />
          <stop offset="0.35" stopColor="#f2cf5b" />
          <stop offset="0.75" stopColor="#c8961c" />
          <stop offset="1" stopColor="#8a6410" />
        </radialGradient>
        <linearGradient id="tkc-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5ff2e0" />
          <stop offset="1" stopColor="#1a8f9e" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="14.5" fill="url(#tkc-face)" />
      <circle cx="16" cy="16" r="11" fill="none" stroke="url(#tkc-ring)" strokeWidth="1.6" />
      <path d="M11.2 10.5l4.8 6.2 4.8-6.2M16 16.7v5.8" fill="none" stroke="#6b4a08" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="11.5" cy="9.5" rx="4" ry="2" fill="#fff" opacity="0.35" transform="rotate(-30 11.5 9.5)" />
    </svg>
  );
}
