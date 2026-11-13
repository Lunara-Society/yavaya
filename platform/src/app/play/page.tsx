import './play.css';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import { hasPermission } from '@/server/domains/access/authorize';
import { lookEnabled } from '@/server/domains/platform/looks';
import { siteContext } from '@/ui/site/context';
import { PlayLoader } from '@/ui/play/loader';

export const dynamic = 'force-dynamic';

/*
 * The one page of the site that does not zoom. Everywhere else zoom stays on,
 * for reading; here a second thumb on the screen is the jump button, and the
 * first real phone to play it ended up magnified with the timer, the jump
 * button and half the character off the screen.
 */
export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, themeColor: '#f6c58f' };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await siteContext();
  return { title: t('play.title'), description: t('play.tagline'), robots: { index: false } };
}

/**
 * Yavaya Play (docs/PLAY.md): the first playable of Yavaya Rush. A page of
 * its own, outside the site's shell, so the game has the whole screen and
 * the rest of Yavaya never loads a byte of it.
 *
 * Open to everyone, signed in or not, while the owner's switch says so
 * (Admin → Diseño del sitio → Yavaya Play). While it is off the page does
 * not exist, except for whoever may change the switch, so the owner can play
 * it before anyone else does.
 */
export default async function PlayPage() {
  const { t, userId } = await siteContext();
  const open = await lookEnabled(db(), 'play');
  const preview = !open && userId !== null && (await hasPermission(db(), userId, 'flags.manage'));
  if (!open && !preview) notFound();
  return (
    <main className="yp">
      <header className="yp-top">
        <Link href="/" className="yp-back">
          ← Yavaya
        </Link>
        <strong className="yp-name">{t('play.title')}</strong>
        {preview ? <span className="yp-preview">{t('play.preview')}</span> : <span />}
      </header>
      <PlayLoader
        loading={t('play.loading')}
        unsupported={t('play.unsupported')}
        labels={{ time: t('play.time'), best: t('play.best'), coins: t('play.coins'), start: t('play.start'), finished: t('play.finished'), record: t('play.record'), again: t('play.again'), jump: t('play.jump') }}
      />
    </main>
  );
}
