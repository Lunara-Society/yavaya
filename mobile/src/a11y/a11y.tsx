import { useEffect, useState } from 'react';
import { AccessibilityInfo, PixelRatio } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Accessibility layer. Every visual system asks here before it moves, glows or
 * talks: reduced motion replaces particles, parallax and camera moves with
 * short fades; screen readers get real text, never text drawn in a shader.
 */
export type A11y = { reducedMotion: boolean; screenReader: boolean; boldText: boolean; fontScale: number };

export function useA11y(): A11y {
  const reducedMotion = useReducedMotion();
  const [screenReader, setScreenReader] = useState(false);
  const [boldText, setBoldText] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader).catch(() => undefined);
    AccessibilityInfo.isBoldTextEnabled?.().then(setBoldText).catch(() => undefined);
    const a = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    const b = AccessibilityInfo.addEventListener('boldTextChanged', setBoldText);
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return { reducedMotion, screenReader, boldText, fontScale: PixelRatio.getFontScale() };
}

/** Large display text may scale, but not beyond what the layout can hold. */
export const MAX_FONT_SCALE = { display: 1.4, body: 2, control: 1.6 } as const;

export const announce = (message: string) => AccessibilityInfo.announceForAccessibility(message);
