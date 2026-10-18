"use strict";
let toastTimer;
let productArtKey = "";
const activityArtCache = new Map();

function openDesk(pane = "stock") {
  const titles = {stock: "收银柜台 · 未拆封货架", listings: "单卡寄售柜", tasks: "店长任务与兑换", news: "今日市场快报", ledger: "店铺成长与账本", settings: "设置与存档"};
  if (!titles[pane]) return;
  for (const section of document.querySelectorAll("[data-desk-pane]")) section.hidden = section.dataset.deskPane !== pane;
  for (const button of document.querySelectorAll("#desk-tabs [data-desk]")) button.setAttribute("aria-pressed", String(button.dataset.desk === pane));
  $("desk-title").textContent = titles[pane];
  $("desk-notice").textContent = "";
  if (!$("desk-dialog").open) $("desk-dialog").showModal();
}
function enterProcurement() {
  if (!state.index) return;
  const current = state.products[state.selected?.id];
  const target = current && Shop.RETAIL.includes(current.channel) ? state.selected : state.index.sets.find(set => state.products[set.id].channel === "booster");
  if (!target) return;
  $("channel-filter").value = state.products[target.id].channel;
  $("set-search").value = "";
  $("series-filter").value = "";
  renderSets();
  jumpToSet(target.id);
}
function updateRoomHeading() {
  const rooms = {shop: ["LITTLE CARD SHOP", "欢迎回到你的小小卡店"], draw: ["A LITTLE LUCK INSIDE", "拆一包，发现新的心动"], collection: ["MY PRECIOUS COLLECTION", "每一张，都有自己的故事"], album: ["CARD MARKET & ALBUM", "找找下一张心愿卡"], events: ["THE COMMUNITY SQUARE", "今天，去遇见一点特别"]};
  const room = rooms[state.mode] || rooms.shop;
  $("room-eyebrow").textContent = room[0];
  $("room-title").textContent = room[1];
  $("choose-set").hidden = !["draw", "collection", "album"].includes(state.mode);
  $("choose-set").firstChild.textContent = `${state.selected?.id || "选择"} · 换个系列 `;
}
function renderGameScene() {
  if (!state.save.shop || !state.feed) return;
  const s = state.save.shop;
  const stock = Object.values(s.stock).reduce((sum, n) => sum + n, 0);
  const stats = Game.stats(state.save);
  $("scene-level").textContent = `Lv.${s.level} · 第 ${s.day} 天`;
  $("scene-news-title").textContent = Shop.news(state.save, state.feed)[0].title;
  const ready = Shop.QUESTS.filter(q => s.progress[q.field] >= q.target && !s.claimed.includes(q.id)).length;
  $("scene-quest-count").textContent = ready ? `${ready} 个目标已完成，去领奖 →` : `活动券 ${s.tickets} 张 · 今日目标等你完成`;
  $("scene-growth").textContent = `Lv.${s.level} 小店 · 口碑 ${s.reputation} · 查看账本`;
  $("daily-guide-title").textContent = !stock ? "店长，货架还等着你的第一批新货。" : s.worked ? "准备好啦，让好卡遇见今天的客人。" : "新一天，先把小店打理得漂漂亮亮。";
  $("daily-guide").textContent = !stock ? "去补货仓库挑个系列；也可以直接买一包拆开。" : `货架上有 ${stock} 件商品，卡册已收藏 ${stats.unique} 款。开门营业，看看今天的收获吧。`;
  updateRoomHeading();
  if (businessScene) businessScene.sync();
}
function renderProductArt() {
  const key = `${state.selected?.id}:${state.localImages}`;
  if (key === productArtKey || !state.cards.length) return;
  productArtKey = key;
  const candidates = [...state.cards].sort((a, b) => Game.tier(b) - Game.tier(a));
  const chosen = [candidates[0], candidates[Math.floor(candidates.length / 3)], candidates[Math.floor(candidates.length * 2 / 3)]].filter(Boolean);
  $("product-art").replaceChildren();
  for (const [index, card] of chosen.entries()) {
    const image = document.createElement("img");
    image.src = state.localImages ? card.thumbnail : card.source_url;
    image.alt = `${card.name} 简中卡面预览`;
    image.width = 300; image.height = 419;
    image.className = `showcase-card showcase-card-${index}`;
    image.addEventListener("error", () => { if (image.src !== card.source_url) image.src = card.source_url; else image.hidden = true; });
    $("product-art").append(image);
  }
}
async function renderActivities() {
  if (!state.index) return;
  const options = [
    {channel: "event", title: "去参加一场活动", sub: "体验对战，带回专属参加奖", note: "每天 1 次 · ¥20", icon: "i-star", preferred: "PROMOSVEVENT05"},
    {channel: "mission", title: "任务奖励站", sub: "用经营赚来的活动券，换一份惊喜", note: "2 张活动券 / 份", icon: "i-ticket", preferred: "MISSION10"},
    {channel: "gift", title: "礼盒特典屋", sub: "挑一张喜欢的特典，订一份小礼物", note: "每日限定 · 自选款式", icon: "i-pack"},
    {channel: "exchange", title: "特典兑换所", sub: "攒下活动券，离心愿卡再近一点", note: "3 张活动券 / 张", icon: "i-cards", preferred: "PROMO21"}
  ];
  $("activity-options").replaceChildren();
  for (const item of options) {
    const set = state.index.sets.find(s => s.id === item.preferred) || state.index.sets.find(s => state.products[s.id].channel === item.channel);
    if (!set) continue;
    const button = lineButton("", () => { $("channel-filter").value = item.channel; renderSets(); jumpToSet(set.id); }, `activity-card activity-${item.channel}`);
    const art = text("span", "", "activity-art");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use"); use.setAttribute("href", `#${item.icon}`); icon.append(use); art.append(icon);
    button.append(art, text("small", item.note), text("h3", item.title), text("p", item.sub), text("span", "去看看 ↗", "activity-go"));
    $("activity-options").append(button);
    try {
      let cards = activityArtCache.get(set.id);
      if (!cards) { cards = await readJSON(set.cards_path); activityArtCache.set(set.id, cards); }
      const card = cards.find(c => c.type !== "能量") || cards[0];
      if (card) { const image = document.createElement("img"); image.src = state.localImages ? card.thumbnail : card.source_url; image.alt = `${card.name} 特典卡面`; image.loading = "lazy"; image.onerror = () => image.remove(); art.append(image); }
    } catch { /* The illustrated icon remains usable without card art. */ }
  }
}
function showSettlement(report) {
  $("settlement-results").replaceChildren();
  $("settlement-title").textContent = `第 ${report.day} 天，营业结束！`;
  const entries = [["售出商品", `${report.soldPacks} 件`], ["单卡成交", `${report.soldCards} 张`], ["销售回款", money(report.packRevenue + report.cardRevenue)], ["运营支出", money(report.rent)]];
  for (const [label, value] of entries) { const row = text("div", ""); row.append(text("span", label), text("strong", value)); $("settlement-results").append(row); }
  if (report.rewards.length) $("settlement-results").append(text("p", `任务奖励已领取：${report.rewards.join("、")}`));
  $("settlement-dialog").showModal();
}
function initGameScene() {
  $("open-settings").addEventListener("click", () => openDesk("settings"));
  $("choose-set").addEventListener("click", () => $("set-picker").showModal());
  for (const button of document.querySelectorAll("[data-desk]")) button.addEventListener("click", () => openDesk(button.dataset.desk));
  for (const button of document.querySelectorAll("[data-close-dialog]")) button.addEventListener("click", () => button.closest("dialog").close());
  for (const dialog of [$("desk-dialog"), $("set-picker"), $("settlement-dialog")]) dialog.addEventListener("click", event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
  document.querySelector('[data-scene-action="supply"]').addEventListener("click", enterProcurement);
  $("settlement-continue").addEventListener("click", () => $("settlement-dialog").close());
  $("dismiss-toast").addEventListener("click", () => { $("game-toast").hidden = true; });
  const observer = new MutationObserver(records => {
    const source = records[records.length - 1].target;
    const content = source.textContent.trim();
    if (!content || content.startsWith("正在读取") || content.startsWith("选择本套")) return;
    $("toast-message").textContent = content;
    if ($("desk-dialog").open) $("desk-notice").textContent = content;
    $("game-toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $("game-toast").hidden = true; }, 7000);
  });
  for (const id of ["message", "shop-message"]) observer.observe($(id), {childList: true, characterData: true, subtree: true});
  businessScene = new ShopBusiness(document.querySelector(".store-scene"));
  $("world-reset").addEventListener("click", () => businessScene.world.resetCamera());
  $("checkout-next").addEventListener("click", () => businessScene.checkoutNext());
  $("retry-checkout").addEventListener("click", () => { businessScene.paymentBlocked = false; businessScene.updateUI(); });
  renderActivities(); renderGameScene();
}
