import { NextResponse } from 'next/server';
import { MEDIA_RULES } from '@/config/business-rules';

/** Shared plumbing for YavayaGo's photo forms: plain multipart posts that answer with a redirect. */

export function go(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

/** A browser always sends `Origin` on a form POST; it must be this site. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** One optional image field, or an error key if it is too large. */
export async function oneFile(form: FormData, name: string): Promise<{ buffer: Buffer | null; error: string | null }> {
  const entry = form.get(name);
  if (!(entry instanceof File) || entry.size === 0) return { buffer: null, error: null };
  if (entry.size > MEDIA_RULES.maxUploadBytes) return { buffer: null, error: 'media.error.too_large' };
  return { buffer: Buffer.from(await entry.arrayBuffer()), error: null };
}

export const number = (value: FormDataEntryValue | null) => Number.parseFloat(String(value ?? ''));
export const text = (form: FormData, name: string) => String(form.get(name) ?? '');
