import Constants from 'expo-constants';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../design/controls';
import { T } from '../design/Text';
import { color, space } from '../design/tokens';
import { SERVER_URL } from '../core/env';
import { decide } from '../links';
import { OPEN_ROXI } from '../synapse/bridge';
import { useNav } from '../navigation/Navigator';

/**
 * The website screen: the complete fallback for every function not yet native.
 * Same account, same rules, same link policy as the Chapter 00 bridge.
 */
export default function WebScreen({ path }: { path: string }) {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const web = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const openRoxi = path.includes('roxi=open');
  const ownHost = (url: string) => url.startsWith(SERVER_URL);
  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: color.void }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space[2], minHeight: 52 }}>
        <IconButton icon="back" label="Volver" onPress={() => nav.back()} />
        <T variant="micro" tone="tertiary" style={{ flex: 1 }}>Yavaya · pantalla web</T>
        {loading ? <ActivityIndicator color={color.signal} style={{ marginRight: space[3] }} /> : null}
      </View>
      <WebView<object>
        ref={web}
        source={{ uri: `${SERVER_URL}${path.replace('?roxi=open', '')}` }}
        style={{ flex: 1, backgroundColor: color.void }}
        applicationNameForUserAgent={`YavayaApp/${Constants.expoConfig?.version ?? '0'}`}
        mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
        allowsInlineMediaPlayback
        onLoadEnd={() => {
          setLoading(false);
          if (openRoxi) web.current?.injectJavaScript(OPEN_ROXI);
        }}
        onShouldStartLoadWithRequest={(req: WebViewNavigation & { isTopFrame?: boolean }) => {
          if (ownHost(req.url)) return true;
          const d = decide(req.url, req.isTopFrame ?? true);
          if (d === 'external') void Linking.openURL(req.url).catch(() => undefined);
          return d === 'in-app';
        }}
      />
    </View>
  );
}
