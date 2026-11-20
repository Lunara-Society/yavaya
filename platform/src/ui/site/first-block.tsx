import './district-focus.css';
import type { ReactNode } from 'react';
import type { Translator } from '@/i18n';
import { Icon, type IconName } from './icons';

/**
 * One honest "be the first" block, for a district (or a part of one) that
 * has nothing in it yet (docs/DISTRICT-FOCUS.md). It replaces the several
 * empty boxes a page used to stack: what will be here, who can bring it, one
 * way to do it, and an example of how it will look.
 *
 * The example is drawn by this component, never stored: it is not a listing,
 * nobody can open, answer or count it, and it says on its face that it is an
 * example (the same "Ejemplo" tag as every sample on the site). It goes away
 * on its own as soon as the first real one exists, because the page only
 * shows this block while it has nothing real to show.
 */
export function FirstBlock({
  t,
  eyebrow,
  title,
  text,
  example,
  actions,
  children,
}: {
  t: Translator;
  eyebrow?: string;
  title: string;
  text: string;
  example: { icon: IconName; title: string; lines: readonly string[] };
  actions: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="first">
      <div className="first-copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
        <p className="muted">{text}</p>
        <div className="first-actions">{actions}</div>
        {children}
      </div>
      <figure className="first-example">
        <span className="demo-tag">{t('first.example')}</span>
        <span className="first-ico" aria-hidden="true">
          <Icon name={example.icon} />
        </span>
        <strong>{example.title}</strong>
        <ul>
          {example.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <figcaption>{t('first.example_note')}</figcaption>
      </figure>
    </section>
  );
}
