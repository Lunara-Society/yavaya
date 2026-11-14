import { describe, expect, it } from 'vitest';
import { converse, LOOKUP_TOOL, OWNER_TOOLS, type RoxiSocket } from '@/server/domains/whatsapp/roxi';
import { WHATSAPP_RULES } from '@/config/business-rules';

/** A stand-in for ElevenLabs' socket: the test plays the agent's side. */
function fakeSocket() {
  const listeners: Record<string, Array<(event: { data?: unknown }) => void>> = {};
  const sent: Array<Record<string, unknown>> = [];
  let closed = false;
  const socket: RoxiSocket = {
    send: (data) => void sent.push(JSON.parse(data)),
    close: () => {
      closed = true;
    },
    addEventListener: (type, listener) => void (listeners[type] ??= []).push(listener),
  };
  const emit = (type: string, payload?: unknown) => listeners[type]?.forEach((l) => l({ data: payload === undefined ? undefined : JSON.stringify(payload) }));
  return {
    socket,
    sent,
    isClosed: () => closed,
    open: () => emit('open'),
    agent: (payload: unknown) => emit('message', payload),
    drop: () => emit('close'),
  };
}

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const says = (text: string) => ({ type: 'agent_response', agent_response_event: { agent_response: text } });
const calls = (id: string, name: string, parameters: unknown) => ({ type: 'client_tool_call', client_tool_call: { tool_name: name, tool_call_id: id, parameters } });
const input = { customerName: 'María', conversation: '', message: '¿Hay refrigeradoras en Masaya?' };
const fast = { settleMs: 10, timeoutMs: 2000 };

describe('one exchange with Roxi on WhatsApp', () => {
  it('asks after the conversation opens and keeps a plain answer', async () => {
    const s = fakeSocket();
    const answer = converse(s.socket, input, fast);
    s.open();
    expect(s.sent[0]).toMatchObject({ type: 'conversation_initiation_client_data', dynamic_variables: { customer_name: 'María' } });
    s.agent({ type: 'conversation_initiation_metadata' });
    expect(s.sent[1]).toEqual({ type: 'user_message', text: input.message });
    s.agent({ type: 'ping', ping_event: { event_id: 7 } });
    expect(s.sent[2]).toEqual({ type: 'pong', event_id: 7 });
    s.agent(says('Hola, soy Roxi.'));
    expect(await answer).toBe('Hola, soy Roxi.');
    expect(s.isClosed()).toBe(true);
  });

  it('looks up before answering: the words said before the look-up are dropped', async () => {
    const s = fakeSocket();
    const asked: Array<Record<string, unknown>> = [];
    const lookup = async (parameters: Record<string, unknown>) => {
      asked.push(parameters);
      return JSON.stringify({ found: 1, results: [{ title: 'Refrigeradora', link: 'https://yavaya.lat/mercadito/1' }] });
    };
    const answer = converse(s.socket, { ...input, lookup }, fast);
    s.open();
    s.agent({ type: 'conversation_initiation_metadata' });
    s.agent(says('Déjame buscar.'));
    s.agent(calls('call-1', LOOKUP_TOOL, { scope: 'mercadito', q: 'refrigeradora', place: 'Masaya' }));
    await tick(30);
    expect(asked).toEqual([{ scope: 'mercadito', q: 'refrigeradora', place: 'Masaya' }]);
    expect(s.sent.at(-1)).toMatchObject({ type: 'client_tool_result', tool_call_id: 'call-1', is_error: false });
    expect(String(s.sent.at(-1)?.result)).toContain('https://yavaya.lat/mercadito/1');
    s.agent(says('Encontré una: https://yavaya.lat/mercadito/1'));
    expect(await answer).toBe('Encontré una: https://yavaya.lat/mercadito/1');
  });

  it('answers an unknown tool, or any tool when no look-up is offered, with an error', async () => {
    const s = fakeSocket();
    const answer = converse(s.socket, input, fast);
    s.open();
    s.agent({ type: 'conversation_initiation_metadata' });
    s.agent(calls('call-1', LOOKUP_TOOL, { scope: 'mercadito' }));
    expect(s.sent.at(-1)).toMatchObject({ type: 'client_tool_result', tool_call_id: 'call-1', is_error: true });
    s.agent(says('No pude buscar ahora.'));
    expect(await answer).toBe('No pude buscar ahora.');
  });

  it("tells her who is the owner, and runs the owner's tools only in the owner's conversation", async () => {
    const stranger = fakeSocket();
    const answer = converse(stranger.socket, input, fast);
    stranger.open();
    expect(stranger.sent[0]).toMatchObject({ dynamic_variables: { is_owner: 'no' } });
    stranger.agent({ type: 'conversation_initiation_metadata' });
    stranger.agent(calls('call-1', OWNER_TOOLS.voice, { recipient: 'Suhey', message: 'Hola' }));
    expect(stranger.sent.at(-1)).toMatchObject({ tool_call_id: 'call-1', is_error: true, result: JSON.stringify({ error: 'not_allowed' }) });
    stranger.agent(says('No puedo hacer eso.'));
    expect(await answer).toBe('No puedo hacer eso.');

    const owner = fakeSocket();
    const sent: Array<Record<string, unknown>> = [];
    const ownerTools = { [OWNER_TOOLS.voice]: async (p: Record<string, unknown>) => (sent.push(p), JSON.stringify({ ok: true })) };
    const done = converse(owner.socket, { ...input, owner: true, ownerTools }, fast);
    owner.open();
    expect(owner.sent[0]).toMatchObject({ dynamic_variables: { is_owner: 'yes' } });
    owner.agent({ type: 'conversation_initiation_metadata' });
    owner.agent(calls('call-2', OWNER_TOOLS.voice, { recipient: 'Suhey', message: 'Hola' }));
    await tick(20);
    expect(sent).toEqual([{ recipient: 'Suhey', message: 'Hola' }]);
    owner.agent(says('Listo, se lo mandé.'));
    expect(await done).toBe('Listo, se lo mandé.');
  });

  it('stops looking up after the configured number of times', async () => {
    const s = fakeSocket();
    let ran = 0;
    const answer = converse(s.socket, { ...input, lookup: async () => String((ran += 1)) }, fast);
    s.open();
    s.agent({ type: 'conversation_initiation_metadata' });
    for (let i = 0; i <= WHATSAPP_RULES.roxiLookupsPerAnswer; i += 1) {
      s.agent(calls(`call-${i}`, LOOKUP_TOOL, { scope: 'mercadito' }));
      await tick(5);
    }
    expect(ran).toBe(WHATSAPP_RULES.roxiLookupsPerAnswer);
    expect(s.sent.at(-1)).toMatchObject({ is_error: true });
    s.agent(says('Listo.'));
    expect(await answer).toBe('Listo.');
  });

  it('gives nothing when the line drops or she takes too long', async () => {
    const dropped = fakeSocket();
    const first = converse(dropped.socket, input, fast);
    dropped.open();
    dropped.drop();
    expect(await first).toBeNull();

    const slow = fakeSocket();
    const second = converse(slow.socket, input, { settleMs: 10, timeoutMs: 40 });
    slow.open();
    expect(await second).toBeNull();
  });
});
