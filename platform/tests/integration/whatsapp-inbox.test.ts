import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { closeDb, db } from '@/server/db/client';
import { auditEvents, users, whatsappContacts, whatsappMessages } from '@/server/db/schema';
import { resetServerEnvCache } from '@/config/env';
import { register } from '@/server/domains/identity/service';
import { grantRole } from '@/server/domains/access/authorize';
import {
  deleteConversation,
  ingestDelivery,
  listInbox,
  openConversation,
  parseDelivery,
  sendReply,
  signatureAccepted,
  verifyHandshake,
  webhookKeyMatches,
  whatsappAvailability,
} from '@/server/domains/whatsapp/service';
import { resetTransactionalData } from '../helpers/database';

/**
 * The WhatsApp team inbox: what Meta delivers is read strictly, stored once,
 * sealed, and shown only to staff holding `whatsapp.inbox`.
 */

const VARS = ['WHATSAPP_WEBHOOK_KEY', 'WHATSAPP_VERIFY_TOKEN', 'WHATSAPP_KEY', 'WHATSAPP_KEY_PREVIOUS', 'WHATSAPP_APP_SECRET', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'] as const;
const saved = Object.fromEntries(VARS.map((key) => [key, process.env[key]]));
const WEBHOOK_KEY = 'a-webhook-key-that-is-long-enough-01';
const VERIFY = 'verify-token-long-enough-02';
const SEAL = 'the-whatsapp-sealing-key-that-is-long-enough-03';

function configure(values: Partial<Record<(typeof VARS)[number], string>>) {
  for (const key of VARS) delete process.env[key];
  Object.assign(process.env, values);
  resetServerEnvCache();
}

const context = { networkHash: null, addressHash: 'whatsapp-test', deviceFingerprint: null, userAgent: 'vitest' };

async function person(role?: 'support' | 'moderator') {
  const { userId } = await register(
    db(),
    { email: `wa-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Equipo', locale: 'es', acceptedTerms: true },
    context,
  );
  await db().update(users).set({ status: 'active' }).where(eq(users.id, userId));
  if (role) await db().transaction((tx) => grantRole(tx, { userId, roleKey: role, grantedBy: null }));
  return { userId, status: 'active' as const };
}

const now = Math.floor(Date.now() / 1000);
function inbound(id: string, text: string, from = '50588881234', at = now) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              contacts: [{ wa_id: from, profile: { name: 'María' } }],
              messages: [{ id, from, timestamp: String(at), type: 'text', text: { body: text } }],
            },
          },
        ],
      },
    ],
  };
}

beforeEach(async () => {
  await resetTransactionalData();
  configure({ WHATSAPP_WEBHOOK_KEY: WEBHOOK_KEY, WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_KEY: SEAL });
});
afterEach(() => configure(saved as Record<string, string>));
afterAll(async () => {
  configure(saved as Record<string, string>);
  await closeDb();
});

describe('configuration', () => {
  it('receives only with all three secrets, and replies only with the Cloud API token too', () => {
    expect(whatsappAvailability()).toEqual({ receive: true, reply: false, missing: [] });
    configure({ WHATSAPP_WEBHOOK_KEY: 'short', WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_KEY: SEAL });
    expect(whatsappAvailability()).toMatchObject({ receive: false, missing: ['WHATSAPP_WEBHOOK_KEY'] });
    expect(webhookKeyMatches('short')).toBe(false);
    configure({ WHATSAPP_WEBHOOK_KEY: WEBHOOK_KEY, WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_KEY: SEAL, WHATSAPP_ACCESS_TOKEN: 'token', WHATSAPP_PHONE_NUMBER_ID: '123456789' });
    expect(whatsappAvailability().reply).toBe(true);
  });

  it('matches the webhook key exactly', () => {
    expect(webhookKeyMatches(WEBHOOK_KEY)).toBe(true);
    expect(webhookKeyMatches(`${WEBHOOK_KEY}x`)).toBe(false);
    expect(webhookKeyMatches('')).toBe(false);
  });
});

describe('Meta handshake and signature', () => {
  it('answers the challenge only for the right verify token', () => {
    const ok = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '1158201444' });
    expect(verifyHandshake(ok)).toBe('1158201444');
    expect(verifyHandshake(new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '1' }))).toBeNull();
    expect(verifyHandshake(new URLSearchParams({ 'hub.mode': 'unsubscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '1' }))).toBeNull();
    expect(verifyHandshake(new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': VERIFY, 'hub.challenge': '<script>' }))).toBeNull();
  });

  it('checks the signature when the app secret is set', () => {
    expect(signatureAccepted('{}', null)).toBe(true);
    configure({ WHATSAPP_WEBHOOK_KEY: WEBHOOK_KEY, WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_KEY: SEAL, WHATSAPP_APP_SECRET: 'app-secret' });
    const good = `sha256=${createHmac('sha256', 'app-secret').update('{"a":1}').digest('hex')}`;
    expect(signatureAccepted('{"a":1}', good)).toBe(true);
    expect(signatureAccepted('{"a":2}', good)).toBe(false);
    expect(signatureAccepted('{"a":1}', null)).toBe(false);
  });
});

describe('reading deliveries', () => {
  it('reads messages, echoes from the phone and statuses, and skips anything malformed', () => {
    const parsed = parseDelivery({
      entry: [
        {
          changes: [
            {
              field: 'messages',
              value: {
                contacts: [{ wa_id: '50588881234', profile: { name: 'María' } }],
                messages: [
                  { id: 'm1', from: '50588881234', timestamp: String(now), type: 'image', image: { caption: 'mi tienda' } },
                  { id: 'm2', from: '50588881234', timestamp: String(now), type: 'something_new' },
                  { id: 'bad', from: 'abc', timestamp: String(now), type: 'text', text: { body: 'x' } },
                  { from: '50588881234', timestamp: String(now), type: 'text' },
                ],
                statuses: [{ id: 'out1', status: 'read' }, { id: 'out2', status: 'weird' }],
              },
            },
            { field: 'smb_message_echoes', value: { message_echoes: [{ id: 'e1', from: '50558365522', to: '50588881234', timestamp: String(now), type: 'text', text: { body: 'Hola' } }] } },
            { field: 'history', value: { anything: true } },
          ],
        },
      ],
    });
    expect(parsed.messages.map((m) => [m.waMessageId, m.direction, m.kind, m.text, m.waId])).toEqual([
      ['m1', 'in', 'image', 'mi tienda', '50588881234'],
      ['m2', 'in', 'other', null, '50588881234'],
      ['e1', 'out', 'text', 'Hola', '50588881234'],
    ]);
    expect(parsed.statuses).toEqual([{ waMessageId: 'out1', status: 'read' }]);
    expect(parsed.names.get('50588881234')).toBe('María');
    expect(parseDelivery(null)).toEqual({ messages: [], statuses: [], names: new Map() });
    expect(parseDelivery({ entry: 'no' }).messages).toEqual([]);
  });
});

describe('storing and the inbox', () => {
  it('stores each message once, sealed, and counts it unread', async () => {
    const delivery = parseDelivery(inbound('wamid.1', 'Hola, quiero vender en Yavaya'));
    expect(await ingestDelivery(db(), delivery)).toEqual({ stored: 1 });
    expect(await ingestDelivery(db(), delivery)).toEqual({ stored: 0 });

    const [message] = await db().select().from(whatsappMessages);
    expect(message?.bodySealed).toBeTruthy();
    expect(message?.bodySealed).not.toContain('Hola');
    const [contact] = await db().select().from(whatsappContacts);
    expect(contact?.unread).toBe(1);
    expect(contact?.nameSealed).not.toContain('María');

    const staff = await person('support');
    const inbox = await listInbox(db(), staff);
    expect(inbox).toEqual([expect.objectContaining({ waId: '50588881234', name: 'María', unread: 1 })]);
    const opened = await openConversation(db(), staff, '50588881234');
    expect(opened?.messages.map((m) => m.text)).toEqual(['Hola, quiero vender en Yavaya']);
    expect(opened?.canReplyUntil).toBeInstanceOf(Date);
    expect((await listInbox(db(), staff))[0]?.unread).toBe(0);
  });

  it('is closed to members without the permission, and to nobody signed in', async () => {
    await ingestDelivery(db(), parseDelivery(inbound('wamid.2', 'Hola')));
    const member = await person();
    const moderator = await person('moderator');
    await expect(listInbox(db(), member)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(listInbox(db(), moderator)).rejects.toMatchObject({ code: 'forbidden' });
    await expect(openConversation(db(), null, '50588881234')).rejects.toBeTruthy();
    await expect(db().transaction((tx) => deleteConversation(tx, member, '50588881234'))).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('deletes a conversation with its messages, and audits it', async () => {
    await ingestDelivery(db(), parseDelivery(inbound('wamid.3', 'Borren esto, por favor')));
    const staff = await person('support');
    await db().transaction((tx) => deleteConversation(tx, staff, '50588881234'));
    expect(await db().select().from(whatsappMessages)).toEqual([]);
    expect(await db().select().from(whatsappContacts)).toEqual([]);
    const audits = await db().select().from(auditEvents).where(eq(auditEvents.action, 'whatsapp.delete_conversation'));
    expect(audits).toHaveLength(1);
  });

  it('does not reply without the Cloud API, nor outside the 24-hour window', async () => {
    const staff = await person('support');
    await ingestDelivery(db(), parseDelivery(inbound('wamid.4', 'Hola')));
    await expect(db().transaction((tx) => sendReply(tx, staff, '50588881234', 'Hola'))).rejects.toMatchObject({ messageKey: 'whatsapp.error.reply_unavailable' });

    configure({ WHATSAPP_WEBHOOK_KEY: WEBHOOK_KEY, WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_KEY: SEAL, WHATSAPP_ACCESS_TOKEN: 'token', WHATSAPP_PHONE_NUMBER_ID: '123456789' });
    await ingestDelivery(db(), parseDelivery(inbound('wamid.old', 'Hace mucho', '50577770000', now - 25 * 3600)));
    let called = false;
    const fetcher = (async () => {
      called = true;
      return new Response('{}');
    }) as unknown as typeof fetch;
    await expect(db().transaction((tx) => sendReply(tx, staff, '50577770000', 'Hola', fetcher))).rejects.toMatchObject({ messageKey: 'whatsapp.error.window_closed' });
    expect(called).toBe(false);
  });

  it('sends a reply inside the window, stores it once and audits who answered', async () => {
    configure({ WHATSAPP_WEBHOOK_KEY: WEBHOOK_KEY, WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_KEY: SEAL, WHATSAPP_ACCESS_TOKEN: 'token', WHATSAPP_PHONE_NUMBER_ID: '123456789' });
    const staff = await person('support');
    await ingestDelivery(db(), parseDelivery(inbound('wamid.5', 'Hola')));
    let sent: { url: string; body: unknown } | null = null;
    const fetcher = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)) };
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.reply' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    await db().transaction((tx) => sendReply(tx, staff, '50588881234', '  Hola María  ', fetcher));
    expect(sent).toMatchObject({ url: 'https://graph.facebook.com/v21.0/123456789/messages', body: { to: '50588881234', text: { body: 'Hola María' } } });
    const opened = await openConversation(db(), staff, '50588881234');
    expect(opened?.messages.map((m) => [m.direction, m.text, m.fromInbox])).toEqual([
      ['in', 'Hola', false],
      ['out', 'Hola María', true],
    ]);
    const audits = await db().select().from(auditEvents).where(eq(auditEvents.action, 'whatsapp.reply'));
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0], (_k, v: unknown) => (typeof v === 'bigint' ? String(v) : v))).not.toContain('Hola María');
  });

  it('a failed send stores nothing', async () => {
    configure({ WHATSAPP_WEBHOOK_KEY: WEBHOOK_KEY, WHATSAPP_VERIFY_TOKEN: VERIFY, WHATSAPP_KEY: SEAL, WHATSAPP_ACCESS_TOKEN: 'token', WHATSAPP_PHONE_NUMBER_ID: '123456789' });
    const staff = await person('support');
    await ingestDelivery(db(), parseDelivery(inbound('wamid.6', 'Hola')));
    const fetcher = (async () => new Response('{"error":{}}', { status: 400 })) as unknown as typeof fetch;
    await expect(db().transaction((tx) => sendReply(tx, staff, '50588881234', 'Hola', fetcher))).rejects.toMatchObject({ messageKey: 'whatsapp.error.send_failed' });
    expect(await db().select().from(whatsappMessages).where(eq(whatsappMessages.direction, 'out'))).toEqual([]);
  });
});
