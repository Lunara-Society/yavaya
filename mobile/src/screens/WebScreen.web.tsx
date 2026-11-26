import { Linking, View } from 'react-native';
import { Screen } from './Screen';
import { Button } from '../design/controls';
import { T } from '../design/Text';
import { space } from '../design/tokens';
import { SERVER_URL } from '../core/env';

/** On the web build (used for development checks) the website opens in its own tab. */
export default function WebScreen({ path }: { path: string }) {
  return (
    <Screen overline="Pantalla web" title="Yavaya">
      <View style={{ gap: space[3] }}>
        <T variant="caption" tone="secondary">En el teléfono esta pantalla muestra el sitio dentro de la app.</T>
        <Button label="Abrir en el navegador" onPress={() => Linking.openURL(`${SERVER_URL}${path}`)} />
      </View>
    </Screen>
  );
}
