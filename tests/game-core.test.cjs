const test = require('node:test');
const assert = require('node:assert/strict');
const Game = require('../web/game-core.js');
const cards = ['C', 'R', 'SR', 'SAR'].map((rarity, index) => ({id: `TEST:${index}`, rarity, variant_code: 0}));

test('every pack has five cards from its selected set and a non-ordinary final card when available', () => {
  for (const random of [() => 0, () => 0.999999]) {
    const result = Game.drawPacks(cards, 10, random);
    assert.equal(result.length, 50);
    assert.ok(result.every(card => cards.includes(card)));
    for (let index = 4; index < result.length; index += 5) assert.ok(Game.tier(result[index]) > 0);
  }
});

test('ordinary-only and single-card sets still open valid packs', () => {
  const result = Game.drawPacks([cards[0]], 1, () => 0.5);
  assert.equal(result.length, 5);
  assert.ok(result.every(card => card === cards[0]));
  assert.deepEqual(Game.collect({version: 1, counts: {}}, result).counts, {'TEST:0': 5});
});

test('all four rarity groups remain reachable and first-slot distribution follows the model', () => {
  let seed = 457;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const counts = [0, 0, 0, 0];
  for (let index = 0; index < 20000; index++) counts[Game.tier(Game.drawPacks(cards, 1, random)[0])]++;
  for (const [index, expected] of [0.8, 0.15, 0.04, 0.01].entries()) {
    assert.ok(counts[index] > 0);
    assert.ok(Math.abs(counts[index] / 20000 - expected) < 0.015, `${index}: ${counts[index]}`);
  }
});

test('collecting counts duplicates without mutating the prior save', () => {
  const old = Object.freeze({version: 1, counts: Object.freeze({'TEST:0': 2})});
  const next = Game.collect(old, [cards[0], cards[1], cards[1]]);
  assert.deepEqual(old.counts, {'TEST:0': 2});
  assert.deepEqual(next.counts, {'TEST:0': 3, 'TEST:1': 2});
  assert.deepEqual(Game.stats(next), {unique: 2, total: 5});
});

test('backup merging is idempotent and preserves the larger count', () => {
  const a = {version: 1, counts: {'TEST:0': 3}};
  const b = {version: 1, counts: {'TEST:0': 1, 'TEST:1': 7}};
  const merged = Game.mergeSaves(a, b);
  assert.deepEqual(merged.counts, {'TEST:0': 3, 'TEST:1': 7});
  assert.deepEqual(Game.mergeSaves(merged, b), merged);
});

test('invalid saves, oversized counts, and bad draw inputs are rejected', () => {
  for (const counts of [[], {'TEST:0': -1}, {'TEST:0': 0}, {'TEST:0': 1.5}, {'TEST:0': 1000000001}, {bad: 1}, JSON.parse('{"__proto__":1}')]) {
    assert.throws(() => Game.validateSave({version: 1, counts}));
  }
  assert.throws(() => Game.drawPacks([], 1));
  assert.throws(() => Game.drawPacks(cards, 0));
  assert.throws(() => Game.drawPacks(cards, 11));
  assert.throws(() => Game.drawPacks(cards, 1, () => 1));
});
