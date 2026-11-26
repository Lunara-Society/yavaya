import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Image, View } from 'react-native';
import { Screen } from './Screen';
import { Button, Field } from '../design/controls';
import { T } from '../design/Text';
import { color, radius, space } from '../design/tokens';
import { districtById, type District as DistrictInfo } from '../districts/registry';
import { DistrictObject } from '../render/DistrictObject';
import { HoloPanel } from '../render/HoloPanel';
import { useNav } from '../navigation/Navigator';
import { ago, fetchFeed, hasFeed, type FeedItem } from '../business/feed';
import { useAuth } from '../business/auth';
import type { SharedValue } from 'react-native-reanimated';

/**
 * A district, native: its object, its actions, and its newest items exactly as
 * its website page lists them (business/feed.ts). Opening an item, publishing
 * or writing to someone opens the real page inside the app, signed in.
 * Districts the server does not list natively yet open their full screen.
 */
const PUBLISH: Record<string, { label: string; path: string }> = {
  mercadito: { label: 'Publicar un anuncio', path: '/mercadito/publish' },
  work: { label: 'Publicar un trabajo', path: '/work/posts/new' },
  community: { label: 'Pedir u ofrecer ayuda', path: '/community/new' },
  services: { label: 'Pedir un servicio', path: '/services/new' },
  animals: { label: 'Reportar perdido o encontrado', path: '/animals/lost' },
};
const PHOTO_DISTRICTS = new Set(['mercadito', 'animals']);
const HERO_OBJECT = 150;
const TILE_GAP = space[3];
const PHOTO_RATIO = 1;
const LINE_GAP = 2;

export function District({ id, tilt }: { id: string; tilt: SharedValue<{ x: number; y: number }> }) {
  const nav = useNav();
  const d = districtById(id);
  if (!d) return <Screen title="Distrito"><T>No encontrado.</T></Screen>;
  const publish = PUBLISH[d.id];
  return (
    <Screen overline="Distrito" title={d.name.es} accent={d.accent}>
      <HoloPanel tilt={tilt} accent={d.accent} focus style={{ padding: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
        <DistrictObject accent={d.accent} size={HERO_OBJECT} focus={1} />
        <View style={{ flex: 1, gap: space[2] }}>
          <T variant="headline">{d.line.es}</T>
          {publish ? <Button label={publish.label} accent={d.accent} onPress={() => nav.push({ name: 'web', path: publish.path })} /> : null}
          <Button label={`Abrir ${d.name.es} completo`} kind="secondary" onPress={() => nav.push({ name: 'web', path: d.webPath })} />
        </View>
      </HoloPanel>
      {hasFeed(d.id) ? <DistrictFeed d={d} tilt={tilt} /> : <NotNativeYet d={d} />}
    </Screen>
  );
}

function DistrictFeed({ d, tilt }: { d: DistrictInfo; tilt: SharedValue<{ x: number; y: number }> }) {
  const nav = useNav();
  const auth = useAuth();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (nextPage: number, q: string) => {
    if (!hasFeed(d.id)) return;
    setBusy(true);
    setFailed(false);
    try {
      const feed = await fetchFeed(d.id, nextPage, q || undefined);
      setItems((current) => (nextPage === 1 ? feed.items : [...(current ?? []), ...feed.items]));
      setHasMore(feed.hasMore);
      setPage(feed.page);
      setSignedOut(Boolean(feed.signedOut));
    } catch {
      setFailed(true);
      setItems((current) => current ?? []);
    } finally {
      setBusy(false);
    }
  }, [d.id]);

  useEffect(() => {
    void load(1, '');
  }, [load, auth.status]);

  const photos = PHOTO_DISTRICTS.has(d.id);
  return (
    <View style={{ gap: space[3] }}>
      {d.id === 'mercadito' ? (
        <Field placeholder="Buscar en Mercadito" value={query} onChangeText={setQuery} returnKeyType="search" onSubmitEditing={() => void load(1, query.trim())} />
      ) : null}
      <T variant="micro" tone="tertiary">{query ? `Resultados para “${query}”` : 'Lo más nuevo'}</T>
      {items === null ? <ActivityIndicator color={d.accent} /> : null}
      {failed ? <T variant="caption" color={color.caution}>No se pudo cargar. Revisa tu conexión y vuelve a intentarlo.</T> : null}
      {signedOut ? <T variant="caption" tone="secondary">Comunidad muestra sus publicaciones a vecinos con cuenta. Entra desde Ajustes para verlas.</T> : null}
      {items && items.length === 0 && !failed && !signedOut ? (
        <HoloPanel depth="structure" style={{ padding: space[4], gap: space[2] }}>
          <T variant="label">Todavía no hay nada aquí.</T>
          <T variant="caption" tone="secondary">Aquí solo aparece lo que de verdad se publica. Puedes ser la primera persona.</T>
        </HoloPanel>
      ) : null}
      {photos ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP }}>
          {items?.map((item) => <PhotoCard key={item.id} item={item} accent={d.accent} tilt={tilt} onOpen={() => nav.push({ name: 'web', path: item.path })} />)}
        </View>
      ) : (
        <View style={{ gap: TILE_GAP }}>
          {items?.map((item) => <TextCard key={item.id} item={item} accent={d.accent} tilt={tilt} onOpen={() => nav.push({ name: 'web', path: item.path })} />)}
        </View>
      )}
      {hasMore ? <Button label={busy ? 'Cargando…' : 'Ver más'} kind="secondary" onPress={() => void load(page + 1, query.trim())} disabled={busy} /> : null}
    </View>
  );
}

function PhotoCard({ item, accent, tilt, onOpen }: { item: FeedItem; accent: string; tilt: SharedValue<{ x: number; y: number }>; onOpen: () => void }) {
  return (
    <View style={{ width: '47.5%' }}>
      <HoloPanel lite tilt={tilt} accent={accent} focus={item.featured} onPress={onOpen} accessibilityLabel={`${item.title}. ${item.detail}`} style={{ padding: space[2], gap: space[2] }}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={{ width: '100%', aspectRatio: PHOTO_RATIO, borderRadius: radius.control, backgroundColor: color.deep }} resizeMode="cover" />
        ) : (
          <View style={{ width: '100%', aspectRatio: PHOTO_RATIO, borderRadius: radius.control, backgroundColor: color.deep }} />
        )}
        <View style={{ paddingHorizontal: space[1], paddingBottom: space[1], gap: LINE_GAP }}>
          <T variant="label" numberOfLines={1}>{item.title}</T>
          <T variant="data" color={accent} numberOfLines={1}>{item.detail}</T>
          <T variant="caption" tone="tertiary" numberOfLines={1}>{[item.place, ago(item.at)].filter(Boolean).join(' · ')}</T>
        </View>
      </HoloPanel>
    </View>
  );
}

function TextCard({ item, accent, tilt, onOpen }: { item: FeedItem; accent: string; tilt: SharedValue<{ x: number; y: number }>; onOpen: () => void }) {
  return (
    <HoloPanel lite tilt={tilt} accent={accent} onPress={onOpen} accessibilityLabel={item.title} style={{ padding: space[4], gap: space[1] }}>
      <T variant="label" numberOfLines={2}>{item.title}</T>
      {item.detail ? <T variant="caption" color={accent} numberOfLines={2}>{item.detail}</T> : null}
      <T variant="caption" tone="tertiary" numberOfLines={1}>{[item.place, ago(item.at)].filter(Boolean).join(' · ')}</T>
    </HoloPanel>
  );
}

function NotNativeYet({ d }: { d: DistrictInfo }) {
  return (
    <HoloPanel depth="structure" style={{ padding: space[4], gap: space[2] }}>
      <T variant="micro" tone="tertiary">{d.name.es} hoy</T>
      <T variant="caption" tone="secondary">
        {d.name.es} funciona completo en su pantalla dentro de la app, con tu misma cuenta. Su lista nativa llega en una próxima versión.
      </T>
    </HoloPanel>
  );
}
