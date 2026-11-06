'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Conversation, type DisconnectionDetails } from '@elevenlabs/client';
import type { RoxiLabels } from './labels';
import { RoxiOrb, type OrbState } from './orb';
import { languageOf } from './language';
import { roxiTools, type RoxiResultCard } from './tools';
import { tidyText } from './tidy';
import { LOG_KEY, preferencesForRoxi, readPrefs, SPEED_VALUE, writePrefs } from './prefs';
import { differenceHash, luminance, photoHints, type PhotoHint } from './photo-quality';
import { reportPresence } from './presence';
import { ROXI_ASK_EVENT } from './ask';
import { publishRoxiState } from './state-bus';

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

/** How the panel was opened: by the member, from Roxi's check-in, or by answering her simulated call. */
export type RoxiOpening = 'none' | 'checkin' | 'call';

type Entry =
  /*
   * `pending`: sent and not answered yet. It is kept with the log, so a message
   * whose answer was lost to a page change, a reload or a closed panel is found
   * when the panel comes back, and offered again instead of sitting there.
   * `unanswered`: a message the conversation stopped at; it stays on screen but
   * out of what the next conversation is told.
   * `greeting`: Roxi's opening line in a conversation begun by voice. The
   * welcome already says hello, so it shows once the member has said something.
   */
  | { id: number; kind: 'roxi' | 'you'; text: string; unanswered?: boolean; pending?: boolean; greeting?: boolean }
  /** `retry`: a message that got no answer in time, which the note's button sends again. */
  | { id: number; kind: 'note'; text: string; retry?: string; link?: { href: string; label: string } }
  | { id: number; kind: 'photo'; url: string }
  /** An action outside Yavaya Roxi wants to take; nothing happens until the member taps Allow. */
  | { id: number; kind: 'confirm'; connection: string; tool: string; lines: string[]; state: 'open' | 'allowed' | 'declined' }
  | { id: number; kind: 'results'; cards: RoxiResultCard[]; more: boolean };

/** Something the member or Roxi said. */
type Said = Extract<Entry, { kind: 'roxi' | 'you' }>;

/** Omit that keeps a union a union, so each kind of entry is still checked on its own. */
type NewEntry = Entry extends infer E ? (E extends unknown ? Omit<E, 'id'> : never) : never;

/*
 * `paused`: the connection closed without the member ending it (a refusal
 * that stopped the conversation, a dropped network, the time limit). Nothing
 * is over for the member: the next message reconnects and Roxi is told what
 * was said. `ended` is only ever the member's (or Roxi's goodbye) doing.
 */
type Phase = 'idle' | 'connecting' | 'live' | 'paused' | 'ended';
type Mode = 'voice' | 'text';

const PHOTO_EDGE = 1600;
/** From this many seconds the wait shows how long it has been, so a slow answer never looks like a frozen one. */
const WAIT_COUNT_FROM_S = 3;
/** After this long the wait says it is taking longer than usual, and the member can stop waiting. */
const WAIT_SLOW_MS = 12_000;
/**
 * If an answer never comes (a dropped tool call, a stalled model), the wait
 * ends here with a way to send again. An ordinary answer takes a few seconds
 * and one that searches and prepares a draft about ten.
 */
const WAIT_GIVE_UP_MS = 30_000;
/** The same message sent again this soon, while the first is unanswered, is a double tap, not a question. */
const DOUBLE_SEND_MS = 8_000;

/**
 * What the wait says while one of Roxi's tools runs. Only real stages: a
 * label is shown because that tool is running, never on a timer.
 */
const TOOL_ACTIVITY: Record<string, 'searching' | 'preparing' | 'filling' | 'checking' | 'opening'> = {
  search_yavaya: 'searching',
  prepare_listing: 'preparing',
  prepare_post: 'preparing',
  prepare_work: 'filling',
  my_account: 'checking',
  open_page: 'opening',
  open_result: 'opening',
  my_memory: 'checking',
  remember: 'preparing',
  update_memory: 'preparing',
  connected_tools: 'checking',
  use_connected_tool: 'checking',
  my_world: 'checking',
  my_path: 'checking',
  business: 'checking',
};

/** Entries this tab keeps (sessionStorage) so closing the panel or reloading does not lose the thread. Photos stay out: they are files, not text. */
type KeptEntry = Exclude<Entry, { kind: 'photo' }>;
const KEPT_ENTRIES = 60;

function readLog(): KeptEntry[] {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(LOG_KEY) ?? '[]') as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is KeptEntry =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as KeptEntry).id === 'number' &&
        (((['roxi', 'you', 'note'] as const).includes((entry as { kind: 'roxi' }).kind) && typeof (entry as { text?: unknown }).text === 'string') ||
          ((entry as { kind: string }).kind === 'results' && Array.isArray((entry as { cards?: unknown }).cards))),
    );
  } catch {
    return [];
  }
}

function writeLog(entries: Entry[]): void {
  try {
    const kept = entries.filter((entry): entry is KeptEntry => entry.kind !== 'photo').slice(-KEPT_ENTRIES);
    if (kept.length) window.sessionStorage.setItem(LOG_KEY, JSON.stringify(kept));
    else window.sessionStorage.removeItem(LOG_KEY);
  } catch {
    // Storage blocked: the conversation lasts as long as the panel.
  }
}

/** The latest message still waiting for its answer, if any. */
function lastPending(entries: readonly Entry[]): Said | undefined {
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index]!;
    if (entry.kind === 'you' && entry.pending) return entry;
  }
  return undefined;
}

type MicProblem = 'blocked' | 'missing' | 'busy';

/**
 * Whether the microphone can be used, asked before a voice conversation
 * starts: a refusal then costs nothing at ElevenLabs, ends no written
 * conversation, and names its cause, because what the member can do about it
 * differs (allow it, plug one in, close the app holding it).
 */
async function micProblem(): Promise<MicProblem | null> {
  if (!navigator.mediaDevices?.getUserMedia) return 'missing';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    return null;
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'blocked';
    if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
    return 'missing';
  }
}

/**
 * A guardrail at ElevenLabs closes the conversation with the policy-violation
 * code and names itself in the reason. Anything else that closes it while an
 * answer is awaited (the network, a server error) is a cut, not a refusal, and
 * is not presented as one.
 */
function refusedByGuardrail(details: DisconnectionDetails): boolean {
  return details.reason === 'error' && details.closeCode === 1008 && /guardrail/i.test(details.closeReason ?? '');
}

/** A small grey sample of a photo for the quality checks and the repeat check. */
async function inspect(file: File): Promise<{ hints: PhotoHint[]; hash: string } | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const longEdge = Math.max(bitmap.width, bitmap.height);
    const scale = 160 / longEdge;
    const width = Math.max(3, Math.round(bitmap.width * scale));
    const height = Math.max(3, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    const grey = luminance(context.getImageData(0, 0, width, height).data);
    canvas.width = 9;
    canvas.height = 8;
    context.drawImage(bitmap, 0, 0, 9, 8);
    const hash = differenceHash(luminance(context.getImageData(0, 0, 9, 8).data));
    bitmap.close();
    return { hints: photoHints({ grey, width, height }, longEdge), hash };
  } catch {
    return null;
  }
}

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

type IconName = 'mic' | 'mic-off' | 'end' | 'camera' | 'image' | 'send' | 'minimize' | 'close' | 'search' | 'coin' | 'spark' | 'arrow' | 'copy' | 'speaker' | 'up' | 'down' | 'gear';

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const props = { ...icon, width: size, height: size };
  switch (name) {
    case 'image':
      return (
        <svg {...props}>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <circle cx="9" cy="10" r="1.6" />
          <path d="M20 16l-5-5-8 8" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...props}>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V6a2 2 0 0 1 2-2h8" />
        </svg>
      );
    case 'speaker':
      return (
        <svg {...props}>
          <path d="M5 10v4h3l4 4V6L8 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
        </svg>
      );
    case 'up':
      return (
        <svg {...props}>
          <path d="M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 3 2l-1 4h5.5a2 2 0 0 1 2 2.4l-1.3 6A2 2 0 0 1 17.2 20H7" />
        </svg>
      );
    case 'down':
      return (
        <svg {...props}>
          <path d="M7 13V4H4v9zM7 13l4 7a2 2 0 0 0 3-2l-1-4h5.5a2 2 0 0 0 2-2.4l-1.3-6A2 2 0 0 0 17.2 4H7" />
        </svg>
      );
    case 'gear':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8" />
        </svg>
      );
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
  refusals,
  openedBy = 'none',
  ask,
  onSettings,
  onClose,
}: {
  member: RoxiMember;
  locale: string;
  labels: RoxiLabels;
  refusals: Record<string, string>;
  openedBy?: RoxiOpening;
  /** A request from a button elsewhere on the site ("¿Qué necesitas hoy?"), sent as the member's first message. */
  ask?: { text: string; id: number } | null;
  onSettings: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  const [phase, setPhase] = useState<Phase>('idle');
  const [mode, setMode] = useState<Mode>('text');
  const [speaking, setSpeaking] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const waitingRef = useRef(false);
  waitingRef.current = waiting;
  // The tool running now, if any, for the words of the wait; and whether the wait has gone on long.
  const [activity, setActivity] = useState<(typeof TOOL_ACTIVITY)[string] | null>(null);
  const [slow, setSlow] = useState(false);
  const lastSent = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const [muted, setMuted] = useState(false);
  const [aside, setAside] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const restored = useRef(false);
  const [canFeedback, setCanFeedback] = useState(false);
  const [feedbackFor, setFeedbackFor] = useState(0);
  const [copied, setCopied] = useState(0);
  const [reading, setReading] = useState(0);
  const cameraInput = useRef<HTMLInputElement>(null);
  const photoHashes = useRef<string[]>([]);
  // A conversation a check-in or call began counts once when it leads to a draft or an opened result.
  const prompted = useRef(openedBy !== 'none');
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
  // Why the microphone could not be used, until it can: the talk button then offers to try again.
  const [micIssue, setMicIssue] = useState<MicProblem | null>(null);
  // Her written answers read aloud by the device's voice, for whoever cannot or would rather not talk.
  const [speakReplies, setSpeakReplies] = useState(() => readPrefs().speak);
  // Seconds of the current wait, shown so a slow answer never looks like a frozen one.
  const [waited, setWaited] = useState(0);
  // The next answer is Roxi's own greeting (a voice conversation the member began with nothing said yet).
  const greetingNext = useRef(false);
  // The panel itself closed a stalled conversation: its disconnection is expected, and says nothing more.
  const abandoning = useRef(false);
  // Answers up to this id are not read aloud: they were there before (restored, or before reading was turned on).
  const spokenUpTo = useRef(0);
  // A page change during an answer, told to Roxi once that answer has arrived.
  const contextLater = useRef<string | null>(null);
  // The open conversation's id, reported when it ends so its cost is counted.
  const liveId = useRef<string | null>(null);
  // Answers to confirmation cards still on screen, by entry id.
  const confirmations = useRef(new Map<number, (allowed: boolean) => void>());

  const add = useCallback((entry: NewEntry) => {
    setEntries((current) => [...current, { ...entry, id: nextId.current++ } as Entry]);
  }, []);

  /*
   * This tab's conversation comes back when the panel reopens, unless the
   * member turned that off. A message still marked as waiting was left behind
   * by a page change, a reload or a closed panel: its answer is not coming, so
   * it is said, with the message ready to send again.
   */
  useEffect(() => {
    if (!readPrefs().keep) return;
    const kept = readLog();
    if (kept.length === 0) return;
    nextId.current = Math.max(...kept.map((entry) => entry.id)) + 1;
    spokenUpTo.current = nextId.current;
    restored.current = true;
    const left = lastPending(kept);
    const settled = kept.map((entry) => (entry.kind === 'you' && entry.pending ? { ...entry, pending: false, unanswered: true } : entry));
    setEntries([
      ...settled,
      left ? { id: nextId.current++, kind: 'note', text: labels.left, retry: left.text } : { id: nextId.current++, kind: 'note', text: labels.restored },
    ]);
  }, [labels.restored, labels.left]);

  // The settings sheet can turn reading aloud on or off while the panel is open.
  useEffect(() => {
    const sync = () => setSpeakReplies(readPrefs().speak);
    window.addEventListener('roxi:prefs', sync);
    return () => window.removeEventListener('roxi:prefs', sync);
  }, []);

  useEffect(() => {
    if (readPrefs().keep) writeLog(entries);
    else writeLog([]);
  }, [entries]);

  useEffect(() => {
    const forget = () => setEntries([]);
    window.addEventListener('roxi:forget', forget);
    return () => window.removeEventListener('roxi:forget', forget);
  }, []);

  const countPrompted = useCallback(() => {
    if (!prompted.current) return;
    prompted.current = false;
    reportPresence('prompted_task');
  }, []);

  // Answering Roxi's simulated call is the tap that starts a voice conversation.
  const answered = useRef(false);
  useEffect(() => {
    if (openedBy !== 'call' || answered.current) return;
    answered.current = true;
    void talk();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on the answer that opened the panel
  }, [openedBy]);

  useEffect(() => {
    // The greeting is read from the top; only a conversation follows its latest line.
    if (entries.length === 0) return;
    list.current?.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [entries, waiting]);

  /*
   * Tell Roxi where the member is, so "this listing" or "here" means
   * something. Not in the middle of an answer, though: the update would reach
   * her as a new turn while she is still working on the last one (and when
   * one of her own tools opened the page, its result already says so).
   */
  useEffect(() => {
    if (pathRef.current === pathname) return;
    pathRef.current = pathname;
    if (waitingRef.current) contextLater.current = pathname;
    else conversation.current?.sendContextualUpdate(`The member is now on the page ${pathname}.`);
  }, [pathname]);

  useEffect(() => {
    if (waiting || !contextLater.current) return;
    const path = contextLater.current;
    contextLater.current = null;
    conversation.current?.sendContextualUpdate(`The member is now on the page ${path}.`);
  }, [waiting]);

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

  /*
   * A wait counts its seconds, says when it is slow (and lets the member stop
   * it), and ends on its own at WAIT_GIVE_UP_MS. Timed from when this wait
   * began: a results card arriving meanwhile does not start the clock again.
   */
  const giveUpRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    if (!waiting) {
      setActivity(null);
      setSlow(false);
      setWaited(0);
      return;
    }
    const began = Date.now();
    const tick = window.setInterval(() => setWaited(Math.floor((Date.now() - began) / 1000)), 1000);
    const slowTimer = window.setTimeout(() => setSlow(true), WAIT_SLOW_MS);
    const timer = window.setTimeout(() => giveUpRef.current(), WAIT_GIVE_UP_MS);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(slowTimer);
      window.clearTimeout(timer);
    };
  }, [waiting]);

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
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
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
        task: countPrompted,
        stepAside: () => {
          if (window.matchMedia('(max-width: 999px)').matches) setAside(true);
        },
        saved: (text, href) => add({ kind: 'note', text: labels.saved.replace('{title}', text), link: { href, label: labels.saved_see } }),
        confirm: (summary) =>
          new Promise<boolean>((resolve) => {
            const id = nextId.current++;
            // The member is reading, not waiting on Roxi: no countdown while the card is open.
            setAside(false);
            setWaiting(false);
            confirmations.current.set(id, (allowed) => {
              confirmations.current.delete(id);
              setEntries((current) => current.map((entry) => (entry.id === id && entry.kind === 'confirm' ? { ...entry, state: allowed ? 'allowed' : 'declined' } : entry)));
              setWaiting(true);
              resolve(allowed);
            });
            setEntries((current) => [...current, { id, kind: 'confirm', connection: summary.connection, tool: summary.tool, lines: summary.lines.slice(0, 4), state: 'open' }]);
          }),
      }),
    [add, router, countPrompted, labels.saved, labels.saved_see],
  );

  /*
   * A lookup can take ten seconds or more, and Roxi's first words ("Déjame
   * ver…") end the wait the panel shows. So a running tool shows the wait
   * again, and it stays until her answer arrives (or WAIT_GIVE_UP_MS).
   */
  const busyTools = useCallback(() => {
    const plain = tools();
    return Object.fromEntries(
      Object.entries(plain).map(([name, run]) => [
        name,
        async (parameters: Record<string, unknown>) => {
          setWaiting(true);
          setActivity(TOOL_ACTIVITY[name] ?? null);
          try {
            return await run(parameters);
          } finally {
            setWaiting(true);
          }
        },
      ]),
    );
  }, [tools]);

  /** What was said before, when switching from writing to voice: a new conversation that remembers. */
  const recap = () =>
    entries
      .filter((entry): entry is Extract<Entry, { kind: 'roxi' | 'you' }> => (entry.kind === 'roxi' || entry.kind === 'you') && !entry.unanswered && !entry.greeting)
      .slice(-12)
      .map((entry) => `${entry.kind === 'you' ? 'Member' : 'Roxi'}: ${entry.text}`)
      .join('\n')
      .slice(0, 3000);

  /** Opens a conversation. Voice is only asked for once the microphone has answered (see talk). */
  async function start(wanted: Mode, opening?: (live: Conversation) => Promise<void> | void) {
    if (phase === 'connecting') return;
    setPhase('connecting');
    try {
      const response = await fetch('/api/roxi/start', { method: 'POST', credentials: 'same-origin' });
      const body = (await response.json().catch(() => null)) as {
        ok: boolean;
        agentId?: string;
        signedUrl?: string;
        status?: string;
        message?: string;
        plans?: string;
      } | null;
      if (!body?.ok) {
        add({ kind: 'note', text: body?.message ?? labels.connect_error, ...(body?.plans ? { link: { href: body.plans, label: labels.plans_link } } : {}) });
        setWaiting(false);
        setPhase(entries.length > 0 ? 'ended' : 'idle');
        return;
      }
      const previous = recap();
      const prefs = readPrefs();
      // Only a voice conversation begun with nothing said opens with her greeting (the welcome already said hello in writing).
      greetingNext.current = wanted === 'voice' && !opening && !previous;
      const live = await Conversation.startSession({
        ...(body.signedUrl ? { signedUrl: body.signedUrl } : { agentId: body.agentId! }),
        connectionType: 'websocket',
        textOnly: wanted === 'text',
        userId: member.yayId,
        overrides: {
          agent: {
            language: locale === 'en' ? 'en' : 'es',
            // Opened by writing or with a photo: Roxi answers that, instead of greeting first.
            ...(opening || previous ? { firstMessage: '' } : {}),
          },
          // Only a speed the member chose travels; the agent allows this one override.
          ...(wanted === 'voice' && prefs.speed !== 'normal' ? { tts: { speed: SPEED_VALUE[prefs.speed] } } : {}),
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
          member_preferences: preferencesForRoxi(prefs),
        },
        clientTools: busyTools(),
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
            add({ kind: 'you', text: said });
            return;
          }
          setWaiting(false);
          const greeting = greetingNext.current;
          greetingNext.current = false;
          // An answer settles whatever was waiting for one.
          setEntries((current) => [
            ...current.map((entry) => (entry.kind === 'you' && entry.pending ? { ...entry, pending: false } : entry)),
            { id: nextId.current++, kind: 'roxi', text: tidyText(said), ...(greeting ? { greeting: true } : {}) },
          ]);
        },
        onModeChange: ({ mode: now }) => setSpeaking(now === 'speaking'),
        onCanSendFeedbackChange: ({ canSendFeedback }) => setCanFeedback(canSendFeedback),
        onDisconnect: (details) => {
          conversation.current = null;
          // Credits are counted from what the conversation really cost; the server reads it from ElevenLabs.
          const ended = liveId.current;
          liveId.current = null;
          if (ended) void fetch('/api/roxi/usage', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: ended }) }).catch(() => undefined);
          setCanFeedback(false);
          setSpeaking(false);
          setWaiting(false);
          if (abandoning.current) {
            // The panel closed a stalled conversation itself and has already said so.
            abandoning.current = false;
            setPhase('paused');
            return;
          }
          /*
           * A connection that closes while a message waits for its answer was
           * not a goodbye. A guardrail refusal is said as one; anything else
           * (the network, a server error, the time limit) is said as a cut,
           * with the message ready to send again. The message never sits there
           * unanswered, and nothing is over: the next message reconnects, with
           * what was said before (minus the message that stopped it).
           */
          const waitingFor = lastPending(entriesRef.current);
          const refused = refusedByGuardrail(details);
          const cut = details.reason !== 'user' && !!waitingFor;
          if (waitingFor && (refused || cut)) {
            setEntries((current) => current.map((entry) => (entry.id === waitingFor.id ? { ...entry, pending: false, unanswered: true } : entry)));
          }
          if (refused) {
            const language = waitingFor ? languageOf(waitingFor.text, locale) : locale;
            add({ kind: 'note', text: refusals[language] ?? refusals[locale] ?? '' });
          } else if (cut) {
            add({ kind: 'note', text: labels.cut, retry: waitingFor.text });
          }
          setPhase(details.reason === 'user' || (details.reason === 'agent' && !cut) ? 'ended' : 'paused');
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
      try {
        liveId.current = live.getId();
      } catch {
        liveId.current = null;
      }
      setMode(wanted);
      setMuted(false);
      setPhase('live');
      await opening?.(live);
    } catch {
      add({ kind: 'note', text: labels.connect_error });
      setWaiting(false);
      setPhase(entries.length > 0 ? 'ended' : 'idle');
    }
  }

  // A request handed over by a page ("Necesito ayuda", "Busco trabajo"): sent once, as if typed.
  const askedId = useRef<number | null>(null);
  const sendTextRef = useRef<(text: string, fromBox: boolean) => Promise<void>>(async () => undefined);
  useEffect(() => {
    if (!ask || askedId.current === ask.id) return;
    askedId.current = ask.id;
    void sendTextRef.current(ask.text, false);
  }, [ask]);

  async function sendText(text: string, fromBox: boolean) {
    const said = text.trim();
    if (!said) return;
    // A double tap (or Enter held down) sends the question once.
    if (said === lastSent.current.text && waitingRef.current && Date.now() - lastSent.current.at < DOUBLE_SEND_MS) {
      if (fromBox) setDraft('');
      return;
    }
    lastSent.current = { text: said, at: Date.now() };
    if (fromBox) setDraft('');
    const live = conversation.current;
    add({ kind: 'you', text: said, pending: true });
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
      const look = await inspect(file);
      // The same photo twice adds nothing to a listing; everything else goes, with advice when it would help.
      if (look && photoHashes.current.includes(look.hash)) {
        add({ kind: 'note', text: labels.photo_duplicate });
        return;
      }
      if (look) photoHashes.current.push(look.hash);
      const small = await shrink(file);
      photos.current.push({ file: small, taken: false });
      add({ kind: 'photo', url: URL.createObjectURL(small) });
      for (const hint of look?.hints ?? []) add({ kind: 'note', text: labels[`photo_${hint}`] });
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
      if (cameraInput.current) cameraInput.current.value = '';
    }
  }

  function pickPhoto(selling: boolean, camera = false) {
    sellingPhoto.current = selling;
    (camera ? cameraInput : fileInput).current?.click();
  }

  async function copy(entry: { id: number; text: string }) {
    try {
      await navigator.clipboard.writeText(entry.text);
      setCopied(entry.id);
      window.setTimeout(() => setCopied((current) => (current === entry.id ? 0 : current)), 1800);
    } catch {
      // No clipboard permission: the text is still there to select.
    }
  }

  /** The browser's own speech, for an answer the member would rather hear: nothing leaves the device. */
  function speak(entry: { id: number; text: string }) {
    const speech = window.speechSynthesis;
    speech.cancel();
    const utterance = new SpeechSynthesisUtterance(entry.text);
    utterance.lang = locale === 'en' ? 'en-US' : 'es-419';
    utterance.rate = SPEED_VALUE[readPrefs().speed];
    utterance.onend = () => setReading((current) => (current === entry.id ? 0 : current));
    utterance.onerror = utterance.onend;
    setReading(entry.id);
    speech.speak(utterance);
  }

  function readAloud(entry: { id: number; text: string }) {
    if (reading === entry.id) {
      window.speechSynthesis.cancel();
      setReading(0);
      return;
    }
    speak(entry);
  }

  /** Every new written answer read aloud from now on, or no longer; remembered in this browser. */
  function toggleSpeakReplies() {
    const next = !speakReplies;
    setSpeakReplies(next);
    writePrefs({ ...readPrefs(), speak: next });
    if (next) {
      spokenUpTo.current = nextId.current;
      // A phone lets a page speak only from a tap: this one opens the way for the answers that follow.
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
    } else {
      window.speechSynthesis.cancel();
      setReading(0);
    }
  }

  function feedback(entry: { id: number }, like: boolean) {
    conversation.current?.sendFeedback(like);
    setFeedbackFor(entry.id);
  }

  async function clearConversation() {
    await end();
    window.speechSynthesis?.cancel();
    for (const entry of entriesRef.current) if (entry.kind === 'photo') URL.revokeObjectURL(entry.url);
    photos.current = [];
    photoHashes.current = [];
    setEntries([]);
    setPhase('idle');
  }

  /*
   * Voice, once the microphone has answered. Without it nothing else changes:
   * a written conversation carries on as it was, no voice conversation is
   * opened (or charged), and the note says why and what to do. Asked again
   * with the microphone still unavailable, that note is not repeated: it is
   * brought back into view, or moved down to where the conversation now is.
   */
  async function talk() {
    if (phase === 'connecting' || waitingRef.current) return;
    const problem = await micProblem();
    if (problem) {
      setMicIssue(problem);
      const text = labels[`mic_${problem}`];
      const last = entriesRef.current[entriesRef.current.length - 1];
      if (last?.kind === 'note' && last.text === text) list.current?.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' });
      // Said again further down, it moves to the bottom: one copy of the explanation, where the member is looking.
      else setEntries((current) => [...current.filter((entry) => !(entry.kind === 'note' && entry.text === text)), { id: nextId.current++, kind: 'note', text }]);
      return;
    }
    setMicIssue(null);
    const live = conversation.current;
    if (live) {
      conversation.current = null;
      await live.endSession();
    }
    await start('voice');
  }

  /*
   * The wait ends, said plainly, with the message ready to send again. A
   * stalled written conversation is closed, so a late answer cannot turn up
   * after the member has asked again; the next message opens a fresh one that
   * remembers what was said. In a voice conversation the call stays open.
   */
  function giveUp() {
    if (!waitingRef.current) return;
    const waitingFor = lastPending(entriesRef.current);
    setWaiting(false);
    if (waitingFor) setEntries((current) => current.map((entry) => (entry.id === waitingFor.id ? { ...entry, pending: false, unanswered: true } : entry)));
    add({ kind: 'note', text: labels.slow, ...(waitingFor ? { retry: waitingFor.text } : {}) });
    const live = conversation.current;
    if (live && mode === 'text') {
      abandoning.current = true;
      conversation.current = null;
      setPhase('paused');
      void live.endSession();
    }
  }
  giveUpRef.current = giveUp;

  /** The member ends it. A message still waiting is marked, with a way to send it again when they come back. */
  async function end() {
    const waitingFor = lastPending(entriesRef.current);
    if (waitingFor) {
      setEntries((current) => current.map((entry) => (entry.id === waitingFor.id ? { ...entry, pending: false, unanswered: true } : entry)));
      add({ kind: 'note', text: labels.left, retry: waitingFor.text });
    }
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

  /*
   * What she is doing, for the presence shown elsewhere on the page
   * (state-bus.ts). Every field is something already true here; "completed"
   * is stamped only when a tool really finished or a confirmation was allowed.
   */
  const confirming = entries.some((entry) => entry.kind === 'confirm' && entry.state === 'open');
  const allowedCount = entries.filter((entry) => entry.kind === 'confirm' && entry.state === 'allowed').length;
  let lastYouUnanswered = false;
  for (const entry of entries) if (entry.kind === 'you') lastYouUnanswered = Boolean(entry.unanswered);
  const problem = micIssue !== null || lastYouUnanswered;
  const previousActivity = useRef(activity);
  const previousAllowed = useRef(allowedCount);
  useEffect(() => {
    const finished = (previousActivity.current !== null && activity === null) || allowedCount > previousAllowed.current;
    previousActivity.current = activity;
    previousAllowed.current = allowedCount;
    // Tucked away, she is not "open" to the page: a call to her from elsewhere brings the panel back (below).
    publishRoxiState({ open: !aside, phase, orb: orbState, waiting, activity, confirming, problem, ...(finished ? { completedAt: Date.now() } : {}) });
  }, [aside, phase, orbState, waiting, activity, confirming, problem, allowedCount]);
  useEffect(() => {
    const back = () => setAside(false);
    window.addEventListener(ROXI_ASK_EVENT, back);
    return () => window.removeEventListener(ROXI_ASK_EVENT, back);
  }, []);
  useEffect(
    () => () => publishRoxiState({ open: false, phase: 'idle', orb: 'idle', waiting: false, activity: null, confirming: false, problem: false }),
    [],
  );
  let lastSaid: string | undefined;
  let lastSaidId = 0;
  for (const entry of entries) {
    if (entry.kind === 'roxi') {
      lastSaid = entry.text;
      lastSaidId = entry.id;
    }
  }
  /*
   * The member has not said or sent anything yet: the welcome and its
   * suggestions stay, in writing and in voice alike. A note (the microphone,
   * a restored conversation) or Roxi's spoken greeting does not take them away.
   */
  const started = entries.some((entry) => entry.kind === 'you' || entry.kind === 'photo' || entry.kind === 'results');
  const welcome = !started && !voice;

  // The wait names the stage only when a tool is actually running; otherwise she is thinking.
  const waitLabel = activity ? labels[`activity.${activity}`] : slow ? labels.still_working : labels.thinking;
  const status =
    phase === 'connecting'
      ? labels['status.connecting']
      : waiting
        ? waitLabel
        : phase === 'live'
          ? mode === 'voice'
            ? speaking
              ? labels['status.speaking']
              : labels['status.listening']
            : labels['status.ready']
          : phase === 'ended'
            ? labels['status.ended']
            : phase === 'paused'
              ? labels['status.paused']
              : labels.role;

  sendTextRef.current = sendText;

  // "¿Qué necesitas hoy?": the four doors besides selling with a photo (the proposal's front door).
  const suggestions = [
    { key: 'help', icon: 'spark', text: labels['suggest.help'] },
    { key: 'work', icon: 'search', text: labels['suggest.work'] },
    { key: 'community', icon: 'search', text: labels['suggest.community'] },
    { key: 'world', icon: 'coin', text: labels['suggest.world'] },
  ] as const;

  /** The phone's share sheet when there is one; otherwise WhatsApp, with an accurate line and the link. */
  async function share(card: RoxiResultCard) {
    const url = new URL(card.url, window.location.origin).toString();
    const text = labels.share_text.replace('{title}', card.title);
    try {
      if (navigator.share) {
        await navigator.share({ title: card.title, text, url });
        return;
      }
    } catch {
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener');
  }

  const photoInput = (
    <>
      <input ref={fileInput} type="file" accept="image/*" hidden onChange={(event) => void sendPhoto(event.currentTarget.files?.[0])} />
      {/* The camera opens only from this tap, through the phone's own camera app: the page itself never touches it. */}
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void sendPhoto(event.currentTarget.files?.[0])} />
    </>
  );
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;

  // Each new written answer is read aloud when the member asked for that (not in a voice conversation: she is already speaking).
  useEffect(() => {
    let latest: Said | undefined;
    for (let index = entries.length - 1; index >= 0 && !latest; index--) {
      const entry = entries[index]!;
      if (entry.kind === 'roxi') latest = entry;
    }
    if (!latest || latest.id < spokenUpTo.current) return;
    spokenUpTo.current = latest.id + 1;
    if (speakReplies && !voice && canSpeak) speak(latest);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `speak` only reads the latest preferences
  }, [entries, speakReplies, voice, canSpeak]);

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
            <button type="button" className="roxi-icon" onClick={onSettings} aria-label={labels.settings}>
              <Icon name="gear" />
            </button>
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
          {!started ? (
            <li className="roxi-welcome">
              {/* In a voice conversation her spoken greeting is the caption under the orb: the written one would say it twice. */}
              {voice ? null : (
                <>
                  <p className="roxi-hello">{labels.hello.replace('{name}', member.firstName || member.yayId)}</p>
                  <p className="roxi-hello-sub">{labels.hello_sub}</p>
                </>
              )}
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
                            countPrompted();
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
                        {/* "Send this to someone" (30): the member chooses who, in their own app. Nothing is sent by Yavaya. */}
                        <button type="button" className="roxi-share" onClick={() => void share(card)} aria-label={labels.share} title={labels.share}>
                          <Icon name="up" size={16} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            }
            // In a voice conversation her latest words are the caption under the orb; not twice.
            if (voice && entry.id === lastSaidId) return null;
            // Her greeting waits behind the welcome, which already says hello, until the member has said something.
            if (entry.kind === 'roxi' && entry.greeting && !started) return null;
            if (entry.kind === 'confirm') {
              return (
                <li key={entry.id} className={`roxi-msg is-confirm is-${entry.state}`}>
                  <p className="roxi-confirm-head">{labels.confirm_title.replace('{connection}', entry.connection)}</p>
                  {entry.lines.map((line, index) => (
                    <p key={index} className="roxi-confirm-line">
                      {line}
                    </p>
                  ))}
                  {entry.state === 'open' ? (
                    <span className="roxi-confirm-actions">
                      <button type="button" className="roxi-retry" onClick={() => confirmations.current.get(entry.id)?.(true)}>
                        {labels.confirm_allow}
                      </button>
                      <button type="button" className="roxi-retry is-quiet" onClick={() => confirmations.current.get(entry.id)?.(false)}>
                        {labels.confirm_decline}
                      </button>
                    </span>
                  ) : (
                    <p className="roxi-confirm-state">{entry.state === 'allowed' ? labels.confirm_allowed : labels.confirm_declined}</p>
                  )}
                </li>
              );
            }
            if (entry.kind !== 'roxi') {
              return (
                <li key={entry.id} className={`roxi-msg is-${entry.kind}${entry.kind === 'you' && entry.unanswered ? ' is-unanswered' : ''}`}>
                  {entry.text}
                  {entry.kind === 'note' && entry.link ? (
                    <a className="roxi-retry" href={entry.link.href}>
                      {entry.link.label}
                    </a>
                  ) : null}
                  {entry.kind === 'note' && entry.retry ? (
                    <button
                      type="button"
                      className="roxi-retry"
                      disabled={phase === 'connecting' || waiting}
                      onClick={() => {
                        const again = entry.retry!;
                        // One retry per note: the button goes once it is used.
                        setEntries((current) => current.map((item) => (item.id === entry.id ? { id: item.id, kind: 'note', text: entry.text } : item)));
                        void sendText(again, false);
                      }}
                    >
                      {labels.retry}
                    </button>
                  ) : null}
                </li>
              );
            }
            const latest = entry.id === lastSaidId;
            return (
              <li key={entry.id} className="roxi-msg is-roxi">
                {entry.text}
                <span className="roxi-msg-actions">
                  <button type="button" onClick={() => void copy(entry)} aria-label={copied === entry.id ? labels.copied : labels.copy} title={copied === entry.id ? labels.copied : labels.copy}>
                    <Icon name="copy" size={15} />
                  </button>
                  {canSpeak && !voice ? (
                    <button type="button" onClick={() => readAloud(entry)} aria-pressed={reading === entry.id} aria-label={reading === entry.id ? labels.stop_reading : labels.read_aloud} title={reading === entry.id ? labels.stop_reading : labels.read_aloud}>
                      <Icon name="speaker" size={15} />
                    </button>
                  ) : null}
                  {latest && canFeedback && phase === 'live' && feedbackFor !== entry.id ? (
                    <>
                      <button type="button" onClick={() => feedback(entry, true)} aria-label={labels.helpful} title={labels.helpful}>
                        <Icon name="up" size={15} />
                      </button>
                      <button type="button" onClick={() => feedback(entry, false)} aria-label={labels.not_helpful} title={labels.not_helpful}>
                        <Icon name="down" size={15} />
                      </button>
                    </>
                  ) : null}
                  {feedbackFor === entry.id ? <small role="status">{labels.feedback_thanks}</small> : null}
                  {copied === entry.id ? <small role="status">{labels.copied}</small> : null}
                </span>
              </li>
            );
          })}
          {waiting && !voice ? (
            <li className="roxi-typing" role="status" aria-live="polite">
              <span className="roxi-typing-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="roxi-typing-text">{waitLabel}</span>
              {/* The seconds stay out of what a screen reader announces: it would read every tick. */}
              {waited >= WAIT_COUNT_FROM_S ? (
                <span className="roxi-typing-time" aria-hidden="true">
                  {labels.waited.replace('{seconds}', String(waited))}
                </span>
              ) : null}
              {slow ? (
                <button type="button" className="roxi-typing-stop" onClick={giveUp}>
                  {labels.stop_waiting}
                </button>
              ) : null}
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
            <>
              <button type="button" className="roxi-talk" onClick={() => void talk()} disabled={phase === 'connecting' || waiting}>
                <Icon name={micIssue ? 'mic-off' : 'mic'} />
                <span>{micIssue ? labels.mic_retry : phase === 'live' ? labels.voice_switch : phase === 'ended' ? labels.new : labels.talk}</span>
              </button>
              {/* Spoken replies without a microphone: her written answers in the device's own voice. */}
              {canSpeak ? (
                <button type="button" className="roxi-speak" onClick={toggleSpeakReplies} aria-pressed={speakReplies}>
                  <Icon name="speaker" size={18} />
                  <span>{labels.speak_replies}</span>
                  <span className="roxi-speak-switch" aria-hidden="true" />
                </button>
              ) : null}
            </>
          )}
        </div>

        <form
          className="roxi-compose"
          onSubmit={(event) => {
            event.preventDefault();
            void sendText(draft, true);
          }}
        >
          <button type="button" className="roxi-icon is-gold" onClick={() => pickPhoto(false, true)} aria-label={labels.camera} title={labels.camera} disabled={busy || phase === 'connecting'}>
            <Icon name="camera" />
          </button>
          <button type="button" className="roxi-icon" onClick={() => pickPhoto(false)} aria-label={labels.photo} title={labels.photo} disabled={busy || phase === 'connecting'}>
            <Icon name="image" />
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
          {entries.length > 0 ? (
            <>
              <button type="button" className="roxi-clear" onClick={() => void clearConversation()}>
                {labels.clear}
              </button>
            </>
          ) : null}
          {labels.disclosure}{' '}
          <a href="/privacy#roxi" target="_blank" rel="noopener">
            {labels.privacy}
          </a>
        </p>
      </section>
    </>
  );
}
