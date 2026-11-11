import type { Conversation } from '@elevenlabs/client';

/**
 * Whether a voice conversation really carries the member's voice.
 *
 * What ElevenLabs recorded on 11 November 2026 for the failing Chrome
 * sessions on a Samsung phone: Roxi's greeting was generated and sent, and
 * the server received **no** microphone audio at all
 * (`asr_usage.total_audio_input_seconds: 0`, no transcription passes), until
 * it closed the call for silence. The same member in Firefox was heard. So
 * the break is in the browser, before anything is sent: the microphone graph
 * produced no frames, or only a dead track.
 *
 * Firefox and Chrome take different paths in the ElevenLabs client. Chrome
 * reports that it can record at a chosen rate, so the client opens the audio
 * graph at 16 kHz and lets the browser resample the microphone; Firefox
 * cannot, so the client records at the device's own rate and resamples in
 * JavaScript (libsamplerate). `nativeRateCapture` puts Chrome on Firefox's
 * path, which is the one known to work on the failing phone.
 *
 * Nothing here reads what the member says: only how many frames went out,
 * their loudness, and the state of the audio objects.
 */

/** The parts of the client's input and output this check reads. They are the client's own objects, read defensively. */
type InputLike = {
  context?: AudioContext;
  inputStream?: MediaStream;
  addListener?: (listener: (event: MessageEvent) => void) => void;
  removeListener?: (listener: (event: MessageEvent) => void) => void;
};
type OutputLike = { context?: AudioContext };

export type VoiceHealth = {
  /** Frames of microphone audio handed to the connection since the conversation opened. */
  frames: number;
  /** The loudest frame seen, 0 to 1. */
  peak: number;
  input: AudioContextState | 'unknown';
  output: AudioContextState | 'unknown';
  track: { readyState: MediaStreamTrackState; muted: boolean; enabled: boolean } | null;
  /** The rate the client recorded at, and the device's own, when known. */
  contextRate: number | null;
  trackRate: number | null;
  nativeRate: boolean;
};

export type VoiceProblem = 'no_frames' | 'track_ended' | 'track_muted';

function parts(live: Conversation): { input: InputLike | null; output: OutputLike | null } {
  const raw = live as unknown as { input?: InputLike; output?: OutputLike };
  return { input: raw.input ?? null, output: raw.output ?? null };
}

/** The member's microphone track in this conversation, if the client has one. */
function micTrack(input: InputLike | null): MediaStreamTrack | null {
  try {
    return input?.inputStream?.getAudioTracks()[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Watches one voice conversation. `onProblem` is called at most once, when
 * no frame has left the browser by `deadlineMs`, or the microphone track ends
 * or stays muted. Returns a stop function and a way to read the figures.
 */
export function watchVoice(
  live: Conversation,
  options: { nativeRate: boolean; deadlineMs: number; onProblem: (problem: VoiceProblem, health: VoiceHealth) => void; onHealthy?: (health: VoiceHealth) => void },
): { stop: () => void; health: () => VoiceHealth } {
  const { input, output } = parts(live);
  let frames = 0;
  let peak = 0;
  let done = false;
  const listener = (event: MessageEvent) => {
    frames += 1;
    const level = Array.isArray(event.data) ? event.data[1] : undefined;
    if (typeof level === 'number' && level > peak) peak = Math.min(1, level);
  };
  input?.addListener?.(listener);

  const health = (): VoiceHealth => {
    const track = micTrack(input);
    let trackRate: number | null = null;
    try {
      trackRate = track?.getSettings().sampleRate ?? null;
    } catch {
      trackRate = null;
    }
    return {
      frames,
      peak: Math.round(peak * 1000) / 1000,
      input: input?.context?.state ?? 'unknown',
      output: output?.context?.state ?? 'unknown',
      track: track ? { readyState: track.readyState, muted: track.muted, enabled: track.enabled } : null,
      contextRate: input?.context?.sampleRate ?? null,
      trackRate,
      nativeRate: options.nativeRate,
    };
  };

  const fail = (problem: VoiceProblem) => {
    if (done) return;
    done = true;
    options.onProblem(problem, health());
  };

  // A suspended input context is the commonest way to produce no frames: try to start it first.
  const nudge = window.setTimeout(() => {
    if (frames === 0 && input?.context?.state === 'suspended') void input.context.resume().catch(() => undefined);
  }, Math.max(500, options.deadlineMs / 2));
  const deadline = window.setTimeout(() => {
    if (frames > 0) {
      if (!done) options.onHealthy?.(health());
      return;
    }
    const track = micTrack(input);
    fail(track?.readyState === 'ended' ? 'track_ended' : 'no_frames');
  }, options.deadlineMs);

  const track = micTrack(input);
  // A track can end mid-call (another app took the microphone) or be muted by the system for a while.
  let mutedTimer = 0;
  const onEnded = () => fail('track_ended');
  const onMute = () => {
    window.clearTimeout(mutedTimer);
    mutedTimer = window.setTimeout(() => {
      if (micTrack(input)?.muted) fail('track_muted');
    }, options.deadlineMs);
  };
  const onUnmute = () => window.clearTimeout(mutedTimer);
  track?.addEventListener('ended', onEnded);
  track?.addEventListener('mute', onMute);
  track?.addEventListener('unmute', onUnmute);
  if (track?.muted) onMute();

  return {
    health,
    stop: () => {
      done = true;
      window.clearTimeout(nudge);
      window.clearTimeout(deadline);
      window.clearTimeout(mutedTimer);
      input?.removeListener?.(listener);
      track?.removeEventListener('ended', onEnded);
      track?.removeEventListener('mute', onMute);
      track?.removeEventListener('unmute', onUnmute);
    },
  };
}

/**
 * Starts both of the conversation's audio contexts if the browser left them
 * suspended. Called from a tap, where every browser allows sound to start.
 */
export function resumeAudio(live: Conversation | null): void {
  if (!live) return;
  const { input, output } = parts(live);
  for (const context of [input?.context, output?.context]) {
    if (context && context.state === 'suspended') void context.resume().catch(() => undefined);
  }
}

/** Whether Roxi's voice cannot be heard because the browser holds its audio context suspended. */
export function outputSuspended(live: Conversation | null): boolean {
  if (!live) return false;
  return parts(live).output?.context?.state === 'suspended';
}

/**
 * Runs `start` with the client believing the browser cannot record at a
 * chosen rate, so it records at the device's own rate and resamples itself:
 * the path Firefox always takes. Restored as soon as the session has its
 * microphone, so nothing else on the page sees the change.
 */
export async function withNativeRateCapture<T>(enabled: boolean, start: () => Promise<T>): Promise<T> {
  const devices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  if (!enabled || !devices?.getSupportedConstraints) return start();
  const original = devices.getSupportedConstraints;
  devices.getSupportedConstraints = function patched(this: MediaDevices) {
    return { ...original.call(devices), sampleRate: false } as MediaTrackSupportedConstraints;
  };
  try {
    return await start();
  } finally {
    devices.getSupportedConstraints = original;
  }
}

/** How long every audio context opened by a voice start may stay suspended before the start is given up. A healthy one runs within a few hundred milliseconds. */
const STUCK_AUDIO_MS = 3000;

/** A voice start that did not finish in time; it says what the browser's audio looked like when it was given up. */
export class VoiceStartTimeout extends Error {
  constructor(readonly detail: string) {
    super(`Roxi voice: start_timeout ${detail}`);
    this.name = 'VoiceStartTimeout';
  }
}

/**
 * Runs a voice start with a deadline, and with whatever it opened accounted
 * for. When the browser never lets the client's audio graph run, the
 * client's own `context.resume()` never settles and the start hangs: no
 * error, no frames, the WebSocket open and Roxi's greeting never connected to
 * the speaker. So the sockets, microphone streams and audio contexts created
 * while starting are recorded; if the deadline passes, they are all closed
 * (the call stops costing, the microphone is released for the next try) and
 * VoiceStartTimeout says in what state they were.
 */
export async function guardedVoiceStart<T>(deadlineMs: number, start: () => Promise<T>, late?: (value: T) => void): Promise<T> {
  const sockets: WebSocket[] = [];
  const streams: MediaStream[] = [];
  const contexts: AudioContext[] = [];
  const RealSocket = window.WebSocket;
  const RealContext = window.AudioContext;
  const devices = navigator.mediaDevices;
  const realGetUserMedia = devices?.getUserMedia;
  const restore = () => {
    window.WebSocket = RealSocket;
    window.AudioContext = RealContext;
    if (devices && realGetUserMedia) devices.getUserMedia = realGetUserMedia;
  };
  // Subclasses keep instanceof and every static (WebSocket.OPEN) working for the client.
  window.WebSocket = class extends RealSocket {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      sockets.push(this);
    }
  };
  window.AudioContext = class extends RealContext {
    constructor(options?: AudioContextOptions) {
      super(options);
      contexts.push(this);
    }
  };
  if (devices && realGetUserMedia) {
    devices.getUserMedia = async (constraints?: MediaStreamConstraints) => {
      const stream = await realGetUserMedia.call(devices, constraints);
      streams.push(stream);
      return stream;
    };
  }
  let timer = 0;
  let watch = 0;
  let gaveUp = false;
  const deadline = new Promise<never>((_, reject) => {
    const giveUp = () => {
      if (gaveUp) return;
      gaveUp = true;
      window.clearTimeout(timer);
      window.clearInterval(watch);
      const detail = [
        `contexts=${contexts.map((c) => `${c.state}@${c.sampleRate}`).join(',') || 'none'}`,
        `tracks=${streams.flatMap((m) => m.getAudioTracks()).map((t) => `${t.readyState}${t.muted ? '/muted' : ''}`).join(',') || 'none'}`,
        `sockets=${sockets.map((w) => w.readyState).join(',') || 'none'}`,
      ].join(' ');
      for (const socket of sockets) {
        try {
          socket.close();
        } catch {
          // already closed
        }
      }
      for (const stream of streams) for (const track of stream.getTracks()) track.stop();
      for (const context of contexts) if (context.state !== 'closed') void context.close().catch(() => undefined);
      reject(new VoiceStartTimeout(detail));
    };
    timer = window.setTimeout(giveUp, deadlineMs);
    // The usual way it hangs: every audio context the client opened is still suspended seconds later.
    let stuckSince = 0;
    watch = window.setInterval(() => {
      const stuck = contexts.length > 0 && contexts.every((context) => context.state === 'suspended');
      if (!stuck) {
        stuckSince = 0;
        return;
      }
      stuckSince ||= Date.now();
      if (Date.now() - stuckSince >= STUCK_AUDIO_MS) giveUp();
    }, 250);
  });
  // Only what the start itself creates is recorded: the patches come off as soon as it settles or is given up.
  const running = start();
  // A start that finishes after it was given up is ended at once: nobody holds it any more.
  running.then(
    (value) => {
      if (gaveUp) late?.(value);
    },
    () => undefined,
  );
  try {
    return await Promise.race([running, deadline]);
  } finally {
    window.clearTimeout(timer);
    window.clearInterval(watch);
    restore();
  }
}

const NATIVE_RATE_KEY = 'roxi.voice.native-rate';

/** This device needed the Firefox path once: use it from the start next time. Kept on this browser only. */
export function rememberedNativeRate(): boolean {
  try {
    return window.localStorage.getItem(NATIVE_RATE_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberNativeRate(): void {
  try {
    window.localStorage.setItem(NATIVE_RATE_KEY, '1');
  } catch {
    // Private browsing: the next conversation finds out again, at the cost of a few seconds.
  }
}

/** Whether the browser says the microphone is already allowed, so the pre-check would only open and close it again. */
export async function microphoneAlreadyAllowed(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

/**
 * One line for the error report: what the browser's audio looked like when
 * the member could not be heard. No words, no identifiers.
 */
export function describeHealth(problem: VoiceProblem, health: VoiceHealth, attempt: 'first' | 'native_rate'): string {
  const track = health.track ? `${health.track.readyState}${health.track.muted ? '/muted' : ''}${health.track.enabled ? '' : '/disabled'}` : 'none';
  return `Roxi voice: ${problem} (${attempt}) frames=${health.frames} peak=${health.peak} input=${health.input} output=${health.output} track=${track} rate=${health.contextRate ?? '?'}/${health.trackRate ?? '?'}`;
}
