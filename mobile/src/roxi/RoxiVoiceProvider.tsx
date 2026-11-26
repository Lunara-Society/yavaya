import { ConversationProvider, useConversation } from '@elevenlabs/react-native';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';
import { apiRequest } from '../business/api';
import { useAuth } from '../business/auth';
import { useNav } from '../navigation/Navigator';
import { cue } from '../motion/cues';
import { roxiTools, type RoxiResultCard, type ToolContext } from './tools';
import { RoxiVoiceContext, type RoxiLine, type RoxiVoice } from './voice-context';

/**
 * Roxi's voice in the app: the same agent, prompt, knowledge and tools as on
 * the website, spoken over WebRTC (ElevenLabs React Native SDK, with the
 * phone's echo cancellation). The server opens each conversation exactly as
 * it does for the website (allowance, credits, the live status register:
 * /api/mobile/v1/roxi/start) and meters it when it ends (/api/roxi/usage).
 * Her tools run here with the member's own session (tools.ts).
 */
export function RoxiVoiceProvider({ children }: { children: ReactNode }) {
  return (
    <ConversationProvider>
      <Voice>{children}</Voice>
    </ConversationProvider>
  );
}

type SessionInfo = { enabled?: boolean; locale?: string; member?: { firstName: string; yayId: string; placeName: string | null; emailVerified: boolean } };
type StartInfo = { ok?: boolean; conversationToken?: string; conversationId?: string | null; agentId?: string; status?: string; message?: string };

const LEVEL_POLL_MS = 50;
const LEVEL_GAIN = 1.8;
const INPUT_WEIGHT = 0.6;
const MAX_LINES = 40;
const LEVEL_EASE_MS = 90;
const SETTLE_MS = LEVEL_EASE_MS * 4;
/** Her hologram's states (shaders.ts, ROXI_HOLO_SKSL). */
const RESTING = 0;
const LISTENING = 1;
const THINKING = 2;
const SPEAKING = 3;

function Voice({ children }: { children: ReactNode }) {
  const nav = useNav();
  const auth = useAuth();
  const [phase, setPhase] = useState<RoxiVoice['phase']>('idle');
  const [lines, setLines] = useState<RoxiLine[]>([]);
  const [results, setResults] = useState<RoxiResultCard[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const state = useSharedValue(0);
  const level = useSharedValue(0);
  const conversationId = useRef<string | null>(null);
  const nextId = useRef(1);
  const lastPath = useRef('/');

  const add = useCallback((who: RoxiLine['who'], text: string) => {
    const said = text.trim();
    if (!said) return;
    setLines((current) => [...current.slice(-MAX_LINES + 1), { id: nextId.current++, who, text: said }]);
  }, []);

  const report = useCallback(async () => {
    const id = conversationId.current;
    conversationId.current = null;
    if (id) await apiRequest('/api/roxi/usage', { method: 'POST', body: { conversationId: id } });
  }, []);

  const conversation = useConversation({
    micMuted: muted,
    onConnect: ({ conversationId: id }: { conversationId: string }) => {
      if (!conversationId.current) conversationId.current = id;
      setPhase('live');
      cue('roxi');
    },
    onDisconnect: () => {
      setPhase('idle');
      state.value = withTiming(RESTING, { duration: SETTLE_MS });
      void report();
    },
    onError: (message: string) => {
      setNote(message ? 'Se cortó la conversación. Puedes volver a llamarla.' : null);
    },
    onMessage: ({ message, source }: { message: string; source: 'user' | 'ai' }) => add(source === 'user' ? 'you' : 'roxi', message),
  });

  // Her live voice, sampled for the hologram: what she says, or what she hears.
  useEffect(() => {
    if (phase !== 'live') return undefined;
    const timer = setInterval(() => {
      const out = conversation.getOutputVolume();
      const heard = conversation.getInputVolume() * INPUT_WEIGHT;
      level.value = withTiming(Math.min(1, Math.max(out, heard) * LEVEL_GAIN), { duration: LEVEL_EASE_MS });
      state.value = conversation.isSpeaking ? SPEAKING : LISTENING;
    }, LEVEL_POLL_MS);
    return () => clearInterval(timer);
  }, [phase, conversation, level, state]);

  const toolContext = useMemo<ToolContext>(() => ({
    navigate: (path: string) => {
      lastPath.current = path;
      nav.push({ name: 'web', path });
    },
    pathname: () => lastPath.current.split('?')[0] ?? '/',
    takePhotos: () => [],
    showResults: (cards) => setResults(cards),
    stepAside: () => undefined,
    task: () => cue('success'),
    saved: (text) => add('note', `Guardado: ${text}`),
    confirm: (summary) =>
      new Promise<boolean>((resolve) => {
        Alert.alert(`${summary.connection}: ${summary.tool}`, summary.lines.join('\n'), [
          { text: 'No', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Permitir', onPress: () => resolve(true) },
        ], { cancelable: true, onDismiss: () => resolve(false) });
      }),
  }), [nav, add]);

  const start = useCallback(async () => {
    if (phase === 'starting' || phase === 'live') return;
    setNote(null);
    if (auth.status !== 'signed_in') {
      setNote('Entra a tu cuenta para hablar con Roxi.');
      return;
    }
    setPhase('starting');
    state.value = THINKING;
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        setNote('Roxi necesita el micrófono. Puedes permitirlo en Ajustes del teléfono → Apps → Yavaya → Permisos.');
        setPhase('idle');
        state.value = RESTING;
        return;
      }
    }
    const session = await apiRequest('/api/roxi/session');
    const info = session.body as SessionInfo | null;
    if (!info?.enabled || !info.member) {
      setNote(session.status === 0 ? 'Sin conexión. Prueba de nuevo en un momento.' : 'Roxi no está disponible en este momento.');
      setPhase('idle');
      state.value = RESTING;
      return;
    }
    const opened = await apiRequest('/api/mobile/v1/roxi/start', { method: 'POST' });
    const begin = opened.body as StartInfo | null;
    if (!opened.ok || !begin?.ok) {
      setNote(begin?.message ?? 'Roxi no está disponible en este momento.');
      setPhase('idle');
      state.value = RESTING;
      return;
    }
    conversationId.current = begin.conversationId ?? null;
    const member = info.member;
    const locale = info.locale === 'en' ? 'en' : 'es';
    try {
      conversation.startSession({
        ...(begin.conversationToken ? { conversationToken: begin.conversationToken } : { agentId: begin.agentId ?? '' }),
        connectionType: 'webrtc',
        userId: member.yayId,
        overrides: { agent: { language: locale } },
        dynamicVariables: {
          member_name: member.firstName || member.yayId,
          member_yay_id: member.yayId,
          member_place: member.placeName ?? '',
          member_email_verified: member.emailVerified,
          member_language: locale,
          current_page: 'app:roxi',
          previous_conversation: '',
          platform_status: begin.status ?? '',
          member_preferences: 'The member is using the Yavaya app on their phone. Pages you open appear inside the app.',
        },
        clientTools: roxiTools(toolContext),
      });
    } catch {
      setNote('No se pudo abrir la conversación. Prueba de nuevo.');
      setPhase('idle');
      state.value = RESTING;
    }
  }, [phase, auth.status, conversation, toolContext, state]);

  const end = useCallback(() => {
    conversation.endSession();
    setPhase('idle');
    state.value = RESTING;
    void report();
  }, [conversation, report, state]);

  const say = useCallback((text: string) => {
    if (phase !== 'live' || !text.trim()) return;
    add('you', text);
    conversation.sendUserMessage(text.trim());
  }, [phase, conversation, add]);

  const value = useMemo<RoxiVoice>(
    () => ({ phase, state, level, lines, results, note, muted, start, end, setMuted, say }),
    [phase, state, level, lines, results, note, muted, start, end, say],
  );
  return <RoxiVoiceContext.Provider value={value}>{children}</RoxiVoiceContext.Provider>;
}
