import { NextResponse } from 'next/server';
import { getTranslator } from '@/i18n/server';
import { currentSession } from '@/server/auth/context';
import { dropHandoff, mobileCode, readHandoff, returnAddress } from '@/server/auth/mobile';
import { siteUrl } from '@/server/seo';

import { HTTP } from '../../http';

export const dynamic = 'force-dynamic';

/**
 * The five characters HTML treats as markup: & < > " '.
 * Matches each of "&", "<" and '"'; leaves "abc" untouched.
 * Tester: https://regex101.com/?flavor=javascript&regex=%5B%26%3C%3E%22'%5D&testString=a%26b%3Cc%3Ed%22e'f%0Aabc
 */
const MARKUP = /[&<>"']/g;
const escape = (value: string) => value.replace(MARKUP, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The last step of signing in from the app. The website has just signed the
 * person in on this browser; this turns that into a one-time code for the app
 * and sends the browser back to the app's own address.
 *
 * A server redirect, not a page that refreshes itself: Android's browser tab
 * opens an app from a redirect at the end of a chain the person started with a
 * tap (as Google's own sign-in for installed apps returns), while a page that
 * leaves by itself can be refused for lacking a tap.
 */
export async function GET() {
  const base = siteUrl();
  const { t, locale } = await getTranslator();
  const handoff = await readHandoff();
  const page = (body: string) =>
    new NextResponse(
      `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<meta name="color-scheme" content="dark">` +
        `<title>${escape(t('mobile.auth.title'))}</title>` +
        `<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#000;color:#eceff6;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}` +
        `a{display:inline-block;margin-top:20px;padding:14px 28px;border:1px solid #9cc9ff;border-radius:14px;color:#eceff6;text-decoration:none}</style>` +
        `</head><body><main>${body}</main></body></html>`,
      { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } },
    );

  if (!handoff) return page(`<p>${escape(t('mobile.auth.expired'))}</p><a href="${escape(base)}/">${escape(t('mobile.auth.back'))}</a>`);

  const session = await currentSession();
  if (!session) return NextResponse.redirect(`${base}/login?next=${encodeURIComponent('/api/mobile/v1/auth/finish')}`, HTTP.seeOther);

  const address = returnAddress(handoff, mobileCode({ userId: session.user.userId, challenge: handoff.challenge }));
  await dropHandoff();
  const back = NextResponse.redirect(address, HTTP.seeOther);
  back.headers.set('Cache-Control', 'no-store');
  return back;
}
