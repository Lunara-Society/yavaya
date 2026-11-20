import type { ReactNode } from 'react';
import './mirador.css';

/** Mirador's pages load its styles; nothing else on Yavaya pays for them. */
export default function MiradorLayout({ children }: { children: ReactNode }) {
  return children;
}
