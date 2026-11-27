import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { View } from 'react-native';
import { Screen } from './Screen';
import { Chip, Row, Toggle } from '../design/controls';
import { T } from '../design/Text';
import { space } from '../design/tokens';
import { HoloPanel } from '../render/HoloPanel';
import { useConfig } from '../core/config';
import { SERVER_URL, VARIANT } from '../core/env';
import { useNav } from '../navigation/Navigator';
import { KEYS, writeJson } from '../core/store';
import { cue } from '../motion/cues';
import { AccountPanel } from './Account';

/** Sound, vibration and the look are the person's choice; nothing is mandatory. */
export function Settings({ onReplayAwakening }: { onReplayAwakening: () => void }) {
  const { prefs, setPrefs, flags } = useConfig();
  const nav = useNav();
  return (
    <Screen overline="Ajustes" title="Tu Yavaya">
      <AccountPanel />
      <HoloPanel depth="panel" style={{ paddingHorizontal: space[4] }}>
        <Toggle label="Sonidos" icon="sound" value={prefs.sound} onChange={(sound) => setPrefs({ sound })} />
        {prefs.sound ? (
          <View style={{ flexDirection: 'row', gap: space[2], paddingBottom: space[2] }}>
            {([['Bajo', 0.3], ['Medio', 0.6], ['Alto', 1]] as const).map(([label, v]) => (
              <Chip key={label} label={label} selected={prefs.volume === v} onPress={() => { setPrefs({ volume: v }); setTimeout(() => cue('success'), 50); }} />
            ))}
          </View>
        ) : null}
        <Toggle label="Vibración" icon="haptic" value={prefs.haptics} onChange={(haptics) => setPrefs({ haptics })} />
        <Toggle label="Synapse (apágalo para la vista Clásica)" icon="lab" value={prefs.look !== 'classic'} onChange={(on) => setPrefs({ look: on ? 'synapse' : 'classic' })} />
        {prefs.look !== 'classic' ? (
          <Toggle label="Aspecto nuevo Aether (prueba)" icon="lab" value={prefs.look === 'aether'} onChange={(on) => setPrefs({ look: on ? 'aether' : 'synapse' })} />
        ) : null}
      </HoloPanel>
      <HoloPanel depth="panel" style={{ paddingHorizontal: space[4] }}>
        <Row icon="roxi" title="Ver el despertar otra vez" onPress={() => { void writeJson(KEYS.awakened, { done: false }); onReplayAwakening(); }} />
        {flags.lab ? <Row icon="lab" title="Laboratorio" detail="Diseño, holograma, reconstrucción, movimiento, sonido, arranque" onPress={() => nav.push({ name: 'lab' })} /> : null}
      </HoloPanel>
      <HoloPanel depth="structure" style={{ padding: space[4], gap: space[1] }}>
        <T variant="micro" tone="tertiary">Acerca de</T>
        <T variant="caption" tone="secondary">Versión {Constants.expoConfig?.version} · {VARIANT}</T>
        <T variant="caption" tone="secondary">Servidor {SERVER_URL.replace('https://', '')}</T>
        <T variant="caption" tone="secondary">Canal {Updates.channel ?? '—'} · actualización {Updates.updateId?.slice(0, 8) ?? 'integrada'}</T>
      </HoloPanel>
    </Screen>
  );
}
