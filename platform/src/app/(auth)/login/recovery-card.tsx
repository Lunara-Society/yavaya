import type { ReactNode } from 'react';
import { Mark } from '@/ui/site/icons';

/** The sign-in card's shape, for the steps around signing in: a code, a forgotten password. */
export function RecoveryCard({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <section className="auth-card">
      <header className="auth-head">
        <Mark size={56} />
        <h1>{title}</h1>
        <p>{lead}</p>
      </header>
      {children}
    </section>
  );
}
