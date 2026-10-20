'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Conversation } from '@elevenlabs/client';
import type { RoxiLabels } from './labels';
import { roxiTools, type RoxiResultCard } from './tools';

/**
 * The conversation with Roxi. Loaded only when a member opens it: the
 * ElevenLabs client and its audio code are not part of any page otherwise.
 *
 * One conversation at a time, by voice or in writing. Photos go to Roxi
 * through the same conversation (ElevenLabs' file input) and are also kept
 * here, so a listing Roxi prepares arrives in the form with them.
 *
 * Connects over WebSocket rather than WebRTC: one host to allow in the
 * Content-Security-Policy, and steadier than UDP on a mobile network that
 * drops it. The audio worklets are served from /vendor/elevenlabs, never
 * from a CDN or a blob: URL, so the CSP stays as strict as it was.
 */

export type RoxiMember = { firstName: string; yayId: string; placeName: string | null; emailVerified: boolean };

type Entry =
  | { id: number; kind: 'roxi' | 'you'; text: string }
  | { id: number; kind: 'note'; text: string }
  | { id: number; kind: 'photo'; url: string }
  | { id: number; kind: 'results'; cards: RoxiResultCard[]; more: boolean };

/** Omit that keeps a union a union, so each kind of entry is still checked on its own. */
type NewEntry = Entry extends infer E ? (E extends unknown ? Omit<E, 'id'> : never) : never;

type Phase = 'idle' | 'connecting' | 'live' | 'ended';
type Mode = 'voice' | 'text';

const PHOTO_EDGE = 1600;

/** A phone photo shrunk before it travels: Roxi needs to see it, not print it. */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export default function RoxiPanel({
  member,
  locale,
  labels,
  onClose,
}: {
  member: RoxiMember;
  locale: string;
  labels: RoxiLabels;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const [phase, setPhase] = useState<Phase>('idle');
  const [mode, setMode] = useState<Mode>('text');
  const [speaking, setSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [aside, setAside] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const conversation = useRef<Conversation | null>(null);
  const photos = useRef<Array<{ file: File; taken: boolean }>>([]);
  const nextId = useRef(1);
  const list = useRef<HTMLOListElement>(null);
  const orb = useRef<HTMLSpanElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // What the member typed, shown at once; the transcript ElevenLabs may echo back is then not shown twice.
  const typed = useRef<string[]>([]);

  const add = useCallback((entry: NewEntry) => {
    setEntries((current) => [...current, { ...entry, id: nextId.current++ } as Entry]);
  }, []);

  useEffect(() => {
    list.current?.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [entries]);

  // Tell Roxi where the member is, so "this listing" or "here" means something.
  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    conversation.current?.sendContextualUpdate(`The member is now on the page ${pathname}.`);
  }, [pathname]);

  // The orb breathes with whoever is talking.
  useEffect(() => {
    if (phase !== 'live' || mode !== 'voice') return;
    let frame = 0;
    const tick = () => {
      const live = conversation.current;
      if (live && orb.current) {
        const level = speaking ? live.getOutputVolume() : live.getInputVolume();
        orb.current.style.setProperty('--level', Math.min(1, level * 1.6).toFixed(3));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, mode, speaking]);

  useEffect(
    () => () => {
      void conversation.current?.endSession();
      for (const entry of entriesRef.current) if (entry.kind === 'photo') URL.revokeObjectURL(entry.url);
    },
    [],
  );

  const tools = useCallback(
    () =>
      roxiTools({
        navigate: (path) => router.push(path),
        pathname: () => pathRef.current,
        takePhotos: () => {
          const waiting = photos.current.filter((photo) => !photo.taken).slice(-6);
          for (const photo of waiting) photo.taken = true;
          return waiting.map((photo) => photo.file);
        },
        showResults: (cards, more) => {
          if (cards.length > 0) add({ kind: 'results', cards, more });
        },
        note: (text) => add({ kind: 'note', text }),
        stepAside: () => {
          if (window.matchMedia('(max-width: 999px)').matches) setAside(true);
        },
        labels: { draft_opened: labels.draft_opened, opened: labels.opened, no_results: labels.no_results },
      }),
    [add, labels, router],
  );

  /** What was said before, when switching from writing to voice: a new conversation that remembers. */
  const recap = () =>
    entries
      .filter((entry): entry is Extract<Entry, { kind: 'roxi' | 'you' }> => entry.kind === 'roxi' || entry.kind === 'you')
      .slice(-12)
      .map((entry) => `${entry.kind === 'you' ? 'Member' : 'Roxi'}: ${entry.text}`)
      .join('\n')
      .slice(0, 3000);

  async function start(wanted: Mode, opening?: (live: Conversation) => Promise<void> | void) {
    if (phase === 'connecting') return;
    setPhase('connecting');
    let modeNow = wanted;
    try {
      const response = await fetch('/api/roxi/start', { method: 'POST', credentials: 'same-origin' });
      const body = (await response.json().catch(() => null)) as {
        ok: boolean;
        agentId?: string;
        signedUrl?: string;
        status?: string;
        message?: string;
      } | null;
      if (!body?.ok) {
        add({ kind: 'note', text: body?.message ?? labels.connect_error });
        setPhase(entries.length > 0 ? 'ended' : 'idle');
        return;
      }
      if (modeNow === 'voice') {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          for (const track of stream.getTracks()) track.stop();
        } catch {
          add({ kind: 'note', text: labels.mic_denied });
          modeNow = 'text';
        }
      }
      const previous = recap();
      const live = await Conversation.startSession({
        ...(body.signedUrl ? { signedUrl: body.signedUrl } : { agentId: body.agentId! }),
        connectionType: 'websocket',
        textOnly: modeNow === 'text',
        userId: member.yayId,
        overrides: {
          agent: {
            language: locale === 'en' ? 'en' : 'es',
            // Opened by writing or with a photo: Roxi answers that, instead of greeting first.
            ...(opening || previous ? { firstMessage: '' } : {}),
          },
        },
        dynamicVariables: {
          member_name: member.firstName || member.yayId,
          member_yay_id: member.yayId,
          member_place: member.placeName ?? '',
          member_email_verified: member.emailVerified,
          member_language: locale,
          current_page: pathRef.current,
          previous_conversation: previous,
          platform_status: body.status ?? '',
        },
        clientTools: tools(),
        workletPaths: {
          rawAudioProcessor: '/vendor/elevenlabs/rawAudioProcessor.js',
          audioConcatProcessor: '/vendor/elevenlabs/audioConcatProcessor.js',
        },
        libsampleratePath: '/vendor/elevenlabs/libsamplerate.worklet.js',
        onMessage: ({ message, source }) => {
          const said = message.trim();
          if (!said) return;
          if (source === 'user') {
            const echo = typed.current.indexOf(said);
            if (echo !== -1) {
              typed.current.splice(echo, 1);
              return;
            }
          }
          add({ kind: source === 'user' ? 'you' : 'roxi', text: said });
        },
        onModeChange: ({ mode: now }) => setSpeaking(now === 'speaking'),
        onDisconnect: () => {
          conversation.current = null;
          setPhase('ended');
          setSpeaking(false);
        },
        // A failed tool already answers Roxi with its error; only a broken connection is the member's business.
        onError: (_message, context) => {
          if (!(context && 'clientToolName' in context)) add({ kind: 'note', text: labels.connect_error });
        },
      });
      conversation.current = live;
      setMode(modeNow);
      setMuted(false);
      setPhase('live');
      await opening?.(live);
    } catch {
      add({ kind: 'note', text: labels.connect_error });
      setPhase(entries.length > 0 ? 'ended' : 'idle');
    }
  }

  async function sendText(event?: React.FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    const live = conversation.current;
    add({ kind: 'you', text });
    typed.current = [...typed.current.slice(-9), text];
    if (live) {
      live.sendUserMessage(text);
      return;
    }
    await start('text', (session) => session.sendUserMessage(text));
  }

  async function sendPhoto(file: File | undefined) {
    if (!file || busy) return;
    setBusy(true);
    try {
      const small = await shrink(file);
      photos.current.push({ file: small, taken: false });
      add({ kind: 'photo', url: URL.createObjectURL(small) });
      const deliver = async (session: Conversation) => {
        try {
          const { fileId } = await session.uploadFile(small);
          const caption = draft.trim() || labels.photo_text;
          typed.current = [...typed.current.slice(-9), caption];
          session.sendMultimodalMessage({ text: caption, fileIds: [fileId] });
          setDraft('');
        } catch {
          add({ kind: 'note', text: labels.photo_error });
        }
      };
      if (conversation.current) await deliver(conversation.current);
      else await start('text', deliver);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function switchToVoice() {
    await conversation.current?.endSession();
    conversation.current = null;
    await start('voice');
  }

  async function end() {
    await conversation.current?.endSession();
    conversation.current = null;
    setPhase('ended');
  }

  function toggleMute() {
    const next = !muted;
    conversation.current?.setMicMuted(next);
    setMuted(next);
  }

  const status =
    phase === 'connecting'
      ? labels['status.connecting']
      : phase === 'live'
        ? mode === 'voice'
          ? speaking
            ? labels['status.speaking']
            : labels['status.listening']
          : labels['status.ready']
        : phase === 'ended'
          ? labels['status.ended']
          : labels.role;

  if (aside) {
    return (
      <button type="button" className="roxi-aside" onClick={() => setAside(false)} data-speaking={speaking || undefined}>
        <span className="roxi-face" aria-hidden="true">
          R
        </span>
        <span>{labels.restore}</span>
        <span className="roxi-aside-status">{status}</span>
      </button>
    );
  }

  return (
    <section className="roxi-panel" role="dialog" aria-label={labels.name} data-phase={phase} data-mode={mode}>
      <header className="roxi-head">
        <span className="roxi-face" aria-hidden="true">
          R
        </span>
        <div className="roxi-title">
          <strong>{labels.name}</strong>
          <span className="roxi-status" aria-live="polite">
            {status}
          </span>
        </div>
        <button type="button" className="roxi-icon" onClick={() => setAside(true)} aria-label={labels.minimize}>
          –
        </button>
        <button
          type="button"
          className="roxi-icon"
          onClick={() => {
            void end();
            onClose();
          }}
          aria-label={labels.close}
        >
          ×
        </button>
      </header>

      <ol className="roxi-log" ref={list} aria-live="polite">
        {entries.length === 0 ? (
          <li className="roxi-msg is-roxi">{labels.intro.replace('{name}', member.firstName || member.yayId)}</li>
        ) : null}
        {entries.map((entry) => {
          if (entry.kind === 'photo') {
            return (
              <li key={entry.id} className="roxi-msg is-you is-photo">
                {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the member's own photo */}
                <img src={entry.url} alt="" />
              </li>
            );
          }
          if (entry.kind === 'results') {
            return (
              <li key={entry.id} className="roxi-results">
                <span className="roxi-results-title">{labels.results}</span>
                <ul>
                  {entry.cards.map((card) => (
                    <li key={card.url}>
                      <a
                        href={card.url}
                        onClick={(event) => {
                          event.preventDefault();
                          router.push(card.url);
                        }}
                      >
                        <strong>{card.title}</strong>
                        <span>{card.detail}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            );
          }
          return (
            <li key={entry.id} className={`roxi-msg is-${entry.kind}`}>
              {entry.text}
            </li>
          );
        })}
      </ol>

      {phase === 'live' && mode === 'voice' ? (
        <div className="roxi-voice">
          <span className="roxi-orb" ref={orb} data-speaking={speaking || undefined} aria-hidden="true" />
          <button type="button" className="btn btn-line" onClick={toggleMute} aria-pressed={muted}>
            {muted ? labels.unmute : labels.mute}
          </button>
          <button type="button" className="btn btn-line" onClick={() => void end()}>
            {labels.end}
          </button>
        </div>
      ) : (
        <div className="roxi-start">
          <button type="button" className="btn btn-gold" onClick={() => void (phase === 'live' ? switchToVoice() : start('voice'))} disabled={phase === 'connecting'}>
            {phase === 'live' ? labels.voice_switch : phase === 'ended' ? labels.new : labels.talk}
          </button>
        </div>
      )}

      <form className="roxi-compose" onSubmit={(event) => void sendText(event)}>
        <button type="button" className="roxi-icon" onClick={() => fileInput.current?.click()} aria-label={labels.photo} disabled={busy || phase === 'connecting'}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M4 7h3l2-2h6l2 2h3v12H4z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            <circle cx="12" cy="13" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => void sendPhoto(event.currentTarget.files?.[0])}
        />
        <input
          value={draft}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
            conversation.current?.sendUserActivity();
          }}
          placeholder={busy ? labels.photo_sending : labels.type_placeholder}
          aria-label={labels.type_placeholder}
          maxLength={1000}
          enterKeyHint="send"
        />
        <button type="submit" className="roxi-send" disabled={!draft.trim() || phase === 'connecting'} aria-label={labels.send}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M4 12l16-8-6 16-2-6z" fill="currentColor" />
          </svg>
        </button>
      </form>

      <p className="roxi-disclosure">
        {labels.disclosure}{' '}
        <a href="/privacy#roxi" target="_blank" rel="noopener">
          {labels.privacy}
        </a>
      </p>
    </section>
  );
}
