import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Image, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useSharedValue, withDelay, withTiming, Easing, type SharedValue } from 'react-native-reanimated';
import { Screen } from './Screen';
import { Button } from '../design/controls';
import { Icon } from '../design/icons';
import { T } from '../design/Text';
import { color, radius, space } from '../design/tokens';
import { DISTRICTS, type District } from '../districts/registry';
import { DistrictObject } from '../render/DistrictObject';
import { HoloPanel } from '../render/HoloPanel';
import { RoxiHologram } from '../render/RoxiHologram';
import { useNav, type Rect } from '../navigation/Navigator';
import { fetchGoMap, fetchLive, type GoLiveMap, type LiveItem } from '../business/public';
import { fetchFeed, type FeedItem } from '../business/feed';
import { useAuth } from '../business/auth';
import { useRoxi } from '../roxi/voice-context';
import { useQuality } from '../performance/Quality';
import { IS_DEV_VARIANT } from '../core/env';

type ViewRef = ComponentRef<typeof View>;

/**
 * Home: Roxi present and one tap away; the essential districts as objects you
 * can swipe through; what is new near you, from the real Mercadito; every
 * district; and what is happening now. Everything shown is real (an empty
 * list says it is empty), and every tile opens something that works.
 */
const ROXI_STAGE = 250;
const ROXI_FIGURE = 220;
const CARD_SHARE = 0.72;
const CARD_OBJECT = 132;
const NEW_TILE = 136;
const GRID_COLUMNS = 3;
const FORM_MS = 1500;
const FORM_DELAY_MS = 300;
/** Her arrival curve: quick to begin, long to settle. */
const ARRIVE = Easing.bezier(0.2, 0, 0, 1);
/** Roxi stands in the left of her stage; her words take the right. */
const ROXI_SHIFT = 0.22;
const ROXI_TEXT_SHARE = 0.42;
const SIDE_GUTTERS = 2;
const LIVE_LINES = 4;
const NEW_ITEMS = 10;

export function Home({ tilt }: { tilt: SharedValue<{ x: number; y: number }> }) {
  const nav = useNav();
  const auth = useAuth();
  const roxi = useRoxi();
  const { width } = useWindowDimensions();
  const { reducedMotion } = useQuality();
  const [live, setLive] = useState<LiveItem[] | null>(null);
  const [go, setGo] = useState<GoLiveMap | null>(null);
  const [fresh, setFresh] = useState<FeedItem[] | null>(null);
  const form = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    const load = async () => {
      const [l, g, f] = await Promise.allSettled([fetchLive(), fetchGoMap(), fetchFeed('mercadito')]);
      setLive(l.status === 'fulfilled' ? l.value : []);
      setGo(g.status === 'fulfilled' ? g.value : null);
      setFresh(f.status === 'fulfilled' ? f.value.items.slice(0, NEW_ITEMS) : []);
    };
    void load();
    if (!reducedMotion) form.value = withDelay(FORM_DELAY_MS, withTiming(1, { duration: FORM_MS, easing: ARRIVE }));
  }, [form, reducedMotion]);

  const essentials = DISTRICTS.filter((d) => d.essential);
  const others = DISTRICTS.filter((d) => !d.essential);
  const cardWidth = width * CARD_SHARE;
  const gridTile = (width - space[4] * SIDE_GUTTERS - space[3] * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  const name = auth.member?.firstName;
  const talking = roxi.phase === 'live';

  return (
    <Screen overline={IS_DEV_VARIANT ? 'YAVAYA · STAGING' : 'YAVAYA'} title={name ? `Hola, ${name}` : '¿Qué necesitas hoy?'}>
      <HoloPanel tilt={tilt} accent={color.roxi} focus={talking} onPress={() => nav.push({ name: 'roxi' })} accessibilityLabel="Roxi. Toca para hablar con ella" style={{ height: ROXI_STAGE, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: -width * ROXI_SHIFT, top: 0 }} pointerEvents="none">
          <RoxiHologram width={width} height={ROXI_STAGE} figureHeight={ROXI_FIGURE} top={space[2]} level={roxi.level} state={roxi.state} form={form} tilt={tilt} />
        </View>
        <View style={{ position: 'absolute', right: space[4], top: space[4], bottom: space[4], width: width * ROXI_TEXT_SHARE, justifyContent: 'space-between' }}>
          <View style={{ gap: space[1] }}>
            <T variant="micro" color={color.roxi}>Roxi</T>
            <T variant="headline">{talking ? 'Te está escuchando' : 'Pídeme lo que necesites'}</T>
            <T variant="caption" tone="secondary">Busco, preparo tus publicaciones y te llevo a donde vas. Tú decides.</T>
          </View>
          <Button label={talking ? 'Volver con Roxi' : 'Hablar'} icon="roxi" accent={color.roxi} onPress={() => nav.push({ name: 'roxi' })} />
        </View>
      </HoloPanel>

      <T variant="micro" tone="tertiary">Lo esencial</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardWidth + space[3]} decelerationRate="fast" contentContainerStyle={{ gap: space[3], paddingRight: space[4] }} style={{ marginHorizontal: -space[4] }}>
        <View style={{ width: space[1] }} />
        {essentials.map((d) => <EssentialCard key={d.id} d={d} width={cardWidth} tilt={tilt} />)}
      </ScrollView>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <T variant="micro" tone="tertiary">Nuevo en Mercadito</T>
        <Pressable accessibilityRole="button" onPress={() => nav.push({ name: 'district', id: 'mercadito' })}>
          <T variant="caption" color={color.signal}>Ver todo</T>
        </Pressable>
      </View>
      {fresh === null ? <T variant="caption" tone="secondary">Consultando…</T> : null}
      {fresh && fresh.length === 0 ? <T variant="caption" tone="secondary">Todavía no hay anuncios nuevos. Aquí solo aparece lo que de verdad se publica.</T> : null}
      {fresh && fresh.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          {fresh.map((item) => (
            <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.detail}`} onPress={() => nav.push({ name: 'web', path: item.path })} style={{ width: NEW_TILE, gap: space[1] }}>
              {item.image ? (
                <Image source={{ uri: item.image }} style={{ width: NEW_TILE, height: NEW_TILE, borderRadius: radius.panel, borderWidth: 1, borderColor: color.hairlineStrong }} resizeMode="cover" />
              ) : (
                <View style={{ width: NEW_TILE, height: NEW_TILE, borderRadius: radius.panel, backgroundColor: color.deep }} />
              )}
              <T variant="caption" numberOfLines={1}>{item.title}</T>
              <T variant="data" color={DISTRICTS[0]!.accent} numberOfLines={1}>{item.detail}</T>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      <T variant="micro" tone="tertiary">Todos los distritos</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
        {others.map((d) => (
          <HoloPanel key={d.id} lite tilt={tilt} accent={d.accent} depth="structure" onPress={() => nav.push({ name: 'district', id: d.id })} accessibilityLabel={`${d.name.es}. ${d.line.es}`} style={{ width: gridTile, paddingVertical: space[3], alignItems: 'center', gap: space[2] }}>
            <Icon name={d.glyph} tint={d.accent} />
            <T variant="caption" numberOfLines={1}>{d.name.es}</T>
          </HoloPanel>
        ))}
      </View>

      <T variant="micro" tone="tertiary">Ahora en Yavaya</T>
      <HoloPanel lite tilt={tilt} depth="structure" style={{ padding: space[4], gap: space[2] }}>
        {live === null ? <T variant="caption" tone="secondary">Consultando…</T> : null}
        {live && live.length === 0 ? <T variant="caption" tone="secondary">Sin actividad reciente. Aquí solo aparece lo que de verdad pasa.</T> : null}
        {live?.slice(0, LIVE_LINES).map((item) => <T key={item.id} variant="caption">{item.text}</T>)}
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

function EssentialCard({ d, width, tilt }: { d: District; width: number; tilt: SharedValue<{ x: number; y: number }> }) {
  const nav = useNav();
  const ref = useRef<ViewRef>(null);
  const open = () => {
    const view = ref.current;
    if (!view) return nav.push({ name: 'district', id: d.id });
    view.measureInWindow((x: number, y: number, w: number, h: number) => nav.push({ name: 'district', id: d.id }, { origin: { x, y, width: w, height: h } as Rect }));
  };
  return (
    <View ref={ref} collapsable={false} style={{ width }}>
      <HoloPanel tilt={tilt} accent={d.accent} focus onPress={open} accessibilityLabel={`${d.name.es}. ${d.line.es}`} style={{ padding: space[4], gap: space[2], alignItems: 'center' }}>
        <DistrictObject accent={d.accent} size={CARD_OBJECT} focus={1} interactive={false} />
        <T variant="headline">{d.name.es}</T>
        <T variant="caption" tone="secondary" numberOfLines={2} style={{ textAlign: 'center' }}>{d.line.es}</T>
        <T variant="micro" color={d.accent}>Entrar</T>
      </HoloPanel>
    </View>
  );
}
