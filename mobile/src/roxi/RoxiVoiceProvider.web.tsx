import { useMemo, type ReactNode } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import { RoxiVoiceContext, type RoxiVoice } from './voice-context';

/** The browser check has no native voice (WebRTC lives in the installed app): Roxi says so instead of pretending. */
export function RoxiVoiceProvider({ children }: { children: ReactNode }) {
  const state = useSharedValue(0);
  const level = useSharedValue(0);
  const value = useMemo<RoxiVoice>(() => ({
    phase: 'unsupported', state, level, lines: [], results: [], muted: false,
    note: 'La voz de Roxi funciona en la app instalada.',
    start: async () => undefined, end: () => undefined, setMuted: () => undefined, say: () => undefined,
  }), [state, level]);
  return <RoxiVoiceContext.Provider value={value}>{children}</RoxiVoiceContext.Provider>;
}
