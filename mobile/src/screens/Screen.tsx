import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../design/controls';
import { T } from '../design/Text';
import { space } from '../design/tokens';
import { usePalette } from '../design/palette';
import { useNav } from '../navigation/Navigator';

const HEADER_HEIGHT = 56;
/** Room left under the content so the dock never covers it. */
const DOCK_SPACE = 96;

/** Scene scaffold: information at the top, actions within the thumb's reach, the dock never covered. */
export function Screen({ overline, title, children, scroll = true, dockSpace = true, accent }: { overline?: string; title?: string; children: ReactNode; scroll?: boolean; dockSpace?: boolean; accent?: string }) {
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const palette = usePalette();
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: HEADER_HEIGHT }}>
      {nav.state.stack.length > 1 ? <IconButton icon="back" label="Volver" onPress={() => nav.back()} /> : null}
      <View style={{ flex: 1 }}>
        {overline ? <T variant="micro" color={accent ?? palette.metal}>{overline}</T> : null}
        {title ? <T variant="title" accessibilityRole="header">{title}</T> : null}
      </View>
    </View>
  );
  const padding = { paddingTop: insets.top + space[2], paddingHorizontal: space[4], paddingBottom: (dockSpace ? DOCK_SPACE : space[5]) + insets.bottom };
  if (!scroll) return <View style={[{ flex: 1 }, padding]}>{header}{children}</View>;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[padding, { gap: space[4] }]} showsVerticalScrollIndicator={false}>
      {header}
      {children}
    </ScrollView>
  );
}
