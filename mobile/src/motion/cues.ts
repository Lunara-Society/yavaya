import { fadeOut, playSound } from '../audio/engine';
import type { SoundName } from '../audio/sounds';
import { playHaptic } from '../haptics/haptics';
import type { PatternName } from '../haptics/patterns';

/**
 * A cue is one physical event: the sound, the vibration and the motion that
 * belong together start on the same frame. Motion code calls `cue(name)` when
 * its animation starts and the returned function if the animation is
 * interrupted, so a cancelled transition is silent and still.
 */
export const CUES = {
  tap: { haptic: 'tap' },
  open: { sound: 'expand', haptic: 'open' },
  districtOpen: { sound: 'districtInit', haptic: 'districtOpen' },
  back: { sound: 'back', haptic: 'back' },
  reconstruct: { sound: 'reconstruct', haptic: 'reconstruct' },
  dissolve: { sound: 'dissolve', haptic: 'dissolve' },
  emerge: { sound: 'holoEmerge', haptic: 'expand' },
  roxi: { sound: 'roxi', haptic: 'roxi' },
  guardian: { sound: 'guardian', haptic: 'guardian' },
  awaken: { sound: 'awaken', haptic: 'awaken' },
  success: { sound: 'confirm', haptic: 'success' },
  notify: { sound: 'notify', haptic: 'notify' },
  error: { sound: 'error', haptic: 'error' },
} as const satisfies Record<string, { sound?: SoundName; haptic?: PatternName }>;

export type CueName = keyof typeof CUES;

export function cue(name: CueName): () => void {
  const def: { sound?: SoundName; haptic?: PatternName } = CUES[name];
  if (def.sound) playSound(def.sound);
  const cancelHaptic = def.haptic ? playHaptic(def.haptic) : () => undefined;
  return () => {
    cancelHaptic();
    if (def.sound) fadeOut(def.sound);
  };
}
