import { describe, expect, it } from 'vitest';
import { withoutCues } from '@/ui/roxi/tidy';

describe("Roxi's delivery cues", () => {
  it('are taken out of what is shown: they are for the voice only', () => {
    expect(withoutCues('[warmly] ¡Hola, María! [short pause] ¿Qué buscas hoy?')).toBe('¡Hola, María! ¿Qué buscas hoy?');
    expect(withoutCues('[laughs softly] Claro que sí.')).toBe('Claro que sí.');
    expect(withoutCues('[emocionada] ¡Lo encontré!')).toBe('¡Lo encontré!');
  });

  it('leave brackets that are not cues alone', () => {
    expect(withoutCues('Talla [M], precio [C$ 500]')).toBe('Talla [M], precio [C$ 500]');
    expect(withoutCues('Paso [1 de 3]')).toBe('Paso [1 de 3]');
  });
});
