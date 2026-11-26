import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Screen } from './Screen';
import { Field, Row } from '../design/controls';
import { T } from '../design/Text';
import { space } from '../design/tokens';
import { DISTRICTS } from '../districts/registry';
import { HoloPanel } from '../render/HoloPanel';
import { useNav } from '../navigation/Navigator';
import { searchPlaces, type Place } from '../business/public';

const COUNTRY_ISO: Record<string, string> = { 'na.mx': 'MEX', 'ca.gt': 'GTM', 'ca.bz': 'BLZ', 'ca.sv': 'SLV', 'ca.hn': 'HND', 'ca.ni': 'NIC', 'ca.cr': 'CRI', 'ca.pa': 'PAN' };

/** Native search: districts by name, and real places from the server's geography. */
export function Search({ q: initial }: { q?: string }) {
  const nav = useNav();
  const [q, setQ] = useState(initial ?? '');
  const [places, setPlaces] = useState<Place[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) return setPlaces([]);
    const t = setTimeout(() => searchPlaces(q.trim()).then(setPlaces).catch(() => setPlaces([])), 250);
    return () => clearTimeout(t);
  }, [q]);
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const districts = q ? DISTRICTS.filter((d) => norm(`${d.name.es} ${d.line.es}`).includes(norm(q))) : DISTRICTS.filter((d) => d.essential);
  return (
    <Screen overline="Buscar" title="Encuentra">
      <Field value={q} onChangeText={setQ} placeholder="Distrito, ciudad o barrio" autoFocus returnKeyType="search" accessibilityLabel="Buscar" />
      {districts.length ? (
        <HoloPanel depth="panel" style={{ paddingHorizontal: space[4] }}>
          {districts.map((d) => (
            <Row key={d.id} icon={d.glyph} title={d.name.es} detail={d.line.es} onPress={() => nav.push({ name: 'district', id: d.id })} />
          ))}
        </HoloPanel>
      ) : null}
      {places.length ? (
        <View style={{ gap: space[2] }}>
          <T variant="micro" tone="tertiary">Lugares</T>
          <HoloPanel depth="panel" style={{ paddingHorizontal: space[4] }}>
            {places.slice(0, 8).map((p) => (
              <Row key={p.id} icon="location" title={p.name} detail={`${p.kind} · ${p.context}`} onPress={() => nav.push({ name: 'map', iso: COUNTRY_ISO[p.code.split('.').slice(0, 2).join('.')] })} />
            ))}
          </HoloPanel>
        </View>
      ) : null}
    </Screen>
  );
}
