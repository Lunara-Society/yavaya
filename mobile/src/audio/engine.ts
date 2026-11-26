import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { admit, effectiveGain, fadeSteps, type Voice } from './mix.ts';
import { SOUNDS, type SoundName } from './sounds';

/**
 * The audio engine. Players are created once and reused (low latency); at most
 * three interface sounds at once, by priority; Roxi's voice ducks everything
 * else; fades are stepped at ~60 Hz. Sound respects the silent switch (iOS) and
 * mixes with other apps' audio instead of stopping it. Nothing plays in the
 * background. Audio is never required to use any function.
 */
type Slot = { player: AudioPlayer; voice: Voice | null; base: number };

const slots = new Map<SoundName, Slot>();
let enabled = true;
let master = 0.6;
let ducked = false;
let serial = 0;
let ready = false;

export async function initAudio(): Promise<void> {
  if (ready) return;
  ready = true;
  try {
    await setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false });
  } catch {
    /* audio mode is best-effort */
  }
  for (const [name, def] of Object.entries(SOUNDS) as [SoundName, (typeof SOUNDS)[SoundName]][]) {
    try {
      const player = createAudioPlayer(def.file);
      player.volume = 0;
      slots.set(name, { player, voice: null, base: def.gain });
    } catch {
      /* a missing sound never breaks the interface */
    }
  }
}

export function setAudioPrefs(on: boolean, volume: number) {
  enabled = on;
  master = Math.max(0, Math.min(1, volume));
  if (!on) slots.forEach((s) => stop(s));
}

function stop(slot: Slot) {
  try {
    slot.player.pause();
  } catch {
    /* already stopped */
  }
  slot.voice = null;
}

const activeVoices = () => [...slots.values()].flatMap((s) => (s.voice ? [s.voice] : []));

export function playSound(name: SoundName): void {
  if (!enabled || master === 0) return;
  const slot = slots.get(name);
  if (!slot) return;
  const voice: Voice = { id: (serial += 1), priority: SOUNDS[name].priority, startedAt: Date.now() };
  const evict = admit(activeVoices().filter((v) => v !== slot.voice), voice);
  if (evict === null) return;
  evict.forEach((v) => slots.forEach((s) => s.voice?.id === v.id && stop(s)));
  slot.voice = voice;
  slot.player.volume = effectiveGain(slot.base, master, ducked);
  void slot.player.seekTo(0).then(() => slot.player.play()).catch(() => undefined);
  setTimeout(() => {
    if (slot.voice?.id === voice.id) slot.voice = null;
  }, 2500);
}

/** Fades a playing sound out (used when an animation is interrupted). */
export function fadeOut(name: SoundName, ms = 160): void {
  const slot = slots.get(name);
  if (!slot?.voice) return;
  const steps = fadeSteps(slot.player.volume, 0, ms);
  steps.forEach((v, i) => setTimeout(() => (slot.player.volume = Math.max(0, Math.min(1, v))), (i * 1000) / 60));
  setTimeout(() => stop(slot), ms + 20);
}

/** Roxi speaking: everything else drops to a quarter until she stops. */
export function setDucked(on: boolean): void {
  ducked = on;
  slots.forEach((s) => {
    if (s.voice) s.player.volume = effectiveGain(s.base, master, ducked);
  });
}
