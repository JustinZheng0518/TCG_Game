const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Game = require('../web/game-core.js');
const cards = ['C', 'RR', 'SR', 'SAR'].map((rarity, index) => ({id: `TEST:${index}`, rarity, variant_code: 0}));
const seeded = (initial = 457) => {
  let seed = initial;
  return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
};

test('each pack contains exactly five cards and an independent RR guarantee', () => {
  for (const random of [() => 0, () => 0.999999]) {
    const result = Game.drawPacks(cards, 10, random);
    assert.equal(result.length, 50);
    assert.ok(result.every(card => cards.includes(card)));
    for (let i = 0; i < result.length; i += 5) {
      assert.ok(result.slice(i, i + 3).every(card => card.rarity === 'C'));
      assert.equal(result[i + 3].rarity, 'RR');
    }
  }
  // Force a SAR bonus, while keeping the RR in its own slot.
  const values = [0, 0, 0, 0, 0.0605, 0];
  assert.deepEqual(Game.drawPacks(cards, 1, () => values.shift()).map(c => c.rarity), ['C', 'C', 'C', 'RR', 'SAR']);
});

test('one million packs follow distinct per-pack odds, including 0.1% apex', () => {
  const full = ['C', 'RR', 'RRR', 'AR', 'SR', 'SSR', 'SAR', 'UR', 'FUR'].map((rarity, i) => ({id: `ODDS:${i}`, rarity}));
  const draw = Game.createDrawer(full, seeded());
  const counts = {};
  for (let i = 0; i < 100000; i++) {
    const result = draw(10);
    for (let j = 4; j < result.length; j += 5) counts[result[j].rarity] = (counts[result[j].rarity] || 0) + 1;
  }
  for (const [rarity, p] of Object.entries({RRR: .15, AR: .12, SR: .06, SSR: .02, SAR: .01, UR: .003, FUR: .001})) {
    const error = Math.abs(counts[rarity] - p * 1000000);
    assert.ok(error < 6 * Math.sqrt(1000000 * p * (1 - p)), `${rarity}: ${counts[rarity]}`);
  }
  console.log('1,000,000-pack bonus-slot simulation:', counts);
});

test('missing grades return their odds to base, and highest present grade stays at 0.1%', () => {
  const model = Game.packModel(cards);
  assert.deepEqual(model.groups.map(g => [g.label, g.probability]), [['SR / CSR', .06], ['SAR', .001]]);
  assert.ok(Math.abs(model.baseProbability - .939) < 1e-12);
  const onlySR = Game.packModel(cards.filter(c => c.rarity !== 'SAR'));
  assert.equal(onlySR.chase.probability, .001);
  assert.equal(onlySR.baseProbability, .999);
  assert.equal(Game.rarity({rarity: 'C★★'}), 'C');
  assert.equal(Game.tier({rarity: 'C★★'}), 0);
});

test('ordinary-only, RRR-only and all-high-rarity sets have explicit fallbacks', () => {
  for (const rarity of ['C', 'RRR', 'SAR']) {
    const card = {id: 'TEST:0', rarity};
    const result = Game.drawPacks([card], 1, () => .5);
    assert.equal(result.length, 5);
    assert.ok(result.every(c => c === card));
  }
  const model = Game.packModel([{rarity: 'SR'}, {rarity: 'SAR'}]);
  assert.equal(model.fixed, true);
  assert.equal(model.chase, null);
  assert.equal(model.groups.length, 0);
});

test('all 236 real sets retain every card and enforce RR wherever present', () => {
  const root = path.join(__dirname, '../data/pokemon/zh-CN/sets');
  for (const set of fs.readdirSync(root)) {
    const actual = JSON.parse(fs.readFileSync(path.join(root, set, 'cards.json')));
    const model = Game.packModel(actual);
    const reachable = new Set([...model.base, ...model.guarantee, ...model.groups.flatMap(g => g.cards)].map(c => c.id));
    assert.equal(reachable.size, actual.length, set);
    const result = Game.drawPacks(actual, 10, seeded());
    assert.equal(result.length, 50);
    if (actual.some(c => Game.rarity(c) === 'RR')) {
      for (let i = 3; i < 50; i += 5) assert.equal(Game.rarity(result[i]), 'RR', set);
    }
    if (model.chase) assert.equal(model.chase.probability, .001, set);
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
