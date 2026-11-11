/**
 * The browser side of the voice test: Roxi's voice start as the panel does it
 * (guarded start, check, fallback to the device's own rate), without the rest
 * of the panel. breakChosenRate() reproduces the failing phone.
 */
import { Conversation } from '@elevenlabs/client';
import { watchVoice, withNativeRateCapture, describeHealth, microphoneAlreadyAllowed, guardedVoiceStart, VoiceStartTimeout } from '../../../src/ui/roxi/voice-health';
const log = (window.vlog = []);
const t0 = performance.now();
const say = (what, extra) => log.push({ t: Math.round(performance.now() - t0), what, ...(extra || {}) });

// Reproduces the failing phone: an AudioContext opened at a chosen rate never runs, so no frame leaves.
window.breakChosenRate = () => {
  const Real = window.AudioContext;
  window.AudioContext = function (options) {
    const ctx = new Real(options);
    if (options && options.sampleRate) {
      void ctx.suspend();
      ctx.resume = () => new Promise(() => {}); // stays suspended, as observed
    }
    return ctx;
  };
  window.AudioContext.prototype = Real.prototype;
};

async function open(nativeRate) {
  say('start-session', { nativeRate });
  let live;
  try {
  live = await guardedVoiceStart(nativeRate ? 30000 : 15000, () => withNativeRateCapture(nativeRate, () => Conversation.startSession({
    signedUrl: `ws://${location.host}/ws`, connectionType: 'websocket',
    workletPaths: { rawAudioProcessor: '/vendor/elevenlabs/rawAudioProcessor.js', audioConcatProcessor: '/vendor/elevenlabs/audioConcatProcessor.js' },
    libsampleratePath: '/vendor/elevenlabs/libsamplerate.worklet.js',
    onModeChange: ({ mode }) => say('mode', { mode }),
    onDisconnect: (d) => say('disconnect', { reason: d.reason }),
  })), (late) => { say('late-start-ended'); void late.endSession(); });
  } catch (error) {
    say('start-failed', { message: String(error && error.message) });
    if (error instanceof VoiceStartTimeout && !nativeRate) return open(true);
    return;
  }
  say('session-ready', { nativeRate });
  window.live = live;
  const w = watchVoice(live, {
    nativeRate, deadlineMs: 4000,
    onHealthy: (h) => say('healthy', { frames: h.frames, rate: h.contextRate }),
    onProblem: (problem, h) => {
      say('problem', { message: describeHealth(problem, h, nativeRate ? 'native_rate' : 'first') });
      if (!nativeRate) { void live.endSession().finally(() => open(true)); }
    },
  });
  window.health = w.health;
}
window.runVoice = async () => { say('tap', { allowed: await microphoneAlreadyAllowed() }); await open(false); };
