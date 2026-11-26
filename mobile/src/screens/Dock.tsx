import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../design/controls';
import { HoloPanel } from '../render/HoloPanel';
import { color, space } from '../design/tokens';
import { useNav } from '../navigation/Navigator';
import type { Route } from '../navigation/routes';

/**
 * The dock: the five essentials under the thumb, on every scene. Roxi sits in
 * the centre, where the thumb rests.
 */
export function Dock() {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const at = nav.top.name;
  const go = (route: Route) => (route.name === 'home' ? nav.home() : nav.push(route));
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: space[3], right: space[3], bottom: insets.bottom + space[2] }}>
      <HoloPanel depth="overlay" radius={28} style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: space[1] }}>
        <IconButton icon="home" label="Inicio" onPress={() => go({ name: 'home' })} tint={at === 'home' ? color.signal : color.textSecondary} />
        <IconButton icon="search" label="Buscar" onPress={() => go({ name: 'search' })} tint={at === 'search' ? color.signal : color.textSecondary} />
        <IconButton icon="roxi" label="Roxi" onPress={() => go({ name: 'roxi' })} tint={color.roxi} size={56} lit={at === 'roxi'} />
        <IconButton icon="map" label="Mapa" onPress={() => go({ name: 'map' })} tint={at === 'map' ? color.signal : color.textSecondary} />
        <IconButton icon="settings" label="Ajustes" onPress={() => go({ name: 'settings' })} tint={at === 'settings' ? color.signal : color.textSecondary} />
      </HoloPanel>
    </View>
  );
}
