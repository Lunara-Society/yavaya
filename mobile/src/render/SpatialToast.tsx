import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HoloPanel } from './HoloPanel';
import { T } from '../design/Text';
import { color, space } from '../design/tokens';
import { cue } from '../motion/cues';
import { announce } from '../a11y/a11y';

type Toast = { id: number; title: string; body?: string; tone: 'info' | 'success' | 'error'; accent?: string };
const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => undefined);

/**
 * Spatial notifications (Chapter 04): they arrive from depth at the top of the
 * screen, out of the thumb's way, with their sound and vibration, and are read
 * aloud to screen readers. They never cover the primary controls.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const serial = useRef(0);
  const insets = useSafeAreaInsets();
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = (serial.current += 1);
    cue(t.tone === 'success' ? 'success' : t.tone === 'error' ? 'error' : 'notify');
    announce(t.body ? `${t.title}. ${t.body}` : t.title);
    setToasts((all) => [...all.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((all) => all.filter((x) => x.id !== id)), 3600);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { paddingTop: insets.top + space[2], paddingHorizontal: space[4], gap: space[2] }]}>
        {toasts.map((t) => (
          <Animated.View key={t.id} entering={ZoomIn.springify().damping(24).withInitialValues({ transform: [{ scale: 0.92 }] })} exiting={FadeOut.duration(180)}>
            <HoloPanel depth="overlay" focus accent={t.accent ?? (t.tone === 'error' ? color.critical : t.tone === 'success' ? color.positive : color.signal)} style={{ padding: space[4] }}>
              <T variant="label">{t.title}</T>
              {t.body ? <T variant="caption" tone="secondary">{t.body}</T> : null}
            </HoloPanel>
          </Animated.View>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
