import 'server-only';
import type { Executor } from '@/server/db/client';
import { serverEnv } from '@/config/env';
import { createTranslator } from '@/i18n';
import { roxiSearch, type RoxiScope } from '@/server/domains/roxi/service';

/**
 * What Roxi may look up for someone writing on WhatsApp.
 *
 * The person on WhatsApp is not signed in, so she sees exactly what a visitor
 * to the public pages sees and nothing else: the open districts whose listings
 * are public. Service requests are left out on purpose: they say where someone
 * lives and what is happening in their home, and are for members only.
 *
 * Every result carries a full link, because on WhatsApp the link is the only
 * way to the page, and every fact in it comes from the database: Roxi is told
 * to say she found nothing when the list is empty.
 */
export const WHATSAPP_LOOKUP_SCOPES = ['mercadito', 'yavayago', 'work', 'animals', 'sanctuary'] as const satisfies readonly RoxiScope[];
export type WhatsappLookupScope = (typeof WHATSAPP_LOOKUP_SCOPES)[number];

export type Lookup = (parameters: Record<string, unknown>) => Promise<string>;

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 80) : undefined);

/** One look-up, answered as compact JSON for the model to read. Never throws: a failure is an answer too. */
export async function whatsappLookup(executor: Executor, parameters: Record<string, unknown>): Promise<string> {
  const scope = text(parameters.scope);
  if (!scope || !(WHATSAPP_LOOKUP_SCOPES as readonly string[]).includes(scope)) {
    return JSON.stringify({ error: 'unknown_scope', scopes: WHATSAPP_LOOKUP_SCOPES });
  }
  try {
    const result = await roxiSearch(executor, {
      // No member: none of the scopes above reads it (only the members-only service board does).
      userId: '',
      locale: 'es',
      t: createTranslator('es'),
      scope: scope as WhatsappLookupScope,
      query: text(parameters.q) ?? text(parameters.query),
      category: text(parameters.category),
      place: text(parameters.place),
    });
    const base = serverEnv().APP_URL.replace(/\/+$/, '');
    return JSON.stringify({
      scope: result.scope,
      place: result.place,
      found: result.items.length,
      more: result.more,
      results: result.items.map((item) => ({ title: item.title, detail: item.detail, link: `${base}${item.url}` })),
    });
  } catch {
    return JSON.stringify({ error: 'lookup_failed' });
  }
}
