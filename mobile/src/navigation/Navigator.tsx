import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { BackHandler } from 'react-native';
import * as Linking from 'expo-linking';
import { parseUrl, type Route } from './routes';
import { reduce, START, type NavState } from './stack';

export type Rect = { x: number; y: number; width: number; height: number };
type Nav = {
  state: NavState;
  top: Route;
  push: (route: Route, opts?: { origin?: Rect }) => void;
  back: () => boolean;
  home: () => void;
  reset: (route: Route) => void;
  /** Where the last forward move started (shared-element origin), and when the finger touched. */
  meta: React.MutableRefObject<{ origin: Rect | null; tapAt: number | null; fromGesture: number | null }>;
};

const NavContext = createContext<Nav | null>(null);

/**
 * Navigation layer (Chapter 02): one stack, home at the bottom; Android back
 * and deep links (yavaya://…, https://yavaya.lat/…) go through the same
 * reducer. No native stack navigator: screens are scenes in one continuous
 * environment, and the motion engine owns how they change.
 */
export function NavigationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, START);
  const meta = useRef<Nav['meta']['current']>({ origin: null, tapAt: null, fromGesture: null });
  const stateRef = useRef(state);
  stateRef.current = state;

  const push = useCallback((route: Route, opts?: { origin?: Rect }) => {
    meta.current = { origin: opts?.origin ?? null, tapAt: performance.now(), fromGesture: null };
    dispatch({ type: 'push', route });
  }, []);
  const back = useCallback(() => {
    if (stateRef.current.stack.length <= 1) return false;
    meta.current = { ...meta.current, origin: null, tapAt: meta.current.fromGesture === null ? performance.now() : meta.current.tapAt };
    dispatch({ type: 'back' });
    return true;
  }, []);
  const home = useCallback(() => {
    meta.current = { origin: null, tapAt: performance.now(), fromGesture: null };
    dispatch({ type: 'home' });
  }, []);
  const reset = useCallback((route: Route) => dispatch({ type: 'reset', route }), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', back);
    return () => sub.remove();
  }, [back]);

  useEffect(() => {
    const open = (url: string | null) => {
      const route = url ? parseUrl(url) : null;
      if (route && route.name !== 'home') push(route);
    };
    Linking.getInitialURL().then(open).catch(() => undefined);
    const sub = Linking.addEventListener('url', (e) => open(e.url));
    return () => sub.remove();
  }, [push]);

  const value = useMemo<Nav>(() => ({ state, top: state.stack[state.stack.length - 1], push, back, home, reset, meta }), [state, push, back, home, reset]);
  return <NavContext.Provider value={value}>{children}</NavContext.Provider>;
}

export function useNav(): Nav {
  const v = useContext(NavContext);
  if (!v) throw new Error('useNav outside NavigationProvider');
  return v;
}
