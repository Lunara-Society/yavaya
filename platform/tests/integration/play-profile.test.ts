import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, db } from '@/server/db/client';
import { register } from '@/server/domains/identity/service';
import { exactLook, playLook, savePlayLook } from '@/server/domains/play/profile';
import { DEFAULT_LOOK, LOOK_OPTIONS, LOOK_PARTS, parseLook } from '@/config/play-looks';
import { getDictionary } from '@/i18n';
import { resetTransactionalData } from '../helpers/database';

const context = { networkHash: null, addressHash: 'play-test', deviceFingerprint: null, userAgent: 'vitest' };

beforeEach(resetTransactionalData);
afterAll(closeDb);

async function player() {
  const { userId } = await register(
    db(),
    { email: `play-${crypto.randomUUID()}@example.com`, password: 'a-sufficiently-long-passphrase', displayName: 'Jugadora', locale: 'es', acceptedTerms: true },
    context,
  );
  return userId;
}

describe('Yavaya Play characters', () => {
  it('names every part and every choice in both languages', () => {
    for (const locale of ['es', 'en'] as const) {
      const texts = getDictionary(locale) as Record<string, string>;
      for (const part of LOOK_PARTS) {
        expect(texts[`play.look.part.${part}`], `${locale} play.look.part.${part}`).toBeTruthy();
        for (const option of LOOK_OPTIONS[part]) expect(texts[`play.look.${part}.${option.id}`], `${locale} ${part}.${option.id}`).toBeTruthy();
      }
    }
  });

  it('starts from a default made of real choices', () => {
    expect(exactLook(DEFAULT_LOOK)).toEqual(DEFAULT_LOOK);
  });

  it('refuses a look with anything the game never offered', () => {
    expect(exactLook({ ...DEFAULT_LOOK, top: 'armadura-dorada' })).toBeNull();
    expect(exactLook({ ...DEFAULT_LOOK, colour: '#ff0000' })).toBeNull();
    const { shoes: _missing, ...partial } = DEFAULT_LOOK;
    expect(exactLook(partial)).toBeNull();
    expect(exactLook('corto')).toBeNull();
    expect(exactLook(null)).toBeNull();
  });

  it('repairs an old or partial look when reading it, rather than failing', () => {
    expect(parseLook({ hair: 'rizos', top: 'retirado' })).toEqual({ ...DEFAULT_LOOK, hair: 'rizos' });
  });

  it('keeps one look per account, and the latest wins', async () => {
    const userId = await player();
    expect(await playLook(db(), userId)).toBeNull();
    await savePlayLook(db(), userId, { ...DEFAULT_LOOK, hair: 'mono' });
    await savePlayLook(db(), userId, { ...DEFAULT_LOOK, hair: 'coleta', accessory: 'sombrero' });
    expect(await playLook(db(), userId)).toEqual({ ...DEFAULT_LOOK, hair: 'coleta', accessory: 'sombrero' });
  });
});
