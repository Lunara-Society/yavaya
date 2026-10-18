import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUIDE_CHAPTERS, GUIDE_KEYS, GUIDE_SECONDS, GUIDE_VERSION, SOCIAL_KEYS, guideDuration, guideFiles, guideObjectKey, socialFile } from '@/config/guide';

const PUBLIC = join(__dirname, '..', '..', 'public');

describe('guide videos', () => {
  it('serves only the listed films, at the current version', () => {
    expect(guideObjectKey(`mercadito-v${GUIDE_VERSION}.mp4`)).toBe(`guide/mercadito-v${GUIDE_VERSION}.mp4`);
    expect(guideObjectKey(`guia-v${GUIDE_VERSION}-720.mp4`)).toBe(`guide/guia-v${GUIDE_VERSION}-720.mp4`);
    // not a window into the bucket
    expect(guideObjectKey('../media/abc.webp')).toBeNull();
    expect(guideObjectKey('secret-v1.mp4')).toBeNull();
    expect(guideObjectKey(`mercadito-v${GUIDE_VERSION + 1}.mp4`)).toBeNull();
    expect(guideObjectKey(`mercadito-v${GUIDE_VERSION}.mp4.bak`)).toBeNull();
    expect(guideObjectKey(`Mercadito-v${GUIDE_VERSION}.mp4`)).toBeNull();
  });

  it('serves the 9:16 social cuts, including the intro teaser, and nothing else under that suffix', () => {
    for (const key of SOCIAL_KEYS) expect(guideObjectKey(socialFile(key).replace('/video/', ''))).toBe(`guide/${key}-v${GUIDE_VERSION}-916.mp4`);
    // the intro exists only as a vertical teaser
    expect(guideObjectKey(`intro-v${GUIDE_VERSION}.mp4`)).toBeNull();
    expect(guideObjectKey(`intro-v${GUIDE_VERSION}-720.mp4`)).toBeNull();
    expect(guideObjectKey(`secret-v${GUIDE_VERSION}-916.mp4`)).toBeNull();
    expect(guideObjectKey(`mercadito-v${GUIDE_VERSION + 1}-916.mp4`)).toBeNull();
  });

  it('names every file it links to so the route will serve it', () => {
    for (const key of GUIDE_KEYS) {
      const files = guideFiles(key);
      expect(guideObjectKey(files.hd.replace('/video/', ''))).not.toBeNull();
      expect(guideObjectKey(files.sd.replace('/video/', ''))).not.toBeNull();
      expect(GUIDE_SECONDS[key]).toBeGreaterThan(0);
    }
  });

  it('lists chapters in order, inside the full guide', () => {
    const at = GUIDE_CHAPTERS.map((c) => c.at);
    expect(at).toEqual([...at].sort((a, b) => a - b));
    expect(at[0]).toBe(0);
    expect(at.at(-1)!).toBeLessThan(GUIDE_SECONDS.guia);
  });

  it('ships the poster and both subtitle tracks of every film with the site', () => {
    for (const key of GUIDE_KEYS) {
      const files = guideFiles(key);
      for (const path of [files.poster, files.captions, files.subtitlesEn]) {
        expect(existsSync(join(PUBLIC, path)), path).toBe(true);
      }
      // the English track is a translation on the Spanish timings, cue for cue
      const cues = (path: string) => readFileSync(join(PUBLIC, path), 'utf8').match(/^\d\d:\d\d:\d\d\.\d{3} --> .+$/gm) ?? [];
      expect(cues(files.subtitlesEn)).toEqual(cues(files.captions));
      expect(cues(files.captions).length).toBeGreaterThan(0);
    }
  });

  it('gives search engines an ISO 8601 duration', () => {
    expect(guideDuration('guia')).toBe(`PT${Math.floor(GUIDE_SECONDS.guia / 60)}M${GUIDE_SECONDS.guia % 60}S`);
    for (const key of GUIDE_KEYS) expect(guideDuration(key)).toMatch(/^PT\d+M\d{1,2}S$/);
  });
});
