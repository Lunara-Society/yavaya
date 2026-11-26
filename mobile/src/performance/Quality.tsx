import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { BUDGETS, stepDown, tierOf, type Budget, type Tier } from './tier.ts';
import { useA11y } from '../a11y/a11y';

/**
 * Performance adaptation. The tier is chosen from the device at start-up and
 * stepped down (never up within a session) when frames run over budget for a
 * sustained moment. Every effect reads its budget from here.
 */
type QualityState = { tier: Tier; budget: Budget; reportFrame: (dtMs: number) => void; reducedMotion: boolean };

const QualityContext = createContext<QualityState | null>(null);

const SUSTAIN = 24;

export function QualityProvider({ children }: { children: ReactNode }) {
  const { reducedMotion } = useA11y();
  const initial = tierOf(Device.totalMemory ?? null, Device.deviceYearClass ?? null, reducedMotion);
  const [tier, setTier] = useState<Tier>(Platform.OS === 'web' ? 'mid' : initial);
  const slow = useRef(0);

  useEffect(() => {
    if (reducedMotion) setTier('low');
  }, [reducedMotion]);

  const value = useMemo<QualityState>(() => {
    const budget = BUDGETS[tier];
    return {
      tier,
      budget,
      reducedMotion,
      reportFrame: (dt: number) => {
        slow.current = dt > budget.frameBudgetMs ? slow.current + 1 : Math.max(0, slow.current - 1);
        if (slow.current >= SUSTAIN && tier !== 'low') {
          slow.current = 0;
          setTier(stepDown(tier));
        }
      },
    };
  }, [tier, reducedMotion]);

  return <QualityContext.Provider value={value}>{children}</QualityContext.Provider>;
}

export function useQuality(): QualityState {
  const value = useContext(QualityContext);
  if (!value) throw new Error('useQuality outside QualityProvider');
  return value;
}
