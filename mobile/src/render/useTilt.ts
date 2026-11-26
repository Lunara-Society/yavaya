import { Platform } from 'react-native';
import { SensorType, useAnimatedSensor, useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';

/**
 * Device tilt in [-1, 1] for parallax, smoothed on the UI thread. Returns a
 * still value when parallax is off, on the web, or under reduced motion.
 */
export function useTilt(enabled: boolean): SharedValue<{ x: number; y: number }> {
  const sensor = useAnimatedSensor(SensorType.ROTATION, { interval: 16 });
  const smooth = useSharedValue({ x: 0, y: 0 });
  const live = enabled && Platform.OS !== 'web';
  return useDerivedValue(() => {
    if (!live) return { x: 0, y: 0 };
    const { roll, pitch } = sensor.sensor.value;
    const tx = Math.max(-1, Math.min(1, roll / 0.6));
    const ty = Math.max(-1, Math.min(1, (pitch - 0.5) / 0.6));
    smooth.value = { x: smooth.value.x + (tx - smooth.value.x) * 0.12, y: smooth.value.y + (ty - smooth.value.y) * 0.12 };
    return smooth.value;
  });
}
