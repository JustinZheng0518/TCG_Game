"use strict";

// Presentation only: the caller draws and saves the entire batch before opening.
class PackOpening {
  constructor(dialog, imageURL) {
    this.dialog = dialog;
    this.imageURL = imageURL;
    this.session = 0;
    this.soundEnabled = true;
    document.getElementById("opening-sound").addEventListener("click", event => {
      this.soundEnabled = !this.soundEnabled;
      event.currentTarget.textContent = `撕包音效：${this.soundEnabled ? "开" : "关"}`;
      event.currentTarget.setAttribute("aria-pressed", String(this.soundEnabled));
    });
    this.stage = document.getElementById("opening-stage");
    this.next = document.getElementById("opening-next");
    document.getElementById("opening-skip").addEventListener("click", () => dialog.close());
    this.next.addEventListener("click", () => {
      if (this.pack + 1 === this.total) dialog.close();
      else { this.pack++; this.showCards(); }
    });
    dialog.addEventListener("close", () => { this.session++; this.stage.replaceChildren(); });
  }
  tearSound(strength) {
    if (!this.soundEnabled) return;
    try {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) return;
      this.audio ||= new Context();
      if (this.audio.state === "suspended") this.audio.resume().catch(() => {});
      const length = Math.round(this.audio.sampleRate * .045), buffer = this.audio.createBuffer(1, length, this.audio.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 1.5);
      const source = this.audio.createBufferSource(), filter = this.audio.createBiquadFilter(), gain = this.audio.createGain();
      source.buffer = buffer; filter.type = "highpass"; filter.frequency.value = 1300;
      gain.gain.value = .07 + strength * .09;
      source.connect(filter); filter.connect(gain); gain.connect(this.audio.destination);
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); }; source.start();
    } catch { /* Audio support is optional; the drag remains usable. */ }
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
    const status = document.getElementById("opening-status");
    status.textContent = `${cards.length} 张卡已加入收藏 · 按住封口向右撕开`;
    const pack = document.createElement("div");
    pack.className = "sealed-pack";
    const top = document.createElement("button");
    top.type = "button";
    top.className = "pack-tear";
    top.textContent = "◂ 按住封口向右撕开 →";
    top.setAttribute("aria-label", "向右拖动撕开卡包，也可按回车拆封");
    const rip = document.createElement("span"); rip.className = "pack-rip";
    const mark = document.createElement("span");
    mark.className = "pack-emblem"; mark.textContent = "✦";
    const title = document.createElement("strong"); title.textContent = setName;
    const caption = document.createElement("span"); caption.textContent = `${packSize} 张${cards[0]?.sport === "basketball" ? "篮球球星卡" : "简体中文卡牌"}`;
    pack.append(top, rip, mark, title, caption);
    const meter = document.createElement("div"); meter.className = "tear-meter";
    const fill = document.createElement("span"); meter.append(fill);
    const help = document.createElement("p"); help.className = "tear-help";
    help.textContent = "捏住银色封口，向右拉到底 · 键盘可按回车";
    let startX = null, progress = 0, finished = false, keyboard = false, lastSound = 0;
    const session = this.session;
    const paint = value => { progress = Math.max(0, Math.min(1, value)); if (progress > lastSound + .07) { this.tearSound(progress); lastSound = progress; } pack.style.setProperty("--tear-progress", progress); meter.style.setProperty("--tear-progress", progress); top.setAttribute("aria-label", `撕开卡包 ${Math.round(progress * 100)}%，向右拉到底；回车可拆封`); };
    const finish = () => {
      if (finished || session !== this.session || !this.dialog.open) return;
      finished = true; this.tearSound(1); paint(1); pack.classList.add("is-torn"); top.disabled = true;
      status.textContent = "撕拉——封口打开了！"; help.textContent = "新卡就藏在里面…";
      setTimeout(() => { if (session === this.session && this.dialog.open) this.showCards(); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 500);
    };
    top.addEventListener("pointerdown", event => { if (finished || event.button !== 0) return; event.preventDefault(); startX = event.clientX; lastSound = 0; this.tearSound(0); top.setPointerCapture(event.pointerId); top.focus(); });
    top.addEventListener("pointermove", event => { if (startX === null || finished) return; paint((event.clientX - startX) / (pack.clientWidth * .8)); status.textContent = progress >= .85 ? "松手，撕开封口！" : `封口已撕开 ${Math.round(progress * 100)}% · 继续向右拉`; });
    const release = event => { if (startX === null) return; startX = null; if (event.type === "pointerup" && progress >= .85) finish(); else { paint(0); status.textContent = "再拉远一点：按住封口，向右撕到底"; } };
    top.addEventListener("pointerup", release); top.addEventListener("pointercancel", release);
    top.addEventListener("click", event => {
      if (event.detail !== 0 || finished || keyboard) return;
      keyboard = true;
      const began = performance.now();
      const step = now => { if (session !== this.session || !this.dialog.open) return; paint((now - began) / 600); if (progress >= 1) finish(); else requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
    this.stage.append(pack, meter, help);
    this.dialog.showModal(); top.focus();
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
      image.referrerPolicy = "no-referrer";
      if (typeof applyCardImage === "function") applyCardImage(image, card);
      else image.src = this.imageURL(card);
      image.alt = "";

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
