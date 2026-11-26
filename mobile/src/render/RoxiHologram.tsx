import { Canvas, Fill, ImageShader, Shader, useClock, useImage } from '@shopify/react-native-skia';
import { Image, View } from 'react-native';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { FX } from './effects';

const FIGURE = require('../../assets/roxi/roxi.webp');
const DEPTH = require('../../assets/roxi/roxi-depth.webp');
/** Her picture's own proportions (720 × 1544). */
export const ROXI_ASPECT = 720 / 1544;

/**
 * Roxi as a hologram (shaders.ts, ROXI_HOLO_SKSL): her own picture, cut out of
 * the dark by its depth map, standing on a projector disc. `level` is her live
 * voice (0..1), `state` what she is doing (0 resting, 1 listening, 2 thinking,
 * 3 speaking), `form` builds her from light (0..1). `figureHeight` is her
 * height inside the canvas; she stands centred with room below for the disc.
 */
export function RoxiHologram({ width, height, figureHeight, top, level, state, form, tilt }: {
  width: number;
  height: number;
  figureHeight: number;
  top: number;
  level: SharedValue<number>;
  state: SharedValue<number>;
  form: SharedValue<number>;
  tilt?: SharedValue<{ x: number; y: number }>;
}) {
  const figure = useImage(FIGURE);
  const depth = useImage(DEPTH);
  const clock = useClock();
  const fw = figureHeight * ROXI_ASPECT;
  const box = { x: (width - fw) / 2, y: top, width: fw, height: figureHeight };
  const uniforms = useDerivedValue(() => ({
    size: [width, height],
    box: [box.x, box.y, box.width, box.height],
    time: clock.value / 1000,
    level: level.value,
    state: state.value,
    form: form.value,
    tilt: tilt ? [tilt.value.x * 14, tilt.value.y * 10] : [0, 0],
  }));
  // Without the shader (a device that cannot compile it) she is still there, as her picture.
  if (!FX.roxi || !figure || !depth) {
    return (
      <View style={{ width, height }} pointerEvents="none">
        <Image source={FIGURE} style={{ position: 'absolute', left: box.x, top: box.y, width: box.width, height: box.height }} resizeMode="contain" />
      </View>
    );
  }
  return (
    <Canvas style={{ width, height }} pointerEvents="none">
      <Fill>
        <Shader source={FX.roxi} uniforms={uniforms}>
          <ImageShader image={figure} fit="fill" rect={box} tx="decal" ty="decal" />
          <ImageShader image={depth} fit="fill" rect={box} tx="decal" ty="decal" />
        </Shader>
      </Fill>
    </Canvas>
  );
}
