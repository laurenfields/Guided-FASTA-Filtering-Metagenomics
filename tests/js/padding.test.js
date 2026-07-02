/* Unit tests for docs/js/padding.js — seeded random padding. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomPad } from '../../docs/js/padding.js';

const POOL = Array.from({ length: 100 }, (_, i) => `g${i}`);

test('randomPad is deterministic for a fixed seed', () => {
  const a = randomPad(POOL, new Set(), 10, 42);
  const b = randomPad(POOL, new Set(), 10, 42);
  assert.deepEqual(a, b);
  assert.equal(a.length, 10);
});

test('different seeds generally produce different draws', () => {
  const a = randomPad(POOL, new Set(), 10, 1);
  const b = randomPad(POOL, new Set(), 10, 2);
  assert.notDeepEqual(a, b);
});

test('randomPad never returns excluded members', () => {
  const exclude = new Set(POOL.slice(0, 90)); // only g90..g99 selectable
  const out = randomPad(POOL, exclude, 10, 7);
  assert.equal(out.length, 10);
  for (const g of out) assert.ok(!exclude.has(g));
  assert.equal(new Set(out).size, 10); // no duplicates
});

test('randomPad caps at the available pool size when exhausted', () => {
  const exclude = new Set(POOL.slice(0, 95)); // only 5 selectable
  const out = randomPad(POOL, exclude, 10, 7);
  assert.equal(out.length, 5);
});

test('randomPad returns [] for a non-positive count', () => {
  assert.deepEqual(randomPad(POOL, new Set(), 0, 7), []);
  assert.deepEqual(randomPad(POOL, new Set(), -3, 7), []);
});
