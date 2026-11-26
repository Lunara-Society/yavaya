import { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type { RoxiResultCard } from './tools';

/**
 * Roxi's live conversation, shared by every screen: the Roxi screen shows her
 * in full, and while she opens a page for the member a small island keeps her
 * present (and stoppable) on top of it. One conversation at a time.
 */
export type RoxiLine = { id: number; who: 'roxi' | 'you' | 'note'; text: string };

export type RoxiVoice = {
  /** `unsupported`: this build has no native voice (the browser check). */
  phase: 'idle' | 'starting' | 'live' | 'unsupported';
  /** 0 resting, 1 listening, 2 thinking, 3 speaking: drives her hologram. */
  state: SharedValue<number>;
  /** Her voice (or the member's) right now, 0..1. */
  level: SharedValue<number>;
  lines: RoxiLine[];
  results: RoxiResultCard[];
  /** A short reason when something stopped her (no microphone, no credits, no signal). */
  note: string | null;
  muted: boolean;
  start: () => Promise<void>;
  end: () => void;
  setMuted: (muted: boolean) => void;
  /** Writes to her instead of speaking (the conversation stays a voice one). */
  say: (text: string) => void;
};

export const RoxiVoiceContext = createContext<RoxiVoice | null>(null);

export function useRoxi(): RoxiVoice {
  const value = useContext(RoxiVoiceContext);
  if (!value) throw new Error('useRoxi outside RoxiVoiceProvider');
  return value;
}
