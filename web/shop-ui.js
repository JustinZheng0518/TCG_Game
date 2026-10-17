"use strict";
const Shop = globalThis.TCGShop;
const money = (cents) => `¥${(cents / 100).toLocaleString("zh-CN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
const marketURL = "https://raw.githubusercontent.com/JustinZheng0518/TCG_Game/main/data/shop/market-feed.json";

function ensureShopReady() {
  if (state.saveError) throw new Error(state.saveError);
  if (!state.products) throw new Error("正在读取经营资料，请稍候。");
}
function shopAction(action, success, target = "shop-message") {
  try {
    ensureShopReady();
    persistSave(action());
    filterCards();
    $(target).textContent = success;
  } catch (error) { $(target).textContent = error.message; }
}
function lineButton(label, callback, className = "") {
  const button = text("button", label, className);
  button.type = "button";
  button.addEventListener("click", callback);
  return button;
}
function jumpToSet(id, mode = "draw") {
  setMode(mode);
  location.hash = encodeURIComponent(id);
}
function renderShop() {
  if (!state.products || !state.save.shop) return;
  const s = state.save.shop;
  const stockCount = Object.values(s.stock).reduce((sum, n) => sum + n, 0);
  const listedCount = Object.values(s.listings).reduce((sum, entry) => sum + entry.count, 0);
  $("store-summary").replaceChildren();
  for (const [label, value] of [["可用现金 · 游戏币", money(s.cash)], ["营业日 / 店铺等级", `第 ${s.day} 天 · Lv.${s.level}`], ["未拆封库存 / 寄售", `${stockCount} 件 / ${listedCount} 张`], ["活动券 / 口碑", `${s.tickets} 张 / ${s.reputation}`]]) {
    const item = text("div", ""); item.append(text("span", label), text("strong", value)); $("store-summary").append(item);
  }
  $("work-day").disabled = s.worked;
  $("work-day").textContent = s.worked ? "今日店务已完成" : "打理店铺 · 赚 ¥50";
  $("upgrade-shop").textContent = s.level < 10 ? `扩建柜台 · ${money(s.level * 50000)}` : "柜台已满级";
  $("upgrade-shop").disabled = s.level >= 10;
  $("news-feed").replaceChildren();
  for (const item of Shop.news(state.save, state.feed)) {
    const article = text("article", "", "news-item");
    article.append(text("small", `${item.kind}${item.date ? ` · ${item.date}` : ` · 第 ${s.day} 天`}`), text("h3", item.title), text("p", item.detail));
    if (item.source_url) { const link = text("a", "阅读官方原文 ↗"); link.href = item.source_url; link.target = "_blank"; link.rel = "noopener"; article.append(link); }
    $("news-feed").append(article);
  }
  const code = text("p", `今日店长通讯码：SHOP-DAY-${String(s.day).padStart(4, "0")} · 获得 1 张活动券`, "daily-code");
  $("news-feed").append(code);
  $("daily-quests").replaceChildren();
  for (const quest of Shop.QUESTS) {
    const row = text("div", "", "quest-row");
    row.append(text("span", `${quest.label} · ${Math.min(s.progress[quest.field], quest.target)} / ${quest.target}`), text("small", `${money(quest.reward)} + ${quest.tickets} 券`));
    const button = lineButton(s.claimed.includes(quest.id) ? "已领取" : "领奖", () => shopAction(() => Shop.claim(state.save, quest.id), "任务奖励已入账。"));
    button.disabled = s.claimed.includes(quest.id) || s.progress[quest.field] < quest.target;
    row.append(button); $("daily-quests").append(row);
  }
  $("stock-list").replaceChildren();
  for (const [id, count] of Object.entries(s.stock)) {
    const product = state.products[id];
    if (!product) continue;
    const q = Shop.productQuote(state.save, product, state.feed);
    const row = text("div", "", "stock-row");
    row.append(text("strong", product.name), text("span", `${count} 件 · 预计顾客价 ${money(q.sale)} / 件`), lineButton("查看 / 拆封", () => jumpToSet(id)));
    $("stock-list").append(row);
  }
  if (!Object.keys(s.stock).length) $("stock-list").append(text("p", "货架还是空的。先去进货，结算营业日时顾客会来购买。", "muted-note"));
  $("listing-list").replaceChildren();
  for (const entry of Object.values(s.listings)) {
    const q = Shop.cardQuote(state.save, entry.card, state.feed);
    const row = text("div", "", "stock-row");
    row.append(text("strong", `${entry.card.name} · ${entry.card.rarity}`), text("span", `×${entry.count} · 预计到账 ${money(q.consignment)} / 张`), lineButton("下架 1 张", () => shopAction(() => Shop.trade(state.save, entry.card, "cancel", state.feed), "卡牌已回到收藏。")));
    $("listing-list").append(row);
  }
  if (!listedCount) $("listing-list").append(text("p", "在收藏中把单卡上架。寄售有更高回款，但需要等顾客成交；没卖出的卡会保留。", "muted-note"));
  $("shop-ledger").replaceChildren();
  for (const entry of s.ledger.slice(0, 12)) {
    const row = text("div", "", "ledger-row");
    row.append(text("small", `第 ${entry.day} 天`), text("span", entry.note), text("strong", `${entry.amount > 0 ? "+" : ""}${money(entry.amount)}`, entry.amount > 0 ? "income" : ""));
    $("shop-ledger").append(row);
  }
  if (!s.ledger.length) $("shop-ledger").append(text("p", "开店资金 ¥3,000 已准备好。先打理店铺，再采购第一批货吧。", "muted-note"));
  renderMarketStatus();
}
function renderMarketStatus() {
  if (!state.feed) return;
  const stale = Date.now() - Date.parse(state.feed.updated_at) > 3 * 86400000;
  $("market-status").textContent = `资料更新于 ${new Date(state.feed.updated_at).toLocaleString("zh-CN")}。${Object.keys(state.feed.products).length} 款商品有官方售价参考；${Object.keys(state.feed.cards || {}).length} 条外部单卡报价。${stale ? "当前快照较旧，可尝试刷新。" : ""}${state.marketNote || ""}`;
}
function renderAcquisition() {
  const product = state.products?.[state.selected?.id];
  if (!product || !state.cards.length) return;
  $("buy-stock-one").disabled = false;
  $("buy-stock-ten").disabled = false;
  $("acquire-special").disabled = false;
  const s = state.save.shop;
  const retail = Shop.RETAIL.includes(product.channel);
  const show = state.mode === "draw";
  const q = Shop.productQuote(state.save, product, state.feed);
  $("channel-badge").textContent = product.channel_label;
  $("channel-title").textContent = retail ? "让货架和收藏一起成长" : "这套卡有自己的相遇方式";
  const descriptions = {
    booster: "常规补充包：从供货商进货后，可拆包收藏，也可留在货架上等待顾客购买。每包 5 张，沿用独立 RR 保底与最高档 0.1% 的游戏规则。",
    special: `特色零售包：本套每份 ${product.cards_per_unit} 张，按收录卡面等概率模拟，不套用常规补充包的 RR 保底。`,
    deck: "预组与构筑：可作为未拆封商品出售，或拆为 60 张卡的游戏配方（58 张基础 + 2 张主力）。这不是实体卡组清单复刻。",
    gift: "礼盒特典：选择礼盒款式对应的卡面订购，获得所选卡面与 1 张活动券。每日限一份；体验价含特典估值，不复刻实体礼盒全部配件。",
    event: "赛事与活动：模拟报名并完成现场活动，随机获得本套 1 张参加奖、2 张活动券与 3 点口碑。每天限参加一次，不作为普通商品开包。",
    mission: "任务奖赏：通过店长任务积累活动券，使用 2 张券领取随机一张奖赏包卡面。现实中的任务条件、封入分配各有不同，此处为游戏兑换。",
    exchange: "特典兑换目录：这里汇集多种特典来源，不代表全部由兑换码发放。用本游戏兑换码或经营任务获得活动券，再用 3 张券选择一张卡面。",
    bundle: "组合附属包：不作为普通补充包售卖。用 1 张活动券领取一张随机体验卡；实体商品可能有 1 / 2 / 10 张等不同规格，本游戏统一为单张体验。"
  };
  $("channel-description").textContent = descriptions[product.channel] + (product.variant_distribution ? " 本套按官方第五弹工艺配比：平卡 / ex 89%、精灵球纹 10%、大师球纹 1%。" : "");
  $("product-price").textContent = retail || product.channel === "gift" ? `参考锚点 ${money(q.base)}（${q.source ? "官方建议零售价" : "模拟定价"}） ${q.source?.reference_date ? ` · 售价资料日期 ${q.source.reference_date}` : ""}${q.source?.observed_at ? ` · 抓取于 ${new Date(q.source.observed_at).toLocaleDateString("zh-CN")}` : ""} · 今日模拟行情 ${money(q.market)}${retail ? ` · 供货价 ${money(q.wholesale)} / 件` : ""}` : "非零售获取渠道 · 不消耗未拆封卡包库存";
  $("channel-source").href = q.source?.source_url || product.source_url;
  $("buy-stock-actions").hidden = !show || !retail;
  $("pack-actions").hidden = !show || !retail;
  $("special-actions").hidden = !show || retail;
  $("draw-rules").hidden = !show || product.channel !== "booster";
  $("draw-one").disabled = !retail || !(s.stock[product.id] > 0);
  $("draw-ten").disabled = !retail || (s.stock[product.id] || 0) < 10 || product.channel === "deck";
  $("draw-one").textContent = `拆封 1 件 · ${product.cards_per_unit} 张`;
  $("draw-ten").textContent = `拆封 10 件 · ${product.cards_per_unit * 10} 张`;
  $("buy-stock-one").textContent = `进货 1 件 · ${money(q.wholesale)}`;
  $("buy-stock-ten").textContent = `进货 10 件 · ${money(q.wholesale * 10)}`;
  $("stock-available").textContent = `本套未拆封库存 ${s.stock[product.id] || 0} 件 · 今日供货额度余 ${Math.max(0, 30 + s.level * 10 - s.progress.bought)} 件`;
  const choose = ["gift", "exchange"].includes(product.channel);
  $("reward-card").hidden = !choose;
  document.querySelector('label[for="reward-card"]').hidden = !choose;
  const selected = state.cards.find(c => c.id === $("reward-card").value) || state.cards[0];
  const giftPrice = Math.max(q.market, Math.ceil(Shop.cardQuote(state.save, selected, state.feed).ask * 1.1));
  const labels = {gift: `订购特典体验 · ${money(giftPrice)}`, event: "参加活动 · ¥20 报名费", mission: "领取任务奖赏包 · 2 张券", exchange: "兑换所选卡 · 3 张券", bundle: "领取附属包体验 · 1 张券"};
  $("acquire-special").textContent = labels[product.channel] || "获取卡牌";
  $("special-cost").textContent = `当前活动券 ${s.tickets} 张${product.channel === "event" && s.visits.includes("event") ? " · 今日活动已完成" : ""}${product.channel === "gift" && s.visits.includes("gift") ? " · 今日礼盒已领取" : ""}`;
}
function cardTradeControls(card) {
  const q = Shop.cardQuote(state.save, card, state.feed);
  const controls = text("div", "", "card-trade");
  controls.append(text("small", `${q.estimated ? "模拟估值" : "店内行情·外部参考"} ${money(q.market)}`));
  const actions = text("div", "", "card-trade-actions");
  if (state.mode === "album") actions.append(lineButton(`买入 ${money(q.ask)}`, () => shopAction(() => Shop.trade(state.save, card, "buy", state.feed), "单卡已买入并加入收藏。", "message")));
  if (state.save.counts[card.id]) {
    actions.append(lineButton(`卖 1 张 ${money(q.bid)}`, () => shopAction(() => Shop.trade(state.save, card, "sell", state.feed), "卡牌已卖出，回款已入账。", "message")));
    actions.append(lineButton("寄售 1 张", () => shopAction(() => Shop.trade(state.save, card, "list", state.feed), "已放入寄售柜，营业结算时等待顾客购买。", "message")));
  }
  controls.append(actions);
  return controls;
}
function acquireSpecial() {
  try {
    ensureShopReady();
    const result = Shop.acquire(state.save, state.products[state.selected.id], state.cards, $("reward-card").value, state.feed);
    showAcquired(result, false);
  } catch (error) { $("message").textContent = error.message; }
}
function showAcquired(result, animate = true) {
  const seen = new Set(Object.keys(state.save.counts));
  const drawn = result.drawn.map(card => { const isNew = !seen.has(card.id); seen.add(card.id); return {...card, isNew}; });
  persistSave(result.save);
  state.lastDraw = drawn;
  setMode("draw");
  $("message").textContent = `获得 ${drawn.length} 张卡，其中 ${drawn.filter(c => c.isNew).length} 款新卡。库存、现金与收藏均已保存。`;
  const product = state.products[state.selected.id];
  if (animate && product.channel !== "deck") opening.open(drawn, state.selected.name, product.cards_per_unit);
}
async function fetchMarket(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("行情地址必须使用 HTTPS，且不能包含账号密码。");
  const response = await fetch(parsed.href, {cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`行情服务返回 ${response.status}`);
  const body = await response.text();
  if (body.length > 8 * 1024 * 1024) throw new Error("行情文件超过 8 MB。");
  return Shop.feedValid(JSON.parse(body));
}
async function refreshMarket(custom = false) {
  const button = $(custom ? "load-market-url" : "refresh-market");
  button.disabled = true;
  try {
    const feed = await fetchMarket(custom ? $("market-url").value : `${marketURL}?t=${Date.now()}`);
    if (custom) {
      // Require exact known Simplified-Chinese card IDs. Ignore product/news overrides.
      const setIds = new Set(state.index.sets.map(set => set.id));
      const bySet = new Map();
      for (const id of Object.keys(feed.cards)) {
        const set = id.split(":")[0];
        if (!setIds.has(set)) throw new Error(`行情含有未知套装：${set}`);
        if (!bySet.has(set)) bySet.set(set, []);
        bySet.get(set).push(id);
      }
      for (const [setId, ids] of bySet) {
        const set = state.index.sets.find(s => s.id === setId);
        const cards = await readJSON(set.cards_path);
        const known = new Set(cards.map(c => c.id));
        if (ids.some(id => !known.has(id))) throw new Error("行情含有未知卡面编号，未应用本次更新。");
      }
      if (!Object.keys(feed.cards).length) throw new Error("该数据没有简中单卡报价。");
      const next = Shop.validate(state.save);
      next.shop.quotes = feed.cards;
      persistSave(next);
      state.feed = {...state.feed, cards: feed.cards};
      state.marketNote = "已接入自选服务的简中单卡报价，来源和时间可在卡牌详情查看。";
    } else {
      state.feed = {...feed, cards: {...feed.cards, ...state.feed.cards}};
      state.marketNote = "已从 GitHub 联网取得最新可用快照；非实时成交盘口。";
    }
    renderShop(); renderAcquisition(); filterCards();
  } catch (error) {
    state.marketNote = `刷新失败：${error.message}；继续使用已有快照。`;
    renderMarketStatus();
  } finally { button.disabled = false; }
}
function initShopUI() {
  for (const [id, label] of Object.entries(state.productCatalog.labels)) $("channel-filter").append(new Option(label, id));
  $("channel-filter").addEventListener("change", renderSets);
  $("reward-card").addEventListener("change", renderAcquisition);
  $("buy-stock-one").addEventListener("click", () => shopAction(() => Shop.buyStock(state.save, state.products[state.selected.id], 1, state.feed), "进货成功。可以拆封收藏，也可以留在货架上出售。", "message"));
  $("buy-stock-ten").addEventListener("click", () => shopAction(() => Shop.buyStock(state.save, state.products[state.selected.id], 10, state.feed), "10 件商品已入库。", "message"));
  $("acquire-special").addEventListener("click", acquireSpecial);
  $("work-day").addEventListener("click", () => shopAction(() => Shop.work(state.save), "今日店务完成：收入 ¥50，口碑 +1。"));
  $("upgrade-shop").addEventListener("click", () => shopAction(() => Shop.upgrade(state.save), "店铺升级成功！供货额度、接客量和每日运营费用已提高。"));
  $("end-day").addEventListener("click", () => {
    try {
      ensureShopReady();
      const {save, report: r} = Shop.endDay(state.save, state.products, state.feed);
      persistSave(save); filterCards();
      $("shop-message").textContent = `第 ${r.day} 天结算：出售 ${r.soldPacks} 件未拆封商品、${r.soldCards} 张寄售卡；销售回款 ${money(r.packRevenue + r.cardRevenue)}，运营支出 ${money(r.rent)}。${r.rewards.length ? `已自动领取任务奖励：${r.rewards.join("、")}。` : ""}今天的行情、任务和活动次数已刷新。`;
    } catch (error) { $("shop-message").textContent = error.message; }
  });
  $("redeem-form").addEventListener("submit", event => {
    event.preventDefault();
    shopAction(() => Shop.redeem(state.save, $("redeem-code").value), "兑换成功，奖励已入账。");
  });
  $("sell-duplicates").addEventListener("click", () => shopAction(() => Shop.sellDuplicates(state.save, state.cards, state.feed), "本套重复卡已卖出，每款保留 1 张。", "message"));
  $("refresh-market").addEventListener("click", () => refreshMarket());
  $("load-market-url").addEventListener("click", () => refreshMarket(true));
  renderShop();
}
