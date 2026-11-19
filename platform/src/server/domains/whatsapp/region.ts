import 'server-only';
import { and, eq, isNotNull } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { locations, type RegionalSpeech } from '@/server/db/schema';

/**
 * Language adaptation for Roxi on WhatsApp: where a number is from, and how
 * people there talk (docs: HANDOFF.md, "Roxi's voice").
 *
 * Her accent is Spain's and never changes (it is the voice); her words adapt
 * to the person. The country comes from the number's dialing prefix, matched
 * against the country rows (`locations.phone_prefix`), longest prefix first,
 * and how people talk there from the same row (`locations.speech`): a new
 * market brings its own notes as data, with no change here.
 */

export type NumberCountry = { name: string; speech: RegionalSpeech | null };

/** The country a WhatsApp number (digits only, with its country code) belongs to, if it is one Yavaya knows. */
export async function countryOfNumber(executor: Executor, waId: string): Promise<NumberCountry | null> {
  const rows = await executor
    .select({ name: locations.name, names: locations.names, phonePrefix: locations.phonePrefix, speech: locations.speech })
    .from(locations)
    .where(and(eq(locations.level, 'country'), isNotNull(locations.phonePrefix)));
  let best: (typeof rows)[number] | null = null;
  let bestLength = 0;
  for (const row of rows) {
    const prefix = (row.phonePrefix ?? '').replace(/\D/g, '');
    if (prefix && waId.startsWith(prefix) && prefix.length > bestLength) {
      best = row;
      bestLength = prefix.length;
    }
  }
  return best ? { name: best.names.es ?? best.name, speech: best.speech ?? null } : null;
}

/**
 * How Roxi should talk to someone from `country`, as one line for her prompt.
 * Written as permission, not instruction: she understands local speech and
 * may use a little of it, never forced slang, and never assumes everyone in a
 * country talks the same way.
 */
export function speechNotes(country: NumberCountry | null): string {
  if (!country) return 'Country not known from the number: neutral Latin American Spanish.';
  const parts = [`From ${country.name}.`];
  if (country.speech?.voseo) {
    parts.push('Many people there say vos (¿cómo estás vos?, ¿qué querés?): understand it, and use vos only if this person does or your boss asks for it.');
  }
  if (country.speech?.expressions.length) {
    parts.push(`Local expressions you know and may use at most once, only where one fits naturally: ${country.speech.expressions.join(', ')}.`);
  } else {
    parts.push('No local expressions noted: neutral Latin American Spanish.');
  }
  return parts.join(' ');
}
