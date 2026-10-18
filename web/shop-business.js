"use strict";
let businessScene = null;
class ShopBusiness {
  constructor(host) {
    this.visitors = new Map(); this.spawnIn = .5; this.lastTime = performance.now(); this.closing = false; this.paymentBlocked = false;
    this.world = new ShopWorld(host, action => { if (action === "supply") enterProcurement(); else if (action === "collection") setMode("collection"); else if (action === "events") setMode("events"); else if(action === "checkout" && !$("checkout-next").disabled) this.checkoutNext(); else openDesk("stock"); });
    this.sync(); this.frame = this.frame.bind(this); requestAnimationFrame(this.frame);
  }
  sync() {
    const s = state.save.shop;
    if (this.day !== s.day) { this.visitors.clear(); this.day = s.day; this.closing = false; this.paymentBlocked = false; this.spawnIn = .5; }
    const active = new Set(s.business.pending.map(order => order.id));
    for (const order of s.business.pending) if (!this.visitors.has(order.id)) {
      const name = ["小林", "阿杰", "小周", "阿岚", "悠悠", "小许"][order.serial % 6];
      this.visitors.set(order.id, {id: order.id, serial: order.serial, name, order, x: 3.8, z: 3.6, phase: "enter", label: `${name} · 进店看看`, route: [[.2, 2.5], order.kind === "card" ? [-3.05, .8] : [-1.65, .55]], wait: 0, angle: 0});
    }
    for (const v of this.visitors.values()) if (!active.has(v.id) && v.phase !== "exit") { v.phase = "exit"; v.route = [[3.9, 3.8]]; v.label = `${v.name} · 离店`; }
    this.world.syncInventory(state.save); this.updateUI();
  }
  updateUI() {
    const s = state.save.shop, b = s.business;
    const ready = [...this.visitors.values()].filter(v => v.phase === "checkout").length;
    $("checkout-next").disabled = !ready || this.paymentBlocked;
    $("checkout-next").textContent = ready ? `收银 (${ready})` : "等待客人";
    $("end-day").disabled = this.closing;
    $("end-day").textContent = this.closing ? "送客中…" : b.open ? "打烊" : "开门营业";
    $("scene-business-label").textContent = this.closing ? "准备打烊" : b.open ? "正在营业" : "还未开门";
    $("live-turnover").textContent = `今日收入 ${money(b.packRevenue + b.cardRevenue)}`;
    $("retry-checkout").hidden = !this.paymentBlocked;
    const stocked = Object.values(s.stock).some(n => n > 0) || Object.values(s.listings).some(e => e.count > 0);
    document.querySelector(".scene-caption h2").textContent = b.open ? "欢迎光临，小小卡店。" : stocked ? "货架摆好了，等第一位客人进门。" : "补上新货，开一家自己的卡店。";
    $("customer-status").textContent = this.paymentBlocked ? "没能保存，请重试收银。" : this.closing ? "最后几位客人结账中…" : !b.open ? "准备好就开门吧 ♡" : ready ? `${ready} 位客人等你收银` : !stocked ? "货架空啦，补点新货吧" : b.nextId >= Shop.customerLimit(state.save) && !b.pending.length ? "今天辛苦啦，可以打烊了" : "客人在挑选中 ♡";
  }
  toggle() {
    try {
      ensureShopReady();
      if (!state.save.shop.business.open) { persistSave(Shop.setBusinessOpen(state.save, true)); this.spawnIn = .2; $("shop-message").textContent = "店门打开了！货架上的卡包和寄售卡现在会吸引顾客。"; }
      else { this.closing = true; this.updateUI(); if (!state.save.shop.business.pending.length) this.finishDay(); }
    } catch (error) { $("shop-message").textContent = error.message; }
  }
  checkout(v) {
    if (!v || this.paymentBlocked) return;
    try {
      const result = Shop.checkoutCustomer(state.save, v.id);
      persistSave(result.save);
      v.phase = "exit"; v.route = [[3.8, 3.7]];
      v.label = result.receipt.count ? `${v.name} · 已付款 +${money(result.receipt.revenue)}` : `${v.name} · 卖光了，下次再来`;
      if (result.receipt.count) {
        $("sale-receipt").textContent = `${v.name} 买单 +${money(result.receipt.revenue)} ♡`;
        $("sale-receipt").classList.remove("sale-pop"); void $("sale-receipt").offsetWidth; $("sale-receipt").classList.add("sale-pop");
      }
      this.updateUI();
    } catch (error) { this.paymentBlocked = true; $("shop-message").textContent = error.message; this.updateUI(); }
  }
  checkoutNext() { this.checkout([...this.visitors.values()].find(v => v.phase === "checkout")); }
  finishDay() {
    if (this.settling) return;
    this.settling = true;
    try { const result = Shop.endDay(state.save, state.products, state.feed); persistSave(result.save); this.closing = false; showSettlement(result.report); $("shop-message").textContent = `第 ${result.report.day} 天完成，顾客回款 ${money(result.report.packRevenue + result.report.cardRevenue)} 已逐笔到账。`; }
    catch (error) { this.closing = false; $("shop-message").textContent = error.message; }
    finally { this.settling = false; this.updateUI(); }
  }
  frame(time) {
    const dt = Math.min(.05, Math.max(0, (time - this.lastTime) / 1000)); this.lastTime = time;
    const active = state.mode === "shop" && !document.hidden;
    if (active) {
      const b = state.save.shop.business;
      if (b.open && !this.closing && !this.paymentBlocked) {
        this.spawnIn -= dt;
        if (this.spawnIn <= 0) {
          this.spawnIn = 3.8;
          try { const result = Shop.admitCustomer(state.save, state.products, state.feed); if (result) persistSave(result.save); }
          catch (error) { this.paymentBlocked = true; $("shop-message").textContent = error.message; this.updateUI(); }
        }
      }
      for (const v of [...this.visitors.values()]) {
        v.moving = false;
        if (v.route.length) {
          const [x, z] = v.route[0], dx = x - v.x, dz = z - v.z, distance = Math.hypot(dx, dz), step = dt * 2.25;
          if (distance <= step) { v.x = x; v.z = z; v.route.shift(); }
          else { v.x += dx / distance * step; v.z += dz / distance * step; v.angle = Math.atan2(dx, dz); v.moving = true; }
        } else if (v.phase === "enter") { v.phase = "browse"; v.label = `${v.name} · ${v.order.kind === "card" ? "挑选寄售卡" : "挑选卡包"}`; v.wait = 1.2; }
        else if (v.phase === "browse") { v.wait -= dt; if (v.wait <= 0) { v.phase = "toCounter"; v.label = `${v.name} · 去结账`; v.route = [[.2, 2.5], [2.6 - ((v.serial - 1) % 3) * .6, 1.95 + ((v.serial - 1) % 3) * .65]]; } }
        else if (v.phase === "toCounter") { v.phase = "checkout"; v.wait = 1.1; v.label = `${v.name} · 等待收银`; this.updateUI(); }
        else if (v.phase === "checkout") { v.wait -= dt; if (v.wait <= 0 && (this.closing || $("auto-checkout").checked)) this.checkout(v); }
        else if (v.phase === "exit") this.visitors.delete(v.id);
      }
      if (this.closing && !state.save.shop.business.pending.length) this.finishDay();
      this.world.render([...this.visitors.values()], dt);
    }
    requestAnimationFrame(this.frame);
  }
}
