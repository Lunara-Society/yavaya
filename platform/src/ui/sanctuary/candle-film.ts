import type { Translator } from '@/i18n';
import type { CandleFilm } from './candle';

/** The candle's film, made once (tools/sanctuary-candle); the one to send carries a line in the sender's language. */
export function candleFilm(language: string): CandleFilm {
  return { light: '/velas/encender.mp4', loop: '/velas/arde.mp4', unlit: '/velas/apagada.webp', lit: '/velas/encendida.webp', share: `/velas/compartir-${language === 'en' ? 'en' : 'es'}.mp4` };
}

/** Candles lit by everyone in the last day, in words. */
export function candleCount(t: Translator, count: number): string {
  return count === 1 ? t('sanctuary.candle.count_one') : t('sanctuary.candle.count_many', { count });
}
