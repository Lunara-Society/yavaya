import './barrio.css';

/** Animales's own stylesheet (barrio.css), loaded only on Animales's pages. The pages render their own shell. */
export default function AnimalsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
