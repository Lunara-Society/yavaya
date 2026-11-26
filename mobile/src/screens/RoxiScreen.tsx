import { useImage } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useSharedValue, withDelay, withTiming, Easing } from 'react-native-reanimated';
import { Screen } from './Screen';
import { Button } from '../design/controls';
import { T } from '../design/Text';
import { color, space } from '../design/tokens';
import { HoloPanel } from '../render/HoloPanel';
import { ReconstructCanvas } from '../render/Reconstruct';
import { PRESETS, SIGNATURE } from '../render/techniques';
import { useNav } from '../navigation/Navigator';
import { useQuality } from '../performance/Quality';

/**
 * Summoning Roxi: she forms from light (the signature arrival). Her voice,
 * memory and tools are the website's (one Roxi); the native layer is her
 * presence and her way in.
 */
export function RoxiScreen() {
  const nav = useNav();
  const { width } = useWindowDimensions();
  const { reducedMotion } = useQuality();
  const image = useImage(require('../../assets/roxi/roxi.webp'));
  const progress = useSharedValue(reducedMotion ? 1 : 0);
  useEffect(() => {
    if (!reducedMotion) progress.value = withDelay(120, withTiming(1, { duration: PRESETS.roxi, easing: Easing.bezier(0.2, 0, 0, 1) }));
  }, [progress, reducedMotion]);
  const w = width - space[4] * 2;
  return (
    <Screen overline="Presencia" title="Roxi" accent={color.roxi}>
      <View style={{ alignItems: 'center', height: w * 0.95 }}>
        <ReconstructCanvas image={image} progress={progress} technique={SIGNATURE.arrive} accent={color.roxi} width={w * 0.62} height={w * 0.95} fit="contain" origin={[0.5, 0.35]} />
      </View>
      <HoloPanel depth="focus" accent={color.roxi} focus style={{ padding: space[4], gap: space[3] }}>
        <T variant="headline">Hola, soy Roxi.</T>
        <T variant="caption" tone="secondary">Te ayudo a buscar, publicar y resolver. Preparo las cosas y tú decides: nunca publico ni pago por ti.</T>
        <Button label="Hablar con Roxi" icon="roxi" accent={color.roxi} onPress={() => nav.push({ name: 'web', path: '/?roxi=open' })} />
      </HoloPanel>
    </Screen>
  );
}
