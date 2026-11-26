/**
 * Yavaya's interface sounds (Chapter 07): original, synthesised in this
 * repository by mobile/tools/audio/make-sounds.py (no samples, no third-party
 * audio), loudness-normalised. Priority decides who yields when too many
 * sounds want to play at once (higher wins).
 */
export const SOUNDS = {
  awaken: { file: require('../../assets/audio/awaken.m4a'), priority: 9, gain: 0.9 },
  districtInit: { file: require('../../assets/audio/district-init.m4a'), priority: 6, gain: 0.7 },
  reconstruct: { file: require('../../assets/audio/reconstruct.m4a'), priority: 5, gain: 0.6 },
  dissolve: { file: require('../../assets/audio/dissolve.m4a'), priority: 4, gain: 0.55 },
  holoEmerge: { file: require('../../assets/audio/holo-emerge.m4a'), priority: 4, gain: 0.5 },
  roxi: { file: require('../../assets/audio/roxi.m4a'), priority: 8, gain: 0.75 },
  guardian: { file: require('../../assets/audio/guardian.m4a'), priority: 8, gain: 0.8 },
  expand: { file: require('../../assets/audio/expand.m4a'), priority: 3, gain: 0.45 },
  confirm: { file: require('../../assets/audio/confirm.m4a'), priority: 7, gain: 0.6 },
  back: { file: require('../../assets/audio/back.m4a'), priority: 2, gain: 0.4 },
  notify: { file: require('../../assets/audio/notify.m4a'), priority: 7, gain: 0.6 },
  error: { file: require('../../assets/audio/error.m4a'), priority: 8, gain: 0.6 },
} as const;

export type SoundName = keyof typeof SOUNDS;
