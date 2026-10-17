"use strict";

const $ = (id) => document.getElementById(id);
const state = {index: null, cards: [], selected: null, filtered: [], shown: 0, request: 0, localImages: null, localOriginals: false};
const PAGE_SIZE = 72;
const Game = globalThis.TCGGame;
const SAVE_KEY = "TCG_Game:collection:v1";
state.mode = "draw";
state.lastDraw = [];
state.save = {version: 1, counts: {}};
state.saveError = "";
state.rawSave = null;
const opening = new PackOpening($("opening-dialog"), (card) => state.localImages ? card.thumbnail : card.source_url);

function loadSave() {
  try {
    state.rawSave = localStorage.getItem(SAVE_KEY);
    if (state.rawSave) state.save = Game.validateSave(JSON.parse(state.rawSave));
  } catch {
    state.saveError = "无法读取浏览器收藏。请先导出备份或导入有效存档；原有数据已保留。";
  }
}

function persistSave(next) {
  const clean = Game.validateSave(next);
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(clean)); }
  catch { throw new Error("浏览器无法保存收藏，请允许本地存储后再试。"); }
  state.save = clean;
  state.saveError = "";
  updateStats();
  renderSets();
}

function updateStats() {
  const stats = Game.stats(state.save);
  $("owned-stats").textContent = `已收藏 ${stats.unique.toLocaleString("zh-CN")} 款 · 共 ${stats.total.toLocaleString("zh-CN")} 张`;
  const owned = state.cards.filter((card) => state.save.counts[card.id]).length;
  $("set-progress").textContent = `本套 ${owned} / ${state.cards.length || "—"} 款`;
}

function setMode(mode) {
  state.mode = mode;
  for (const button of document.querySelectorAll("[data-mode]")) button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  $("pack-actions").hidden = mode !== "draw";
  $("draw-rules").hidden = mode !== "draw";
  $("card-search").value = "";
  $("rarity-filter").value = "";
  filterCards();
}

function openPacks(count) {
  try {
    if (state.saveError) throw new Error(state.saveError);
    const drawn = Game.drawPacks(state.cards, count);
    const seen = new Set(Object.keys(state.save.counts));
    const result = drawn.map((card) => {
      const isNew = !seen.has(card.id);
      seen.add(card.id);
      return {...card, isNew};
    });
    persistSave(Game.collect(state.save, drawn));
    state.lastDraw = result;
    setMode("draw");
    $("message").textContent = `已打开 ${count} 包，获得 ${drawn.length} 张卡，其中 ${result.filter((card) => card.isNew).length} 款新卡。已保存到收藏。`;
    opening.open(result, state.selected.name);
  } catch (error) { $("message").textContent = error.message; }
}

function exportSave() {
  const content = state.saveError && state.rawSave ? state.rawSave : JSON.stringify(state.save, null, 2);
  const blob = new Blob([content], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "宝可梦收藏备份.json";
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
    const imported = Game.validateSave(JSON.parse(await file.text()));
    const next = Game.mergeSaves(state.save, imported);
    persistSave(next);
    setMode("collection");
    $("message").textContent = "收藏已合并并保存；重复导入同一备份不会重复增加卡牌数量。";
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
  const matching = state.index.sets.filter((set) =>
    (!series || set.series === series) && `${set.id} ${set.name}`.toLocaleLowerCase().includes(query));
  $("set-list").replaceChildren();
  $("set-count").textContent = `${matching.length} 套`;
  const ownedBySet = new Map();
  for (const id of Object.keys(state.save.counts)) {
    const setId = id.split(":")[0];
    ownedBySet.set(setId, (ownedBySet.get(setId) || 0) + 1);
  }
  for (const set of matching) {
    const button = text("button", "", `set-button${state.selected?.id === set.id ? " active" : ""}`);
    button.type = "button";
    button.setAttribute("aria-pressed", String(state.selected?.id === set.id));
    button.append(text("strong", set.name));
    const sub = text("small", "");
    const owned = ownedBySet.get(set.id) || 0;
    sub.append(text("span", set.id), text("span", `${owned} / ${set.card_faces}`));
    button.append(sub);
    button.addEventListener("click", () => { location.hash = encodeURIComponent(set.id); });
    $("set-list").append(button);
  }
  if (!matching.length) $("set-list").append(text("p", "未找到对应系列", "message"));
}

function showCard(card) {
  $("dialog-title").textContent = card.name;
  $("dialog-number").textContent = `${card.set_id} · ${card.number}`;
  $("dialog-meta").textContent = `${card.rarity} · ${card.type || "卡牌"}\n简体中文版${card.illustrators.length ? `\n插画：${card.illustrators.join("、")}` : ""}`;
  $("dialog-image").src = state.localOriginals ? card.image : card.source_url;
  $("dialog-image").onerror = () => {
    $("dialog-image").onerror = null;
    if (state.localImages) $("dialog-image").src = card.thumbnail;
  };
  $("dialog-image").alt = `${card.name} 简体中文卡面`;
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
    label.append(text("span", card.number), text("span", card.rarity, "rarity"));
    const name = text("h2", "", "card-name");
    name.append(text("span", card.name));
    if (state.save.counts[card.id]) name.append(text("span", `×${state.save.counts[card.id]}`, "owned-count"));
    tile.append(button, label, name);
    if (state.mode === "draw" && card.isNew) tile.append(text("span", "新卡", "new-badge"));
    $("cards").append(tile);
  }
  state.shown += batch.length;
  $("load-more").hidden = state.shown >= state.filtered.length;
}

function filterCards() {
  const query = $("card-search").value.trim().toLocaleLowerCase();
  const rarity = $("rarity-filter").value;
  const base = state.mode === "draw" ? state.lastDraw : state.mode === "collection" ? state.cards.filter((card) => state.save.counts[card.id]) : state.cards;
  state.filtered = base.filter((card) => (!rarity || card.rarity === rarity)
    && `${card.name} ${card.number}`.toLocaleLowerCase().includes(query));
  state.shown = 0;
  $("cards").replaceChildren();
  $("result-count").textContent = `${state.filtered.length.toLocaleString("zh-CN")} 张卡面`;
  $("message").textContent = state.saveError || (state.filtered.length ? "" : !base.length && state.mode === "draw" ? "选好了就打开一包，开始收集这套卡牌。" : !base.length && state.mode === "collection" ? "这套收藏还是空的，去开包发现第一张卡吧。" : "没有找到符合条件的卡牌，试试其他卡名或稀有度。");
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
  $("card-search").value = "";
  $("rarity-filter").replaceChildren(new Option("全部稀有度", ""));
  renderSets();
  try {
    const cards = await readJSON(set.cards_path);
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
    $("draw-one").disabled = !cards.length;
    $("draw-ten").disabled = !cards.length;
    updateStats();
    const counts = new Map();
    for (const card of cards) counts.set(card.rarity, (counts.get(card.rarity) || 0) + 1);
    for (const [rarity, count] of counts) $("rarity-filter").append(new Option(`${rarity} (${count})`, rarity));
    filterCards();
  } catch (error) {
    if (request === state.request) { state.cards = []; $("message").textContent = error.message; $("result-count").textContent = ""; }
  }
}

async function start() {
  loadSave();
  try {
    state.index = await readJSON("data/pokemon/zh-CN/index.json");
    state.index.sets.sort((a, b) => (b.release_date || "").localeCompare(a.release_date || "") || b.source_collection_id - a.source_collection_id);
    $("library-stats").textContent = `${state.index.set_count} 套 · ${state.index.card_faces.toLocaleString("zh-CN")} 张卡面`;
    for (const series of new Set(state.index.sets.map((set) => set.series))) $("series-filter").append(new Option(series, series));
    $("library-status").textContent = "简体中文卡牌 · 本地档案";
    readJSON("data/pokemon/zh-CN/coverage.json").then((coverage) => {
      $("library-status").textContent = `${state.index.set_count} 套简体中文卡牌`;
    }).catch(() => {});
    $("set-search").addEventListener("input", renderSets);
    for (const button of document.querySelectorAll("[data-mode]")) button.addEventListener("click", () => setMode(button.dataset.mode));
    $("draw-one").addEventListener("click", () => openPacks(1));
    $("draw-ten").addEventListener("click", () => openPacks(10));
    $("export-save").addEventListener("click", exportSave);
    $("import-save").addEventListener("click", () => $("import-file").click());
    $("import-file").addEventListener("change", importSave);
    $("series-filter").addEventListener("change", renderSets);
    $("card-search").addEventListener("input", filterCards);
    $("rarity-filter").addEventListener("change", filterCards);
    $("load-more").addEventListener("click", appendCards);
    $("close-dialog").addEventListener("click", () => $("card-dialog").close());
    $("card-dialog").addEventListener("click", (event) => { if (event.target === $("card-dialog")) $("card-dialog").close(); });
    window.addEventListener("hashchange", selectSet);
    await selectSet();
  } catch (error) {
    $("set-title").textContent = "卡牌档案暂时无法打开";
    $("message").textContent = error.message;
  }
}
start();
