import { describe, expect, it } from 'vitest';
import { voiceSpeed } from '@/ui/roxi/prefs';

describe("Roxi's voice speed", () => {
  it('is a little slower in Spanish, at every speed the member can choose, and unchanged in English', () => {
    expect(voiceSpeed('normal', 'es')).toBe(0.9);
    expect(voiceSpeed('slow', 'es')).toBe(0.77);
    expect(voiceSpeed('fast', 'es')).toBe(1.03);
    expect(voiceSpeed('normal', 'en')).toBe(1);
    expect(voiceSpeed('fast', 'en')).toBe(1.15);
  });
});
