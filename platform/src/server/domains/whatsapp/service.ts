import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { whatsappContacts, whatsappMessages } from '@/server/db/schema';
import { serverEnv } from '@/config/env';
import { WHATSAPP_RULES } from '@/config/business-rules';
import { seal, unsealAny, usableKey } from '@/server/security/sealed-text';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { recordAudit } from '@/server/domains/audit/service';
import { errors } from '@/server/errors';

/**
 * Yavaya's WhatsApp team inbox.
 *
 * Meta delivers what people write to Yavaya's number (connected through
 * Dualhook, with the WhatsApp Business app still working on the phone) to
 * /api/whatsapp/webhook/<key>. Each message is stored once, its text sealed,
 * and shown to staff holding `whatsapp.inbox` at /admin/whatsapp. What the
 * team writes from the phone comes back as an "echo" and is shown too, so the
 * inbox is the whole conversation, not half of it.
 *
 * Nothing here is sent anywhere by itself: no automatic replies, no bulk
 * messages. A reply goes out only when a person writes it, and only inside
 * WhatsApp's 24-hour window after the person's last message.
 */

const PURPOSE = 'whatsapp.message';

function keys(): Array<string | null> {
  const env = serverEnv();
  return [usableKey(env.WHATSAPP_KEY), usableKey(env.WHATSAPP_KEY_PREVIOUS)];
}

/** What a conversation looks like after a person on the team writes in it. */
function teamTookOver() {
  return { roxiPausedUntil: new Date(Date.now() + WHATSAPP_RULES.roxiPauseAfterTeamHours * 3_600_000), needsTeam: false };
}

/** Where replies go: Meta's Graph API, or Dualhook's Runtime API (same requests, a dh_live_ key). */
function apiBase(): string {
  return serverEnv().WHATSAPP_API_BASE ?? 'https://graph.facebook.com/v21.0';
}

/**
 * Sends one text message and returns WhatsApp's id for it, or null when it was
 * not accepted. Nothing is stored here: callers store what was sent.
 */
export async function sendText(waId: string, body: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const env = serverEnv();
  const response = await fetcher(`${apiBase()}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: waId, type: 'text', text: { body, preview_url: false } }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!response) return null;
  const result = (await response.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null;
  const id = result?.messages?.[0]?.id;
  return response.ok && typeof id === 'string' && id.length > 0 ? id : null;
}

/**
 * Sends one audio message that WhatsApp fetches from `link`, and returns its id,
 * or null when it was not accepted. `voice` asks for it to arrive as a voice note
 * (Ogg Opus only); if that is refused it is sent once more as a plain audio message.
 */
export async function sendAudio(waId: string, link: string, voice: boolean, fetcher: typeof fetch = fetch): Promise<string | null> {
  const env = serverEnv();
  const post = async (asVoice: boolean) => {
    const response = await fetcher(`${apiBase()}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: waId, type: 'audio', audio: asVoice ? { link, voice: true } : { link } }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!response) return null;
    const result = (await response.json().catch(() => null)) as { messages?: Array<{ id?: string }> } | null;
    const id = result?.messages?.[0]?.id;
    return response.ok && typeof id === 'string' && id.length > 0 ? id : null;
  };
  return (await post(voice)) ?? (voice ? post(false) : null);
}

export function whatsappAvailability(): { receive: boolean; reply: boolean; missing: string[] } {
  const env = serverEnv();
  const missing = [
    !env.WHATSAPP_WEBHOOK_KEY || env.WHATSAPP_WEBHOOK_KEY.length < 24 ? 'WHATSAPP_WEBHOOK_KEY' : '',
    !env.WHATSAPP_VERIFY_TOKEN || env.WHATSAPP_VERIFY_TOKEN.length < 16 ? 'WHATSAPP_VERIFY_TOKEN' : '',
    usableKey(env.WHATSAPP_KEY) ? '' : 'WHATSAPP_KEY',
  ].filter(Boolean);
  const receive = missing.length === 0;
  return { receive, reply: receive && Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID), missing };
}

/** Constant-time comparison of two strings (a secret against what was presented). */
function sameSecret(given: string | null | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function webhookKeyMatches(key: string): boolean {
  return whatsappAvailability().receive && sameSecret(key, serverEnv().WHATSAPP_WEBHOOK_KEY);
}

/** Meta's handshake: GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=… — the challenge, or null. */
export function verifyHandshake(params: URLSearchParams): string | null {
  if (params.get('hub.mode') !== 'subscribe') return null;
  if (!sameSecret(params.get('hub.verify_token'), serverEnv().WHATSAPP_VERIFY_TOKEN)) return null;
  const challenge = params.get('hub.challenge');
  return challenge && /^[\w.-]{1,200}$/.test(challenge) ? challenge : null;
}

/**
 * The delivery's signature (X-Hub-Signature-256), checked when the Meta app
 * secret is known. Through Dualhook the app is theirs and the secret may not
 * be ours to hold: then the unguessable key in the address is the guard.
 */
export function signatureAccepted(rawBody: string, header: string | null): boolean {
  const secret = serverEnv().WHATSAPP_APP_SECRET;
  if (!secret) return true;
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  return sameSecret(header, expected);
}

// --- Reading what Meta sends --------------------------------------------------

export type ParsedMessage = { waMessageId: string; waId: string; direction: 'in' | 'out'; kind: string; text: string | null; sentAt: Date };
export type ParsedStatus = { waMessageId: string; status: string };
export type ParsedDelivery = { messages: ParsedMessage[]; statuses: ParsedStatus[]; names: Map<string, string> };

const KINDS = new Set(['text', 'image', 'audio', 'video', 'document', 'sticker', 'location', 'contacts', 'reaction', 'button', 'interactive']);
const STATUSES = new Set(['sent', 'delivered', 'read', 'failed']);

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Raw) : {});
const arr = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const str = (value: unknown, max = 4096): string | null => (typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null);
const digits = (value: unknown): string | null => {
  const text = str(value, 32)?.replace(/\D/g, '');
  return text && text.length >= 6 && text.length <= 20 ? text : null;
};

/** What a message says, in words: its text, a caption, or nothing (the inbox names the kind). */
function textOf(message: Raw, kind: string): string | null {
  if (kind === 'text') return str(obj(message.text).body);
  if (kind === 'reaction') return str(obj(message.reaction).emoji, 16);
  if (kind === 'button') return str(obj(message.button).text, 500);
  if (kind === 'interactive') {
    const reply = obj(obj(message.interactive).button_reply ?? obj(message.interactive).list_reply);
    return str(reply.title, 500);
  }
  if (kind === 'location') {
    const place = obj(message.location);
    return str(place.name, 300) ?? str(place.address, 300);
  }
  return str(obj(message[kind]).caption, 1000);
}

function parseMessage(message: Raw, direction: 'in' | 'out'): ParsedMessage | null {
  const waMessageId = str(message.id, 200);
  // In an echo (a message the team sent from the phone app) the contact is the recipient.
  const waId = digits(direction === 'in' ? message.from : message.to);
  const seconds = Number(message.timestamp);
  if (!waMessageId || !waId || !Number.isFinite(seconds)) return null;
  const type = str(message.type, 32) ?? 'other';
  const kind = KINDS.has(type) ? type : 'other';
  return { waMessageId, waId, direction, kind, text: textOf(message, kind), sentAt: new Date(seconds * 1000) };
}

/** Everything useful in one webhook delivery; anything malformed is skipped, never guessed. */
export function parseDelivery(payload: unknown): ParsedDelivery {
  const out: ParsedDelivery = { messages: [], statuses: [], names: new Map() };
  for (const entry of arr(obj(payload).entry)) {
    for (const change of arr(obj(entry).changes)) {
      const field = str(obj(change).field, 64);
      const value = obj(obj(change).value);
      if (field === 'messages') {
        for (const contact of arr(value.contacts)) {
          const waId = digits(obj(contact).wa_id);
          const name = str(obj(obj(contact).profile).name, 120);
          if (waId && name) out.names.set(waId, name);
        }
        for (const message of arr(value.messages)) {
          const parsed = parseMessage(obj(message), 'in');
          if (parsed) out.messages.push(parsed);
        }
        for (const status of arr(value.statuses)) {
          const waMessageId = str(obj(status).id, 200);
          const state = str(obj(status).status, 16);
          if (waMessageId && state && STATUSES.has(state)) out.statuses.push({ waMessageId, status: state });
        }
      } else if (field === 'smb_message_echoes') {
        for (const message of arr(value.message_echoes)) {
          const parsed = parseMessage(obj(message), 'out');
          if (parsed) out.messages.push(parsed);
        }
      }
      // Other fields (history sync, account updates) are not kept.
    }
  }
  return out;
}

/** Stores a delivery. Idempotent: Meta repeats deliveries, and each message is kept once. */
export async function ingestDelivery(executor: Executor, delivery: ParsedDelivery): Promise<{ stored: number; newInbound: string[] }> {
  const [current] = keys();
  if (!current) return { stored: 0, newInbound: [] };
  let stored = 0;
  const newInbound = new Set<string>();
  for (const message of delivery.messages) {
    const name = delivery.names.get(message.waId);
    // Inside a raw `sql` fragment the driver does not convert a Date, so it goes as text, cast.
    const at = sql`${message.sentAt.toISOString()}::timestamptz`;
    await executor
      .insert(whatsappContacts)
      .values({
        waId: message.waId,
        nameSealed: name ? seal(current, PURPOSE, name) : null,
        lastMessageAt: message.sentAt,
        lastInboundAt: message.direction === 'in' ? message.sentAt : null,
      })
      .onConflictDoUpdate({
        target: whatsappContacts.waId,
        set: {
          ...(name ? { nameSealed: seal(current, PURPOSE, name) } : {}),
          lastMessageAt: sql`greatest(${whatsappContacts.lastMessageAt}, ${at})`,
          ...(message.direction === 'in' ? { lastInboundAt: sql`greatest(coalesce(${whatsappContacts.lastInboundAt}, ${at}), ${at})` } : {}),
        },
      });
    const inserted = await executor
      .insert(whatsappMessages)
      .values({
        waMessageId: message.waMessageId,
        waId: message.waId,
        direction: message.direction,
        kind: message.kind,
        bodySealed: message.text ? seal(current, PURPOSE, message.text) : null,
        status: message.direction === 'out' ? 'sent' : null,
        sentAt: message.sentAt,
      })
      .onConflictDoNothing({ target: whatsappMessages.waMessageId })
      .returning({ id: whatsappMessages.id });
    if (inserted.length > 0) {
      stored += 1;
      if (message.direction === 'in') {
        newInbound.add(message.waId);
        await executor.update(whatsappContacts).set({ unread: sql`${whatsappContacts.unread} + 1` }).where(eq(whatsappContacts.waId, message.waId));
      } else {
        // The team wrote from the phone: Roxi steps back in this conversation for a while.
        // (Roxi's own messages are stored when sent, so if one ever echoed back it would not land here.)
        await executor.update(whatsappContacts).set(teamTookOver()).where(eq(whatsappContacts.waId, message.waId));
      }
    }
  }
  for (const status of delivery.statuses) {
    await executor.update(whatsappMessages).set({ status: status.status }).where(and(eq(whatsappMessages.waMessageId, status.waMessageId), eq(whatsappMessages.direction, 'out')));
  }
  return { stored, newInbound: [...newInbound] };
}

// --- The inbox ----------------------------------------------------------------------

function open(sealed: string | null): string | null {
  if (!sealed) return null;
  try {
    return unsealAny(keys(), PURPOSE, sealed);
  } catch {
    return null;
  }
}

export type InboxContact = { waId: string; name: string | null; lastMessageAt: Date; unread: number; needsTeam: boolean; roxiPausedUntil: Date | null };
export type InboxMessage = { id: string; direction: 'in' | 'out'; kind: string; text: string | null; status: string | null; sentAt: Date; fromInbox: boolean; byRoxi: boolean };

export async function listInbox(executor: Executor, actor: AuthContext | null): Promise<InboxContact[]> {
  await requirePermission(executor, actor, 'whatsapp.inbox');
  const rows = await executor.select().from(whatsappContacts).orderBy(desc(whatsappContacts.lastMessageAt)).limit(WHATSAPP_RULES.inboxListSize);
  return rows.map((row) => ({
    waId: row.waId,
    name: open(row.nameSealed),
    lastMessageAt: row.lastMessageAt,
    unread: row.unread,
    needsTeam: row.needsTeam,
    roxiPausedUntil: row.roxiPausedUntil && row.roxiPausedUntil > new Date() ? row.roxiPausedUntil : null,
  }));
}

/** One conversation, oldest first; opening it marks it read. */
export async function openConversation(
  executor: Executor,
  actor: AuthContext | null,
  waId: string,
): Promise<{ contact: InboxContact; messages: InboxMessage[]; canReplyUntil: Date | null } | null> {
  await requirePermission(executor, actor, 'whatsapp.inbox');
  const [row] = await executor.select().from(whatsappContacts).where(eq(whatsappContacts.waId, waId)).limit(1);
  if (!row) return null;
  if (row.unread > 0) await executor.update(whatsappContacts).set({ unread: 0 }).where(eq(whatsappContacts.waId, waId));
  const messages = await executor
    .select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.waId, waId))
    .orderBy(desc(whatsappMessages.sentAt))
    .limit(WHATSAPP_RULES.conversationSize);
  const windowEnds = row.lastInboundAt ? new Date(row.lastInboundAt.getTime() + WHATSAPP_RULES.replyWindowHours * 3_600_000) : null;
  return {
    contact: {
      waId: row.waId,
      name: open(row.nameSealed),
      lastMessageAt: row.lastMessageAt,
      unread: 0,
      needsTeam: row.needsTeam,
      roxiPausedUntil: row.roxiPausedUntil && row.roxiPausedUntil > new Date() ? row.roxiPausedUntil : null,
    },
    messages: messages.reverse().map((m) => ({
      id: m.id,
      direction: m.direction === 'out' ? 'out' : 'in',
      kind: m.kind,
      text: open(m.bodySealed),
      status: m.status,
      sentAt: m.sentAt,
      fromInbox: m.sentBy !== null,
      byRoxi: m.byRoxi,
    })),
    canReplyUntil: windowEnds && windowEnds > new Date() ? windowEnds : null,
  };
}

/**
 * A team member's reply. Sent through the Cloud API only when it is
 * configured, only inside the 24-hour window, and stored and audited in the
 * same transaction once Meta has accepted it.
 */
export async function sendReply(executor: Executor, actor: AuthContext | null, waId: string, text: string, fetcher: typeof fetch = fetch): Promise<void> {
  const who = await requirePermission(executor, actor, 'whatsapp.inbox');
  if (!whatsappAvailability().reply) throw errors.conflict('whatsapp.error.reply_unavailable');
  const body = text.trim().slice(0, WHATSAPP_RULES.replyMaxLength);
  if (!body) throw errors.validation('whatsapp.error.empty');
  const [contact] = await executor.select().from(whatsappContacts).where(eq(whatsappContacts.waId, waId)).limit(1);
  if (!contact) throw errors.notFound('whatsapp_contact');
  if (!contact.lastInboundAt || contact.lastInboundAt.getTime() + WHATSAPP_RULES.replyWindowHours * 3_600_000 < Date.now()) {
    throw errors.conflict('whatsapp.error.window_closed');
  }
  const waMessageId = await sendText(waId, body, fetcher);
  if (!waMessageId) throw errors.conflict('whatsapp.error.send_failed');
  const [current] = keys();
  const now = new Date();
  await executor.insert(whatsappMessages).values({
    waMessageId,
    waId,
    direction: 'out',
    kind: 'text',
    bodySealed: current ? seal(current, PURPOSE, body) : null,
    status: 'sent',
    sentBy: who.userId,
    sentAt: now,
  }).onConflictDoNothing({ target: whatsappMessages.waMessageId });
  await executor.update(whatsappContacts).set({ lastMessageAt: now, ...teamTookOver() }).where(eq(whatsappContacts.waId, waId));
  // The audit says who answered whom and when, never what was written.
  await recordAudit(executor, { actorType: 'admin', actorUserId: who.userId, action: 'whatsapp.reply', subjectType: 'whatsapp_contact', subjectId: waId });
}

/** Deletes a conversation and everything in it (a person asked, or it is not needed). Audited. */
/**
 * A message Yavaya itself sends in answer to something the person just did
 * (confirming that their number was verified): sent, stored and shown in the
 * inbox like any reply, but it is not the team stepping in, so Roxi is not
 * paused by it. Only inside the 24 hours after the person's own message.
 */
export async function sendSystemText(executor: Executor, waId: string, text: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const [current] = keys();
  if (!current || !whatsappAvailability().reply) return false;
  const waMessageId = await sendText(waId, text, fetcher);
  if (!waMessageId) return false;
  const sentAt = new Date();
  await executor
    .insert(whatsappMessages)
    .values({ waMessageId, waId, direction: 'out', kind: 'text', bodySealed: seal(current, PURPOSE, text), status: 'sent', sentAt })
    .onConflictDoNothing({ target: whatsappMessages.waMessageId });
  await executor.update(whatsappContacts).set({ lastMessageAt: sentAt }).where(eq(whatsappContacts.waId, waId));
  return true;
}

export async function deleteConversation(executor: Executor, actor: AuthContext | null, waId: string): Promise<void> {
  const who = await requirePermission(executor, actor, 'whatsapp.inbox');
  const removed = await executor.delete(whatsappContacts).where(eq(whatsappContacts.waId, waId)).returning({ waId: whatsappContacts.waId });
  if (removed.length === 0) throw errors.notFound('whatsapp_contact');
  await recordAudit(executor, { actorType: 'admin', actorUserId: who.userId, action: 'whatsapp.delete_conversation', subjectType: 'whatsapp_contact', subjectId: waId });
}

/** Unread conversations, for the admin overview. */
export async function unreadConversations(executor: Executor): Promise<number> {
  const [row] = await executor.select({ n: sql<number>`count(*)::int` }).from(whatsappContacts).where(sql`${whatsappContacts.unread} > 0`);
  return row?.n ?? 0;
}

/**
 * Stops Roxi answering in one conversation (for the usual pause after the team
 * writes), or lets her answer again. Audited: who decided and when.
 */
export async function setRoxiInConversation(executor: Executor, actor: AuthContext | null, waId: string, on: boolean): Promise<void> {
  const who = await requirePermission(executor, actor, 'whatsapp.inbox');
  const changed = await executor
    .update(whatsappContacts)
    .set(on ? { roxiPausedUntil: null, needsTeam: false } : teamTookOver())
    .where(eq(whatsappContacts.waId, waId))
    .returning({ waId: whatsappContacts.waId });
  if (changed.length === 0) throw errors.notFound('whatsapp_contact');
  await recordAudit(executor, {
    actorType: 'admin',
    actorUserId: who.userId,
    action: on ? 'whatsapp.roxi_resumed' : 'whatsapp.roxi_paused',
    subjectType: 'whatsapp_contact',
    subjectId: waId,
  });
}
