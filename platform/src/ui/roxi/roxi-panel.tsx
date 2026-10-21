'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Conversation } from '@elevenlabs/client';
import type { RoxiLabels } from './labels';
import { RoxiOrb, type OrbState } from './orb';
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
 *
 * Shape: a column down the right of a wide screen (the page moves over to
 * make room, so a form Roxi opens stays in full view beside her), a sheet
 * from the bottom on a phone. When she opens a page on a phone she shrinks to
 * an island above the dock and keeps talking.
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
/** If an answer never comes (a dropped tool call, a stalled model), the dots stop rather than spin forever. */
const WAIT_GIVE_UP_MS = 45_000;

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

const icon = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

function Icon({ name, size = 20 }: { name: 'mic' | 'mic-off' | 'end' | 'camera' | 'send' | 'minimize' | 'close' | 'search' | 'coin' | 'spark' | 'arrow'; size?: number }) {
  const props = { ...icon, width: size, height: size };
  switch (name) {
    case 'mic':
      return (
        <svg {...props}>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
        </svg>
      );
    case 'mic-off':
      return (
        <svg {...props}>
          <path d="M15 10V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.9 2.3M5.5 11a6.5 6.5 0 0 0 10.6 5M18.4 12.6c.07-.5.1-1 .1-1.6M12 17.5V21M3 3l18 18" />
        </svg>
      );
    case 'end':
      return (
        <svg {...props}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    case 'camera':
      return (
        <svg {...props}>
          <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
          <circle cx="12" cy="13" r="3.4" />
        </svg>
      );
    case 'send':
      return (
        <svg {...props}>
          <path d="M5 12h13M13 6l6 6-6 6" />
        </svg>
      );
    case 'minimize':
      return (
        <svg {...props}>
          <path d="M6 13l6 6 6-6" />
        </svg>
      );
    case 'close':
      return (
        <svg {...props}>
          <path d="M7 7l10 10M17 7L7 17" />
        </svg>
      );
    case 'search':
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
      );
    case 'coin':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7.5v9M9.5 10a2.5 2 0 0 1 5 0c0 2.6-5 1.4-5 4a2.5 2 0 0 0 5 0" />
        </svg>
      );
    case 'spark':
      return (
        <svg {...props}>
          <path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6zM18.5 16l.7 2 .2.1 1.6.6-1.6.6-.2.1-.7 2-.7-2-.2-.1-1.6-.6 1.6-.6.2-.1z" />
        </svg>
      );
    case 'arrow':
      return (
        <svg {...props}>
          <path d="M5 12h13M13 7l5 5-5 5" />
        </svg>
      );
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
  const [waiting, setWaiting] = useState(false);
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
  const panel = useRef<HTMLElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const island = useRef<HTMLSpanElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const level = useRef(0);
  // What the member typed, shown at once; the transcript ElevenLabs may echo back is then not shown twice.
  const typed = useRef<string[]>([]);
  // A photo picked from "Sell with a photo" says so, instead of the plain caption.
  const sellingPhoto = useRef(false);

  const add = useCallback((entry: NewEntry) => {
    setEntries((current) => [...current, { ...entry, id: nextId.current++ } as Entry]);
  }, []);

  useEffect(() => {
    // The greeting is read from the top; only a conversation follows its latest line.
    if (entries.length === 0) return;
    list.current?.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [entries, waiting]);

  // Tell Roxi where the member is, so "this listing" or "here" means something.
  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    conversation.current?.sendContextualUpdate(`The member is now on the page ${pathname}.`);
  }, [pathname]);

  // The orb (and the island's small sphere) moves with whoever is talking.
  useEffect(() => {
    if (phase !== 'live' || mode !== 'voice') {
      level.current = 0;
      island.current?.style.setProperty('--level', '0');
      return;
    }
    let frame = 0;
    const tick = () => {
      const live = conversation.current;
      if (live) {
        level.current = Math.min(1, (speaking ? live.getOutputVolume() : live.getInputVolume()) * 1.6);
        island.current?.style.setProperty('--level', level.current.toFixed(3));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phase, mode, speaking]);

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setWaiting(false), WAIT_GIVE_UP_MS);
    return () => window.clearTimeout(timer);
  }, [waiting, entries.length]);

  // While the panel is open the page makes room for it on a wide screen (see site.css), and Esc tucks it away.
  useEffect(() => {
    if (aside) return;
    const root = document.documentElement;
    root.dataset.roxi = 'open';
    if (window.matchMedia('(pointer: fine)').matches) input.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && panel.current?.contains(document.activeElement)) setAside(true);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      delete root.dataset.roxi;
      window.removeEventListener('keydown', onKey);
    };
  }, [aside]);

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
          const waitingPhotos = photos.current.filter((photo) => !photo.taken).slice(-6);
          for (const photo of waitingPhotos) photo.taken = true;
          return waitingPhotos.map((photo) => photo.file);
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
        setWaiting(false);
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
          } else {
            setWaiting(false);
          }
          add({ kind: source === 'user' ? 'you' : 'roxi', text: said });
        },
        onModeChange: ({ mode: now }) => setSpeaking(now === 'speaking'),
        onDisconnect: () => {
          conversation.current = null;
          setPhase('ended');
          setSpeaking(false);
          setWaiting(false);
        },
        // A failed tool already answers Roxi with its error; only a broken connection is the member's business.
        onError: (_message, context) => {
          if (!(context && 'clientToolName' in context)) {
            add({ kind: 'note', text: labels.connect_error });
            setWaiting(false);
          }
        },
      });
      conversation.current = live;
      setMode(modeNow);
      setMuted(false);
      setPhase('live');
      await opening?.(live);
    } catch {
      add({ kind: 'note', text: labels.connect_error });
      setWaiting(false);
      setPhase(entries.length > 0 ? 'ended' : 'idle');
    }
  }

  async function sendText(text: string, fromBox: boolean) {
    const said = text.trim();
    if (!said) return;
    if (fromBox) setDraft('');
    const live = conversation.current;
    add({ kind: 'you', text: said });
    setWaiting(true);
    typed.current = [...typed.current.slice(-9), said];
    if (live) {
      live.sendUserMessage(said);
      return;
    }
    await start('text', (session) => session.sendUserMessage(said));
  }

  async function sendPhoto(file: File | undefined) {
    const selling = sellingPhoto.current;
    sellingPhoto.current = false;
    if (!file || busy) return;
    setBusy(true);
    try {
      const small = await shrink(file);
      photos.current.push({ file: small, taken: false });
      add({ kind: 'photo', url: URL.createObjectURL(small) });
      setWaiting(true);
      const deliver = async (session: Conversation) => {
        try {
          const { fileId } = await session.uploadFile(small);
          const caption = draft.trim() || (selling ? labels.sell_caption : labels.photo_text);
          typed.current = [...typed.current.slice(-9), caption];
          session.sendMultimodalMessage({ text: caption, fileIds: [fileId] });
          setDraft('');
        } catch {
          add({ kind: 'note', text: labels.photo_error });
          setWaiting(false);
        }
      };
      if (conversation.current) await deliver(conversation.current);
      else await start('text', deliver);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function pickPhoto(selling: boolean) {
    sellingPhoto.current = selling;
    fileInput.current?.click();
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
    setWaiting(false);
  }

  function toggleMute() {
    const next = !muted;
    conversation.current?.setMicMuted(next);
    setMuted(next);
  }

  const voice = phase === 'live' && mode === 'voice';
  const orbState: OrbState = phase === 'connecting' || waiting ? 'thinking' : voice ? (speaking ? 'speaking' : 'listening') : 'idle';
  let lastSaid: string | undefined;
  let lastSaidId = 0;
  for (const entry of entries) {
    if (entry.kind === 'roxi') {
      lastSaid = entry.text;
      lastSaidId = entry.id;
    }
  }
  const welcome = entries.length === 0 && !voice;

  const status =
    phase === 'connecting'
      ? labels['status.connecting']
      : waiting
        ? labels.thinking
        : phase === 'live'
          ? mode === 'voice'
            ? speaking
              ? labels['status.speaking']
              : labels['status.listening']
            : labels['status.ready']
          : phase === 'ended'
            ? labels['status.ended']
            : labels.role;

  const suggestions = [
    { key: 'find', icon: 'search', text: labels['suggest.find'] },
    { key: 'account', icon: 'coin', text: labels['suggest.account'] },
    { key: 'how', icon: 'spark', text: labels['suggest.how'] },
  ] as const;

  const photoInput = (
    <input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => void sendPhoto(event.currentTarget.files?.[0])} />
  );

  if (aside) {
    return (
      <div className="roxi-island" data-state={orbState}>
        <button type="button" className="roxi-island-main" onClick={() => setAside(false)} aria-label={labels.restore}>
          <span className="roxi-mini" ref={island} aria-hidden="true">
            <span className="roxi-sphere" />
          </span>
          <span className="roxi-island-text">
            <strong>{labels.name}</strong>
            <span>{voice && lastSaid ? lastSaid : status}</span>
          </span>
        </button>
        {voice ? (
          <button type="button" className="roxi-round is-small" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? labels.unmute : labels.mute}>
            <Icon name={muted ? 'mic-off' : 'mic'} size={18} />
          </button>
        ) : null}
        <button type="button" className="roxi-round is-small is-quiet" onClick={() => setAside(false)} aria-label={labels.restore}>
          <span className="roxi-flip">
            <Icon name="minimize" size={18} />
          </span>
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="roxi-scrim" onClick={() => setAside(true)} aria-hidden="true" />
      <section className="roxi-panel" ref={panel} role="dialog" aria-label={labels.name} data-phase={phase} data-mode={mode} data-voice={voice || undefined} data-welcome={welcome || undefined}>
        <header className="roxi-head">
          <span className="roxi-grip" aria-hidden="true" />
          <RoxiOrb state={orbState} level={level} className="roxi-head-orb" />
          <div className="roxi-title">
            <strong className="roxi-name">{labels.name}</strong>
            <span className="roxi-status" aria-live="polite">
              <span className="roxi-dot" aria-hidden="true" />
              {status}
            </span>
          </div>
          <div className="roxi-actions">
            <button type="button" className="roxi-icon" onClick={() => setAside(true)} aria-label={labels.minimize}>
              <Icon name="minimize" />
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
              <Icon name="close" />
            </button>
          </div>
          {voice ? (
            <p className="roxi-caption" key={lastSaid ?? ''}>
              {lastSaid ?? ''}
            </p>
          ) : null}
        </header>

        <ol className="roxi-log" ref={list} aria-live="polite">
          {entries.length === 0 ? (
            <li className="roxi-welcome">
              <p className="roxi-hello">{labels.hello.replace('{name}', member.firstName || member.yayId)}</p>
              <p className="roxi-hello-sub">{labels.hello_sub}</p>
              <div className="roxi-chips">
                <button type="button" className="roxi-chip is-primary" onClick={() => pickPhoto(true)} disabled={busy || phase === 'connecting'}>
                  <Icon name="camera" />
                  <span>{labels['suggest.sell']}</span>
                </button>
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.key}
                    type="button"
                    className="roxi-chip"
                    onClick={() => void sendText(suggestion.text, false)}
                    disabled={phase === 'connecting'}
                  >
                    <Icon name={suggestion.icon} />
                    <span>{suggestion.text}</span>
                    <Icon name="arrow" size={16} />
                  </button>
                ))}
              </div>
            </li>
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
                            if (window.matchMedia('(max-width: 999px)').matches) setAside(true);
                          }}
                        >
                          <strong>{card.title}</strong>
                          <span>{card.detail}</span>
                          <em aria-hidden="true">
                            <Icon name="arrow" size={18} />
                          </em>
                        </a>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            }
            // In a voice conversation her latest words are the caption under the orb; not twice.
            if (voice && entry.id === lastSaidId) return null;
            return (
              <li key={entry.id} className={`roxi-msg is-${entry.kind}`}>
                {entry.text}
              </li>
            );
          })}
          {waiting && !voice ? (
            <li className="roxi-typing" role="status" aria-label={labels.thinking}>
              <i />
              <i />
              <i />
            </li>
          ) : null}
        </ol>

        <div className="roxi-controls">
          {voice ? (
            <div className="roxi-voicebar">
              <button type="button" className="roxi-round" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? labels.unmute : labels.mute}>
                <Icon name={muted ? 'mic-off' : 'mic'} size={22} />
              </button>
              <button type="button" className="roxi-round is-end" onClick={() => void end()} aria-label={labels.end}>
                <Icon name="end" size={22} />
              </button>
            </div>
          ) : (
            <button type="button" className="roxi-talk" onClick={() => void (phase === 'live' ? switchToVoice() : start('voice'))} disabled={phase === 'connecting'}>
              <Icon name="mic" />
              <span>{phase === 'live' ? labels.voice_switch : phase === 'ended' ? labels.new : labels.talk}</span>
            </button>
          )}
        </div>

        <form
          className="roxi-compose"
          onSubmit={(event) => {
            event.preventDefault();
            void sendText(draft, true);
          }}
        >
          <button type="button" className="roxi-icon is-gold" onClick={() => pickPhoto(false)} aria-label={labels.photo} disabled={busy || phase === 'connecting'}>
            <Icon name="camera" />
          </button>
          {photoInput}
          <input
            ref={input}
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
            <Icon name="send" size={18} />
          </button>
        </form>

        <p className="roxi-disclosure">
          {labels.disclosure}{' '}
          <a href="/privacy#roxi" target="_blank" rel="noopener">
            {labels.privacy}
          </a>
        </p>
      </section>
    </>
  );
}
