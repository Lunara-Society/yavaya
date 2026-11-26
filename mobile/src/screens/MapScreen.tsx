import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Screen } from './Screen';
import { T } from '../design/Text';
import { color, districtAccent, space } from '../design/tokens';
import { GeoMap } from '../render/GeoMap';
import { HoloPanel } from '../render/HoloPanel';
import { fetchGoMap, type GoLiveMap } from '../business/public';

/** The map hologram with YavayaGo's real public live map (stores and totals; never a person). */
export function MapScreen({ iso }: { iso?: string }) {
  const { width } = useWindowDimensions();
  const [data, setData] = useState<GoLiveMap | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    fetchGoMap().then(setData).catch(() => setFailed(true));
  }, []);
  const w = width - space[4] * 2;
  const drivers = data?.driversOnline.count ?? (data?.driversOnline.fewerThan ? `menos de ${data.driversOnline.fewerThan}` : '—');
  return (
    <Screen overline="Mapa" title="YavayaGo en vivo" accent={districtAccent.yavayago}>
      <HoloPanel depth="focus" accent={districtAccent.yavayago} focus style={{ padding: space[2], alignItems: 'center' }}>
        <GeoMap width={w - space[4]} height={(w - space[4]) * 0.72} accent={districtAccent.yavayago} focusIso={iso}
          points={(data?.stores ?? []).map((s) => ({ id: s.id, latitude: s.latitude, longitude: s.longitude, active: s.isOpen }))} />
      </HoloPanel>
      <HoloPanel depth="panel" style={{ padding: space[4], gap: space[2] }}>
        {failed ? <T variant="caption" tone="secondary">No se pudo consultar el mapa. Revisa tu conexión.</T> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T variant="caption" tone="secondary">Tiendas en el mapa</T><T variant="data">{data ? data.stores.length : '…'}</T></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T variant="caption" tone="secondary">Entregas activas</T><T variant="data">{data ? data.activeDeliveries : '…'}</T></View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T variant="caption" tone="secondary">Repartidores en línea</T><T variant="data">{data ? String(drivers) : '…'}</T></View>
        <T variant="caption" tone="tertiary" color={color.textTertiary}>El mapa nunca muestra dónde está una persona.</T>
      </HoloPanel>
    </Screen>
  );
}
