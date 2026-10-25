import 'server-only';
import { headers } from 'next/headers';
import { loginHref } from './return-path';

/**
 * The sign-in page, asked to bring the visitor back to the page they are on:
 * `redirect(await signInPath())` wherever a page or a form needs a session.
 * A shared link to a members-only form, or a session that lapsed while a form
 * was being filled in, then comes back to the same page after signing in.
 *
 * The path is the one the middleware recorded for this request. A form posts
 * its server action to the page it sits on, so inside an action it is that
 * page's path too.
 */
export async function signInPath(): Promise<string> {
  return loginHref((await headers()).get('x-pathname') ?? '/');
}
