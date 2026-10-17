(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TCGGame = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const MAX_COUNT = 1_000_000_000;
  function tier(card) {
    const rarity = card.rarity.replace(/[★✦●◆\s]/g, "");
    if (["SAR", "FUR", "RGB", "UR", "HR", "SSR"].includes(rarity)) return 3;
    if (["SR", "RRR", "CSR", "S", "AR", "CHR"].includes(rarity) || card.rarity.includes("★★")) return 2;
    if (["R", "RR", "PR", "K", "A"].includes(rarity) || card.rarity.includes("★") || card.variant_code > 0) return 1;
    return 0;
  }
  function drawPacks(cards, count = 1, random = Math.random) {
    if (!Array.isArray(cards) || !cards.length) throw new Error("本套卡表尚未加载。");
    if (!Number.isInteger(count) || count < 1 || count > 10) throw new Error("一次可打开 1 至 10 包。");
    const pools = [[], [], [], []];
    for (const card of cards) pools[tier(card)].push(card);
    const weights = [80, 15, 4, 1];
    const result = [];
    function unit() {
      const value = random();
      if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("随机数无效。");
      return value;
    }
    for (let pack = 0; pack < count; pack++) {
      for (let slot = 0; slot < 5; slot++) {
        let eligible = pools.map((pool, index) => index).filter((index) => pools[index].length && (slot !== 4 || index > 0));
        if (!eligible.length) eligible = pools.map((pool, index) => index).filter((index) => pools[index].length);
        let target = unit() * eligible.reduce((sum, index) => sum + weights[index], 0);
        let selected = eligible[eligible.length - 1];
        for (const index of eligible) {
          target -= weights[index];
          if (target < 0) { selected = index; break; }
        }
        const pool = pools[selected];
        result.push(pool[Math.floor(unit() * pool.length)]);
      }
    }
    return result;
  }
  function validateSave(value) {
    if (!value || value.version !== 1 || !value.counts || typeof value.counts !== "object" || Array.isArray(value.counts)) throw new Error("不是有效的收藏存档。");
    const entries = Object.entries(value.counts);
    if (entries.length > 50000) throw new Error("存档条目过多。");
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
  return {tier, drawPacks, validateSave, collect, mergeSaves, stats};
});
