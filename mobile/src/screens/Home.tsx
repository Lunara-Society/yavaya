import { useEffect, useRef, useState, type ComponentRef } from 'react';

type ViewRef = ComponentRef<typeof View>;
import { Pressable, View } from 'react-native';
import { Screen } from './Screen';
import { Button, Row } from '../design/controls';
import { Icon } from '../design/icons';
import { T } from '../design/Text';
import { color, space } from '../design/tokens';
import { DISTRICTS, type District } from '../districts/registry';
import { DistrictObject } from '../render/DistrictObject';
import { HoloPanel } from '../render/HoloPanel';
import { useNav, type Rect } from '../navigation/Navigator';
import { fetchGoMap, fetchLive, type GoLiveMap, type LiveItem } from '../business/public';
import { IS_DEV_VARIANT } from '../core/env';
import type { SharedValue } from 'react-native-reanimated';

/**
 * Home: the essential services first, under the thumb; then every district;
 * then what is happening now, from the live server (never invented).
 */
export function Home({ tilt }: { tilt: SharedValue<{ x: number; y: number }> }) {
  const nav = useNav();
  const [hero, setHero] = useState<District>(DISTRICTS[0]);
  const [live, setLive] = useState<LiveItem[] | null>(null);
  const [go, setGo] = useState<GoLiveMap | null>(null);
  const heroRef = useRef<ViewRef>(null);
  useEffect(() => {
    fetchLive().then(setLive).catch(() => setLive([]));
    fetchGoMap().then(setGo).catch(() => setGo(null));
  }, []);
  const open = (d: District, view?: ViewRef | null) => {
    if (!view) return nav.push({ name: 'district', id: d.id });
    view.measureInWindow((x: number, y: number, width: number, height: number) => nav.push({ name: 'district', id: d.id }, { origin: { x, y, width, height } as Rect }));
  };
  const essentials = DISTRICTS.filter((d) => d.essential);
  const others = DISTRICTS.filter((d) => !d.essential);
  return (
    <Screen overline={IS_DEV_VARIANT ? 'YAVAYA · STAGING' : 'YAVAYA'} title="¿Qué necesitas hoy?">
      <HoloPanel tilt={tilt} accent={hero.accent} focus style={{ padding: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <View ref={heroRef} collapsable={false}>
          <DistrictObject accent={hero.accent} size={132} focus={1} />
        </View>
        <View style={{ flex: 1, gap: space[2] }}>
          <T variant="micro" color={hero.accent}>Distrito</T>
          <T variant="headline">{hero.name.es}</T>
          <T variant="caption" tone="secondary">{hero.line.es}</T>
          <Button label="Entrar" kind="primary" accent={hero.accent} onPress={() => open(hero, heroRef.current)} />
        </View>
      </HoloPanel>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
        {essentials.map((d) => (
          <EssentialTile key={d.id} d={d} tilt={tilt} selected={hero.id === d.id} onFocus={() => setHero(d)} onOpen={(v) => open(d, v)} />
        ))}
      </View>
      <T variant="micro" tone="tertiary">Todos los distritos</T>
      <HoloPanel tilt={tilt} depth="structure" style={{ paddingHorizontal: space[4] }}>
        {others.map((d) => (
          <Row key={d.id} icon={d.glyph} title={d.name.es} detail={d.line.es} onPress={() => nav.push({ name: 'district', id: d.id })} />
        ))}
      </HoloPanel>
      <T variant="micro" tone="tertiary">Ahora en Yavaya</T>
      <HoloPanel tilt={tilt} depth="structure" style={{ padding: space[4], gap: space[2] }}>
        {live === null ? <T variant="caption" tone="secondary">Consultando…</T> : null}
        {live && live.length === 0 ? <T variant="caption" tone="secondary">Sin actividad reciente. Aquí solo aparece lo que de verdad pasa.</T> : null}
        {live?.slice(0, 4).map((item) => <T key={item.id} variant="caption">{item.text}</T>)}
        {go ? (
          <Pressable accessibilityRole="button" onPress={() => nav.push({ name: 'map' })} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingTop: space[2] }}>
            <Icon name="go" size={20} tint={color.textSecondary} />
            <T variant="data" tone="secondary" style={{ flex: 1 }}>
              {go.stores.length} tiendas · {go.activeDeliveries} entregas activas
            </T>
            <Icon name="chevron" size={16} tint={color.textTertiary} />
          </Pressable>
        ) : null}
      </HoloPanel>
    </Screen>
  );
}

function EssentialTile({ d, tilt, selected, onFocus, onOpen }: { d: District; tilt: SharedValue<{ x: number; y: number }>; selected: boolean; onFocus: () => void; onOpen: (v: ViewRef | null) => void }) {
  const ref = useRef<ViewRef>(null);
  return (
    <View ref={ref} collapsable={false} style={{ width: '47.5%' }}>
      <HoloPanel tilt={tilt} accent={d.accent} focus={selected} onPress={() => (selected ? onOpen(ref.current) : onFocus())} accessibilityLabel={`${d.name.es}. ${d.line.es}`} style={{ padding: space[4], gap: space[2], minHeight: 104 }}>
        <Icon name={d.glyph} tint={selected ? d.accent : color.textSecondary} />
        <T variant="label">{d.name.es}</T>
        <T variant="caption" tone="tertiary" numberOfLines={1}>{d.line.es}</T>
      </HoloPanel>
    </View>
  );
}
