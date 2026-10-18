(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TCGGame = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const MAX_COUNT = 1_000_000_000;
  // Game balance, not official physical-product odds. Each high-rarity roll is per pack.
  const RARITY_GROUPS = [
    {label: "AR / CHR / S", rarities: ["AR", "CHR", "S"], probability: 0.12},
    {label: "SR / CSR", rarities: ["SR", "CSR"], probability: 0.06},
    {label: "SSR / HR", rarities: ["SSR", "HR"], probability: 0.02},
    {label: "SAR", rarities: ["SAR"], probability: 0.01},
    {label: "UR", rarities: ["UR"], probability: 0.003},
    {label: "FUR", rarities: ["FUR"], probability: 0.001}
  ];
  function rarity(card) {
    // Foil suffixes are printing variants, not higher rarity grades.
    return (card.rarity || "").trim().replace(/[★✦✧◇]+$/g, "") || (card.rarity || "").trim();
  }
  function group(card) {
    return RARITY_GROUPS.findIndex((entry) => entry.rarities.includes(rarity(card)));
  }
  function tier(card) {
    if (card.sport === "basketball") return card.is_chase || ["auto", "auto_patch", "memorabilia"].includes(card.basketball_kind) || card.serial_max <= 10 && card.serial_max > 0 ? 3 : ["parallel", "insert", "numbered"].includes(card.basketball_kind) ? 2 : card.is_rookie ? 1 : 0;
    const rank = group(card);
    if (rank >= 2) return 3;
    if (rank >= 0) return 2;
    return ["R", "RR", "RRR", "PR", "K", "A", "ACE", "★", "★★", "★★★"].includes(rarity(card)) ? 1 : 0;
  }
  function packModel(cards) {
    if (!Array.isArray(cards) || !cards.length) throw new Error("本套卡表尚未加载。");
    const ordinary = cards.filter((card) => group(card) < 0 && !["RR", "RRR"].includes(rarity(card)));
    const rr = cards.filter((card) => rarity(card) === "RR");
    const rrr = cards.filter((card) => rarity(card) === "RRR");
    const base = ordinary.length ? ordinary : rr.length ? rr : rrr.length ? rrr : cards;
    const guarantee = rr.length ? rr : rrr.length ? rrr : base;
    const groups = RARITY_GROUPS.map((entry, index) => ({...entry, cards: cards.filter((card) => group(card) === index)})).filter((entry) => entry.cards.length);
    // All-high-rarity promo sets cannot implement a meaningful rare-card chase.
    const fixed = !ordinary.length && !rr.length && !rrr.length;
    if (fixed) groups.length = 0;
    if (groups.length) groups[groups.length - 1].probability = 0.001;
    const chase = groups.length ? groups[groups.length - 1] : null;
    if (rrr.length && rr.length) groups.unshift({label: "RRR", cards: rrr, probability: 0.15});
    return {base, guarantee, groups, chase, fixed,
      guaranteeLabel: rr.length ? "每包保 1 张 RR" : rrr.length ? "本套无 RR，每包保 1 张 RRR" : "本套无 RR / RRR，使用本套基础卡池",
      baseProbability: 1 - groups.reduce((sum, entry) => sum + entry.probability, 0)};
  }
  function createDrawer(cards, random = Math.random) {
    const model = packModel(cards);
    function unit() {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("随机数无效。");
      return value;
    }
    function pick(pool) { return pool[Math.floor(unit() * pool.length)]; }
    return function (count = 1) {
      if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error("一次可打开 1 至 10 包。");
      const result = [];
      for (let pack = 0; pack < count; pack++) {
        for (let slot = 0; slot < 3; slot++) result.push(pick(model.base));
        result.push(pick(model.guarantee));
        const roll = unit();
        let ceiling = 0;
        let bonus = model.base;
        for (const entry of model.groups) {
          ceiling += entry.probability;
          if (roll < ceiling) { bonus = entry.cards; break; }
        }
        result.push(pick(bonus));
      }
      return result;
    };
  }
  function drawPacks(cards, count = 1, random = Math.random) {
    return createDrawer(cards, random)(count);
  }
  function validateSave(value) {
    if (!value || value.version !== 1 || !value.counts || typeof value.counts !== "object" || Array.isArray(value.counts)) throw new Error("不是有效的收藏存档。");
    const entries = Object.entries(value.counts);
    if (entries.length > 100000) throw new Error("存档条目过多。");
    for (const [id, count] of entries) {
      if (!/^[A-Za-z0-9_.-]+:\d+$/.test(id) || !Number.isSafeInteger(count) || count < 1 || count > MAX_COUNT) throw new Error("存档包含无效卡牌或数量。");
    }
    return {version: 1, counts: Object.fromEntries(entries)};
  }
  function collect(save, drawn) {
    const next = validateSave(save);
    for (const card of drawn) {
      const count = (next.counts[card.id] || 0) + 1;
      if (count > MAX_COUNT) throw new Error("该卡的收藏数量已达上限。");
      next.counts[card.id] = count;
    }
    return validateSave(next);
  }
  function mergeSaves(first, second) {
    const left = validateSave(first), right = validateSave(second);
    for (const [id, count] of Object.entries(right.counts)) left.counts[id] = Math.max(left.counts[id] || 0, count);
    return validateSave(left);
  }
  function stats(save) {
    const counts = Object.values(save.counts);
    return {unique: counts.length, total: counts.reduce((sum, count) => sum + count, 0)};
  }
  return {tier, rarity, packModel, createDrawer, drawPacks, validateSave, collect, mergeSaves, stats};
});
