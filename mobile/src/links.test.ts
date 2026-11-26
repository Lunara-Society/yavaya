/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, openableUrl } from './links.ts';

// Run with: npm test (node's own test runner; Node 22.18+ reads TypeScript directly).

test("Yavaya's pages and Stripe's checkout stay in the app", () => {
  assert.equal(decide('https://yavaya.lat/mercadito'), 'in-app');
  assert.equal(decide('https://www.yavaya.lat/'), 'in-app');
  assert.equal(decide('https://YAVAYA.lat/play?reto=1'), 'in-app');
  assert.equal(decide('https://checkout.stripe.com/c/pay/cs_test_x'), 'in-app');
});

test('other sites and app links open outside', () => {
  assert.equal(decide('https://wa.me/50500000000'), 'external');
  assert.equal(decide('https://www.instagram.com/yavayago/'), 'external');
  assert.equal(decide('https://yavaya.lat.evil.example/'), 'external');
  assert.equal(decide('https://evil.example/?u=https://yavaya.lat'), 'external');
  assert.equal(decide('https://user@evil.example/'), 'external');
  assert.equal(decide('whatsapp://send?text=hola'), 'external');
  assert.equal(decide('tel:+50500000000'), 'external');
  assert.equal(decide('mailto:hola@example.com'), 'external');
});

test('frames belong to their page; dangerous schemes are refused', () => {
  assert.equal(decide('https://js.stripe.com/v3/elements', false), 'in-app');
  assert.equal(decide('about:blank'), 'in-app');
  assert.equal(decide('javascript:alert(1)'), 'block');
  assert.equal(decide('file:///etc/hosts'), 'block');
  assert.equal(decide('not a url'), 'block');
});

test('intent links open through their browser fallback', () => {
  assert.equal(openableUrl('intent://scan/#Intent;scheme=zxing;S.browser_fallback_url=https%3A%2F%2Fyavaya.lat%2F;end'), 'https://yavaya.lat/');
  assert.equal(openableUrl('intent://scan/#Intent;scheme=zxing;end'), null);
  assert.equal(openableUrl('https://wa.me/1'), 'https://wa.me/1');
});
