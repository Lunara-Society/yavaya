import './barrio.css';

/** Servicios's own stylesheet (barrio.css), loaded only on Servicios's pages. The pages render their own shell. */
export default function ServicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
