"use strict";

const $ = (id) => document.getElementById(id);
const state = {index: null, cards: [], selected: null, filtered: [], shown: 0, request: 0, localImages: null, localOriginals: false};
const PAGE_SIZE = 72;
const Game = globalThis.TCGGame;
const SAVE_KEY = "TCG_Game:collection:v1";
state.mode = "shop";
state.lastDraw = [];
state.collectionCards = [];
state.collectionSet = "";
state.collectionLoading = false;
state.collectionError = "";
const cardSetCache = new Map();
let collectionRequest = 0;
state.save = Shop.validate({version: 1, counts: {}});
state.saveError = "";
state.rawSave = null;
const opening = new PackOpening($("opening-dialog"), (card) => state.localImages ? card.thumbnail : card.source_url);

function loadSave() {
  try {
    state.rawSave = localStorage.getItem(SAVE_KEY);
    if (state.rawSave) state.save = Shop.validate(JSON.parse(state.rawSave));
  } catch {
    state.saveError = "无法读取浏览器收藏。请先导出备份或导入有效存档；原有数据已保留。";
  }
}

function persistSave(next) {
  const clean = Shop.validate(next);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(clean)); }
  catch { throw new Error("浏览器无法保存收藏，请允许本地存储后再试。"); }
  state.save = clean;
  state.saveError = "";
  updateStats();
  renderSets();
  renderShop();
  renderAcquisition();
  if (state.mode === "collection") loadCollection();
}

function updateStats() {
  const stats = Game.stats(state.save);
  $("owned-stats").textContent = `已收藏 ${stats.unique.toLocaleString("zh-CN")} 款 · 共 ${stats.total.toLocaleString("zh-CN")} 张`;
  const owned = state.cards.filter((card) => state.save.counts[card.id]).length;
  $("set-progress").textContent = `本套 ${owned} / ${state.cards.length || "—"} 款`;
}

function setMode(mode) {
  if (!["shop", "draw", "collection", "album", "events"].includes(mode)) return;
  const changed = state.mode !== mode;
  if (changed && mode === "collection") state.collectionSet = "";
  if (changed && businessScene) { businessScene.world.releaseInput(); if (mode !== "shop" && businessScene.world.expanded) businessScene.world.setExpanded(false); }
  state.mode = mode;
  document.body.dataset.mode = mode;
  for (const button of document.querySelectorAll("button[data-mode]")) button.setAttribute("aria-pressed", String(button.dataset.mode === mode || mode === "album" && button.matches(".mode-tabs [data-mode=collection]")));
  $("shop-dashboard").hidden = mode !== "shop";
  $("catalog-area").hidden = !["draw", "collection", "album"].includes(mode);
  $("activity-room").hidden = mode !== "events";
  $("acquisition-area").hidden = mode !== "draw";
  updateRoomHeading();
  renderAcquisition();
  $("card-search").value = "";
  $("rarity-filter").value = "";
  if (mode === "collection") loadCollection();
  else refreshRarities(state.cards);
  filterCards();
  if (changed) window.scrollTo(0, 0);
}

async function readCardSet(set) {
  if (!cardSetCache.has(set.id)) {
    const pending = readJSON(set.cards_path).catch(error => { cardSetCache.delete(set.id); throw error; });
    cardSetCache.set(set.id, pending);
  }
  return cardSetCache.get(set.id);
}
function refreshRarities(cards) {
  const previous = $("rarity-filter").value;
  const values = [...new Set(cards.map(c => c.rarity))];
  $("rarity-filter").replaceChildren(new Option("全部稀有度", ""), ...values.map(value => new Option(value, value)));
  if (values.includes(previous)) $("rarity-filter").value = previous;
}
async function loadCollection() {
  if (!state.index) return;
  const request = ++collectionRequest;
  const ownedSets = new Set(Object.keys(state.save.counts).map(id => id.split(":")[0]));
  const sets = state.index.sets.filter(set => ownedSets.has(set.id));
  state.collectionLoading = true;
  $("sell-duplicates").disabled = true;
  $("collection-notice").textContent = "整理卡册中…";
  $("retry-collection").hidden = true;
  const results = [], failures = [];
  let cursor = 0;
  await Promise.all(Array.from({length: Math.min(4, sets.length)}, async () => {
    while (cursor < sets.length) {
      const set = sets[cursor++];
      try { results.push(...await readCardSet(set)); } catch { failures.push(set.id); }
    }
  }));
  if (request !== collectionRequest) return;
  state.collectionLoading = false;
  state.collectionCards = results.filter(card => state.save.counts[card.id]).sort((a, b) => Game.tier(b) - Game.tier(a) || a.name.localeCompare(b.name, "zh-CN") || a.id.localeCompare(b.id));
  const readIds = new Set(results.map(card => card.id));
  const unknown = Object.keys(state.save.counts).filter(id => !readIds.has(id)).length;
  state.collectionError = failures.length || unknown ? `有 ${unknown} 款卡暂未读出，收藏已保留。` : "";
  $("collection-notice").textContent = state.collectionError;
  $("retry-collection").hidden = !state.collectionError;
  $("sell-duplicates").disabled = !!state.collectionError;
  const filter = $("collection-set");
  filter.replaceChildren(new Option("全部系列", ""), ...sets.map(set => new Option(set.name, set.id)));
  if (sets.some(set => set.id === state.collectionSet)) filter.value = state.collectionSet;
  else state.collectionSet = "";
  if (state.mode === "collection") { refreshRarities(state.collectionCards); filterCards(); }
}

function openPacks(count) {
  try {
    ensureShopReady();
    const result = Shop.buyAndOpen(state.save, state.products[state.selected.id], state.cards, count, state.feed);
    showAcquired(result);
  } catch (error) { $("message").textContent = error.message; }
}

function exportSave() {
  const content = state.saveError && state.rawSave ? state.rawSave : JSON.stringify(state.save, null, 2);
  const blob = new Blob([content], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "小小卡店经营备份.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importSave(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 8 * 1024 * 1024) throw new Error("存档文件过大，最大支持 8 MB。");
    const raw = JSON.parse(await file.text());
    const imported = Shop.validate(raw);
    if (raw.version === 2) {
      if (!confirm(`恢复经营存档将替换当前现金、库存和收藏。备份：第 ${imported.shop.day} 天，${money(imported.shop.cash)}。是否继续？`)) return;
      persistSave(imported);
    } else {
      const next = Shop.validate(state.save);
      const signature = `LEGACY-${Shop.hash(JSON.stringify(Object.entries(imported.counts).sort()))}`;
      if (next.shop.redeemed.includes(signature)) throw new Error("这份旧版收藏已导入过，不能重复增加已卖出的卡牌。");
      next.counts = Game.mergeSaves({version: 1, counts: next.counts}, {version: 1, counts: imported.counts}).counts;
      next.shop.redeemed.push(signature);
      persistSave(next);
    }
    $("desk-dialog").close();
    setMode("collection");
    $("message").textContent = raw.version === 2 ? "现金、库存、寄售和收藏已恢复。" : "旧版收藏已合并，经营资金与进度保持不变。";
  } catch (error) { $("message").textContent = `导入失败：${error.message} 当前收藏未改变。`; }
  finally { event.target.value = ""; }
}

function text(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

async function readJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`无法读取卡牌档案 (${response.status})`);
  return response.json();
}

function renderSets() {
  const query = $("set-search").value.trim().toLocaleLowerCase();
  const series = $("series-filter").value;
  const channel = $("channel-filter").value;
  const matching = state.index.sets.filter((set) =>
    (!series || set.series === series) && (!channel || state.products?.[set.id]?.channel === channel) && `${set.id} ${set.name}`.toLocaleLowerCase().includes(query));
  $("set-list").replaceChildren();
  $("set-count").textContent = `${matching.length} 套`;
  const ownedBySet = new Map();
  for (const id of Object.keys(state.save.counts)) {
    const setId = id.split(":")[0];
    ownedBySet.set(setId, (ownedBySet.get(setId) || 0) + 1);
  }
  const channelOrder = ["booster", "special", "deck", "gift", "event", "mission", "exchange", "bundle"];
  const grouped = [...matching].sort((a, b) => channelOrder.indexOf(state.products[a.id].channel) - channelOrder.indexOf(state.products[b.id].channel));
  let previousChannel = "";
  for (const set of grouped) {
    const product = state.products[set.id];
    if (!channel && previousChannel !== product.channel) {
      $("set-list").append(text("h3", product.channel_label, "set-group-label"));
      previousChannel = product.channel;
    }
    const button = text("button", "", `set-button${state.selected?.id === set.id ? " active" : ""}`);
    button.type = "button";
    button.setAttribute("aria-pressed", String(state.selected?.id === set.id));
    button.append(text("strong", set.name));
    button.append(text("span", state.products?.[set.id]?.channel_label || "", "set-channel"));
    const sub = text("small", "");
    const owned = ownedBySet.get(set.id) || 0;
    sub.append(text("span", set.id), text("span", `${owned} / ${set.card_faces}`));
    button.append(sub);
    button.addEventListener("click", () => jumpToSet(set.id, state.mode === "shop" ? "draw" : state.mode));
    $("set-list").append(button);
  }
  if (!matching.length) $("set-list").append(text("p", "未找到对应系列", "message"));
}

function showCard(card) {
  $("dialog-title").textContent = card.name;
  $("dialog-number").textContent = `${card.set_id} · ${card.number}`;
  const quote = Shop.cardQuote(state.save, card, state.feed);
  $("dialog-meta").textContent = `${card.rarity} · ${card.type || "卡牌"}\n简体中文版${card.illustrators.length ? `\n插画：${card.illustrators.join("、")}` : ""}\n${quote.estimated ? "模拟估值" : "店内行情（外部参考）"} ${money(quote.market)} · 回收 ${money(quote.bid)}\n${quote.source ? `来源参考价：${money(quote.source.cents)}\n来源：${quote.source.source_url}\n抓取时间：${quote.source.observed_at}` : "按稀有度、加工与人气推算，并非真实成交价"}`;
  $("dialog-image").src = state.localOriginals ? card.image : card.source_url;
  $("dialog-image").onerror = () => {
    $("dialog-image").onerror = null;
    if (state.localImages) $("dialog-image").src = card.thumbnail;
  };
  $("dialog-image").alt = `${card.name} 简体中文卡面`;
  prepareLivePrice(card);
  if (!$("card-dialog").open) $("card-dialog").showModal();
}

function appendCards() {
  const batch = state.filtered.slice(state.shown, state.shown + PAGE_SIZE);
  for (const card of batch) {
    const tile = text("article", "", `card-tile rarity-tier-${Game.tier(card)}`);
    const button = text("button", "", "card-button");
    button.type = "button";
    button.setAttribute("aria-label", `查看 ${card.name} ${card.number} ${card.rarity}`);
    const image = document.createElement("img");
    image.loading = "lazy";
    image.decoding = "async";
    image.width = 300;
    image.height = 419;
    image.alt = `${card.name} ${card.rarity} 简体中文卡面`;
    image.src = state.localImages ? card.thumbnail : card.source_url;
    let originalTried = false;
    image.addEventListener("error", () => {
      if (!originalTried && state.localImages) { originalTried = true; image.src = card.source_url; return; }
      image.remove();
      button.replaceChildren(text("span", "卡面暂缺", "missing-label"));
      button.disabled = true;
    });
    button.append(image);
    button.addEventListener("click", () => showCard(card));
    const label = text("div", "", "card-label");
    label.append(text("span", state.mode === "collection" ? card.set_id : card.number), text("span", card.rarity, "rarity"));
    const name = text("h2", "", "card-name");
    name.append(text("span", card.name));
    if (state.save.counts[card.id]) name.append(text("span", `×${state.save.counts[card.id]}`, "owned-count"));
    tile.append(button, label, name, cardTradeControls(card));
    if (state.mode === "draw" && card.isNew) tile.append(text("span", "新卡", "new-badge"));
    $("cards").append(tile);
  }
  state.shown += batch.length;
  $("load-more").hidden = state.shown >= state.filtered.length;
}

function filterCards() {
  if (["shop", "events"].includes(state.mode)) { $("cards").replaceChildren(); return; }
  const query = $("card-search").value.trim().toLocaleLowerCase();
  const rarity = $("rarity-filter").value;
  const base = state.mode === "draw" ? state.lastDraw : state.mode === "collection" ? state.collectionCards.filter((card) => state.save.counts[card.id] && (!state.collectionSet || card.set_id === state.collectionSet)) : state.cards;
  state.filtered = base.filter((card) => (!rarity || card.rarity === rarity)
    && `${card.name} ${card.number} ${card.set_id}`.toLocaleLowerCase().includes(query));
  state.shown = 0;
  $("cards").replaceChildren();
  $("result-count").textContent = `${state.filtered.length.toLocaleString("zh-CN")} 张卡面`;
  $("message").textContent = state.saveError || (state.filtered.length ? "" : !base.length && state.mode === "draw" ? "选择本套对应的获取渠道，开始经营与收集。" : !base.length && state.mode === "collection" ? state.collectionLoading ? "整理卡册中…" : state.collectionError ? "请重试读取收藏。" : "卡册空空的，去拆一包吧！" : "没有找到符合条件的卡牌，试试其他卡名或稀有度。");
  appendCards();
}

async function selectSet() {
  let code;
  try { code = decodeURIComponent(location.hash.slice(1)); } catch { code = ""; }
  const set = state.index.sets.find((entry) => entry.id === code) || state.index.sets.find((entry) => entry.source_goods_type === "1") || state.index.sets[0];
  const request = ++state.request;
  state.selected = set;
  state.cards = [];
  state.lastDraw = [];
  state.filtered = [];
  state.shown = 0;
  $("result-count").textContent = "";
  $("set-title").textContent = set.name;
  $("set-code").textContent = set.id;
  $("set-date").textContent = set.release_date ? `发行于 ${set.release_date}` : "";
  $("set-description").textContent = `${set.series} · ${set.distinct_card_numbers} 个卡号 · ${set.card_faces} 张卡面，含不同闪卡版本`;
  $("message").textContent = "正在读取本套卡牌…";
  $("set-odds").textContent = "正在读取本套概率…";
  $("cards").replaceChildren();
  $("load-more").hidden = true;
  $("draw-one").disabled = true;
  $("draw-ten").disabled = true;
  $("buy-stock-one").disabled = true;
  $("buy-stock-ten").disabled = true;
  $("acquire-special").disabled = true;
  $("card-search").value = "";
  $("rarity-filter").replaceChildren(new Option("全部稀有度", ""));
  renderSets();
  try {
    const cards = await readCardSet(set);
    if (request !== state.request) return;
    if (state.localImages === null && cards.length) {
      const available = await Promise.all([cards[0].thumbnail, cards[0].image].map(async (path) => {
        try { return (await fetch(path, {method: "HEAD"})).ok; } catch { return false; }
      }));
      state.localImages = available[0];
      state.localOriginals = available[1];
    }
    if (request !== state.request) return;
    state.cards = cards;
    const model = Game.packModel(cards);
    const odds = model.groups.map((entry) => `${entry.label}${entry === model.chase ? "（本套最高档）" : ""}：${Number((entry.probability * 100).toFixed(3))}%`).join("；");
    $("set-odds").textContent = `${model.guaranteeLabel}。${model.fixed ? "本套仅收录高稀有卡，按本套卡面等概率模拟，不适用千包稀有档。" : odds ? `机会卡每包概率：${odds}；其余 ${Number((model.baseProbability * 100).toFixed(3))}% 为基础卡。` : "本套无高稀有档，机会卡从基础卡池抽取，不适用千包稀有档。"}`;
    $("reward-card").replaceChildren(...cards.map(card => new Option(`${card.number} · ${card.name} · ${card.rarity}`, card.id)));
    renderAcquisition();
    updateStats();
    if (state.mode !== "collection") refreshRarities(cards);
    filterCards();
  } catch (error) {
    if (request === state.request) { state.cards = []; $("message").textContent = error.message; $("result-count").textContent = ""; }
  }
}

async function start() {
  loadSave();
  try {
    const [index, products, feed] = await Promise.all([readJSON("data/pokemon/zh-CN/index.json"), readJSON("data/shop/products.json"), readJSON("data/shop/market-feed.json")]);
    state.index = index;
    state.productCatalog = products;
    state.products = products.products;
    state.feed = Shop.feedValid(feed);
    state.feed.cards = state.save.shop.quotes;
    initShopUI();
    initGameScene();
    state.index.sets.sort((a, b) => (b.release_date || "").localeCompare(a.release_date || "") || b.source_collection_id - a.source_collection_id);
    $("library-stats").textContent = `${state.index.set_count} 个系列 · 简体中文卡面`;
    for (const series of new Set(state.index.sets.map((set) => set.series))) $("series-filter").append(new Option(series, series));
    $("library-status").textContent = "简体中文卡牌 · 本地档案";
    readJSON("data/pokemon/zh-CN/coverage.json").then((coverage) => {
      $("library-status").textContent = `${state.index.set_count} 套简体中文卡牌`;
    }).catch(() => {});
    $("set-search").addEventListener("input", renderSets);
    for (const button of document.querySelectorAll("button[data-mode]")) button.addEventListener("click", () => button.dataset.mode === "draw" && button.closest(".mode-tabs") ? enterProcurement() : setMode(button.dataset.mode));
    $("draw-one").addEventListener("click", () => openPacks(1));
    $("draw-ten").addEventListener("click", () => openPacks(10));
    $("export-save").addEventListener("click", exportSave);
    $("import-save").addEventListener("click", () => $("import-file").click());
    $("import-file").addEventListener("change", importSave);
    $("series-filter").addEventListener("change", renderSets);
    $("card-search").addEventListener("input", filterCards);
    $("collection-set").addEventListener("change", event => { state.collectionSet = event.target.value; filterCards(); });
    $("retry-collection").addEventListener("click", loadCollection);
    $("rarity-filter").addEventListener("change", filterCards);
    $("load-more").addEventListener("click", appendCards);
    $("close-dialog").addEventListener("click", () => $("card-dialog").close());
    $("card-dialog").addEventListener("click", (event) => { if (event.target === $("card-dialog")) $("card-dialog").close(); });
    window.addEventListener("hashchange", selectSet);
    await selectSet();
    setMode(state.save.shop.business.open ? "shop" : location.hash ? "draw" : "shop");
    refreshMarket();
  } catch (error) {
    $("set-title").textContent = "卡牌档案暂时无法打开";
    $("shop-message").textContent = `经营资料暂时无法读取：${error.message}，请刷新后重试。`;
    $("toast-message").textContent = $("shop-message").textContent;
    $("game-toast").hidden = false;
    $("message").textContent = error.message;
  }
}
start();
