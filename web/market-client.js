"use strict";
// Public PKCN query/price adapter. Selecting a candidate never silently maps versions.
const KYO_ROOT = "https://kyocards.com/shopping-cards/v1";
let priceSession = 0;
async function marketRequest(url) {
  const response = await fetch(url, {credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`查价服务返回 ${response.status}`);
  const body = await response.text();
  if (body.length > 2 * 1024 * 1024) throw new Error("查价响应过大。");
  return JSON.parse(body);
}
function prepareLivePrice(card) {
  const session = ++priceSession;
  const button = $("lookup-card-price"), status = $("live-price-status"), results = $("live-price-results");
  button.disabled = false;
  results.replaceChildren();
  status.textContent = "人民币参考报价来自 Kyo Cards 的 PKCN / 集换社市场价字段。需核对套装、卡号及工艺；接口不可用时保留模拟估值。";
  button.onclick = async () => {
    button.disabled = true;
    status.textContent = "正在搜索简体中文版本…";
    try {
      const params = new URLSearchParams({skip: "0", take: "12", productLine: "PKCN", productType: "SING", search: card.name});
      const payload = await marketRequest(`${KYO_ROOT}/card-queries?${params}`);
      if (session !== priceSession || !$("card-dialog").open) return;
      if (!Array.isArray(payload.data)) throw new Error("查价服务的响应格式已变化。");
      const candidates = payload.data.slice(0, 12).filter(item => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.collectorNo === "string" && typeof item.set?.name === "string");
      if (!candidates.length) throw new Error("没有找到可核对的简中版本。");
      results.replaceChildren();
      status.textContent = `当前收藏：${card.set_id} · ${card.number} · ${card.rarity}。请选对应的简中套装、卡号与加工版本；同名卡不能直接共用价格。`;
      for (const candidate of candidates) {
        const row = text("div", "", "live-quote-row");
        row.append(text("strong", candidate.name.slice(0, 200)), text("span", `${candidate.set.name.slice(0, 200)} · ${candidate.collectorNo.slice(0, 80)} · ${String(candidate.rarity || "未提供稀有度").slice(0, 30)}`));
        const select = lineButton("查询此版本", async () => {
          select.disabled = true;
          try {
            const url = `${KYO_ROOT}/cards/${encodeURIComponent(candidate.id)}/price/single`;
            const detail = await marketRequest(url);
            if (session !== priceSession || !$("card-dialog").open) return;
            const raw = detail?.data?.metadata?.card?.jihuansheMarketPrice;
            const yuan = typeof raw === "number" || typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
            if (!Number.isFinite(yuan) || yuan <= 0 || yuan > 1000000) throw new Error("这个版本没有有效人民币报价，继续使用原估值。");
            row.querySelector(".quote-application")?.remove();
            const application = text("div", "", "quote-application");
            application.append(text("p", `服务返回市场参考价 ${money(Math.round(yuan * 100))}，不等同于实际成交价。`));
            application.append(lineButton("已核对版本，将报价用于此卡", () => {
              try {
                ensureShopReady();
                const entry = {cents: Math.round(yuan * 100), source_url: url, observed_at: new Date().toISOString()};
                const checked = Shop.feedValid({schema_version: 1, currency: "CNY", language: "zh-CN", updated_at: entry.observed_at, products: {}, news: [], cards: {[card.id]: entry}}).cards[card.id];
                const next = Shop.validate(state.save);
                next.shop.quotes[card.id] = checked;
                persistSave(next);
                state.feed.cards = {...state.feed.cards, [card.id]: checked};
                renderShop(); renderAcquisition(); filterCards();
                showCard(card);
                $("live-price-status").textContent = "版本已由你确认，报价与来源已保存到经营存档；游戏中的买卖价仍受新闻与价差影响。";
              } catch (error) { status.textContent = error.message; }
            }));
            row.append(application);
          } catch (error) { if (session === priceSession) status.textContent = `查价失败：${error.message} 原报价未改变。`; }
          finally { select.disabled = false; }
        });
        row.append(select);
        results.append(row);
      }
    } catch (error) { if (session === priceSession) status.textContent = `查价失败：${error.message} 原报价未改变，可稍后重试或在工作台接入自选行情。`; }
    finally { if (session === priceSession) button.disabled = false; }
  };
}
