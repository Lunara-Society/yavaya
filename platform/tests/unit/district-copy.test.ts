import { describe, expect, it } from 'vitest';
import { DISTRICTS } from '@/config/districts';
import { BOARD_DISTRICT_KEYS } from '@/config/boards';
import { es } from '@/i18n/dictionaries/es';
import { en } from '@/i18n/dictionaries/en';
import { siteEs } from '@/i18n/site/es';
import { siteEn } from '@/i18n/site/en';

/**
 * Copy that counts the districts in words (the audit of 21 November 2026 found
 * the Terms, Help, Districts and Status pages still saying "seven" with fifteen
 * open). When a district opens or closes this fails, naming the copy to change.
 */
const WORDS: Record<number, [es: string, en: string]> = { 8: ['ocho', 'eight'], 15: ['quince', 'fifteen'] };

describe('copy that counts the districts', () => {
  const open = Object.values(DISTRICTS).filter((d) => d.status === 'available').length;
  const boards = BOARD_DISTRICT_KEYS.length;

  it('says how many districts are open', () => {
    const [wordEs, wordEn] = WORDS[open] ?? ['?', '?'];
    for (const text of [es['home.districts.sub'], es['capability.districts.detail'], siteEs.pages.districts.title, siteEs.pages.home.gatesTitle, siteEs.pages.terms.sections[0]!.text]) expect(text.toLowerCase(), text).toContain(wordEs);
    for (const text of [en['home.districts.sub'], en['capability.districts.detail'], siteEn.pages.districts.title, siteEn.pages.home.gatesTitle, siteEn.pages.terms.sections[0]!.text]) expect(text.toLowerCase(), text).toContain(wordEn);
  });

  it('says how many board districts there are', () => {
    const [wordEs, wordEn] = WORDS[boards] ?? ['?', '?'];
    expect(es['board.more.lead'].toLowerCase()).toContain(wordEs);
    expect(es['capability.board_districts.detail'].toLowerCase()).toContain(wordEs);
    expect(en['board.more.lead'].toLowerCase()).toContain(wordEn);
    expect(en['capability.board_districts.detail'].toLowerCase()).toContain(wordEn);
  });
});
