import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeHealth, withNativeRateCapture, type VoiceHealth } from '@/ui/roxi/voice-health';

/**
 * The parts of Roxi's voice check that run outside a browser. The audio
 * itself is tested in a real browser (tests/e2e/README.md, "Roxi's voice").
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubDevices() {
  const original = () => ({ sampleRate: true, echoCancellation: true }) as MediaTrackSupportedConstraints;
  const devices = { getSupportedConstraints: original };
  vi.stubGlobal('navigator', { mediaDevices: devices });
  return { devices, original };
}

describe('recording at the device’s own rate', () => {
  it('tells the client the rate cannot be chosen only while it starts, then puts everything back', async () => {
    const { devices, original } = stubDevices();
    const seen = await withNativeRateCapture(true, async () => devices.getSupportedConstraints());
    expect(seen).toEqual({ sampleRate: false, echoCancellation: true });
    expect(devices.getSupportedConstraints).toBe(original);
    expect(devices.getSupportedConstraints().sampleRate).toBe(true);
  });

  it('puts everything back when the start fails', async () => {
    const { devices, original } = stubDevices();
    await expect(withNativeRateCapture(true, async () => Promise.reject(new Error('no')))).rejects.toThrow('no');
    expect(devices.getSupportedConstraints).toBe(original);
  });

  it('changes nothing when not asked to', async () => {
    const { devices } = stubDevices();
    expect(await withNativeRateCapture(false, async () => devices.getSupportedConstraints().sampleRate)).toBe(true);
  });
});

describe('the report when the member is not heard', () => {
  it('says what the audio looked like, without anything the member said', () => {
    const health: VoiceHealth = {
      frames: 0,
      peak: 0,
      input: 'suspended',
      output: 'running',
      track: { readyState: 'live', muted: true, enabled: true },
      contextRate: 16000,
      trackRate: 48000,
      nativeRate: false,
    };
    expect(describeHealth('no_frames', health, 'first')).toBe('Roxi voice: no_frames (first) frames=0 peak=0 input=suspended output=running track=live/muted rate=16000/48000');
  });
});
