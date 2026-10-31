import { describe, expect, it } from 'vitest';
import { matchPlace, MAX_PLACE_OPTIONS, type PlaceCandidate } from '@/ui/roxi/places';
import { tidyField, tidyText } from '@/ui/roxi/tidy';

const place = (id: string, name: string, context: string, level = 'town'): PlaceCandidate => ({ id, name, context, level });

const nandaime = place('n1', 'Nandaime', 'Granada, Nicaragua');
const leon = place('l1', 'León', 'León, Nicaragua', 'city');
const sanJuanCr = place('sj1', 'San Juan', 'San José, Costa Rica', 'city');
const sanJuanPa = place('sj2', 'San Juan', 'Veraguas, Panamá');
const sanJuanMx = place('sj3', 'San Juan', 'Estado de México, México');

describe('which town the member meant', () => {
  it('takes the one place with that name', () => {
    expect(matchPlace('Nandaime', [nandaime])).toEqual({ kind: 'one', place: nandaime });
  });

  it('ignores accents and case, as people type them', () => {
    expect(matchPlace('leon', [leon])).toEqual({ kind: 'one', place: leon });
    expect(matchPlace('  NANDAIME ', [nandaime])).toEqual({ kind: 'one', place: nandaime });
  });

  it('asks when two places share the name', () => {
    const match = matchPlace('San Juan', [sanJuanCr, sanJuanPa, sanJuanMx]);
    expect(match.kind).toBe('several');
    expect(match.kind === 'several' && match.options.map((p) => p.id)).toEqual(['sj1', 'sj2', 'sj3']);
  });

  it('narrows a shared name by the department or country the member added', () => {
    expect(matchPlace('San Juan, Veraguas', [sanJuanCr, sanJuanPa, sanJuanMx])).toEqual({ kind: 'one', place: sanJuanPa });
    expect(matchPlace('San Juan, Costa Rica', [sanJuanCr, sanJuanPa, sanJuanMx])).toEqual({ kind: 'one', place: sanJuanCr });
  });

  it('never invents a place: no exact name, no place', () => {
    expect(matchPlace('Xyzzyville', [])).toEqual({ kind: 'none' });
    // A longer name that only starts the same is not what the member said.
    expect(matchPlace('San Juan', [place('x', 'San Juan del Sur', 'Rivas, Nicaragua')])).toEqual({ kind: 'none' });
    expect(matchPlace('', [nandaime])).toEqual({ kind: 'none' });
  });

  it('reads back only a handful of options', () => {
    const many = Array.from({ length: 12 }, (_, i) => place(`s${i}`, 'San José', `Lugar ${i}`));
    const match = matchPlace('San José', many);
    expect(match.kind === 'several' && match.options).toHaveLength(MAX_PLACE_OPTIONS);
  });

  it('counts the same place twice as one', () => {
    expect(matchPlace('Nandaime', [nandaime, { ...nandaime }])).toEqual({ kind: 'one', place: nandaime });
  });
});

describe('Roxi’s text', () => {
  it('puts back the space lost between two sentences', () => {
    expect(tidyText('Está en Nandaime.Precio: 500 córdobas.')).toBe('Está en Nandaime. Precio: 500 córdobas.');
    expect(tidyText('Listo.¿Quieres que lo publique?')).toBe('Listo. ¿Quieres que lo publique?');
    expect(tidyText('Cuesta 500.El envío es aparte')).toBe('Cuesta 500. El envío es aparte');
  });

  it('leaves addresses, prices and lowercase words alone', () => {
    for (const text of ['Entra a yavaya.lat para verlo', 'Cuesta C$3.500', 'Mide 1.5 m', 'etc. y más', 'EE.UU. y México']) {
      expect(tidyText(text)).toBe(text);
    }
  });

  it('cleans what goes into a form without joining its lines', () => {
    expect(tidyField('Mesa de pino.Buen estado   \n\n\n\nRetiro en Nandaime  ')).toBe('Mesa de pino. Buen estado\n\nRetiro en Nandaime');
  });
});
