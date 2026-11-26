import { Canvas, Circle, Group, Path, Skia, useClock, BlurMask } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { View } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import { COUNTRIES } from '../districts/geo';
import { color } from '../design/tokens';

export type GeoPoint = { id: string; latitude: number; longitude: number; active: boolean };

const BOUNDS = { minLon: -118.5, maxLon: -77, minLat: 7, maxLat: 33 };

/**
 * Geographic visualisation (Chapter 04): Mexico and Central America as lines
 * of light (Natural Earth outlines), with real points (YavayaGo stores from the
 * public live map). Equirectangular projection corrected for latitude.
 */
export function GeoMap({ width, height, points, accent = color.signal, focusIso }: { width: number; height: number; points: GeoPoint[]; accent?: string; focusIso?: string }) {
  const clock = useClock();
  const project = useMemo(() => {
    const k = Math.cos((20 * Math.PI) / 180);
    const sx = (BOUNDS.maxLon - BOUNDS.minLon) * k;
    const sy = BOUNDS.maxLat - BOUNDS.minLat;
    const scale = Math.min(width / sx, height / sy) * 0.94;
    const ox = (width - sx * scale) / 2;
    const oy = (height - sy * scale) / 2;
    return (lon: number, lat: number) => [ox + (lon - BOUNDS.minLon) * k * scale, oy + (BOUNDS.maxLat - lat) * scale] as const;
  }, [width, height]);
  const paths = useMemo(
    () =>
      COUNTRIES.map((c) => {
        const b = Skia.PathBuilder.Make();
        for (const ring of c.rings) {
          ring.forEach(([lon, lat], i) => (i === 0 ? b.moveTo(...project(lon, lat)) : b.lineTo(...project(lon, lat))));
          b.close();
        }
        return { iso: c.iso, path: b.build() };
      }),
    [project],
  );
  const pulse = useDerivedValue(() => 3 + 5 * ((clock.value / 1600) % 1));
  const pulseOpacity = useDerivedValue(() => 1 - ((clock.value / 1600) % 1));
  return (
    <View style={{ width, height }} accessible accessibilityLabel={`Mapa con ${points.length} puntos`}>
      <Canvas style={{ width, height }}>
        {paths.map(({ iso, path }) => (
          <Group key={iso}>
            <Path path={path} color="rgba(156,201,255,0.05)" style="fill" />
            <Path path={path} color={iso === focusIso ? accent : 'rgba(156,201,255,0.55)'} style="stroke" strokeWidth={1}>
              <BlurMask blur={iso === focusIso ? 3 : 1.5} style="solid" />
            </Path>
          </Group>
        ))}
        {points.map((pt) => {
          const [x, y] = project(pt.longitude, pt.latitude);
          return (
            <Group key={pt.id}>
              <Circle cx={x} cy={y} r={pulse} color={accent} opacity={pulseOpacity} style="stroke" strokeWidth={1} />
              <Circle cx={x} cy={y} r={2.5} color={pt.active ? accent : color.textTertiary} />
            </Group>
          );
        })}
      </Canvas>
    </View>
  );
}
