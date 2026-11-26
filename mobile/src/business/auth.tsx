import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import { SERVER_URL } from '../core/env';
import { apiRequest, setSessionToken } from './api';

/**
 * Signing in, the way native apps are meant to (RFC 8252, and what Google
 * requires): the phone's own browser opens Yavaya's sign-in, the person signs
 * in there exactly as on the website (Google, password, two-step, new-member
 * terms), and the browser hands back to the app's address with a one-time
 * code. The app trades the code plus its PKCE verifier for a session and keeps
 * it in the phone's keystore. Server side: platform/src/server/auth/mobile.ts.
 */
export type Member = { firstName: string; yayId: string; placeName: string | null };
export type AuthState = {
  status: 'checking' | 'signed_out' | 'signed_in';
  member: Member | null;
  token: string | null;
  /** `google` goes straight to Google; `any` shows every way in. `fresh` signs in again (another account). */
  signIn: (via?: 'google' | 'any', fresh?: boolean) => Promise<{ ok: true } | { ok: false; reason: 'cancelled' | 'failed' | 'unsupported' }>;
  signOut: () => Promise<void>;
  /** Asks the server whether the session still holds (after the website signed out, for example). */
  refresh: () => Promise<void>;
};

const KEY = 'yavaya.session.v1';
const VERIFIER_BYTES = 48;
const STATE_BYTES = 18;

const AuthContext = createContext<AuthState | null>(null);

/**
 * Base64 padding at the end of a string.
 * Matches the "==" in "ab+/c=="; leaves "abc" untouched.
 * Tester: https://regex101.com/?flavor=javascript&regex=%3D%2B%24&testString=ab%2B%2Fc%3D%3D%0Aabc
 */
const PADDING = /=+$/;
/**
 * The plus signs of base64, which base64url writes as "-".
 * Matches both "+" in "a+b+c"; leaves "abc" untouched.
 * Tester: https://regex101.com/?flavor=javascript&regex=%5C%2B&testString=a%2Bb%2Bc%0Aabc
 */
const PLUS = /\+/g;
/**
 * The slashes of base64, which base64url writes as "_".
 * Matches both "/" in "a/b/c"; leaves "abc" untouched.
 * Tester: https://regex101.com/?flavor=javascript&regex=%5C%2F&testString=a%2Fb%2Fc%0Aabc
 */
const SLASH = /\//g;
/** Base64url (RFC 4648 §5), what PKCE asks for: "ab+/c==" becomes "ab-_c". */
const base64url = (base64: string) => base64.replace(PLUS, '-').replace(SLASH, '_').replace(PADDING, '');

/** Hermes has `btoa` (React Native 0.74 and later); bytes go in as a binary string. */
const bytesToBase64 = (bytes: Uint8Array) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));

const randomToken = (bytes: number) => base64url(bytesToBase64(Crypto.getRandomBytes(bytes)));

async function challengeOf(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 });
  return base64url(digest);
}

/** The app's own return address: `yavaya://auth`, or `yavaya-dev://auth` for the development build. */
function redirectUri(): string {
  const scheme = typeof Constants.expoConfig?.scheme === 'string' ? Constants.expoConfig.scheme : 'yavaya';
  return `${scheme}://auth`;
}

async function readStored(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

async function store(token: string | null): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    if (token) await SecureStore.setItemAsync(KEY, token);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // A keystore that refuses only means the person signs in again next time.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('checking');
  const [member, setMember] = useState<Member | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const adopt = useCallback(async (next: string | null, who: Member | null) => {
    setSessionToken(next);
    setToken(next);
    setMember(who);
    setStatus(next ? 'signed_in' : 'signed_out');
    await store(next);
  }, []);

  const check = useCallback(async (candidate: string | null) => {
    if (!candidate) return adopt(null, null);
    setSessionToken(candidate);
    const result = await apiRequest('/api/mobile/v1/auth/session');
    const body = result.body as { signedIn?: boolean; member?: Member | null } | null;
    // Offline: keep the stored session and try again later, rather than signing out someone who is only without signal.
    if (result.status === 0) {
      setToken(candidate);
      setStatus('signed_in');
      return;
    }
    if (body?.signedIn) return adopt(candidate, body.member ?? null);
    return adopt(null, null);
  }, [adopt]);

  useEffect(() => {
    const restore = async () => check(await readStored());
    void restore();
  }, [check]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && token) void check(token);
    });
    return () => sub.remove();
  }, [check, token]);

  const signIn = useCallback<AuthState['signIn']>(async (via = 'any', fresh = false) => {
    if (Platform.OS === 'web') return { ok: false, reason: 'unsupported' };
    const verifier = randomToken(VERIFIER_BYTES);
    const state = randomToken(STATE_BYTES);
    const redirect = redirectUri();
    const query = new URLSearchParams({ redirect_uri: redirect, state, code_challenge: await challengeOf(verifier), code_challenge_method: 'S256' });
    if (via === 'google') query.set('via', 'google');
    if (fresh) query.set('fresh', '1');
    const result = await WebBrowser.openAuthSessionAsync(`${SERVER_URL}/api/mobile/v1/auth/start?${query.toString()}`, redirect, { showInRecents: false });
    if (result.type !== 'success') return { ok: false, reason: 'cancelled' };
    const back = new URL(result.url);
    const code = back.searchParams.get('code');
    // The state proves this answer belongs to the sign-in this app just started.
    if (!code || back.searchParams.get('state') !== state) return { ok: false, reason: 'failed' };
    const exchange = await apiRequest('/api/mobile/v1/auth/exchange', { method: 'POST', body: { code, verifier } });
    const body = exchange.body as { token?: string; member?: Member | null } | null;
    if (!exchange.ok || !body?.token) return { ok: false, reason: 'failed' };
    await adopt(body.token, body.member ?? null);
    return { ok: true };
  }, [adopt]);

  const signOut = useCallback(async () => {
    await apiRequest('/api/mobile/v1/auth/session', { method: 'DELETE' });
    await adopt(null, null);
  }, [adopt]);

  const refresh = useCallback(() => check(token), [check, token]);

  const value = useMemo<AuthState>(() => ({ status, member, token, signIn, signOut, refresh }), [status, member, token, signIn, signOut, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}
