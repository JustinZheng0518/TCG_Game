const test = require('node:test');
const assert = require('node:assert/strict');
const Shop = require('../web/shop-core.js');
const Game = require('../web/game-core.js');
const catalog = require('../data/shop/products.json');
const feed = Shop.feedValid(require('../data/shop/market-feed.json'));
const product = catalog.products.CS1aC;
const cards = require('../data/pokemon/zh-CN/sets/CS1aC/cards.json');
const first = () => Shop.validate({version: 1, counts: {}});
const total = save => Game.stats(save).total;

test('legacy collection migrates with starter cash and all economic fields survive roundtrip', () => {
  const old = {version: 1, counts: {'CS1aC:123': 4}};
  const save = Shop.validate(old);
  assert.equal(save.version, 2);
  assert.equal(save.shop.cash, 300000);
  assert.equal(save.counts['CS1aC:123'], 4);
  assert.deepEqual(Shop.validate(JSON.parse(JSON.stringify(save))), save);
  assert.equal(old.version, 1);
});

test('money and unopened stock move once; opening spends stock, preserves cash, and gives RR', () => {
  const old = first();
  const price = Shop.productQuote(old, product, feed).wholesale;
  const bought = Shop.buyStock(old, product, 10, feed);
  assert.equal(bought.shop.cash, 300000 - 10 * price);
  assert.equal(bought.shop.stock.CS1aC, 10);
  const opened = Shop.openStock(bought, product, cards, 1, () => .5);
  assert.equal(opened.save.shop.cash, bought.shop.cash);
  assert.equal(opened.save.shop.stock.CS1aC, 9);
  assert.equal(total(opened.save), 5);
  assert.equal(Game.rarity(opened.drawn[3]), 'RR');
  assert.equal(old.shop.cash, 300000);
  assert.deepEqual(old.shop.stock, {});
  assert.equal(bought.shop.stock.CS1aC, 10);
});

test('insufficient cash, stock, invalid counts and wholesale quota fail without partial mutation', () => {
  const save = first();
  save.shop.cash = 0;
  const before = JSON.stringify(save);
  assert.throws(() => Shop.buyStock(save, product, 1, feed), /现金不足/);
  assert.throws(() => Shop.openStock(save, product, cards, 1), /库存不足/);
  for (const amount of [-1, 0, .2, 11, Infinity]) assert.throws(() => Shop.buyStock(save, product, amount, feed));
  assert.equal(JSON.stringify(save), before);
  const full = first(); full.shop.progress.bought = 40;
  assert.throws(() => Shop.buyStock(full, product, 1, feed), /额度/);
});

test('all 236 sets have channels; small promos and bundles cannot use normal booster commerce', () => {
  const index = require('../data/pokemon/zh-CN/index.json');
  assert.equal(Object.keys(catalog.products).length, index.set_count);
  for (const set of index.sets) assert.ok(catalog.labels[catalog.products[set.id].channel], set.id);
  for (const id of ['PROMOSVEVENT05', 'MISSION10', 'PROMO21', 'CSVH6pC', '30thSCZSLH']) {
    const p = catalog.products[id];
    assert.notEqual(p.channel, 'booster');
    assert.throws(() => Shop.buyStock(first(), p, 1, feed), /专属获取渠道/);
    assert.throws(() => Shop.openStock(first(), p, cards, 1), /专属获取渠道/);
  }
  assert.equal(catalog.products['151C'].channel, 'event');
  assert.equal(catalog.products.CBB6C.channel, 'special');
  assert.equal(catalog.products.CBB6C.cards_per_unit, 4);
});

test('single-card trade uses bid/ask spread and duplicates sale preserves final copies', () => {
  const old = first(), card = cards[0], q = Shop.cardQuote(old, card, feed);
  const bought = Shop.trade(old, card, 'buy', feed);
  const sold = Shop.trade(bought, card, 'sell', feed);
  assert.equal(total(sold), 0);
  assert.equal(sold.shop.cash, old.shop.cash - q.ask + q.bid);
  assert.ok(sold.shop.cash < old.shop.cash);
  assert.throws(() => Shop.trade(sold, card, 'sell', feed), /没有可出售/);
  bought.counts[card.id] = 4;
  bought.counts[cards[1].id] = 1;
  const duplicates = Shop.sellDuplicates(bought, cards, feed);
  assert.equal(duplicates.counts[card.id], 1);
  assert.equal(duplicates.counts[cards[1].id], 1);
  assert.equal(duplicates.shop.cash, bought.shop.cash + q.bid * 3);
});

test('listing removes tradable card; cancel restores it; settlement never sells more than listed', () => {
  let save = first(); const card = cards[0];
  save.counts[card.id] = 2;
  const listed = Shop.trade(save, card, 'list', feed);
  assert.equal(listed.counts[card.id], 1);
  assert.equal(listed.shop.listings[card.id].count, 1);
  assert.equal(listed.shop.cash, save.shop.cash);
  const canceled = Shop.trade(listed, card, 'cancel', feed);
  assert.equal(canceled.counts[card.id], 2);
  assert.deepEqual(canceled.shop.listings, {});
  const next = Shop.endDay(listed, catalog.products, feed);
  assert.equal((next.save.shop.listings[card.id]?.count || 0) + next.report.soldCards, 1);
  assert.equal(next.save.counts[card.id], 1);
  assert.ok(next.report.soldCards <= 1);
});

test('sealed-stock settlement conserves units and cash, advances day and refreshes daily actions', () => {
  let save = Shop.buyStock(first(), product, 10, feed);
  save = Shop.work(save);
  const before = JSON.stringify(save);
  const result = Shop.endDay(save, catalog.products, feed), r = result.report;
  assert.equal(result.save.shop.day, 2);
  assert.equal((result.save.shop.stock.CS1aC || 0) + r.soldPacks, 10);
  const bonus = Shop.QUESTS.filter(q => r.rewards.includes(q.label)).reduce((sum, q) => sum + q.reward, 0);
  assert.equal(result.save.shop.cash, save.shop.cash + r.packRevenue + r.cardRevenue + bonus - r.rent);
  assert.equal(result.save.shop.worked, false);
  assert.deepEqual(result.save.shop.progress, {opened: 0, soldCards: 0, soldPacks: 0, bought: 0});
  assert.equal(JSON.stringify(save), before);
});

test('quests and codes pay once; settlement auto-claims qualifying quests before resetting them', () => {
  let save = first();
  save.shop.progress.opened = 5;
  const paid = Shop.claim(save, 'open');
  assert.equal(paid.shop.cash, save.shop.cash + 1500);
  assert.equal(paid.shop.tickets, 2);
  assert.throws(() => Shop.claim(paid, 'open'), /已经领取/);
  const next = Shop.endDay(paid, catalog.products, feed);
  assert.equal(next.save.shop.cash, paid.shop.cash - next.report.rent);
  const auto = Shop.endDay(save, catalog.products, feed);
  assert.equal(auto.save.shop.tickets, 2);
  assert.ok(auto.report.rewards.includes('拆包研究'));
  let coded = Shop.redeem(first(), ' start-store ');
  assert.equal(coded.shop.cash, 310000);
  assert.equal(coded.shop.tickets, 3);
  assert.throws(() => Shop.redeem(coded, 'START-STORE'), /已经使用/);
  coded = Shop.redeem(coded, 'SHOP-DAY-0001');
  assert.equal(coded.shop.tickets, 4);
  assert.throws(() => Shop.redeem(coded, 'SHOP-DAY-0002'), /无效或已过期/);
});

test('event, mission, mixed promo, bundle and gift channels grant appropriate rewards and enforce limits', () => {
  let save = first();
  const event = catalog.products.PROMOSVEVENT05;
  const eventCards = require('../data/pokemon/zh-CN/sets/PROMOSVEVENT05/cards.json');
  const attended = Shop.acquire(save, event, eventCards, '', feed, () => 0);
  assert.equal(attended.drawn.length, 1);
  assert.equal(attended.save.shop.cash, save.shop.cash - 2000);
  assert.equal(attended.save.shop.tickets, 2);
  assert.throws(() => Shop.acquire(attended.save, event, eventCards, '', feed), /已经参加/);
  const mission = catalog.products.MISSION10;
  const missionCards = require('../data/pokemon/zh-CN/sets/MISSION10/cards.json');
  const redeemed = Shop.acquire(attended.save, mission, missionCards, missionCards[1].id, feed, () => 0);
  assert.equal(redeemed.drawn[0].id, missionCards[0].id);
  assert.equal(redeemed.save.shop.tickets, 0);
  assert.throws(() => Shop.acquire(redeemed.save, mission, missionCards, '', feed), /需要 2 张/);
  const gift = catalog.products['30thSCZSLH'];
  const giftCards = require('../data/pokemon/zh-CN/sets/30thSCZSLH/cards.json');
  const gifted = Shop.acquire(save, gift, giftCards, giftCards[0].id, feed);
  assert.equal(gifted.drawn[0].id, giftCards[0].id);
  assert.equal(gifted.save.shop.tickets, 1);
  assert.throws(() => Shop.acquire(gifted.save, gift, giftCards, '', feed), /每天限订/);
  assert.ok(save.shop.cash - gifted.save.shop.cash > Shop.cardQuote(save, giftCards[0], feed).bid);
});

test('special retail packs and decks use their own card counts', () => {
  for (const [id, count] of [['CBB6C', 4], ['CSVH6C', 60]]) {
    const p = catalog.products[id], cards = require(`../data/pokemon/zh-CN/sets/${id}/cards.json`);
    const bought = Shop.buyStock(first(), p, 1, feed);
    const result = Shop.openStock(bought, p, cards, 1, () => .3);
    assert.equal(result.drawn.length, count);
    assert.equal(result.save.shop.stock[id], undefined);
    assert.equal(total(result.save), count);
  }
});

test('news and day change both prices, which remain integer cents with a spread', () => {
  const save = first(), next = Shop.endDay(save, catalog.products, feed).save;
  assert.notEqual(Shop.productQuote(save, product, feed).market, Shop.productQuote(next, product, feed).market);
  assert.notEqual(Shop.cardQuote(save, cards[0], feed).market, Shop.cardQuote(next, cards[0], feed).market);
  assert.equal(Shop.productQuote(save, product, feed).base, 3143);
  assert.ok(Shop.news(save, feed).some(n => n.kind.includes('官方')));
  for (let day = 1; day < 100; day++) {
    save.shop.day = day;
    const p = Shop.productQuote(save, product, feed), c = Shop.cardQuote(save, cards[0], feed);
    assert.ok(p.wholesale < p.sale);
    assert.ok(c.bid < c.ask);
    assert.ok(Number.isSafeInteger(c.market));
  }
});

test('feed rejects missing provenance, foreign-language card prices, invalid units and XSS URLs', () => {
  assert.deepEqual(Shop.feedValid(feed), feed);
  const raw = {schema_version: 1, currency: 'CNY', language: 'zh-CN', updated_at: '2026-10-17T00:00:00Z', products: {}, cards: {}, news: []};
  const good = {...raw, cards: {[cards[0].id]: {cents: 1234, source_url: 'https://example.com/sale', observed_at: raw.updated_at}}};
  assert.equal(Shop.cardQuote(first(), cards[0], Shop.feedValid(good)).estimated, false);
  for (const value of [{...good, language: 'en'}, {...good, currency: 'USD'}, {...raw, cards: {bad: {cents: 1}}}, {...raw, news: [{title: 'bad', date: '2026-10-17', source_url: 'javascript:alert(1)'}]}]) assert.throws(() => Shop.feedValid(value));
});

test('bad economic saves and unsafe cash/counts are rejected, including impossible listings', () => {
  for (const field of ['cash', 'tickets', 'reputation', 'level', 'day']) {
    for (const value of [-1, NaN, 1.5, 1e20]) {
      const save = first(); save.shop[field] = value;
      assert.throws(() => Shop.validate(save), `${field}: ${value}`);
    }
  }
  const bad = first(); bad.shop.stock = JSON.parse('{"__proto__":1}');
  assert.throws(() => Shop.validate(bad));
  const listing = first(); listing.shop.listings['CS1aC:1'] = {count: 1, card: {id: 'OTHER:1', set_id: 'CS1aC', name: 'bad', rarity: 'C'}};
  assert.throws(() => Shop.validate(listing));
});

test('verified event pack fifth edition follows official 89/10/1 processing slots', () => {
  const p = catalog.products.PROMOSVEVENT05;
  const cards = require('../data/pokemon/zh-CN/sets/PROMOSVEVENT05/cards.json');
  for (const [roll, variant] of [[0, 0], [.889999, 0], [.89, 1], [.989999, 1], [.99, 2], [.999999, 2]]) {
    const randoms = [roll, 0];
    const result = Shop.acquire(first(), p, cards, '', feed, () => randoms.shift());
    assert.equal(result.drawn[0].variant_code, variant);
    assert.equal(result.drawn.length, 1);
  }
});

test('external quotes persist in version two backups and malformed quote stores fail safely', () => {
  const save = first();
  save.shop.quotes[cards[0].id] = {cents: 999, source_url: 'https://example.com/quote', observed_at: '2026-10-17T00:00:00Z'};
  assert.deepEqual(Shop.validate(JSON.parse(JSON.stringify(save))).shop.quotes, save.shop.quotes);
  save.shop.quotes[cards[0].id].cents = -1;
  assert.throws(() => Shop.validate(save));
});

test('one-click opening buys only the missing units and charges once', () => {
  const old = first(), unit = Shop.productQuote(old, product, feed).wholesale;
  const firstPack = Shop.buyAndOpen(old, product, cards, 1, feed, () => .3);
  assert.equal(firstPack.drawn.length, 5);
  assert.equal(firstPack.save.shop.cash, old.shop.cash - unit);
  assert.equal(firstPack.save.shop.stock.CS1aC, undefined);
  const partial = Shop.buyStock(old, product, 3, feed);
  const ten = Shop.buyAndOpen(partial, product, cards, 10, feed, () => .3);
  assert.equal(ten.drawn.length, 50);
  assert.equal(ten.save.shop.cash, partial.shop.cash - 7 * unit);
  assert.equal(ten.save.shop.stock.CS1aC, undefined);
  assert.equal(ten.save.shop.progress.bought, 10);
  assert.equal(old.shop.cash, 300000);
});

test('one-click opening prioritizes owned inventory even with no cash or wholesale quota', () => {
  const save = first(); save.shop.stock.CS1aC = 2; save.shop.cash = 0; save.shop.progress.bought = 40;
  const result = Shop.buyAndOpen(save, product, cards, 1, feed, () => .3);
  assert.equal(result.save.shop.cash, 0);
  assert.equal(result.save.shop.stock.CS1aC, 1);
  assert.equal(result.save.shop.progress.bought, 40);
  assert.equal(result.drawn.length, 5);
});

test('failed one-click purchase or random draw never changes the original wallet or inventory', () => {
  const save = first(), before = JSON.stringify(save);
  assert.throws(() => Shop.buyAndOpen(save, product, cards, 1, feed, () => NaN), /随机数无效/);
  assert.equal(JSON.stringify(save), before);
  save.shop.cash = 0;
  assert.throws(() => Shop.buyAndOpen(save, product, cards, 1, feed), /现金不足/);
  assert.equal(save.shop.cash, 0);
  assert.deepEqual(save.shop.stock, {});
});

test('live customers reserve stock without charging; checkout pays exactly once and survives reload', () => {
  let save = Shop.setBusinessOpen(Shop.buyStock(first(), product, 1, feed), true);
  const cash = save.shop.cash, admitted = Shop.admitCustomer(save, catalog.products, feed);
  assert.equal(save.shop.business.pending.length, 0);
  save = Shop.validate(JSON.parse(JSON.stringify(admitted.save)));
  assert.equal(save.shop.cash, cash);
  assert.equal(save.shop.stock.CS1aC, 1);
  assert.equal(Shop.admitCustomer(save, catalog.products, feed), null);
  assert.throws(() => Shop.endDay(save, catalog.products, feed), /没有结账/);
  const sold = Shop.checkoutCustomer(save, admitted.order.id);
  assert.equal(sold.save.shop.cash, cash + admitted.order.unitPrice);
  assert.equal(sold.save.shop.stock.CS1aC, undefined);
  assert.equal(sold.save.shop.progress.soldPacks, 1);
  assert.deepEqual(Shop.checkoutCustomer(sold.save, admitted.order.id).save, sold.save);
  const ended = Shop.endDay(sold.save, catalog.products, feed);
  assert.equal(ended.report.soldPacks, 1);
  assert.equal(ended.report.packRevenue, admitted.order.unitPrice);
  assert.equal(ended.save.shop.cash, sold.save.shop.cash - ended.report.rent);
  assert.deepEqual(ended.report.rewards, []); // one sale must not be counted twice at settlement
  assert.equal(ended.save.shop.business.open, false);
  assert.throws(() => Shop.checkoutCustomer(ended.save, admitted.order.id), /失效/);
});

test('listed cards have real waiting orders; cancelled or opened goods cannot be sold again', () => {
  const card = cards.find(c => c.rarity === 'RR');
  let save = first(); save.counts[card.id] = 1;
  save = Shop.setBusinessOpen(Shop.trade(save, card, 'list', feed), true);
  let admitted = Shop.admitCustomer(save, catalog.products, feed);
  assert.equal(admitted.order.kind, 'card');
  let sold = Shop.checkoutCustomer(admitted.save, admitted.order.id);
  assert.equal(sold.save.shop.business.soldCards, 1);
  assert.equal(sold.save.shop.cash, save.shop.cash + admitted.order.unitPrice);
  assert.deepEqual(sold.save.shop.listings, {});
  const cancelled = Shop.trade(admitted.save, card, 'cancel', feed);
  sold = Shop.checkoutCustomer(cancelled, admitted.order.id);
  assert.equal(sold.receipt.revenue, 0);
  assert.equal(sold.save.shop.cash, cancelled.shop.cash);
  assert.equal(sold.save.counts[card.id], 1);
  save = Shop.setBusinessOpen(Shop.buyStock(first(), product, 1, feed), true);
  admitted = Shop.admitCustomer(save, catalog.products, feed);
  const opened = Shop.openStock(admitted.save, product, cards, 1, () => .5);
  sold = Shop.checkoutCustomer(opened.save, admitted.order.id);
  assert.equal(sold.receipt.count, 0);
  assert.equal(total(sold.save), 5);
  assert.equal(sold.save.shop.cash, opened.save.shop.cash);
});

test('customer queues and daily admission are bounded, empty shelves do not consume quota', () => {
  let save = Shop.setBusinessOpen(first(), true);
  assert.equal(Shop.admitCustomer(save, catalog.products, feed), null);
  save = Shop.buyStock(save, product, 10, feed);
  for (let n = 0; n < 3; n++) save = Shop.admitCustomer(save, catalog.products, feed).save;
  assert.equal(Shop.admitCustomer(save, catalog.products, feed), null);
  assert.throws(() => Shop.setBusinessOpen(save, false), /没有结账/);
  for (let n = 0; n < 24; n++) {
    if (save.shop.business.pending.length) save = Shop.checkoutCustomer(save, save.shop.business.pending[0].id).save;
    const next = Shop.admitCustomer(save, catalog.products, feed);
    if (next) save = next.save;
  }
  assert.ok(save.shop.business.nextId <= Shop.customerLimit(save));
  assert.ok(save.shop.business.nextId <= 24);
  assert.equal(save.shop.business.pending.length, 0);
  const old = first(); delete old.shop.business;
  assert.equal(Shop.validate(old).shop.business.open, false);
  const bad = first(); bad.shop.business.receipts = ['1-2'];
  assert.throws(() => Shop.validate(bad), /收银记录/);
});

test('US historical anchor applies only to booster packs and remains explicit and distinct from CN MSRP', () => {
  const q = Shop.productQuote(first(), product, feed);
  assert.equal(q.source.kind, 'historical_us_msrp');
  assert.equal(q.source.usd_cents, 449);
  assert.equal(q.base, 3143);
  assert.equal(product.retail_cents, 1000);
  assert.equal(Shop.productQuote(first(), catalog.products.CS1DC, feed).source.kind, 'official_msrp');
});
