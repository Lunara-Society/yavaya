import { headers } from 'next/headers';

/**
 * Structured data for search engines (schema.org JSON-LD). It carries the
 * request's CSP nonce like every other script, though browsers never run it.
 * Only facts that are true go in: no ratings, no review counts, no numbers
 * Yavaya does not have.
 */
export async function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  // `<` is escaped so content can never close the script element.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  // Browsers hide a nonce from the DOM once the page loads, so React finds it
  // empty when it hydrates; the warning is about that, not a real difference.
  return <script type="application/ld+json" nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: json }} />;
}
