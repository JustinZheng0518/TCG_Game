(function (root, factory) {
  const api = factory(typeof module === "object" && module.exports ? require("./game-core.js") : root.TCGGame);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TCGShop = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Game) {
  "use strict";
  const LIMIT = 1_000_000_000;
  const ID = /^[A-Za-z0-9_.-]+$/;
  const CARD_ID = /^[A-Za-z0-9_.-]+:\d+$/;
  const RETAIL = ["booster", "special", "deck"];
  const QUESTS = [
    {id: "open", label: "拆包研究", field: "opened", target: 5, reward: 1500, tickets: 2},
    {id: "sealed", label: "招待开包客", field: "soldPacks", target: 3, reward: 1000, tickets: 2},
    {id: "singles", label: "单卡成交", field: "soldCards", target: 2, reward: 1000, tickets: 2}
  ];
  const EVENTS = [
    {title: "补货车抵达，供应转松", detail: "零售包行情 -12%，单卡行情 -4%", pack: .88, card: .96},
    {title: "周末赛事热潮", detail: "零售包行情 +8%，单卡行情 +15%", pack: 1.08, card: 1.15},
    {title: "收藏专栏掀起讨论", detail: "零售包行情 +4%，单卡行情 +22%", pack: 1.04, card: 1.22},
    {title: "市场观望，交易放缓", detail: "零售包行情 -5%，单卡行情 -16%", pack: .95, card: .84},
    {title: "新品预热，老卡回温", detail: "零售包行情 +12%，单卡行情 +6%", pack: 1.12, card: 1.06},
    {title: "社区交换日", detail: "零售包行情回归基准，单卡行情 -6%", pack: 1, card: .94}
  ];
  function integer(value, min = 0, max = LIMIT) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error("经营存档包含无效数值。");
    return value;
  }
  function dictionary(value, pattern, max = 50000) {
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > max) throw new Error("经营存档格式无效。");
    const result = {};
    for (const [key, count] of Object.entries(value)) {
      if (!pattern.test(key) || ["__proto__", "constructor", "prototype"].includes(key)) throw new Error("经营存档标识无效。");
      result[key] = integer(count, 1);
    }
    return result;
  }
  function strings(value, max) {
    if (!Array.isArray(value) || value.length > max || value.some(v => typeof v !== "string" || v.length > 120)) throw new Error("经营记录无效。");
    return [...new Set(value)];
  }
  function newBusiness() {
    return {open: false, nextId: 0, pending: [], receipts: [], packRevenue: 0, cardRevenue: 0, soldPacks: 0, soldCards: 0};
  }
  function validateBusiness(value, day) {
    if (value === undefined) return newBusiness();
    if (!value || typeof value.open !== "boolean" || !Array.isArray(value.pending) || value.pending.length > 3) throw new Error("营业状态无效。");
    const result = {open: value.open, nextId: integer(value.nextId, 0, 24), pending: [], receipts: strings(value.receipts, 24)};
    for (const key of ["packRevenue", "cardRevenue", "soldPacks", "soldCards"]) result[key] = integer(value[key]);
    for (const order of value.pending) {
      if (!order || order.id !== `${day}-${order.serial}` || !Number.isInteger(order.serial) || order.serial < 1 || order.serial > result.nextId || order.day !== day || !["pack", "card"].includes(order.kind) || typeof order.name !== "string" || order.name.length > 200 || !(order.kind === "pack" ? ID : CARD_ID).test(order.itemId) || result.receipts.includes(order.id)) throw new Error("顾客订单无效。");
      result.pending.push({id: order.id, serial: order.serial, day, kind: order.kind, name: order.name, itemId: order.itemId, count: integer(order.count, 1, 2), unitPrice: integer(order.unitPrice, 1, 100000000)});
    }
    if (new Set(result.pending.map(order => order.id)).size !== result.pending.length || result.receipts.some(id => !new RegExp(`^${day}-[1-9]\\d?$`).test(id) || Number(id.split("-")[1]) > result.nextId)) throw new Error("顾客收银记录无效。");
    if (!result.open && result.pending.length) throw new Error("未营业时不能保留待付款订单。");
    return result;
  }
  function newShop() {
    return {business: newBusiness(), quotes: {}, cash: 300000, day: 1, reputation: 0, tickets: 0, level: 1, stock: {}, listings: {},
      progress: {opened: 0, soldPacks: 0, soldCards: 0, bought: 0}, claimed: [], redeemed: [], visits: [], worked: false, ledger: []};
  }
  function validate(value) {
    if (value?.version === 1) return {version: 2, counts: Game.validateSave(value).counts, shop: newShop()};
    if (value?.version !== 2) throw new Error("不是有效的卡店存档。");
    const counts = Game.validateSave({version: 1, counts: value.counts}).counts;
    const s = value.shop;
    if (!s || typeof s !== "object") throw new Error("缺少卡店经营数据。");
    const quotes = feedValid({schema_version: 1, currency: "CNY", language: "zh-CN", updated_at: "2026-10-17T00:00:00Z", products: {}, news: [], cards: s.quotes || {}}).cards;
    const shop = {quotes, cash: integer(s.cash), day: integer(s.day, 1, 1000000), reputation: integer(s.reputation), tickets: integer(s.tickets), level: integer(s.level, 1, 10),
      stock: dictionary(s.stock, ID, 300), listings: {}, progress: {}, claimed: strings(s.claimed, 3), redeemed: strings(s.redeemed, 100000), visits: strings(s.visits, 10),
      worked: Boolean(s.worked), ledger: []};
    shop.business = validateBusiness(s.business, shop.day);
    if (!s.progress || typeof s.progress !== "object") throw new Error("经营进度无效。");
    for (const key of ["opened", "soldPacks", "soldCards", "bought"]) shop.progress[key] = integer(s.progress[key]);
    if (!s.listings || typeof s.listings !== "object" || Array.isArray(s.listings) || Object.keys(s.listings).length > 50000) throw new Error("寄售记录无效。");
    for (const [id, entry] of Object.entries(s.listings)) {
      if (!CARD_ID.test(id) || entry?.card?.id !== id || entry.card.set_id !== id.split(":")[0] || typeof entry.card.name !== "string" || entry.card.name.length > 200 || typeof entry.card.rarity !== "string" || entry.card.rarity.length > 30) throw new Error("寄售卡牌无效。");
      shop.listings[id] = {count: integer(entry.count, 1), card: {id, set_id: entry.card.set_id, name: entry.card.name, rarity: entry.card.rarity, variant_code: integer(entry.card.variant_code || 0, 0, 100)}};
    }
    if (!Array.isArray(s.ledger) || s.ledger.length > 50) throw new Error("账本无效。");
    shop.ledger = s.ledger.map(entry => {
      if (!entry || typeof entry.note !== "string" || entry.note.length > 300) throw new Error("账本内容无效。");
      return {day: integer(entry.day, 1, 1000000), amount: integer(entry.amount, -LIMIT, LIMIT), note: entry.note};
    });
    return {version: 2, counts, shop};
  }
  function hash(value) {
    let result = 2166136261;
    for (const char of String(value)) result = Math.imul(result ^ char.charCodeAt(0), 16777619) >>> 0;
    return result;
  }
  function log(save, amount, note) {
    const cash = save.shop.cash + amount;
    integer(cash);
    save.shop.cash = cash;
    save.shop.ledger.unshift({day: save.shop.day, amount, note});
    save.shop.ledger.length = Math.min(50, save.shop.ledger.length);
  }
  function spend(save, amount, note) {
    integer(amount, 1);
    if (save.shop.cash < amount) throw new Error("现金不足。可以出售卡牌、营业售货，或先打理店铺赚取服务收入。");
    log(save, -amount, note);
  }
  function feedValid(feed) {
    if (feed?.schema_version !== 1 || feed.currency !== "CNY" || typeof feed.updated_at !== "string" || !Number.isFinite(Date.parse(feed.updated_at))) throw new Error("行情数据格式无效。");
    if (!Array.isArray(feed.news) || feed.news.length > 30 || !feed.products || typeof feed.products !== "object" || Array.isArray(feed.products)) throw new Error("行情数据内容无效。");
    const result = {schema_version: 1, currency: "CNY", language: "zh-CN", updated_at: feed.updated_at, products: {}, news: [], cards: {}};
    if (Object.keys(feed.products).length > 300) throw new Error("商品报价条目过多。");
    for (const [id, entry] of Object.entries(feed.products)) {
      if (!ID.test(id) || ["__proto__", "constructor", "prototype"].includes(id) || !/^https:\/\//.test(entry?.source_url || "") || !Number.isFinite(Date.parse(entry.observed_at))) throw new Error("商品报价缺少来源或时间。");
      result.products[id] = {cents: integer(entry.cents, 1, 100000000), source_url: entry.source_url, observed_at: entry.observed_at, kind: "official_msrp", reference_date: /^\d{4}-\d{2}-\d{2}$/.test(entry.reference_date || "") ? entry.reference_date : null};
    }
    result.news = feed.news.map(entry => {
      if (!entry || typeof entry.title !== "string" || entry.title.length > 240 || !/^https:\/\//.test(entry.source_url || "") || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date || "")) throw new Error("新闻条目无效。");
      return {title: entry.title, source_url: entry.source_url, date: entry.date, category: /\/event\//.test(entry.source_url) ? "event" : "product"};
    });
    if (feed.cards && (feed.language !== "zh-CN" || typeof feed.cards !== "object" || Array.isArray(feed.cards) || Object.keys(feed.cards).length > 50000)) throw new Error("单卡行情必须标明简体中文版本 zh-CN。");
    for (const [id, entry] of Object.entries(feed.cards || {})) {
      if (!CARD_ID.test(id) || !/^https:\/\//.test(entry?.source_url || "") || !Number.isFinite(Date.parse(entry.observed_at))) throw new Error("单卡报价缺少卡面编号、来源或时间。");
      result.cards[id] = {cents: integer(entry.cents, 1, 100000000), source_url: entry.source_url, observed_at: entry.observed_at};
    }
    return result;
  }
  function news(save, feed) {
    const event = EVENTS[(save.shop.day - 1) % EVENTS.length];
    const items = [{...event, kind: "模拟经营新闻"}];
    if (feed?.news?.length) {
      const item = feed.news[(save.shop.day - 1) % Math.min(feed.news.length, 8)];
      const tournament = item.category === "event";
      items.push({...item, kind: "官方新闻 · 影响为游戏推演", pack: tournament ? 1.03 : .98, card: tournament ? 1.08 : 1.02,
        detail: tournament ? "赛事关注度提升：包价 +3%，单卡 +8%（模拟）" : "新品消息带动换仓：包价 -2%，单卡 +2%（模拟）"});
    }
    return items;
  }
  function multiplier(save, feed, type, id) {
    const event = news(save, feed).reduce((value, item) => value * item[type], 1);
    const wave = 1 + .045 * Math.sin(save.shop.day * .73 + hash(id) % 100) + ((hash(id + ':' + save.shop.day) % 21) - 10) / 500;
    return event * wave;
  }
  function productQuote(save, product, feed) {
    const external = feed?.products?.[product.id];
    const us = product.channel === "booster" ? product.us_reference : null;
    const base = us ? Math.round(us.usd_cents * us.cny_per_usd) : external?.cents || product.retail_cents;
    const market = Math.max(100, Math.round(base * multiplier(save, feed, "pack", product.id)));
    return {market, wholesale: Math.max(1, Math.round(market * .72)), sale: Math.max(1, Math.round(market * .95)),
      base, source: us || external || (product.price_kind === "official_msrp" ? {source_url: product.source_url, kind: "official_msrp", reference_date: product.reference_date || null} : null)};
  }
  function cardQuote(save, card, feed) {
    const external = feed?.cards?.[card.id];
    const bases = {C: 40, U: 70, R: 150, RR: 600, RRR: 1200, AR: 2400, CHR: 2400, S: 2000, SR: 6500, CSR: 7500, SSR: 9500, HR: 12000, SAR: 30000, UR: 60000, FUR: 160000};
    const popularity = /皮卡丘|喷火龙|月亮伊布|梦幻|超梦|莉莉艾|玛俐/.test(card.name) ? 1.65 : 1;
    const variant = 1 + Math.min(6, card.variant_code || 0) * .2;
    const base = external?.cents || Math.round((bases[Game.rarity(card)] || 100) * popularity * variant);
    const market = Math.max(1, Math.round(base * multiplier(save, feed, "card", card.id)));
    return {market, bid: Math.max(1, Math.floor(market * .7)), ask: Math.ceil(market * 1.2), consignment: Math.max(1, Math.floor(market * .92)),
      source: external || null, estimated: !external};
  }
  function buyStock(value, product, count, feed) {
    const next = validate(value);
    if (!RETAIL.includes(product.channel)) throw new Error("该商品不能作为普通补充包进货，请使用专属获取渠道。");
    integer(count, 1, 10);
    if (next.shop.progress.bought + count > 30 + next.shop.level * 10) throw new Error("今日供货额度已用完，营业结算后刷新；升级店铺可增加额度。");
    const quote = productQuote(next, product, feed);
    spend(next, quote.wholesale * count, `进货 ${product.name} ×${count}`);
    next.shop.stock[product.id] = (next.shop.stock[product.id] || 0) + count;
    next.shop.progress.bought += count;
    return validate(next);
  }
  function buyAndOpen(value, product, cards, count, feed, random = Math.random) {
    integer(count, 1, 10);
    // Consume existing inventory first; purchase only the shortage. The caller
    // persists this final state once, so a failed draw never leaves a charge.
    const current = validate(value);
    const missing = Math.max(0, count - (current.shop.stock[product.id] || 0));
    const supplied = missing ? buyStock(current, product, missing, feed) : current;
    return openStock(supplied, product, cards, count, random);
  }
  function pick(cards, random) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("随机数无效。");
    return cards[Math.floor(value * cards.length)];
  }
  function addCards(save, cards) {
    save.counts = Game.collect({version: 1, counts: save.counts}, cards).counts;
  }
  function openStock(value, product, cards, count, random = Math.random) {
    const next = validate(value);
    integer(count, 1, 10);
    if (!RETAIL.includes(product.channel) || !cards.length) throw new Error("请使用该商品的专属获取渠道。");
    if ((next.shop.stock[product.id] || 0) < count) throw new Error("未拆封库存不足，请先从供货商进货。");
    let drawn = [];
    if (product.channel === "booster") drawn = Game.drawPacks(cards, count, random);
    else if (product.channel === "special") {
      for (let i = 0; i < count * product.cards_per_unit; i++) drawn.push(pick(cards, random));
    } else {
      // A declared game recipe: not a reconstructed official 60-card decklist.
      const base = cards.filter(c => Game.tier(c) < 2 && !["RR", "RRR"].includes(Game.rarity(c)));
      const ace = cards.filter(c => ["RR", "RRR"].includes(Game.rarity(c)));
      for (let deck = 0; deck < count; deck++) {
        for (let i = 0; i < 58; i++) drawn.push(pick(base.length ? base : cards, random));
        for (let i = 0; i < 2; i++) drawn.push(pick(ace.length ? ace : base.length ? base : cards, random));
      }
    }
    addCards(next, drawn);
    next.shop.stock[product.id] -= count;
    if (!next.shop.stock[product.id]) delete next.shop.stock[product.id];
    next.shop.progress.opened += count;
    log(next, 0, `拆封 ${product.name} ×${count}，入库 ${drawn.length} 张`);
    return {save: validate(next), drawn};
  }
  function trade(value, card, action, feed) {
    const next = validate(value), quote = cardQuote(next, card, feed);
    if (action === "buy") { spend(next, quote.ask, `柜台买入 ${card.name}`); addCards(next, [card]); }
    else if (action === "sell" || action === "list") {
      if (!(next.counts[card.id] > 0)) throw new Error("没有可出售的这张卡牌。");
      next.counts[card.id]--;
      if (!next.counts[card.id]) delete next.counts[card.id];
      if (action === "sell") { log(next, quote.bid, `即时卖出 ${card.name}`); next.shop.progress.soldCards++; }
      else {
        const entry = next.shop.listings[card.id] || {count: 0, card: {id: card.id, set_id: card.set_id, name: card.name, rarity: card.rarity, variant_code: card.variant_code || 0}};
        entry.count++;
        next.shop.listings[card.id] = entry;
        log(next, 0, `上架 ${card.name}，等待顾客购买`);
      }
    } else if (action === "cancel") {
      const entry = next.shop.listings[card.id];
      if (!entry) throw new Error("该卡没有上架。");
      addCards(next, [entry.card]);
      if (--entry.count === 0) delete next.shop.listings[card.id];
    } else throw new Error("未知的交易操作。");
    return validate(next);
  }
  function sellDuplicates(value, cards, feed) {
    const next = validate(value);
    let amount = 0, revenue = 0;
    for (const card of cards) {
      const count = Math.max(0, (next.counts[card.id] || 0) - 1);
      if (!count) continue;
      amount += count;
      revenue += cardQuote(next, card, feed).bid * count;
      next.counts[card.id] = 1;
    }
    if (!amount) throw new Error("本套没有重复卡，已保留每款最后一张。");
    next.shop.progress.soldCards += amount;
    log(next, revenue, `出售本套重复卡 ${amount} 张（每款保留 1 张）`);
    return validate(next);
  }
  function acquire(value, product, cards, chosenId, feed, random = Math.random) {
    const next = validate(value);
    if (!cards.length) throw new Error("卡表尚未加载。");
    const channel = product.channel;
    if (RETAIL.includes(channel)) throw new Error("请先购买库存再拆封。");
    const selected = cards.find(c => c.id === chosenId) || cards[0];
    let drawn;
    if (channel === "event") {
      if (next.shop.visits.includes("event")) throw new Error("今天已经参加过活动，营业结算后可再次参与。");
      spend(next, 2000, `参加店外活动：${product.name}（模拟报名费）`);
      if (product.variant_distribution) {
        const roll = random();
        if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error("随机数无效。");
        let ceiling = 0, selectedVariant = 0;
        for (const [variant, probability] of Object.entries(product.variant_distribution)) {
          ceiling += probability;
          if (roll < ceiling) { selectedVariant = Number(variant); break; }
        }
        const pool = cards.filter(card => card.variant_code === selectedVariant);
        if (!pool.length) throw new Error("活动卡表与官方工艺配比不匹配。");
        drawn = [pick(pool, random)];
      } else drawn = [pick(cards, random)];
      next.shop.visits.push("event");
      next.shop.reputation += 3;
      next.shop.tickets += 2;
    } else if (channel === "gift") {
      if (next.shop.visits.includes("gift")) throw new Error("每天限订一份礼盒体验，明天再来。");
      const price = Math.max(productQuote(next, product, feed).market, Math.ceil(cardQuote(next, selected, feed).ask * 1.1));
      spend(next, price, `订购礼盒特典体验：${selected.name}`);
      drawn = [selected];
      next.shop.visits.push("gift");
      next.shop.tickets++;
    } else if (["mission", "exchange", "bundle"].includes(channel)) {
      const cost = channel === "exchange" ? 3 : channel === "mission" ? 2 : 1;
      if (next.shop.tickets < cost) throw new Error(`需要 ${cost} 张活动券。完成经营任务、参加活动或领取游戏兑换码可获得。`);
      next.shop.tickets -= cost;
      drawn = ["bundle", "mission"].includes(channel) ? [pick(cards, random)] : [selected];
    } else throw new Error("尚不支持的获取渠道。");
    addCards(next, drawn);
    log(next, 0, `${product.channel_label}：获得 ${drawn.length} 张卡牌`);
    return {save: validate(next), drawn};
  }
  function work(value) {
    const next = validate(value);
    if (next.shop.worked) throw new Error("今天已经打理过店铺。");
    next.shop.worked = true;
    next.shop.reputation++;
    log(next, 5000, "整理货架、教学体验：服务收入");
    return validate(next);
  }
  function claim(value, id) {
    const next = validate(value), quest = QUESTS.find(q => q.id === id);
    if (!quest || next.shop.claimed.includes(id) || next.shop.progress[quest.field] < quest.target) throw new Error("任务尚未完成，或今天已经领取过奖励。");
    next.shop.claimed.push(id);
    next.shop.tickets += quest.tickets;
    log(next, quest.reward, `完成经营任务：${quest.label}`);
    return validate(next);
  }
  function redeem(value, code) {
    const next = validate(value);
    const cleaned = code.trim().toUpperCase();
    const daily = `SHOP-DAY-${String(next.shop.day).padStart(4, "0")}`;
    if (!["START-STORE", daily].includes(cleaned)) throw new Error("兑换码无效或已过期。请查看今日店长通讯。");
    if (next.shop.redeemed.includes(cleaned)) throw new Error("这个兑换码已经使用过。");
    next.shop.redeemed.push(cleaned);
    next.shop.tickets += cleaned === "START-STORE" ? 3 : 1;
    log(next, cleaned === "START-STORE" ? 10000 : 0, `游戏兑换码：${cleaned}`);
    return validate(next);
  }
  function upgrade(value) {
    const next = validate(value);
    if (next.shop.level >= 10) throw new Error("店铺已达最高等级。");
    spend(next, next.shop.level * 50000, "升级店铺：扩大供货额度与接客能力");
    next.shop.level++;
    next.shop.reputation += 5;
    return validate(next);
  }
  function customerLimit(value) { return Math.min(24, 6 + value.shop.level * 2 + Math.floor(value.shop.reputation / 5)); }
  function setBusinessOpen(value, open) {
    const next = validate(value);
    if (typeof open !== "boolean") throw new Error("营业开关无效。");
    if (!open && next.shop.business.pending.length) throw new Error("还有顾客没有结账，请等他们付款后打烊。");
    next.shop.business.open = open;
    return validate(next);
  }
  function admitCustomer(value, products, feed) {
    const next = validate(value), s = next.shop, business = s.business;
    if (!business.open) throw new Error("请先开门营业。");
    if (business.pending.length >= 3 || business.nextId >= customerLimit(next)) return null;
    const reserved = new Map();
    for (const order of business.pending) reserved.set(`${order.kind}:${order.itemId}`, (reserved.get(`${order.kind}:${order.itemId}`) || 0) + order.count);
    const packs = Object.keys(s.stock).filter(id => products[id] && RETAIL.includes(products[id].channel) && s.stock[id] > (reserved.get(`pack:${id}`) || 0));
    const cards = Object.keys(s.listings).filter(id => s.listings[id].count > (reserved.get(`card:${id}`) || 0));
    if (!packs.length && !cards.length) return null;
    const serial = business.nextId + 1;
    const kind = cards.length && (!packs.length || serial % 3 === 1) ? "card" : "pack";
    const pool = kind === "pack" ? packs : cards;
    const itemId = pool[hash(`${s.day}:${serial}`) % pool.length];
    const quote = kind === "pack" ? productQuote(next, products[itemId], feed).sale : cardQuote(next, s.listings[itemId].card, feed).consignment;
    const order = {id: `${s.day}-${serial}`, serial, day: s.day, kind, itemId, count: 1, unitPrice: quote,
      name: kind === "pack" ? products[itemId].name : s.listings[itemId].card.name};
    business.nextId = serial;
    business.pending.push(order);
    return {save: validate(next), order};
  }
  function checkoutCustomer(value, id) {
    const next = validate(value), s = next.shop, business = s.business;
    if (business.receipts.includes(id)) return {save: next, receipt: {id, duplicate: true, revenue: 0, count: 0}};
    const order = business.pending.find(item => item.id === id);
    if (!order || !business.open) throw new Error("顾客订单已失效。");
    const available = order.kind === "pack" ? s.stock[order.itemId] || 0 : s.listings[order.itemId]?.count || 0;
    const count = Math.min(available, order.count);
    const revenue = count * order.unitPrice;
    if (count) {
      if (order.kind === "pack") {
        s.stock[order.itemId] -= count;
        if (!s.stock[order.itemId]) delete s.stock[order.itemId];
        business.soldPacks += count; business.packRevenue += revenue; s.progress.soldPacks += count;
      } else {
        s.listings[order.itemId].count -= count;
        if (!s.listings[order.itemId].count) delete s.listings[order.itemId];
        business.soldCards += count; business.cardRevenue += revenue; s.progress.soldCards += count;
      }
      log(next, revenue, `顾客 ${order.id} 付款：${order.name} ×${count}`);
      s.reputation++;
    } else log(next, 0, `顾客 ${order.id} 因缺货离店`);
    business.pending = business.pending.filter(item => item.id !== id);
    business.receipts.push(id);
    return {save: validate(next), receipt: {id, kind: order.kind, name: order.name, revenue, count, duplicate: false}};
  }
  function endDay(value, products, feed) {
    const next = validate(value), s = next.shop;
    if (s.business.pending.length) throw new Error("还有顾客没有结账，请等他们付款后打烊。");
    const {packRevenue, cardRevenue, soldPacks, soldCards} = s.business;
    // Settle completed sales quests before resetting the daily counters.
    const rewards = [];
    for (const quest of QUESTS) {
      if (s.progress[quest.field] >= quest.target && !s.claimed.includes(quest.id)) {
        s.claimed.push(quest.id);
        s.tickets += quest.tickets;
        log(next, quest.reward, `结算自动领取：${quest.label}`);
        rewards.push(quest.label);
      }
    }
    const rent = Math.min(s.cash, 1500 + (s.level - 1) * 500);
    log(next, -rent, "今日租金与运营支出");
    s.reputation += Math.min(5, soldPacks + soldCards);
    const day = s.day;
    s.day++;
    s.progress = {opened: 0, soldPacks: 0, soldCards: 0, bought: 0};
    s.claimed = [];
    s.visits = [];
    s.worked = false;
    s.business = newBusiness();
    return {save: validate(next), report: {day, soldPacks, soldCards, packRevenue, cardRevenue, rent, rewards}};
  }
  return {RETAIL, QUESTS, validate, news, hash, feedValid, productQuote, cardQuote, buyStock, buyAndOpen, openStock, trade, sellDuplicates, acquire, work, claim, redeem, upgrade, customerLimit, setBusinessOpen, admitCustomer, checkoutCustomer, endDay};
});
