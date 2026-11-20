import type { ReactNode } from 'react';
import '../../mirador/mirador.css';

/** The moderation page uses Mirador's own list styles. */
export default function MiradorAdminLayout({ children }: { children: ReactNode }) {
  return children;
}
