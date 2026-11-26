import { View } from 'react-native';
import { Screen } from './Screen';
import { Button } from '../design/controls';
import { T } from '../design/Text';
import { color, space } from '../design/tokens';
import { districtById } from '../districts/registry';
import { HoloPanel } from '../render/HoloPanel';
import { useNav } from '../navigation/Navigator';
import { useToast } from '../render/SpatialToast';

/**
 * Example listing and profile scenes for the motion engine (Chapter 06).
 * Clearly labelled as examples: no real listing or person is shown until the
 * mobile API serves them.
 */
export function SampleListing({ district }: { district: string }) {
  const nav = useNav();
  const toast = useToast();
  const d = districtById(district);
  const accent = d?.accent ?? color.signal;
  return (
    <Screen overline="Ejemplo · no es un anuncio real" title="Bicicleta urbana" accent={accent}>
      <HoloPanel depth="focus" accent={accent} focus style={{ height: 200, alignItems: 'center', justifyContent: 'center' }}>
        <T variant="micro" color={accent}>Imagen de ejemplo</T>
      </HoloPanel>
      <T variant="data" color={accent}>C$ 4 500</T>
      <T variant="caption" tone="secondary">Así se abrirá un anuncio cuando el distrito sea nativo: desde su tarjeta, sin cortar el espacio.</T>
      <View style={{ gap: space[3] }}>
        <Button label="Ver vendedor (ejemplo)" kind="secondary" onPress={() => nav.push({ name: 'profile', yayId: '00000000' })} />
        <Button label="Guardar (ejemplo)" accent={accent} onPress={() => toast({ title: 'Guardado', body: 'Ejemplo de confirmación', tone: 'success' })} />
      </View>
    </Screen>
  );
}

export function SampleProfile() {
  return (
    <Screen overline="Ejemplo · no es una persona real" title="Perfil">
      <HoloPanel depth="panel" style={{ padding: space[4], gap: space[2] }}>
        <T variant="headline">Miembro de ejemplo</T>
        <T variant="caption" tone="secondary">Los perfiles reales llegan con la API móvil. Hoy se ven completos en la pantalla web.</T>
      </HoloPanel>
    </Screen>
  );
}
