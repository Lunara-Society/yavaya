import { useImage } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useFrameCallback, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { Screen } from './Screen';
import { Button, Chip, Field, Row, Toggle } from '../design/controls';
import { Icon, ICONS } from '../design/icons';
import { T } from '../design/Text';
import { color, districtAccent, space, type as typeScale } from '../design/tokens';
import { DISTRICTS } from '../districts/registry';
import { HoloPanel } from '../render/HoloPanel';
import { DistrictObject } from '../render/DistrictObject';
import { GeoMap } from '../render/GeoMap';
import { ReconstructCanvas } from '../render/Reconstruct';
import { PRESETS, SIGNATURE, TECHNIQUES, type Preset, type TechniqueKey } from '../render/techniques';
import { useToast } from '../render/SpatialToast';
import { useNav } from '../navigation/Navigator';
import { useQuality } from '../performance/Quality';
import { frameStats } from '../performance/tier';
import { SOUNDS } from '../audio/sounds';
import { CUES, cue, type CueName } from '../motion/cues';
import { startup, subscribeTransitions, transitionLog } from '../motion/metrics';

const SECTIONS = ['design', 'holo', 'recon', 'motion', 'sound', 'start'] as const;
const LABELS: Record<(typeof SECTIONS)[number], string> = { design: 'Diseño', holo: 'Holograma', recon: 'Reconstrucción', motion: 'Movimiento', sound: 'Sonido', start: 'Arranque' };

/** The laboratory: a working demonstration of every Synapse system, with live measurements. */
export function Lab({ section, tilt }: { section?: string; tilt: SharedValue<{ x: number; y: number }> }) {
  const [s, setS] = useState<(typeof SECTIONS)[number]>((SECTIONS as readonly string[]).includes(section ?? '') ? (section as never) : 'design');
  return (
    <Screen overline="Laboratorio" title={LABELS[s]}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {SECTIONS.map((k) => <Chip key={k} label={LABELS[k]} selected={k === s} onPress={() => setS(k)} />)}
      </View>
      <FrameMeter />
      {s === 'design' ? <DesignLab /> : null}
      {s === 'holo' ? <HoloLab tilt={tilt} /> : null}
      {s === 'recon' ? <ReconLab /> : null}
      {s === 'motion' ? <MotionLab /> : null}
      {s === 'sound' ? <SoundLab /> : null}
      {s === 'start' ? <StartLab /> : null}
    </Screen>
  );
}

/** Live frame rate over the last second, measured on the UI thread, plus the device tier and JS heap. */
function FrameMeter() {
  const { tier, budget } = useQuality();
  const [stats, setStats] = useState({ fps: 0, dropped: 0, p95: 0 });
  const times = useSharedValue<number[]>([]);
  const publish = (t: number[]) => {
    const s = frameStats(t.slice(1).map((x, i) => x - t[i]));
    setStats({ fps: Math.round(s.fps), dropped: s.dropped, p95: Math.round(s.p95 * 10) / 10 });
  };
  useFrameCallback((f) => {
    const t = [...times.value, f.timestamp];
    if (t[t.length - 1] - t[0] >= 1000) {
      runOnJS(publish)(t);
      times.value = [f.timestamp];
    } else times.value = t;
  });
  const hermes = (globalThis as { HermesInternal?: { getInstrumentedStats?: () => Record<string, number> } }).HermesInternal?.getInstrumentedStats?.();
  const heap = hermes ? `${Math.round((hermes.js_heapSize ?? 0) / 1048576)} MB` : '—';
  return (
    <HoloPanel depth="structure" style={{ padding: space[3], flexDirection: 'row', justifyContent: 'space-between' }}>
      <T variant="data">{stats.fps} fps</T>
      <T variant="data" tone="secondary">p95 {stats.p95} ms</T>
      <T variant="data" tone="secondary">perdidos {stats.dropped}</T>
      <T variant="data" tone="secondary">{tier} · {budget.cell}dp</T>
      <T variant="data" tone="tertiary">JS {heap}</T>
    </HoloPanel>
  );
}

function DesignLab() {
  const [on, setOn] = useState(true);
  const [text, setText] = useState('');
  return (
    <View style={{ gap: space[4] }}>
      <T variant="micro" tone="tertiary">Color · un acento por distrito</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {DISTRICTS.map((d) => (
          <View key={d.id} style={{ width: '30%', gap: 4 }}>
            <View style={{ height: 28, borderRadius: 8, backgroundColor: d.accent }} />
            <T variant="caption" tone="secondary" numberOfLines={1}>{d.name.es}</T>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {[color.void, color.deep, color.text, color.signal, color.metal, color.roxi].map((c) => <View key={c} style={{ flex: 1, height: 28, borderRadius: 8, backgroundColor: c, borderWidth: 1, borderColor: color.hairline }} />)}
      </View>
      <T variant="micro" tone="tertiary">Tipografía · Geist y Geist Mono</T>
      {(Object.keys(typeScale) as (keyof typeof typeScale)[]).map((k) => <T key={k} variant={k}>{k} · Todo lo que nos une</T>)}
      <T variant="micro" tone="tertiary">Controles</T>
      <Button label="Acción principal" onPress={() => undefined} />
      <Button label="Acción en Mercadito" accent={districtAccent.mercadito} onPress={() => undefined} />
      <Button label="Secundaria" kind="secondary" onPress={() => undefined} />
      <Button label="Discreta" kind="quiet" onPress={() => undefined} />
      <Field value={text} onChangeText={setText} placeholder="Campo de texto" />
      <Toggle label="Interruptor" value={on} onChange={setOn} icon="sound" />
      <Row icon="bell" title="Fila de lista" detail="Con detalle y destino" onPress={() => undefined} />
      <T variant="micro" tone="tertiary">Iconos originales</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
        {Object.keys(ICONS).map((n) => <Icon key={n} name={n} tint={color.textSecondary} />)}
      </View>
    </View>
  );
}

function HoloLab({ tilt }: { tilt: SharedValue<{ x: number; y: number }> }) {
  const toast = useToast();
  const { width } = useWindowDimensions();
  const [focus, setFocus] = useState<string | null>(null);
  const w = width - space[4] * 2;
  return (
    <View style={{ gap: space[4] }}>
      <T variant="micro" tone="tertiary">Paneles por profundidad (inclina el teléfono, toca uno)</T>
      {(['structure', 'panel', 'focus'] as const).map((dpth) => (
        <HoloPanel key={dpth} depth={dpth} tilt={tilt} focus={focus === dpth} accent={districtAccent.services} onPress={() => setFocus(focus === dpth ? null : dpth)} style={{ padding: space[4] }}>
          <T variant="label">Profundidad: {dpth}</T>
          <T variant="caption" tone="secondary">Texto real, legible y accesible sobre vidrio dibujado por la GPU.</T>
        </HoloPanel>
      ))}
      <T variant="micro" tone="tertiary">Objeto de distrito (arrastra para inspeccionar)</T>
      <View style={{ alignItems: 'center' }}><DistrictObject accent={districtAccent.animals} size={Math.min(260, w)} focus={1} /></View>
      <T variant="micro" tone="tertiary">Proyección geográfica</T>
      <GeoMap width={w} height={w * 0.7} points={[{ id: 'a', latitude: 12.13, longitude: -86.25, active: true }, { id: 'b', latitude: 14.6, longitude: -90.5, active: false }]} accent={districtAccent.movilidad} focusIso="NIC" />
      <T variant="micro" tone="tertiary">Notificaciones espaciales</T>
      <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
        <Button label="Aviso" kind="secondary" onPress={() => toast({ title: 'Nuevo mensaje', body: 'Ejemplo de notificación', tone: 'info' })} />
        <Button label="Éxito" kind="secondary" onPress={() => toast({ title: 'Publicado', tone: 'success' })} />
        <Button label="Error" kind="secondary" onPress={() => toast({ title: 'No se pudo enviar', body: 'Revisa tu conexión', tone: 'error' })} />
      </View>
    </View>
  );
}

function ReconLab() {
  const { width } = useWindowDimensions();
  const roxi = useImage(require('../../assets/roxi/roxi.webp'));
  const guardian = useImage(require('../../assets/splash-icon.png'));
  const [subject, setSubject] = useState<'roxi' | 'guardian'>('roxi');
  const [tech, setTech] = useState<TechniqueKey>(SIGNATURE.arrive);
  const [preset, setPreset] = useState<Preset>('district');
  const [last, setLast] = useState<string>('—');
  const [grid, setGrid] = useState(false);
  const progress = useSharedValue(0);
  const recording = useSharedValue(0);
  const frames = useSharedValue<number[]>([]);
  const w = width - space[4] * 2;
  useFrameCallback((f) => {
    if (recording.value) frames.value = [...frames.value, f.timestamp];
  });
  const report = (t: number[], ms: number) => {
    const s = frameStats(t.slice(1).map((x, i) => x - t[i]));
    setLast(`${ms} ms planificados · ${Math.round(t[t.length - 1] - t[0])} ms reales · ${Math.round(s.fps)} fps · ${s.dropped} perdidos`);
  };
  const play = (to: 0 | 1) => {
    cancelAnimation(progress);
    const ms = Math.round(Math.abs(to - progress.value) * PRESETS[preset]);
    frames.value = [];
    recording.value = 1;
    cue(to ? 'reconstruct' : 'dissolve');
    progress.value = withTiming(to, { duration: ms, easing: Easing.bezier(0.2, 0, 0, 1) }, (done) => {
      recording.value = 0;
      if (done) runOnJS(report)(frames.value, ms);
    });
  };
  const scrub = Gesture.Pan().onChange((e) => {
    cancelAnimation(progress);
    progress.value = Math.max(0, Math.min(1, progress.value + e.changeX / w));
  });
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  const image = subject === 'roxi' ? roxi : guardian;
  const accent = subject === 'roxi' ? color.roxi : color.metal;
  return (
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <Chip label="Roxi" selected={subject === 'roxi'} onPress={() => setSubject('roxi')} />
        <Chip label="Guardián" selected={subject === 'guardian'} onPress={() => setSubject('guardian')} />
        <Chip label="Comparar las 7" selected={grid} onPress={() => setGrid(!grid)} />
      </View>
      {grid ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {TECHNIQUES.map((t) => (
            <View key={t.key} style={{ width: (w - space[2] * 2) / 3 }}>
              <ReconstructCanvas image={image} progress={progress} technique={t.key} accent={accent} width={(w - space[2] * 2) / 3} height={(w - space[2] * 2) / 3} fit="contain" />
              <T variant="caption" tone="secondary" numberOfLines={1}>{t.es}</T>
            </View>
          ))}
        </View>
      ) : (
        <View style={{ alignItems: 'center' }}>
          <ReconstructCanvas image={image} progress={progress} technique={tech} accent={accent} width={w} height={w} fit="contain" />
        </View>
      )}
      <GestureDetector gesture={scrub}>
        <View accessible accessibilityLabel="Desliza para avanzar o retroceder la reconstrucción" style={{ height: 40, justifyContent: 'center' }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: color.hairline }}>
            <Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: accent }, bar]} />
          </View>
        </View>
      </GestureDetector>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <View style={{ flex: 1 }}><Button label="Formar" accent={accent} onPress={() => play(1)} /></View>
        <View style={{ flex: 1 }}><Button label="Disolver" kind="secondary" onPress={() => play(0)} /></View>
      </View>
      <T variant="caption" tone="secondary">Tócalo a mitad de camino: cambia de sentido desde donde está.</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {TECHNIQUES.map((t) => <Chip key={t.key} label={`${t.es}${SIGNATURE.arrive === t.key ? ' ★' : ''}`} selected={tech === t.key} onPress={() => setTech(t.key)} accent={accent} />)}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {(Object.keys(PRESETS) as Preset[]).map((p) => <Chip key={p} label={`${p} ${PRESETS[p]} ms`} selected={preset === p} onPress={() => setPreset(p)} />)}
      </View>
      <T variant="data" tone="secondary">{last}</T>
    </View>
  );
}

function MotionLab() {
  const nav = useNav();
  const toast = useToast();
  const [, setTick] = useState(0);
  useEffect(() => subscribeTransitions(() => setTick((n) => n + 1)), []);
  const log = transitionLog();
  return (
    <View style={{ gap: space[3] }}>
      <Button label="Abrir un distrito" accent={districtAccent.mercadito} onPress={() => nav.push({ name: 'district', id: 'mercadito' })} />
      <Button label="Abrir un anuncio (ejemplo)" kind="secondary" onPress={() => nav.push({ name: 'listing', district: 'mercadito', id: 'ejemplo' })} />
      <Button label="Ver un perfil (ejemplo)" kind="secondary" onPress={() => nav.push({ name: 'profile', yayId: '00000000' })} />
      <Button label="Abrir búsqueda" kind="secondary" onPress={() => nav.push({ name: 'search' })} />
      <Button label="Abrir el mapa" kind="secondary" onPress={() => nav.push({ name: 'map' })} />
      <Button label="Llamar a Roxi" kind="secondary" onPress={() => nav.push({ name: 'roxi' })} />
      <Button label="Confirmación" kind="secondary" onPress={() => toast({ title: 'Listo', tone: 'success' })} />
      <T variant="micro" tone="tertiary">Medido en este teléfono (últimas transiciones)</T>
      <HoloPanel depth="structure" style={{ padding: space[3], gap: 4 }}>
        {log.length === 0 ? <T variant="caption" tone="secondary">Navega para medir.</T> : null}
        {[...log].reverse().slice(0, 12).map((r, i) => (
          <T key={i} variant="caption" tone="secondary">
            {r.kind} → {r.to}: {r.actualMs}/{r.plannedMs} ms · {r.fps} fps · {r.dropped} perdidos · latencia {r.latencyMs ?? '—'} ms
          </T>
        ))}
      </HoloPanel>
    </View>
  );
}

function SoundLab() {
  return (
    <View style={{ gap: space[2] }}>
      <T variant="caption" tone="secondary">Sonidos originales de Yavaya (sintetizados aquí, sin muestras de terceros). Respetan el modo silencio y tu ajuste.</T>
      <HoloPanel depth="panel" style={{ paddingHorizontal: space[4] }}>
        {(Object.keys(CUES) as CueName[]).map((c) => <Row key={c} icon="sound" title={c} detail={'sound' in CUES[c] ? String((CUES[c] as { sound?: string }).sound) : 'solo vibración'} onPress={() => cue(c)} />)}
      </HoloPanel>
      <T variant="caption" tone="tertiary">{Object.keys(SOUNDS).length} sonidos, 164 KB en total.</T>
    </View>
  );
}

function StartLab() {
  return (
    <HoloPanel depth="panel" style={{ padding: space[4], gap: space[2] }}>
      <T variant="data">JS listo → primer cuadro: {startup.firstFrame ? Math.round(startup.firstFrame - startup.jsStart) : '—'} ms</T>
      <T variant="data">JS listo → interactivo: {startup.interactive ? Math.round(startup.interactive - startup.jsStart) : '—'} ms</T>
      <T variant="data">Regresos en caliente: {startup.warmResumes.length ? startup.warmResumes.map((m) => `${Math.round(m)} ms`).join(', ') : '—'}</T>
      <T variant="caption" tone="tertiary">El tiempo antes de que arranque JavaScript (proceso nativo) no se ve desde aquí; se mide con las herramientas del sistema.</T>
    </HoloPanel>
  );
}
