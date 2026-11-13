import './play.css';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/server/db/client';
import { hasPermission } from '@/server/domains/access/authorize';
import { lookEnabled } from '@/server/domains/platform/looks';
import { siteContext } from '@/ui/site/context';
import { PlayLoader } from '@/ui/play/loader';
import { getDictionary } from '@/i18n';
import { playLook } from '@/server/domains/play/profile';
import { achievementsOf, bestsOf, ownedItems, playProgressOf, sharedRun } from '@/server/domains/play/progress';
import { dayOf } from '@/ui/play/trials/courses';

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
export default async function PlayPage({ searchParams }: { searchParams: Promise<{ reto?: string }> }) {
  const { t, userId, locale } = await siteContext();
  const open = await lookEnabled(db(), 'play');
  const preview = !open && userId !== null && (await hasPermission(db(), userId, 'flags.manage'));
  if (!open && !preview) notFound();
  // The game's words: every `play.*` text in the visitor's language, and nothing else.
  const texts = Object.fromEntries(Object.entries(getDictionary(locale)).filter(([key]) => key.startsWith('play.')));
  const look = userId ? await playLook(db(), userId) : null;
  // The Pruebas de Maestría: open to all by their own switch, or to the owner as a preview.
  const trials = (await lookEnabled(db(), 'trials')) || (userId !== null && (await hasPermission(db(), userId, 'flags.manage')));
  // The player's progress on the account (docs/PLAY.md, "Progress"), all of it verified runs.
  const account = userId
    ? { progress: await playProgressOf(db(), userId), owned: await ownedItems(db(), userId), achievements: await achievementsOf(db(), userId), bests: await bestsOf(db(), userId) }
    : null;
  // A challenge link (`?reto=`): the shared run to race, if it is still shared.
  const reto = (await searchParams).reto;
  const challenge = typeof reto === 'string' ? await sharedRun(db(), reto) : null;
  const today = dayOf(new Date());
  return (
    <main className="yp">
      <header className="yp-top">
        <Link href="/" className="yp-back">
          ← Yavaya
        </Link>
        <strong className="yp-name">{t('play.title')}</strong>
        {preview ? <span className="yp-preview">{t('play.preview')}</span> : <span />}
      </header>
      <PlayLoader loading={t('play.loading')} unsupported={t('play.unsupported')} setup={{ texts, look, signedIn: userId !== null, trials, account, today, challenge, signInHref: '/login?next=%2Fplay' }} />
    </main>
  );
}
