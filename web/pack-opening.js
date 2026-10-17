"use strict";

// Presentation only: the caller draws and saves the entire batch before opening.
class PackOpening {
  constructor(dialog, imageURL) {
    this.dialog = dialog;
    this.imageURL = imageURL;
    this.session = 0;
    this.stage = document.getElementById("opening-stage");
    this.next = document.getElementById("opening-next");
    document.getElementById("opening-skip").addEventListener("click", () => dialog.close());
    this.next.addEventListener("click", () => {
      if (this.pack + 1 === this.total) dialog.close();
      else { this.pack++; this.showCards(); }
    });
    dialog.addEventListener("close", () => { this.session++; this.stage.replaceChildren(); });
  }
  open(cards, setName, packSize = 5) {
    this.packSize = packSize;
    this.total = Math.ceil(cards.length / packSize);
    this.cards = cards;
    this.setName = setName;
    this.pack = 0;
    this.session++;
    this.next.hidden = true;
    this.stage.replaceChildren();
    document.getElementById("opening-title").textContent = setName;
    document.getElementById("opening-status").textContent = `${cards.length} 张卡已加入收藏 · 点击卡包拆封`;
    const pack = document.createElement("button");
    pack.type = "button";
    pack.className = "sealed-pack";
    pack.setAttribute("aria-label", "撕开卡包");
    const top = document.createElement("span");
    top.className = "pack-tear";
    const mark = document.createElement("span");
    mark.className = "pack-emblem";
    mark.textContent = "✦";
    const title = document.createElement("strong");
    title.textContent = setName;
    const caption = document.createElement("span");
    caption.textContent = `${packSize} 张卡牌 · 点击拆封`;
    pack.append(top, mark, title, caption);
    pack.addEventListener("click", () => {
      pack.disabled = true;
      pack.classList.add("is-torn");
      const session = this.session;
      const delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 420;
      setTimeout(() => { if (session === this.session && this.dialog.open) this.showCards(); }, delay);
    }, {once: true});
    this.stage.append(pack);
    this.dialog.showModal();
    pack.focus();
  }
  showCards() {
    this.next.hidden = true;
    this.stage.replaceChildren();
    const pack = this.cards.slice(this.pack * this.packSize, (this.pack + 1) * this.packSize);
    const grid = document.createElement("div");
    grid.className = "reveal-grid";
    let revealed = 0;
    const status = document.getElementById("opening-status");
    status.textContent = `第 ${this.pack + 1} / ${this.total} 包 · 点击卡背逐张翻开`;
    for (const [index, card] of pack.entries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `reveal-card rarity-tier-${globalThis.TCGGame.tier(card)}`;
      button.setAttribute("aria-label", `翻开第 ${index + 1} 张卡牌`);
      const inner = document.createElement("span");
      inner.className = "reveal-inner";
      const back = document.createElement("span");
      back.className = "reveal-back";
      back.setAttribute("aria-hidden", "true");
      back.textContent = "✦";
      const front = document.createElement("span");
      front.className = "reveal-front";
      front.setAttribute("aria-hidden", "true");
      const image = document.createElement("img");
      image.src = this.imageURL(card);
      image.alt = "";
      image.addEventListener("error", () => { image.hidden = true; }, {once: true});
      const label = document.createElement("span");
      label.className = "reveal-caption";
      label.textContent = `${card.name} · ${card.rarity}${card.isNew ? " · 新卡" : ""}`;
      front.append(image, label);
      inner.append(back, front);
      button.append(inner);
      button.addEventListener("click", () => {
        button.classList.add("is-revealed");
        button.setAttribute("aria-label", label.textContent);
        button.setAttribute("aria-disabled", "true");
        front.removeAttribute("aria-hidden");
        revealed++;
        status.textContent = `第 ${this.pack + 1} / ${this.total} 包 · 已翻开 ${revealed} / ${pack.length} 张`;
        if (revealed === pack.length) {
          this.next.hidden = false;
          this.next.textContent = this.pack + 1 === this.total ? "查看本次收获" : "打开下一包";
        }
      }, {once: true});
      grid.append(button);
    }
    this.stage.append(grid);
    grid.querySelector("button").focus();
  }
}
