/* eslint-disable ts-patterns/no-magic-numbers -- a geometry table: the gem's points and facets in its 100 × 100 drawing box */
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Line, LinearGradient, Polygon, Stop } from 'react-native-svg';
import { Icon } from '../design/icons';
import { aether } from '../design/aether';

/** The gem in a 100 × 100 box: an outer hexagon, an inner table, and the facets that join them. */
const VIEW_BOX = '0 0 100 100';
const OUTER = '50,4 90,27 90,73 50,96 10,73 10,27';
const INNER = '50,24 72,37 72,63 50,76 28,63 28,37';
const FACETS: readonly (readonly [number, number, number, number])[] = [
  [50, 4, 50, 24], [90, 27, 72, 37], [90, 73, 72, 63], [50, 96, 50, 76], [10, 73, 28, 63], [10, 27, 28, 37],
];
const EDGE_WIDTH = 1.5;
const FACET_WIDTH = 0.75;
const FACET_OPACITY = 0.22;
const CORE_OPACITY = 0.16;
const CORE_EDGE_OPACITY = 0.55;
const ICON_SHARE = 0.34;

/**
 * A district's emblem in the Aether look (AX-04, VISUAL_LANGUAGE §6): a
 * crystal of obsidian with a champagne edge and the district's accent at its
 * core, its symbol inside. Drawn as vectors, still, with no GPU canvas, so a
 * screen can hold many. `lit` brightens the edge for a selected district.
 */
export function CrystalEmblem({ accent, glyph, size, lit = false }: { accent: string; glyph: string; size: number; lit?: boolean }) {
  const key = accent.replace('#', '');
  const edgeId = `crystal-edge-${key}-${lit ? 'lit' : 'rest'}`;
  const bodyId = `crystal-body-${key}`;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={size} height={size} viewBox={VIEW_BOX} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={edgeId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={lit ? aether.champagneLit : aether.champagneRest} />
            <Stop offset="1" stopColor={aether.champagneDeep} />
          </LinearGradient>
          <LinearGradient id={bodyId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={aether.obsidian3} />
            <Stop offset="1" stopColor={aether.obsidian1} />
          </LinearGradient>
        </Defs>
        <Polygon points={OUTER} fill={`url(#${bodyId})`} stroke={`url(#${edgeId})`} strokeWidth={EDGE_WIDTH} strokeLinejoin="round" />
        <Polygon points={INNER} fill={accent} fillOpacity={CORE_OPACITY} stroke={accent} strokeOpacity={CORE_EDGE_OPACITY} strokeWidth={1} strokeLinejoin="round" />
        {FACETS.map(([x1, y1, x2, y2]) => (
          <Line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={aether.silverText} strokeOpacity={FACET_OPACITY} strokeWidth={FACET_WIDTH} />
        ))}
      </Svg>
      <Icon name={glyph} size={size * ICON_SHARE} tint={accent} />
    </View>
  );
}
