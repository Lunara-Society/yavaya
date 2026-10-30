import type { ReactNode } from 'react';
// The Studio draws the same profile canvas as the public page, beside its own controls.
import '@/ui/identity/identity.css';
import '@/ui/identity/studio/studio.css';

export default function IdentityStudioLayout({ children }: { children: ReactNode }) {
  return children;
}
