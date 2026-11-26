import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BUDGETS, frameStats, stepDown, tierOf } from './tier.ts';

test('tiers come from memory and year class; reduced motion is always the light tier', () => {
  const GB = 1024 ** 3;
  assert.equal(tierOf(2 * GB, 2020, false), 'low');
  assert.equal(tierOf(4 * GB, 2020, false), 'mid');
  assert.equal(tierOf(8 * GB, 2023, false), 'high');
  assert.equal(tierOf(8 * GB, 2017, false), 'low');
  assert.equal(tierOf(null, null, false), 'mid');
  assert.equal(tierOf(12 * GB, 2024, true), 'low');
});

test('budgets shrink with the tier and step down one level at a time', () => {
  assert.ok(BUDGETS.low.cell > BUDGETS.mid.cell && BUDGETS.mid.cell > BUDGETS.high.cell);
  assert.equal(BUDGETS.low.dust, 0);
  assert.equal(stepDown('high'), 'mid');
  assert.equal(stepDown('low'), 'low');
});

test('frame statistics count missed vsyncs', () => {
  const smooth = frameStats(Array(60).fill(1000 / 60));
  assert.equal(Math.round(smooth.fps), 60);
  assert.equal(smooth.dropped, 0);
  const janky = frameStats([16.7, 16.7, 50, 16.7]);
  assert.equal(janky.dropped, 2);
});
