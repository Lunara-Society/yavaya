import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { whatsappContacts, whatsappMessages, whatsappVoiceNotes } from '@/server/db/schema';
import { serverEnv } from '@/config/env';
import { WHATSAPP_RULES } from '@/config/business-rules';
import { seal, unsealAny, usableKey } from '@/server/security/sealed-text';
import { recordAudit } from '@/server/domains/audit/service';
import { sendAudio } from './service';

/**
 * Roxi for the owner (docs: HANDOFF.md, "WhatsApp"): when the owner writes to
 * Yavaya's number from one of their own numbers (WHATSAPP_OWNER_WA_IDS), she is
 * their assistant too, and can send a voice note on their behalf ("send Suhey
 * a voice message: I'll be home in 20 minutes").
 *
 * Who the owner is comes from the number WhatsApp says the message came from,
 * never from what the message says; the tools here refuse everyone else even
 * if the model were talked into calling them.
 *
 * WhatsApp's rule stands: Yavaya's number may send freely only to someone who
 * wrote to it in the last 24 hours (a voice note cannot be a template). The
 * note comes from Yavaya's number, in Roxi's voice, and says it is from her.
 */

const PURPOSE = 'whatsapp.message';
const LINK_PURPOSE = 'whatsapp.voice-note';

function keys(): Array<string | null> {
  const env = serverEnv();
  return [usableKey(env.WHATSAPP_KEY), usableKey(env.WHATSAPP_KEY_PREVIOUS)];
}

function open(sealed: string | null): string | null {
  if (!sealed) return null;
  try {
    return unsealAny(keys(), PURPOSE, sealed);
  } catch {
    return null;
  }
}

/** Whether this WhatsApp number is one of the owner's own. */
export function isOwner(waId: string): boolean {
  const list = serverEnv().WHATSAPP_OWNER_WA_IDS;
  return Boolean(list && list.split(',').includes(waId));
}

/** Lower case, no accents, single spaces: how names are compared. */
function plain(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

type Person = { waId: string; name: string | null; nickname: string | null; lastInboundAt: Date | null };

/**
 * The people a name or number could mean, among those who have written to
 * Yavaya (and those the owner saved). A number matches by its digits; a name
 * matches the nickname the owner gave or the WhatsApp profile name, whole or
 * by its first word. The owner's own numbers are never a recipient.
 */
export async function findPeople(executor: Executor, query: string): Promise<Person[]> {
  const rows = await executor.select().from(whatsappContacts);
  const people = rows
    .filter((row) => !isOwner(row.waId))
    .map((row) => ({ waId: row.waId, name: open(row.nameSealed), nickname: open(row.nicknameSealed), lastInboundAt: row.lastInboundAt }));
  const digits = query.replace(/\D/g, '');
  if (digits.length >= 7) return people.filter((p) => p.waId === digits || p.waId.endsWith(digits));
  const wanted = plain(query);
  if (!wanted) return [];
  const names = (p: Person) => [p.nickname, p.name].filter((n): n is string => Boolean(n)).map(plain);
  const exact = people.filter((p) => names(p).some((n) => n === wanted));
  if (exact.length) return exact;
  return people.filter((p) => names(p).some((n) => n.split(' ')[0] === wanted.split(' ')[0] || n.includes(wanted)));
}

function label(p: Person): string {
  return p.nickname ?? p.name ?? `+${p.waId}`;
}

// --- The voice -------------------------------------------------------------------------

export type Voice = { audio: Buffer; mime: 'audio/ogg' | 'audio/mpeg' };

/**
 * The words in Roxi's voice, from ElevenLabs. Ogg Opus first, which WhatsApp
 * shows as a voice note; if what comes back is not an Ogg file, MP3, which it
 * shows as an audio message.
 */
export async function speak(text: string, fetcher: typeof fetch = fetch): Promise<Voice | null> {
  const key = serverEnv().ELEVENLABS_API_KEY;
  if (!key) return null;
  const ask = async (format: string) => {
    const response = await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${WHATSAPP_RULES.roxiVoiceId}?output_format=${format}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/*' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2' }),
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (!response?.ok) return null;
    const audio = Buffer.from(await response.arrayBuffer());
    return audio.length > 64 ? audio : null;
  };
  const opus = await ask('opus_48000_64');
  if (opus && opus.subarray(0, 4).toString('latin1') === 'OggS') return { audio: opus, mime: 'audio/ogg' };
  const mp3 = await ask('mp3_44100_64');
  return mp3 ? { audio: mp3, mime: 'audio/mpeg' } : null;
}

function linkKey(id: string): string {
  return createHmac('sha256', serverEnv().SESSION_SECRET).update(`${LINK_PURPOSE}:${id}`).digest('base64url');
}

/** Whether `key` is the one Yavaya gave out for this voice note's link. */
export function voiceLinkMatches(id: string, key: string): boolean {
  const expected = Buffer.from(linkKey(id));
  const given = Buffer.from(key);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** A voice note for WhatsApp to fetch, if its link is right and it is still kept. */
export async function voiceNote(executor: Executor, id: string, key: string): Promise<{ audio: Buffer; mime: string } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id) || !voiceLinkMatches(id, key)) return null;
  const since = new Date(Date.now() - WHATSAPP_RULES.voiceNoteKeepHours * 3_600_000);
  const [row] = await executor
    .select({ audio: whatsappVoiceNotes.audio, mime: whatsappVoiceNotes.mime })
    .from(whatsappVoiceNotes)
    .where(and(eq(whatsappVoiceNotes.id, id), gte(whatsappVoiceNotes.createdAt, since)))
    .limit(1);
  return row ?? null;
}

// --- The owner's tools (answers go back to the agent as JSON) -------------------------

type Deps = { fetcher?: typeof fetch };

/**
 * Sends `message` as a voice note to the person the owner named. Refused for
 * anyone but the owner. The answer tells Roxi what happened, so she can tell
 * the owner (or ask which person was meant).
 */
export async function sendVoiceForOwner(executor: Executor, ownerWaId: string, parameters: Record<string, unknown>, deps: Deps = {}): Promise<string> {
  if (!isOwner(ownerWaId)) return JSON.stringify({ error: 'not_allowed' });
  const recipient = typeof parameters.recipient === 'string' ? parameters.recipient.trim().slice(0, 80) : '';
  const message = typeof parameters.message === 'string' ? parameters.message.trim().slice(0, WHATSAPP_RULES.voiceNoteMaxLength) : '';
  if (!recipient || !message) return JSON.stringify({ error: 'missing', need: ['recipient', 'message'] });

  const found = await findPeople(executor, recipient);
  if (found.length === 0) return JSON.stringify({ error: 'not_found', recipient });
  if (found.length > 1) return JSON.stringify({ error: 'ambiguous', candidates: found.slice(0, 5).map(label) });
  const person = found[0]!;
  if (!person.lastInboundAt || person.lastInboundAt.getTime() + WHATSAPP_RULES.replyWindowHours * 3_600_000 < Date.now()) {
    return JSON.stringify({ error: 'window_closed', recipient: label(person) });
  }
  const [recent] = await executor
    .select({ n: sql<number>`count(*)::int` })
    .from(whatsappMessages)
    .where(and(eq(whatsappMessages.kind, 'audio'), eq(whatsappMessages.byRoxi, true), eq(whatsappMessages.direction, 'out'), gte(whatsappMessages.sentAt, new Date(Date.now() - 3_600_000))));
  if ((recent?.n ?? 0) >= WHATSAPP_RULES.ownerVoiceNotesPerHour) return JSON.stringify({ error: 'limit' });

  const voice = await speak(message, deps.fetcher);
  if (!voice) return JSON.stringify({ error: 'voice_failed' });
  // Old notes go as new ones are made: WhatsApp fetches a note within moments.
  await executor.delete(whatsappVoiceNotes).where(lt(whatsappVoiceNotes.createdAt, new Date(Date.now() - WHATSAPP_RULES.voiceNoteKeepHours * 3_600_000)));
  const [note] = await executor.insert(whatsappVoiceNotes).values({ waId: person.waId, mime: voice.mime, audio: voice.audio }).returning({ id: whatsappVoiceNotes.id });
  const link = `${serverEnv().APP_URL.replace(/\/$/, '')}/api/whatsapp/voice/${note!.id}?k=${linkKey(note!.id)}`;
  const waMessageId = await sendAudio(person.waId, link, voice.mime === 'audio/ogg', deps.fetcher);
  if (!waMessageId) return JSON.stringify({ error: 'send_failed', recipient: label(person) });

  const [current] = keys();
  const sentAt = new Date();
  await executor.transaction(async (tx) => {
    // In the inbox as hers, with what she said, so the team can read it.
    await tx
      .insert(whatsappMessages)
      .values({ waMessageId, waId: person.waId, direction: 'out', kind: 'audio', bodySealed: current ? seal(current, PURPOSE, message) : null, status: 'sent', byRoxi: true, sentAt })
      .onConflictDoNothing({ target: whatsappMessages.waMessageId });
    await tx.update(whatsappContacts).set({ lastMessageAt: sentAt }).where(eq(whatsappContacts.waId, person.waId));
    await recordAudit(tx, { actorType: 'system', actorUserId: null, action: 'whatsapp.roxi_voice_note', subjectType: 'whatsapp_contact', subjectId: person.waId, metadata: { forOwner: true, format: voice.mime } });
  });
  return JSON.stringify({ ok: true, recipient: label(person), said: message });
}

/** Remembers a name for a number ("guarda a Suhey: +505 …"). Refused for anyone but the owner. */
export async function saveContactForOwner(executor: Executor, ownerWaId: string, parameters: Record<string, unknown>): Promise<string> {
  if (!isOwner(ownerWaId)) return JSON.stringify({ error: 'not_allowed' });
  const name = typeof parameters.name === 'string' ? parameters.name.trim().slice(0, 60) : '';
  const waId = typeof parameters.phone === 'string' ? parameters.phone.replace(/\D/g, '') : '';
  if (!name || waId.length < 8 || waId.length > 15) return JSON.stringify({ error: 'missing', need: ['name', 'phone with country code'] });
  if (isOwner(waId)) return JSON.stringify({ error: 'own_number' });
  const [current] = keys();
  if (!current) return JSON.stringify({ error: 'not_configured' });
  const nicknameSealed = seal(current, PURPOSE, name);
  await executor
    .insert(whatsappContacts)
    .values({ waId, nicknameSealed, lastMessageAt: new Date() })
    .onConflictDoUpdate({ target: whatsappContacts.waId, set: { nicknameSealed } });
  const [row] = await executor.select({ lastInboundAt: whatsappContacts.lastInboundAt }).from(whatsappContacts).where(eq(whatsappContacts.waId, waId)).limit(1);
  const open24 = Boolean(row?.lastInboundAt && row.lastInboundAt.getTime() + WHATSAPP_RULES.replyWindowHours * 3_600_000 >= Date.now());
  return JSON.stringify({ ok: true, name, can_send_now: open24 });
}
