'use client';

import { askRoxi } from './ask';

/**
 * "¿Qué necesitas hoy?" — five doors into Yavaya through Roxi. Each opens her
 * with the request already said; she works out which district and prepares
 * what she can, and the member approves it. Without Roxi on the page (signed
 * out, or not configured) the doors are plain links to the districts.
 */
export function FrontDoor({ title, doors, variant }: { title: string; doors: Array<{ key: string; label: string; ask: string; href: string }>; variant?: 'hero' }) {
  return (
    <section className={`rx-door${variant ? ` is-${variant}` : ''}`} aria-labelledby="rx-door-title">
      <h2 id="rx-door-title" className="rx-door-title">
        {title}
      </h2>
      <div className="rx-door-row">
        {doors.map((door) => (
          <a
            key={door.key}
            href={door.href}
            className={`rx-door-btn is-${door.key}`}
            onClick={(event) => {
              // Roxi listens only when she is on the page; otherwise the link simply opens the district.
              if (!document.querySelector('.roxi')) return;
              event.preventDefault();
              askRoxi(door.ask);
            }}
          >
            {door.label}
          </a>
        ))}
      </div>
    </section>
  );
}
