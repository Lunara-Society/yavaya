import 'server-only';
import { and, desc, eq, gte, isNull, lt, or, sql } from 'drizzle-orm';
import type { Executor } from '@/server/db/client';
import { whatsappContacts, whatsappMessages } from '@/server/db/schema';
import { serverEnv } from '@/config/env';
import { WHATSAPP_RULES } from '@/config/business-rules';
import { seal, unsealAny, usableKey } from '@/server/security/sealed-text';
import { requirePermission, type AuthContext } from '@/server/domains/access/authorize';
import { recordAudit } from '@/server/domains/audit/service';
import { isFlagEnabled, setFlag } from '@/server/domains/platform/settings';
import { signedConversationUrl } from '@/server/domains/roxi/service';
import { roxiPlatformStatus } from '@/server/domains/roxi/status';
import { createTranslator } from '@/i18n';
import { errors } from '@/server/errors';
import { sendText, whatsappAvailability } from './service';

/**
 * Roxi answering on Yavaya's WhatsApp.
 *
 * When someone writes to the number, Roxi (a separate, text-only ElevenLabs
 * agent whose instructions keep her to Yavaya topics) may answer, as Yavaya's
 * assistant, never as a person. She never writes first: only an answer to a
 * message, inside WhatsApp's 24 hours. She stays out of a conversation:
 *
 * - when the owner has her switched off (`whatsapp.roxi` flag, off by default);
 * - for a while after a person on the team wrote in it (from the phone or the inbox);
 * - when someone paused her for that conversation;
 * - after she handed it to the team, until someone lets her back in.
 *
 * Her answers are stored and shown in the inbox marked as hers, and each one is
 * audited without its text.
 */

const FLAG = 'whatsapp.roxi';
const PURPOSE = 'whatsapp.message';
const HANDOVER = '[[EQUIPO]]';

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

/** Everything Roxi needs to be able to answer, whether or not she is switched on. */
export function roxiWhatsappReady(): { ready: boolean; missing: string[] } {
  const env = serverEnv();
  const missing = [
    whatsappAvailability().reply ? '' : 'WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID',
    env.WHATSAPP_ROXI_AGENT_ID ? '' : 'WHATSAPP_ROXI_AGENT_ID',
    env.ELEVENLABS_API_KEY ? '' : 'ELEVENLABS_API_KEY',
  ].filter(Boolean);
  return { ready: missing.length === 0, missing };
}

export async function roxiWhatsappOn(executor: Executor): Promise<boolean> {
  return roxiWhatsappReady().ready && (await isFlagEnabled(executor, FLAG, false));
}

/** The owner's switch. Turning it on is refused while something she needs is missing. */
export async function setRoxiWhatsapp(executor: Executor, actor: AuthContext | null, on: boolean): Promise<void> {
  const who = await requirePermission(executor, actor, 'whatsapp.roxi');
  if (on && !roxiWhatsappReady().ready) throw errors.conflict('whatsapp.error.roxi_not_ready');
  await setFlag(executor, { key: FLAG, enabled: on, adminUserId: who.userId });
}

export async function roxiWhatsappSwitch(executor: Executor): Promise<boolean> {
  return isFlagEnabled(executor, FLAG, false);
}

// --- Asking Roxi --------------------------------------------------------------------

export type AskRoxi = (input: { customerName: string; conversation: string; message: string }) => Promise<string | null>;

/**
 * One text-only conversation with the WhatsApp agent over ElevenLabs'
 * WebSocket: the earlier messages go in as context, the newest as the
 * person's message, and the first complete answer is kept. Any failure or a
 * slow answer gives null, and then nothing is sent.
 */
export const askRoxiOverWebSocket: AskRoxi = async ({ customerName, conversation, message }) => {
  const agentId = serverEnv().WHATSAPP_ROXI_AGENT_ID;
  if (!agentId) return null;
  const url = await signedConversationUrl(agentId).catch(() => null);
  if (!url) return null;
  return new Promise<string | null>((resolve) => {
    let finished = false;
    let asked = false;
    const socket = new WebSocket(url);
    const finish = (answer: string | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // already closed
      }
      resolve(answer);
    };
    const timer = setTimeout(() => finish(null), 45_000);
    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          type: 'conversation_initiation_client_data',
          conversation_config_override: { conversation: { text_only: true } },
          dynamic_variables: {
            customer_name: customerName,
            conversation: conversation || '(no earlier messages)',
            platform_status: roxiPlatformStatus(createTranslator('es')),
          },
        }),
      );
    });
    socket.addEventListener('message', (event) => {
      let data: { type?: string; ping_event?: { event_id?: number }; agent_response_event?: { agent_response?: unknown } };
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (data.type === 'conversation_initiation_metadata' && !asked) {
        asked = true;
        socket.send(JSON.stringify({ type: 'user_message', text: message }));
      } else if (data.type === 'ping') {
        socket.send(JSON.stringify({ type: 'pong', event_id: data.ping_event?.event_id }));
      } else if (data.type === 'agent_response') {
        const answer = data.agent_response_event?.agent_response;
        if (asked && typeof answer === 'string' && answer.trim()) finish(answer);
      }
    });
    socket.addEventListener('error', () => finish(null));
    socket.addEventListener('close', () => finish(null));
  });
};

// --- Answering -------------------------------------------------------------------------

/** How a message reads in Roxi's context: its words, or what kind of thing it was. */
function line(direction: string, kind: string, text: string | null): string {
  const who = direction === 'in' ? 'Cliente' : 'Yavaya';
  return `${who}: ${text ?? `[sent ${kind === 'other' ? 'a message WhatsApp could not show' : `a ${kind}`}]`}`;
}

export type RoxiOutcome = 'off' | 'paused' | 'window_closed' | 'already_answered' | 'limit' | 'no_answer' | 'send_failed' | 'answered' | 'handed_over';

type Deps = { ask?: AskRoxi; fetcher?: typeof fetch; wait?: (ms: number) => Promise<void> };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function quiet(contact: { needsTeam: boolean; roxiPausedUntil: Date | null }): boolean {
  return contact.needsTeam || (contact.roxiPausedUntil !== null && contact.roxiPausedUntil > new Date());
}

/**
 * Answers the newest messages in one conversation, if Roxi should. Called after
 * a delivery is stored; safe to call more than once for the same message.
 */
export async function answerWithRoxi(executor: Executor, waId: string, deps: Deps = {}): Promise<RoxiOutcome> {
  if (!(await roxiWhatsappOn(executor))) return 'off';
  // A short wait, so several messages sent in a row get one answer: if a newer
  // message arrives meanwhile, the claim below fails here and its own call answers.
  await (deps.wait ?? sleep)(WHATSAPP_RULES.roxiWaitSeconds * 1000);

  const [contact] = await executor.select().from(whatsappContacts).where(eq(whatsappContacts.waId, waId)).limit(1);
  if (!contact?.lastInboundAt) return 'off';
  if (quiet(contact)) return 'paused';
  if (contact.lastInboundAt.getTime() + WHATSAPP_RULES.replyWindowHours * 3_600_000 < Date.now()) return 'window_closed';

  // Claim the newest message from the person, once, by when Yavaya stored it
  // (in SQL, at the database's microsecond precision, unlike WhatsApp's whole
  // seconds): two deliveries racing here answer once. A message arriving while
  // she thinks is newer, so its own call answers it afterwards.
  const newest = sql`(select max(m.created_at) from whatsapp_messages m where m.wa_id = ${waId} and m.direction = 'in')`;
  const claimed = await executor
    .update(whatsappContacts)
    .set({ roxiAnsweredThrough: newest })
    .where(and(eq(whatsappContacts.waId, waId), sql`${newest} is not null`, or(isNull(whatsappContacts.roxiAnsweredThrough), lt(whatsappContacts.roxiAnsweredThrough, newest))))
    .returning({ waId: whatsappContacts.waId });
  if (claimed.length === 0) return 'already_answered';

  const [recent] = await executor
    .select({ n: sql<number>`count(*)::int` })
    .from(whatsappMessages)
    .where(and(eq(whatsappMessages.waId, waId), eq(whatsappMessages.byRoxi, true), gte(whatsappMessages.sentAt, new Date(Date.now() - 3_600_000))));
  if ((recent?.n ?? 0) >= WHATSAPP_RULES.roxiMaxAnswersPerHour) return 'limit';

  const rows = (
    await executor
      .select()
      .from(whatsappMessages)
      .where(eq(whatsappMessages.waId, waId))
      // In the order Yavaya stored them: WhatsApp's timestamps are whole seconds,
      // so a reply sent a moment ago could otherwise sort after a newer message.
      .orderBy(desc(whatsappMessages.createdAt))
      .limit(WHATSAPP_RULES.roxiContextMessages)
  ).reverse();
  // The person's messages since the last answer are what she answers; the rest is context.
  let split = rows.length;
  while (split > 0 && rows[split - 1]!.direction === 'in') split -= 1;
  const context = rows.slice(0, split).map((m) => line(m.direction, m.kind, open(m.bodySealed)));
  const latest = rows.slice(split).map((m) => open(m.bodySealed) ?? line('in', m.kind, null).slice('Cliente: '.length));
  if (latest.length === 0) return 'already_answered';

  const raw = await (deps.ask ?? askRoxiOverWebSocket)({
    customerName: open(contact.nameSealed) ?? '',
    conversation: context.join('\n'),
    message: latest.join('\n'),
  });
  if (!raw) return 'no_answer';
  const handover = raw.includes(HANDOVER);
  const text = raw.split(HANDOVER).join('').trim().slice(0, WHATSAPP_RULES.replyMaxLength);

  // Someone on the team may have stepped in while she was thinking.
  const [now] = await executor.select().from(whatsappContacts).where(eq(whatsappContacts.waId, waId)).limit(1);
  if (!now || quiet(now)) return 'paused';

  let waMessageId: string | null = null;
  if (text) {
    waMessageId = await sendText(waId, text, deps.fetcher);
    if (!waMessageId) return 'send_failed';
  }
  const [current] = keys();
  const sentAt = new Date();
  await executor.transaction(async (tx) => {
    if (waMessageId) {
      await tx
        .insert(whatsappMessages)
        .values({ waMessageId, waId, direction: 'out', kind: 'text', bodySealed: current ? seal(current, PURPOSE, text) : null, status: 'sent', byRoxi: true, sentAt })
        .onConflictDoNothing({ target: whatsappMessages.waMessageId });
    }
    await tx
      .update(whatsappContacts)
      .set({
        ...(waMessageId ? { lastMessageAt: sentAt } : {}),
        // A conversation she handed over stays marked unread, so the team sees it.
        ...(handover ? { needsTeam: true, unread: sql`greatest(${whatsappContacts.unread}, 1)` } : {}),
      })
      .where(eq(whatsappContacts.waId, waId));
    await recordAudit(tx, {
      actorType: 'system',
      actorUserId: null,
      action: handover ? 'whatsapp.roxi_handover' : 'whatsapp.roxi_reply',
      subjectType: 'whatsapp_contact',
      subjectId: waId,
    });
  });
  return handover ? 'handed_over' : 'answered';
}
