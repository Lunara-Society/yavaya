import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admit, effectiveGain, fadeSteps, DUCKED, MAX_VOICES } from './audio/mix.ts';
import { PRESETS, remainingMs, SIGNATURE, TECHNIQUES, techniqueId } from './render/techniques.ts';
import { DURATIONS, transitionFor, BUDGET } from './motion/specs.ts';
import { FLAG_DEFAULTS, mergeFlags, parseRemoteConfig } from './core/flags.ts';
import { PATTERNS } from './haptics/patterns.ts';
import { SHADERS } from './render/shaders.ts';

test('audio: at most three voices; a stronger sound evicts the weakest, a weaker one is dropped', () => {
  const v = (id: number, priority: number) => ({ id, priority, startedAt: id });
  assert.deepEqual(admit([v(1, 5)], v(2, 3)), []);
  const full = [v(1, 5), v(2, 3), v(3, 7)];
  assert.equal(full.length, MAX_VOICES);
  assert.deepEqual(admit(full, v(4, 6)), [v(2, 3)]);
  assert.equal(admit(full, v(5, 1)), null);
});

test('audio: ducking and master volume, fades end exactly at the target', () => {
  assert.equal(effectiveGain(0.8, 0.5, false), 0.4);
  assert.equal(effectiveGain(0.8, 0.5, true), 0.4 * DUCKED);
  assert.equal(effectiveGain(2, 1, false), 1);
  const steps = fadeSteps(0.6, 0, 160);
  assert.equal(steps.length, 10);
  assert.equal(steps[steps.length - 1], 0);
});

test('reconstruction: seven techniques with stable ids; district timing inside 400–700 ms; frequent is shorter', () => {
  assert.equal(TECHNIQUES.length, 7);
  assert.deepEqual(TECHNIQUES.map((t) => t.id), [0, 1, 2, 3, 4, 5, 6]);
  assert.equal(techniqueId('light'), 3);
  assert.ok(PRESETS.district >= 400 && PRESETS.district <= 700);
  assert.ok(PRESETS.frequent < PRESETS.district);
  assert.ok(TECHNIQUES.some((t) => t.key === SIGNATURE.arrive));
});

test('reconstruction: an interrupted run continues from where it is, in either direction', () => {
  assert.equal(remainingMs(0.25, 1, 520), 390);
  assert.equal(remainingMs(0.25, 0, 520), 130);
  assert.equal(remainingMs(1, 1, 520), 0);
});

test('motion: every place change has a kind; reduced motion is always a short fade; budgets are sane', () => {
  const home = { name: 'home' } as const;
  assert.equal(transitionFor(home, { name: 'district', id: 'mercadito' }, 'forward', false), 'spatial');
  assert.equal(transitionFor(home, { name: 'roxi' }, 'forward', false), 'summon');
  assert.equal(transitionFor(home, { name: 'map' }, 'forward', false), 'dive');
  assert.equal(transitionFor(home, { name: 'search' }, 'forward', false), 'focus');
  assert.equal(transitionFor({ name: 'district', id: 'x' }, home, 'back', false), 'return');
  assert.equal(transitionFor({ name: 'district', id: 'x' }, home, 'back', false, true), 'swipe');
  assert.equal(transitionFor(home, { name: 'map' }, 'forward', true), 'fade');
  assert.ok(Object.values(DURATIONS).every((ms) => ms <= 520));
  assert.equal(BUDGET.latencyMs, 100);
});

test('flags: remote overrides apply only to known booleans; malformed config is ignored', () => {
  const merged = mergeFlags(FLAG_DEFAULTS, { awakening: false, unknown: true, sound: 'off' });
  assert.equal(merged.awakening, false);
  assert.equal(merged.sound, true);
  assert.ok(!('unknown' in merged));
  assert.equal(parseRemoteConfig('nope'), null);
  assert.deepEqual(parseRemoteConfig({ flags: { lab: true }, minBuild: 3.7, message: 'x' }), { flags: { lab: true }, minBuild: 3, message: 'x' });
});

test('haptics: patterns are short and ordered; shaders avoid SkSL reserved words', () => {
  for (const [name, p] of Object.entries(PATTERNS)) {
    assert.ok(p.length >= 1 && p.length <= 4, name);
    assert.ok(p.every((x, i) => i === 0 || x.at >= p[i - 1].at), name);
    assert.ok(p[p.length - 1].at <= 3500, name);
  }
  for (const [name, src] of Object.entries(SHADERS)) assert.ok(!/\b(flat|smooth|noperspective)\s+[a-z]/.test(src.replace(/smoothstep/g, '')), name);
});
