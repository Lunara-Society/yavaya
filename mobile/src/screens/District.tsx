import { View } from 'react-native';
import { Screen } from './Screen';
import { Button } from '../design/controls';
import { T } from '../design/Text';
import { space } from '../design/tokens';
import { districtById } from '../districts/registry';
import { DistrictObject } from '../render/DistrictObject';
import { HoloPanel } from '../render/HoloPanel';
import { useNav } from '../navigation/Navigator';
import type { SharedValue } from 'react-native-reanimated';

/**
 * A district's native hub. Its full function (listings, posting, contact)
 * runs today in the district's website screen inside the app; the native
 * screens replace it district by district once the mobile API exists.
 */
export function District({ id, tilt }: { id: string; tilt: SharedValue<{ x: number; y: number }> }) {
  const nav = useNav();
  const d = districtById(id);
  if (!d) return <Screen title="Distrito"><T>No encontrado.</T></Screen>;
  return (
    <Screen overline="Distrito" title={d.name.es} accent={d.accent}>
      <View style={{ alignItems: 'center' }}>
        <DistrictObject accent={d.accent} size={240} focus={1} />
      </View>
      <T variant="headline" style={{ textAlign: 'center' }}>{d.line.es}</T>
      <View style={{ gap: space[3] }}>
        <Button label={`Abrir ${d.name.es}`} icon="external" accent={d.accent} onPress={() => nav.push({ name: 'web', path: d.webPath })} accessibilityHint="Abre el distrito completo dentro de la app" />
        <Button label="Buscar" icon="search" kind="secondary" onPress={() => nav.push({ name: 'search' })} />
        <Button label="Ver ejemplo de anuncio" kind="quiet" onPress={() => nav.push({ name: 'listing', district: d.id, id: 'ejemplo' })} />
      </View>
      <HoloPanel tilt={tilt} depth="structure" style={{ padding: space[4], gap: space[2] }}>
        <T variant="micro" tone="tertiary">Cómo funciona hoy</T>
        <T variant="caption" tone="secondary">
          Todo {d.name.es} funciona en su pantalla completa dentro de la app, con tu misma cuenta. Esta vista nativa es la entrada; las pantallas nativas del distrito llegan por etapas.
        </T>
      </HoloPanel>
    </Screen>
  );
}
