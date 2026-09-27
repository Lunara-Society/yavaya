import { Fragment, type ReactNode } from 'react';

/**
 * Renders the three inline marks the website content uses — **strong**,
 * *emphasis* and `code` — as elements. Everything else is text, so content
 * can never inject markup.
 */
export function Md({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1] !== undefined) parts.push(<strong key={key++}>{match[1]}</strong>);
    else if (match[2] !== undefined) parts.push(<em key={key++}>{match[2]}</em>);
    else parts.push(<code key={key++}>{match[3]}</code>);
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <Fragment>{parts}</Fragment>;
}

/** One paragraph per entry. */
export function Paras({ text }: { text: string | readonly string[] }) {
  const list = typeof text === 'string' ? [text] : text;
  return (
    <>
      {list.map((p, i) => (
        <p key={i}>
          <Md text={p} />
        </p>
      ))}
    </>
  );
}
