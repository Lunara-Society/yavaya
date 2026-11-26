import { test } from 'node:test';
import assert from 'node:assert/strict';
import { directionOf, parseUrl, routeKey, webPathOf } from './routes.ts';
import { reduce, START } from './stack.ts';

test('deep links map to native places; unknown paths fall back to the website screen', () => {
  assert.deepEqual(parseUrl('yavaya://district/mercadito'), { name: 'district', id: 'mercadito' });
  assert.deepEqual(parseUrl('https://yavaya.lat/yavayago'), { name: 'district', id: 'yavayago' });
  assert.deepEqual(parseUrl('https://www.yavaya.lat/members/12345678'), { name: 'profile', yayId: '12345678' });
  assert.deepEqual(parseUrl('yavaya://search?q=bici'), { name: 'search', q: 'bici' });
  assert.deepEqual(parseUrl('https://yavaya.lat/'), { name: 'home' });
  assert.deepEqual(parseUrl('https://yavaya.lat/terms'), { name: 'web', path: '/terms' });
  assert.deepEqual(parseUrl('yavaya-dev://map'), { name: 'map' });
});

test('foreign hosts, plain http and look-alikes are refused', () => {
  assert.equal(parseUrl('https://yavaya.lat.evil.example/mercadito'), null);
  assert.equal(parseUrl('http://yavaya.lat/mercadito'), null);
  assert.equal(parseUrl('javascript:alert(1)'), null);
  assert.equal(parseUrl('not a url'), null);
});

test('direction follows spatial depth', () => {
  assert.equal(directionOf({ name: 'home' }, { name: 'district', id: 'mercadito' }), 'forward');
  assert.equal(directionOf({ name: 'listing', district: 'mercadito', id: 'a1' }, { name: 'district', id: 'mercadito' }), 'back');
  assert.equal(directionOf({ name: 'search' }, { name: 'map' }), 'lateral');
});

test('every route has a website path for the fallback', () => {
  assert.equal(webPathOf({ name: 'district', id: 'animals' }), '/animals');
  assert.equal(webPathOf({ name: 'profile', yayId: '12345678' }), '/members/12345678');
  assert.equal(routeKey({ name: 'district', id: 'animals' }), 'district:animals');
});

test('the stack pushes, returns, ignores duplicate pushes and never pops past home', () => {
  let s = START;
  s = reduce(s, { type: 'push', route: { name: 'district', id: 'mercadito' } });
  s = reduce(s, { type: 'push', route: { name: 'district', id: 'mercadito' } });
  assert.equal(s.stack.length, 2);
  s = reduce(s, { type: 'push', route: { name: 'listing', district: 'mercadito', id: 'x' } });
  assert.equal(s.direction, 'forward');
  s = reduce(s, { type: 'back' });
  assert.equal(s.direction, 'back');
  assert.equal(s.stack.length, 2);
  s = reduce(reduce(s, { type: 'back' }), { type: 'back' });
  assert.equal(s.stack.length, 1);
  assert.equal(s.stack[0].name, 'home');
  s = reduce(s, { type: 'reset', route: { name: 'map' } });
  assert.deepEqual(s.stack.map((r) => r.name), ['home', 'map']);
});
