import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton } from '../design/controls';
import { HoloPanel } from '../render/HoloPanel';
import { space } from '../design/tokens';
import { usePalette } from '../design/palette';
import { useNav } from '../navigation/Navigator';
import type { Route } from '../navigation/routes';

const DOCK_RADIUS = 28;
const ROXI_BUTTON = 56;

/**
 * The dock: the five essentials under the thumb, on every scene. Roxi sits in
 * the centre, where the thumb rests. The current place is lit; the rest stay quiet.
 */
export function Dock() {
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const at = nav.top.name;
  const go = (route: Route) => (route.name === 'home' ? nav.home() : nav.push(route));
  const tint = (name: Route['name']) => (at === name ? palette.focus : palette.textSecondary);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: space[3], right: space[3], bottom: insets.bottom + space[2] }}>
      <HoloPanel depth="overlay" radius={DOCK_RADIUS} style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingVertical: space[1] }}>
        <IconButton icon="home" label="Inicio" onPress={() => go({ name: 'home' })} tint={tint('home')} />
        <IconButton icon="search" label="Buscar" onPress={() => go({ name: 'search' })} tint={tint('search')} />
        <IconButton icon="roxi" label="Roxi" onPress={() => go({ name: 'roxi' })} tint={palette.roxi} size={ROXI_BUTTON} lit={at === 'roxi'} />
        <IconButton icon="map" label="Mapa" onPress={() => go({ name: 'map' })} tint={tint('map')} />
        <IconButton icon="settings" label="Ajustes" onPress={() => go({ name: 'settings' })} tint={tint('settings')} />
      </HoloPanel>
    </View>
  );
}
