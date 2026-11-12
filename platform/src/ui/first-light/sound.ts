/**
 * Yavaya's interaction sounds: short, quiet cues made in the browser with the
 * Web Audio API, so there is nothing to download and nothing plays that the
 * page did not cause.
 *
 * Off unless the visitor turns it on. The choice is kept on this device
 * (localStorage), and every switch on the page follows it (SOUND_EVENT).
 * A sound plays only because something happened — a door opened, Roxi
 * finished — never on a timer, and never while the tab is hidden. Each cue
 * has a cooldown and no more than MAX_VOICES play at once, so a quick series
 * of taps cannot pile up into noise. The audio context is created on the tap
 * that turns sound on, as browsers require.
 *
 * Never used in Espacio Violeta: it is not loaded there at all.
 */
export type Cue = 'enable' | 'door' | 'transition' | 'success' | 'roxi' | 'roxi-done' | 'guardian' | 'status' | 'portal';

export const SOUND_KEY = 'yavaya.sound';
export const SOUND_EVENT = 'yavaya:sound';

/** The least time between two plays of the same cue. */
export const COOLDOWN_MS: Record<Cue, number> = {
  enable: 400,
  door: 160,
  transition: 700,
  success: 300,
  roxi: 600,
  'roxi-done': 900,
  guardian: 8000,
  status: 1500,
  portal: 250,
};
export const MAX_VOICES = 3;

/** Whether a cue may play now: its cooldown has passed and there is a free voice. Pure, for the tests. */
export function mayPlay(cue: Cue, now: number, lastPlayed: Partial<Record<Cue, number>>, activeVoices: number): boolean {
  if (activeVoices >= MAX_VOICES) return false;
  const last = lastPlayed[cue];
  return last === undefined || now - last >= COOLDOWN_MS[cue];
}

export function readSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * For the districts in depth, where the owner asked (12 November 2026) for
 * sound to be on from the start: on unless this device has said "off". The
 * cues there still only answer a tap, which is also the only moment a browser
 * lets a page make a sound.
 */
export function soundWanted(): boolean {
  try {
    return window.localStorage.getItem(SOUND_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** A pentatonic scale around A4: each district door has its own note, and any two sound well together. */
const DOOR_NOTES = [440, 493.88, 554.37, 659.25, 739.99, 880, 987.77];

type AudioContextCtor = typeof AudioContext;

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private room: ConvolverNode | null = null;
  private last: Partial<Record<Cue, number>> = {};
  private voices = 0;

  enabled(): boolean {
    return readSoundPreference();
  }

  /** Call from a tap or a click: browsers only start audio from a gesture. */
  setEnabled(on: boolean): void {
    try {
      window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
    } catch {
      // Private browsing without storage: the choice lasts this page view.
    }
    window.dispatchEvent(new CustomEvent(SOUND_EVENT, { detail: on }));
    if (on) {
      this.ensure();
      this.play('enable', { force: true });
    } else {
      void this.ctx?.suspend().catch(() => undefined);
    }
  }

  play(cue: Cue, options: { pitch?: number; force?: boolean } = {}): void {
    if (typeof window === 'undefined' || document.hidden) return;
    if (!options.force && !this.enabled()) return;
    const now = performance.now();
    if (!mayPlay(cue, now, this.last, this.voices)) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    this.last[cue] = now;
    this.voices += 1;
    const length = this.render(cue, ctx, ctx.currentTime + 0.01, options.pitch ?? 0);
    window.setTimeout(() => {
      this.voices = Math.max(0, this.voices - 1);
    }, length * 1000);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext) as AudioContextCtor | undefined;
    if (!Ctor) return null;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = 0.55;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.ratio.value = 6;
    master.connect(limiter).connect(ctx.destination);
    // A small room: decaying noise as an impulse, made once, so the cues have air without a file.
    const seconds = 1.4;
    const impulse = ctx.createBuffer(2, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 3.2);
    }
    const room = ctx.createConvolver();
    room.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    room.connect(wet).connect(master);
    this.ctx = ctx;
    this.master = master;
    this.room = room;
    return ctx;
  }

  /** A soft partial: quick attack, exponential fall. Returns when it ends. */
  private tone(ctx: AudioContext, at: number, freq: number, peak: number, decay: number, type: OscillatorType = 'sine', attack = 0.006, roomSend = 0.5): number {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    osc.connect(gain).connect(this.master!);
    if (this.room && roomSend > 0) {
      const send = ctx.createGain();
      send.gain.value = roomSend;
      gain.connect(send).connect(this.room);
    }
    osc.start(at);
    osc.stop(at + attack + decay + 0.05);
    return at + attack + decay;
  }

  /** Filtered air moving from one side to the other: the sound of passing through a doorway. */
  private air(ctx: AudioContext, at: number, duration: number, peak: number): number {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 0.9;
    band.frequency.setValueAtTime(320, at);
    band.frequency.exponentialRampToValueAtTime(2400, at + duration * 0.8);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(peak, at + duration * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    const pan = ctx.createStereoPanner();
    pan.pan.setValueAtTime(-0.45, at);
    pan.pan.linearRampToValueAtTime(0.45, at + duration);
    source.connect(band).connect(gain).connect(pan).connect(this.master!);
    source.start(at);
    source.stop(at + duration + 0.02);
    return at + duration;
  }

  /**
   * The district cards' sound: four quick notes climbing, clipped like a
   * machine's, and a clear tone left ringing on the last. The owner asked
   * first for something sharper and louder (the other cues peak near a tenth
   * of full scale, which a phone's small speaker at half volume does not
   * carry), then for something more digital. The square wave is what makes
   * it sound made rather than struck; the filter keeps it from being harsh,
   * and the limiter after the master keeps it from clipping.
   */
  private arpeggio(ctx: AudioContext, at: number, root: number, peak: number): number {
    const soften = ctx.createBiquadFilter();
    soften.type = 'lowpass';
    soften.frequency.value = 5200;
    soften.Q.value = 0.7;
    soften.connect(this.master!);
    if (this.room) {
      const send = ctx.createGain();
      send.gain.value = 0.3;
      soften.connect(send).connect(this.room);
    }
    const blip = (type: OscillatorType, freq: number, when: number, level: number, decay: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, when);
      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(level, when + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
      osc.connect(gain).connect(soften);
      osc.start(when);
      osc.stop(when + decay + 0.05);
    };
    // Root, fifth, octave, and the fifth above: the same on every card, from that card's own note.
    const steps = [1, 1.5, 2, 3];
    const gap = 0.058;
    steps.forEach((ratio, i) => {
      const when = at + i * gap;
      const last = i === steps.length - 1;
      blip('square', root * ratio, when, peak * 0.32, last ? 0.2 : 0.07);
      blip('triangle', root * ratio, when, peak, last ? 0.5 : 0.1);
    });
    const ring = at + (steps.length - 1) * gap;
    blip('sine', root * 6, ring, peak * 0.3, 0.55);
    blip('sine', root * 6.03, ring, peak * 0.2, 0.55);
    return ring + 0.6;
  }

  /** Writes one cue into the graph and returns its length in seconds. */
  private render(cue: Cue, ctx: AudioContext, t: number, pitch: number): number {
    let end = t;
    switch (cue) {
      case 'enable':
        end = Math.max(this.tone(ctx, t, 659.25, 0.1, 0.5), this.tone(ctx, t + 0.09, 987.77, 0.08, 0.7));
        break;
      case 'door': {
        const f = DOOR_NOTES[((pitch % DOOR_NOTES.length) + DOOR_NOTES.length) % DOOR_NOTES.length] ?? 440;
        end = Math.max(this.tone(ctx, t, f, 0.09, 0.9), this.tone(ctx, t, f * 2, 0.025, 0.5), this.tone(ctx, t, f / 2, 0.035, 0.8, 'triangle', 0.01, 0.2));
        break;
      }
      case 'portal': {
        // Each district on its own note of the same scale, an octave up where a phone speaker is clearest.
        const f = (DOOR_NOTES[((pitch % DOOR_NOTES.length) + DOOR_NOTES.length) % DOOR_NOTES.length] ?? 440) * 2;
        end = this.arpeggio(ctx, t, f, 0.45);
        break;
      }
      case 'transition':
        end = Math.max(this.air(ctx, t, 0.55, 0.06), this.tone(ctx, t, 98, 0.045, 0.55, 'sine', 0.18, 0));
        break;
      case 'success':
        end = Math.max(this.tone(ctx, t, 1046.5, 0.07, 0.3), this.tone(ctx, t + 0.07, 1567.98, 0.06, 0.4));
        break;
      case 'roxi':
        end = Math.max(
          this.tone(ctx, t, 880, 0.05, 0.25),
          this.tone(ctx, t + 0.055, 1108.73, 0.05, 0.25),
          this.tone(ctx, t + 0.11, 1318.51, 0.05, 0.35),
          this.tone(ctx, t + 0.11, 2637.02, 0.012, 0.4),
        );
        break;
      case 'roxi-done':
        end = Math.max(this.tone(ctx, t, 1318.51, 0.06, 0.3), this.tone(ctx, t + 0.09, 880, 0.06, 0.5));
        break;
      case 'guardian': {
        // A low swell under four rising partials, a little detuned: rare, so it may be the richest sound here.
        end = Math.max(this.tone(ctx, t, 146.83, 0.06, 1.6, 'sine', 0.35, 0.6), this.tone(ctx, t, 220, 0.045, 1.5, 'triangle', 0.4, 0.6));
        [1174.66, 1479.98, 1760, 2349.32].forEach((f, i) => {
          end = Math.max(end, this.tone(ctx, t + 0.12 + i * 0.11, f * (1 + (i % 2 ? 0.002 : -0.002)), 0.03, 1.1, 'sine', 0.01, 0.9));
        });
        break;
      }
      case 'status':
        end = Math.max(this.tone(ctx, t, 1567.98, 0.05, 0.18), this.tone(ctx, t + 0.12, 1567.98, 0.05, 0.22));
        break;
    }
    return end - t + 0.1;
  }
}

let engine: SoundEngine | null = null;

/** The page's one sound engine. */
export function sound(): SoundEngine {
  engine ??= new SoundEngine();
  return engine;
}
