import Link from 'next/link';
import { AppShell } from '@/ui/components/app-shell';
import { shellContext } from '@/ui/shell-context';

export const dynamic = 'force-dynamic';

/**
 * 404.
 *
 * Next.js ships an unstyled English default. That would be the one page in
 * Yavaya written in a language the member did not choose, on a page with no way
 * back — so it is replaced rather than left as a framework detail.
 *
 * It carries the full shell deliberately: someone who lands here mistyped a
 * URL or followed a stale link, and what they need is the navigation, not an
 * apology on a blank page.
 */
export default async function NotFound() {
  const { t, language, theme, member } = await shellContext();

  return (
    <AppShell t={t} language={language} theme={theme} member={member}>
      <div className="mx-auto w-full max-w-md py-10 text-center">
        <p className="text-2xs font-semibold tracking-[0.18em] text-[var(--text-muted)] uppercase">
          404
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{t('error.page.title')}</h1>
        <p className="mt-2 text-[var(--text-secondary)]">{t('error.page.body')}</p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-touch items-center rounded-xl px-5 font-medium"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-contrast-text)' }}
          >
            {t('nav.home')}
          </Link>
          <Link
            href="/districts"
            className="inline-flex min-h-touch items-center rounded-xl border px-5 font-medium"
          >
            {t('nav.districts')}
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
