import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Button } from '../design/controls';
import { T } from '../design/Text';
import { color, space } from '../design/tokens';
import { HoloPanel } from '../render/HoloPanel';
import { useAuth } from '../business/auth';

/**
 * The account, natively: who is signed in, or the way in. Signing in opens
 * the phone's browser on Yavaya's own sign-in (business/auth.tsx) and comes
 * back here signed in; the website screens share the same session.
 */
export function AccountPanel({ compact = false, reason }: { compact?: boolean; reason?: string }) {
  const auth = useAuth();
  const [busy, setBusy] = useState<'google' | 'any' | 'out' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const signIn = async (via: 'google' | 'any', fresh = false) => {
    setBusy(via);
    setNote(null);
    const result = await auth.signIn(via, fresh);
    setBusy(null);
    if (!result.ok && result.reason === 'failed') setNote('No se pudo terminar de entrar. Vuelve a intentarlo.');
    if (!result.ok && result.reason === 'unsupported') setNote('Entrar funciona en la app instalada.');
  };

  if (auth.status === 'checking') {
    return (
      <HoloPanel depth="panel" style={{ padding: space[4], alignItems: 'center' }}>
        <ActivityIndicator color={color.signal} />
      </HoloPanel>
    );
  }

  if (auth.status === 'signed_in') {
    return (
      <HoloPanel depth="panel" accent={color.metal} focus style={{ padding: space[4], gap: space[3] }}>
        <View style={{ gap: space[1] }}>
          <T variant="micro" color={color.metal}>Tu cuenta</T>
          <T variant="headline">{auth.member?.firstName ? `Hola, ${auth.member.firstName}` : 'Dentro de Yavaya'}</T>
          {auth.member ? <T variant="data" tone="secondary">{auth.member.yayId}{auth.member.placeName ? ` · ${auth.member.placeName}` : ''}</T> : null}
        </View>
        {compact ? null : (
          <View style={{ gap: space[2] }}>
            <Button label="Entrar con otra cuenta" kind="secondary" onPress={() => void signIn('any', true)} />
            <Button
              label={busy === 'out' ? 'Cerrando…' : 'Cerrar sesión'}
              kind="quiet"
              onPress={async () => {
                setBusy('out');
                await auth.signOut();
                setBusy(null);
              }}
            />
          </View>
        )}
      </HoloPanel>
    );
  }

  return (
    <HoloPanel depth="panel" accent={color.signal} focus style={{ padding: space[4], gap: space[3] }}>
      <View style={{ gap: space[1] }}>
        <T variant="micro" color={color.signal}>Tu cuenta</T>
        <T variant="headline">Entra a Yavaya</T>
        <T variant="caption" tone="secondary">{reason ?? 'Una sola cuenta para todo: publicar, escribir, Roxi y tus distritos.'}</T>
      </View>
      <Button label={busy === 'google' ? 'Abriendo Google…' : 'Continuar con Google'} icon="external" accent={color.signal} onPress={() => void signIn('google')} disabled={busy !== null} />
      <Button label={busy === 'any' ? 'Abriendo…' : 'Correo, contraseña u otra forma'} kind="secondary" onPress={() => void signIn('any')} disabled={busy !== null} />
      {note ? <T variant="caption" color={color.caution}>{note}</T> : null}
      <T variant="caption" tone="tertiary">Se abre el navegador del teléfono con la página de Yavaya y vuelves aquí ya dentro.</T>
    </HoloPanel>
  );
}
