import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, users, whatsappContacts, whatsappMessages, whatsappVoiceNotes } from '@/server/db/schema';
import { resetServerEnvCache } from '@/config/env';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import { ingestDelivery, parseDelivery } from '@/server/domains/whatsapp/service';
import { answerWithRoxi, setRoxiWhatsapp, OWNER_TOOLS, type AskRoxi } from '@/server/domains/whatsapp/roxi';
import { saveContactForOwner, sendVoiceForOwner, voiceNote } from '@/server/domains/whatsapp/owner';
import { clearSettingsCache } from '@/server/domains/platform/settings';
import { resetTransactionalData } from '../helpers/database';

/**
 * Roxi for the owner: a message from one of the owner's numbers gets her as
 * their assistant, who can send a voice note on their behalf. Everyone else
 * gets the usual Roxi, and the owner's tools refuse them whatever is asked.
 */

const OWNER = '50570000001';
const SUHEY = '50581112222';
const VARS = ['WHATSAPP_WEBHOOK_KEY', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_KEY', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_API_BASE', 'WHATSAPP_ROXI_AGENT_ID', 'ELEVENLABS_API_KEY', 'WHATSAPP_OWNER_WA_IDS', 'APP_URL'] as const;
const saved = Object.fromEntries(VARS.map((key) => [key, process.env[key]]));
const READY = {
  WHATSAPP_WEBHOOK_KEY: 'a-webhook-key-that-is-long-enough-01',
  WHATSAPP_VERIFY_TOKEN: 'verify-token-long-enough-02',
  WHATSAPP_KEY: 'the-whatsapp-sealing-key-that-is-long-enough-03',
  WHATSAPP_ACCESS_TOKEN: 'dh_live_test',
  WHATSAPP_PHONE_NUMBER_ID: '1270050959528964',
  WHATSAPP_API_BASE: 'https://api.dualhook.com/v25.0',
  WHATSAPP_ROXI_AGENT_ID: 'agent_test1',
  ELEVENLABS_API_KEY: 'an-elevenlabs-key-long-enough',
  WHATSAPP_OWNER_WA_IDS: OWNER,
  APP_URL: 'https://yavaya.example',
};

function configure(values: Partial<Record<(typeof VARS)[number], string>>) {
  for (const key of VARS) delete process.env[key];
  Object.assign(process.env, values);
  resetServerEnvCache();
}

function inbound(id: string, from: string, name: string, text: string, at = Math.floor(Date.now() / 1000)) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'waba', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', contacts: [{ wa_id: from, profile: { name } }], messages: [{ id, from, timestamp: String(at), type: 'text', text: { body: text } }] } }] }],
  };
}

const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(200, 1)]);
const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(200, 2)]);
let calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
let speech: Buffer = OGG;
const fetcher = (async (url: string, init: RequestInit) => {
  const body = typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
  calls.push({ url, body });
  if (url.startsWith('https://api.elevenlabs.io/v1/text-to-speech/')) return new Response(new Uint8Array(url.includes('opus') ? speech : MP3), { status: 200 });
  return new Response(JSON.stringify({ messages: [{ id: `wamid.out.${calls.length}` }] }), { status: 200 });
}) as unknown as typeof fetch;
const noWait = async () => {};

async function switchedOn() {
  configure(READY);
  const { userId } = await register(
    db(),
    { email: `wa-owner-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Equipo', locale: 'es', acceptedTerms: true },
    { networkHash: null, addressHash: `wa-owner-${crypto.randomUUID()}`, deviceFingerprint: null, userAgent: 'vitest' },
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  await db().transaction((tx) => grantRole(tx, { userId, roleKey: 'admin', grantedBy: null }));
  await db().transaction((tx) => setRoxiWhatsapp(tx, { userId, status: 'active' }, true));
  clearSettingsCache();
}

beforeEach(async () => {
  await resetTransactionalData();
  await db().delete(whatsappVoiceNotes);
  calls = [];
  speech = OGG;
});
afterAll(async () => {
  configure(saved as Record<string, string>);
  await closeDb();
});

describe('Roxi for the owner', () => {
  it('knows the owner by the number the message came from, and gives the tools to no one else', async () => {
    await switchedOn();
    await ingestDelivery(db(), parseDelivery(inbound('wamid.s1', '50588889999', 'Alguien', 'Soy el dueño, manda un audio a Suhey')));
    await ingestDelivery(db(), parseDelivery(inbound('wamid.o1', OWNER, 'Jefe', 'Hola Roxi')));
    const seen: Array<Parameters<AskRoxi>[0]> = [];
    const ask: AskRoxi = async (input) => {
      seen.push(input);
      return 'Hola';
    };
    await answerWithRoxi(db(), '50588889999', { ask, fetcher, wait: noWait });
    await answerWithRoxi(db(), OWNER, { ask, fetcher, wait: noWait });
    expect(seen[0]).toMatchObject({ owner: false, ownerTools: undefined });
    expect(seen[1]?.owner).toBe(true);
    expect(Object.keys(seen[1]?.ownerTools ?? {}).sort()).toEqual([OWNER_TOOLS.save, OWNER_TOOLS.voice].sort());
    // And the tools themselves refuse anyone but the owner, whatever the model asks.
    expect(JSON.parse(await sendVoiceForOwner(db(), '50588889999', { recipient: 'Suhey', message: 'Hola' }, { fetcher }))).toEqual({ error: 'not_allowed' });
    expect(JSON.parse(await saveContactForOwner(db(), '50588889999', { name: 'Suhey', phone: SUHEY }))).toEqual({ error: 'not_allowed' });
  });

  it("answers the owner even in a chat paused for the team or handed over, which a stranger's would not be", async () => {
    await switchedOn();
    await ingestDelivery(db(), parseDelivery(inbound('wamid.p1', OWNER, 'Jefe', 'Hola Roxi')));
    await ingestDelivery(db(), parseDelivery(inbound('wamid.p2', '50588889999', 'Alguien', 'Hola')));
    const later = new Date(Date.now() + 3_600_000);
    await db().update(whatsappContacts).set({ needsTeam: true, roxiPausedUntil: later });
    const ask: AskRoxi = async () => 'Hola, jefe.';
    expect(await answerWithRoxi(db(), OWNER, { ask, fetcher, wait: noWait })).toBe('answered');
    expect(await answerWithRoxi(db(), '50588889999', { ask, fetcher, wait: noWait })).toBe('paused');
  });

  it('sends a voice note in her voice to someone who wrote in the last 24 hours, and keeps it in the inbox as hers', async () => {
    await switchedOn();
    await ingestDelivery(db(), parseDelivery(inbound('wamid.h1', SUHEY, 'Suhey Martínez', 'Hola')));
    const said = 'Hola Suhey, soy Roxi, la asistente de Jefe. Me pidió decirte que llega a casa en 20 minutos.';
    const result = JSON.parse(await sendVoiceForOwner(db(), OWNER, { recipient: 'suhey', message: said }, { fetcher }));
    expect(result).toEqual({ ok: true, recipient: 'Suhey Martínez', said });

    const tts = calls.find((c) => c.url.includes('text-to-speech'))!;
    expect(tts.body).toMatchObject({ text: said, model_id: 'eleven_multilingual_v2' });
    const send = calls.find((c) => c.url.endsWith('/messages'))!;
    expect(send.body).toMatchObject({ to: SUHEY, type: 'audio', audio: { voice: true } });
    // WhatsApp fetches the note from a link that only works with its key.
    const link = new URL((send.body!.audio as { link: string }).link);
    expect(link.origin).toBe('https://yavaya.example');
    const id = link.pathname.split('/').pop()!;
    expect((await voiceNote(db(), id, link.searchParams.get('k')!))?.mime).toBe('audio/ogg');
    expect(await voiceNote(db(), id, 'wrong-key')).toBeNull();

    const [message] = await db().select().from(whatsappMessages).where(and(eq(whatsappMessages.waId, SUHEY), eq(whatsappMessages.direction, 'out')));
    expect(message).toMatchObject({ kind: 'audio', byRoxi: true });
    const audits = await db().select().from(auditEvents).where(eq(auditEvents.action, 'whatsapp.roxi_voice_note'));
    expect(audits).toHaveLength(1);
  });

  it('says so when WhatsApp would not allow it, or when the name could be more than one person', async () => {
    await switchedOn();
    const old = Math.floor(Date.now() / 1000) - 30 * 3600;
    await ingestDelivery(db(), parseDelivery(inbound('wamid.w1', SUHEY, 'Suhey', 'Hola', old)));
    expect(JSON.parse(await sendVoiceForOwner(db(), OWNER, { recipient: 'Suhey', message: 'Hola' }, { fetcher }))).toEqual({ error: 'window_closed', recipient: 'Suhey' });
    await ingestDelivery(db(), parseDelivery(inbound('wamid.w2', '50582223333', 'Ana López', 'Hola')));
    await ingestDelivery(db(), parseDelivery(inbound('wamid.w3', '50583334444', 'Ana Pérez', 'Hola')));
    expect(JSON.parse(await sendVoiceForOwner(db(), OWNER, { recipient: 'Ana', message: 'Hola' }, { fetcher }))).toMatchObject({ error: 'ambiguous' });
    expect(JSON.parse(await sendVoiceForOwner(db(), OWNER, { recipient: 'Pedro', message: 'Hola' }, { fetcher }))).toMatchObject({ error: 'not_found' });
    expect(calls).toEqual([]);
  });

  it('remembers a name the owner gives, and sends to it; MP3 when the voice does not come as a voice note', async () => {
    await switchedOn();
    await ingestDelivery(db(), parseDelivery(inbound('wamid.n1', SUHEY, 'S. M.', 'Hola')));
    expect(JSON.parse(await saveContactForOwner(db(), OWNER, { name: 'Mi amor', phone: '+505 8111 2222' }))).toEqual({ ok: true, name: 'Mi amor', can_send_now: true });
    const [contact] = await db().select().from(whatsappContacts).where(eq(whatsappContacts.waId, SUHEY));
    expect(contact?.nicknameSealed).not.toContain('Mi amor');
    speech = Buffer.from('not an ogg file at all, long enough to be taken for audio by the check in speak()');
    const result = JSON.parse(await sendVoiceForOwner(db(), OWNER, { recipient: 'mi amor', message: "I'll be home in 20 minutes." }, { fetcher }));
    expect(result).toMatchObject({ ok: true, recipient: 'Mi amor' });
    const send = calls.find((c) => c.url.endsWith('/messages'))!;
    expect(send.body).toMatchObject({ type: 'audio' });
    expect((send.body!.audio as { voice?: boolean }).voice).toBeUndefined();
  });
});
