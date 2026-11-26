import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../design/controls';
import { T } from '../design/Text';
import { color, space } from '../design/tokens';
import { useNav } from '../navigation/Navigator';

/** Scene scaffold: information at the top, actions within the thumb's reach, the dock never covered. */
export function Screen({ overline, title, children, scroll = true, dockSpace = true, accent }: { overline?: string; title?: string; children: ReactNode; scroll?: boolean; dockSpace?: boolean; accent?: string }) {
  const insets = useSafeAreaInsets();
  const nav = useNav();
  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 56 }}>
      {nav.state.stack.length > 1 ? <IconButton icon="back" label="Volver" onPress={() => nav.back()} /> : null}
      <View style={{ flex: 1 }}>
        {overline ? <T variant="micro" color={accent ?? color.metal}>{overline}</T> : null}
        {title ? <T variant="title" accessibilityRole="header">{title}</T> : null}
      </View>
    </View>
  );
  const padding = { paddingTop: insets.top + space[2], paddingHorizontal: space[4], paddingBottom: (dockSpace ? 96 : space[5]) + insets.bottom };
  if (!scroll) return <View style={[{ flex: 1 }, padding]}>{header}{children}</View>;
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[padding, { gap: space[4] }]} showsVerticalScrollIndicator={false}>
      {header}
      {children}
    </ScrollView>
  );
}
