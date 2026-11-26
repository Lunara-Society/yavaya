import Constants from 'expo-constants';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../design/controls';
import { T } from '../design/Text';
import { color, space } from '../design/tokens';
import { SERVER_URL } from '../core/env';
import { decide } from '../links';
import { useNav } from '../navigation/Navigator';
import { useAuth } from '../business/auth';
import { draftScript, takePendingDraft } from '../roxi/drafts';

/**
 * A website screen inside the app, for everything that is not native yet.
 *
 * Signed in with the app's own session: the first request goes through
 * /api/mobile/v1/auth/web with the token in its Authorization header, and the
 * screen keeps the same session as its cookie. The website's own sign-in links
 * (/login, /register, "Continuar con Google", which Google refuses inside an
 * app) are caught and run as the app's native sign-in instead. A draft Roxi
 * prepared is handed to the page before it loads, for its form to fill in.
 */
const SIGN_IN_PATHS = ['/login', '/register', '/auth/google'];
const HEADER_HEIGHT = 52;

/** Another site opens in the phone's own browser; if nothing can open it, the screen simply stays. */
async function openOutside(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    // No app for this address: nothing to do.
  }
}

function pathOf(url: string): string | null {
  if (!url.startsWith(SERVER_URL)) return null;
  const rest = url.slice(SERVER_URL.length) || '/';
  return rest.startsWith('/') ? rest : `/${rest}`;
}

export default function WebScreen({ path }: { path: string }) {
  const nav = useNav();
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const web = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [generation, setGeneration] = useState(0);
  const current = useRef(path);
  const draft = useMemo(() => draftScript(takePendingDraft()), []);

  const target = path.replace('?roxi=open', '');
  // The token goes in the header of the first request only; a remount (after signing in) does it again.
  const source = useMemo(
    () =>
      auth.token
        ? { uri: `${SERVER_URL}/api/mobile/v1/auth/web?next=${encodeURIComponent(current.current === path ? target : current.current)}`, headers: { Authorization: `Bearer ${auth.token}` } }
        : { uri: `${SERVER_URL}${target}` },
    // `generation` re-signs the screen in after a native sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auth.token, generation],
  );

  const signInNatively = async (via: 'google' | 'any') => {
    if (signing) return;
    setSigning(true);
    const result = await auth.signIn(via);
    setSigning(false);
    if (result.ok) setGeneration((g) => g + 1);
  };

  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: color.void }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2], minHeight: HEADER_HEIGHT }}>
        <IconButton icon="back" label="Volver" onPress={() => (web.current && current.current !== path ? web.current.goBack() : nav.back())} />
        <T variant="micro" tone="tertiary" style={{ flex: 1 }} numberOfLines={1}>
          {auth.member ? `Yavaya · ${auth.member.firstName}` : 'Yavaya'}
        </T>
        {loading || signing ? <ActivityIndicator color={color.signal} style={{ marginRight: space[2] }} /> : null}
        <IconButton icon="close" label="Cerrar" onPress={() => nav.back()} />
      </View>
      <WebView<object>
        key={generation}
        ref={web}
        source={source}
        style={{ flex: 1, backgroundColor: color.void }}
        applicationNameForUserAgent={`YavayaApp/${Constants.expoConfig?.version ?? '0'}`}
        injectedJavaScriptBeforeContentLoaded={draft}
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        allowsInlineMediaPlayback
        sharedCookiesEnabled
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onNavigationStateChange={(state) => {
          const p = pathOf(state.url);
          if (p && !p.startsWith('/api/')) current.current = p;
        }}
        onShouldStartLoadWithRequest={(req: WebViewNavigation & { isTopFrame?: boolean }) => {
          const p = pathOf(req.url);
          if (p !== null) {
            const signInPath = SIGN_IN_PATHS.find((prefix) => p === prefix || p.startsWith(`${prefix}?`) || p.startsWith(`${prefix}/`));
            // Leaving the website's sign-in pages to the website would end in Google's refusal; the app signs in instead.
            if (signInPath && !p.startsWith('/login/codigo')) {
              void signInNatively(signInPath === '/auth/google' ? 'google' : 'any');
              return false;
            }
            return true;
          }
          const decision = decide(req.url, req.isTopFrame ?? true);
          if (decision === 'external') void openOutside(req.url);
          return decision === 'in-app';
        }}
      />
    </View>
  );
}
