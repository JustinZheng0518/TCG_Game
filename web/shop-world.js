"use strict";
// Original low-poly shop geometry. No art or models from the reference game.
class ShopWorld {
  constructor(host, onAction) {
    this.host = host; this.onAction = onAction; this.yaw = .73; this.zoom = 1; this.people = new Map(); this.time = 0;
    this.canvas = document.createElement("canvas"); this.canvas.className = "shop-world-canvas";
    this.canvas.tabIndex = 0; this.canvas.setAttribute("aria-label", "立体卡店：拖动旋转，方向键旋转，加减号缩放");
    host.prepend(this.canvas); this.labels = document.getElementById("customer-labels");
    this.anchors = {supply: [-3.7, 1.2, 2.4], stock: [2.65, 1.7, .9], collection: [-3.8, 1.65, -.2], events: [.3, 2.5, -3.7]};
    try { this.init3D(); this.mode = "3d"; } catch { this.renderer?.dispose(); this.renderer = null; this.camera = null; this.canvas.remove(); this.canvas = document.createElement("canvas"); this.canvas.className = "shop-world-canvas"; this.canvas.setAttribute("aria-label", "等距卡店场景"); host.prepend(this.canvas); this.ctx = this.canvas.getContext("2d"); this.mode = "2.5d"; }
    this.canvas.tabIndex = 0; host.classList.add("is-3d"); host.dataset.renderMode = this.mode;
    this.bindControls(); new ResizeObserver(() => this.resize()).observe(host); this.resize();
  }
  init3D() {
    const T = globalThis.THREE; if (!T) throw new Error("3D unavailable"); this.T = T;
    this.renderer = new T.WebGLRenderer({canvas: this.canvas, antialias: true, alpha: true, powerPreference: "low-power"});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace; this.renderer.setClearColor(0xf0ead9, 0);
    this.scene = new T.Scene(); this.camera = new T.OrthographicCamera(-8, 8, 5, -5, .1, 100);
    this.scene.add(new T.HemisphereLight(0xfff6dc, 0xa0ac91, 2.3));
    const sun = new T.DirectionalLight(0xfff1cc, 3.1); sun.position.set(-3, 12, 7); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, {left: -9, right: 9, top: 9, bottom: -9}); sun.shadow.normalBias = .035; sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(sun); this.materials = new Map(); this.clickables = [];
    this.box(0, -.3, 0, 10.6, .5, 8.6, 0x9c8265);
    for (let z = 0; z < 12; z++) for (let x = 0; x < 3; x++) this.box(-3.32 + x * 3.32, -.02, -3.67 + z * .67, 3.27, .12, .63, [0xd6b38a, 0xcba67c, 0xe1be94][(x + z) % 3]);
    this.box(-5.1, 1.7, 0, .18, 3.5, 8.2, 0xe6dfc7); this.box(0, 1.7, -4.1, 10.4, 3.5, .18, 0xece5d2);
    this.box(-5, .14, 0, .15, .25, 8.2, 0x6d8b72); this.box(0, .14, -4, 10.1, .25, .15, 0x6d8b72);
    // Window, wall sign, community noticeboard.
    this.box(-3.45, 2.1, -3.96, 2.1, 1.8, .12, 0x8fa99e); this.box(-3.45, 2.1, -3.86, 1.85, 1.55, .05, 0xcbe4df);
    this.box(-3.45, 2.1, -3.8, .07, 1.55, .08, 0xf6edce); this.box(-3.45, 2.1, -3.8, 1.85, .07, .08, 0xf6edce);
    this.sign("小小卡店", 0x315d4c, 0xfff1ce, 2.6, .65, 1.9, 2.9, -3.94);
    this.sign("活动公告", 0xb68a53, 0xfff5d3, 1.55, .85, -.5, 2.25, -3.9, "events");
    for (let n = 0; n < 4; n++) this.box(-1.04 + n * .34, 2.2 + (n % 2) * .15, -3.79, .22, .32, .02, [0xeacb78, 0xb4d5bb, 0xe5b4a7, 0xc8bee3][n]);
    this.shelf(2.55, -3.45, 3.4, "stock"); this.shelf(-1.65, -.65, 1.9, "stock");
    // Card display on left, counter on right.
    const display = this.box(-3.85, .48, -.1, 1.55, .95, .85, 0x668b78, "collection");
    const glass = this.box(-3.85, 1.1, -.1, 1.5, .55, .8, 0xd9f1e6, "collection"); glass.material = new T.MeshStandardMaterial({color: 0xdbf3e8, transparent: true, opacity: .32, roughness: .15, metalness: .1});
    this.displayCards = [];
    for (let i = 0; i < 5; i++) this.displayCards.push(this.card(-4.35 + i * .26, .99, .07, .22, "collection"));
    this.box(2.65, .56, .85, 2.5, 1.12, 1, 0x658b73, "stock"); this.box(2.65, 1.18, .85, 2.65, .17, 1.13, 0xd9b486, "stock");
    for (let i = 0; i < 7; i++) this.box(1.65 + i * .32, .6, 1.36, .035, .98, .025, 0x51755e);
    this.box(3.25, 1.35, .8, .55, .22, .4, 0x314a43, "stock"); const screen = this.box(3.25, 1.61, .75, .5, .36, .07, 0x36534a, "stock"); screen.rotation.x = -.22;
    this.box(3.25, 1.63, .8, .41, .22, .02, 0x9bc9a3);
    this.cashier = this.person(0x3f7357); this.cashier.position.set(2.6, 0, -.14); this.scene.add(this.cashier);
    // Delivery crates, table, plants, rug and doorway.
    this.box(-3.7, .35, 2.6, .95, .7, .8, 0xbd9267, "supply"); this.box(-3.7, .73, 2.6, 1.02, .08, .88, 0xd7af79, "supply");
    this.box(-4.28, .22, 3.1, .65, .45, .65, 0xcba577, "supply");
    this.sign("补货", 0xeadab1, 0x6c845c, .48, .29, -3.7, .38, 3.02, "supply");
    this.box(.5, .025, 2, 2.2, .02, 1.4, 0x8b9a7b); this.box(3.75, .045, 3.2, 1.55, .02, 1, 0x627e68);
    this.plant(-4.25, -3.1); this.plant(4.25, -3.15); this.plant(4.35, 2.6);
    this.sign("入口", 0x76917a, 0xfff2cf, .9, .35, 4.6, .65, 3.35);
    this.renderer.domElement.addEventListener("webglcontextlost", event => { event.preventDefault(); document.getElementById("shop-message").textContent = "画面暂时中断，请刷新；已经付款的交易已保存。"; });
  }
  material(color) { if (!this.materials.has(color)) this.materials.set(color, new this.T.MeshStandardMaterial({color, roughness: .82, flatShading: true})); return this.materials.get(color); }
  box(x, y, z, w, h, d, color, action) {
    const mesh = new this.T.Mesh(new this.T.BoxGeometry(w, h, d), this.material(color)); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    if (action) { mesh.userData.action = action; this.clickables.push(mesh); } this.scene.add(mesh); return mesh;
  }
  sign(label, background, color, w, h, x, y, z, action) {
    const c = document.createElement("canvas"); c.width = 512; c.height = 160; const ctx = c.getContext("2d");
    ctx.fillStyle = `#${background.toString(16).padStart(6, "0")}`; ctx.fillRect(0, 0, 512, 160); ctx.fillStyle = `#${color.toString(16).padStart(6, "0")}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = 'bold 80px "Microsoft YaHei",sans-serif'; ctx.fillText(label, 256, 85);
    const texture = new this.T.CanvasTexture(c); texture.colorSpace = this.T.SRGBColorSpace;
    const mesh = new this.T.Mesh(new this.T.PlaneGeometry(w, h), new this.T.MeshBasicMaterial({map: texture, side: this.T.DoubleSide})); mesh.position.set(x, y, z); if (action) { mesh.userData.action = action; this.clickables.push(mesh); } this.scene.add(mesh); return mesh;
  }
  card(x, y, z, size, action) {
    const mesh = this.box(x, y, z, size, size * 1.4, .04, 0xe3c982, action);
    mesh.userData.face = this.box(x, y, z + .025, size * .73, size * .94, .015, [0x9cbeaa, 0x8fa6cb, 0xcf9f94][Math.abs(Math.round(x * 100)) % 3] || 0x9cbeaa, action); return mesh;
  }
  shelf(x, z, width, action) {
    this.box(x, 1.02, z, width, 2.04, .62, 0xaa8059, action);
    this.box(x, 1.05, z + .2, width - .12, 1.86, .35, 0x6c7560, action);
    for (let row = 0; row < 3; row++) {
      this.box(x, .24 + row * .6, z + .16, width + .09, .1, .82, 0xd7b48a, action);
      for (let i = 0; i < Math.floor(width / .3); i++) {
        const pack = this.box(x - width / 2 + .2 + i * .3, .48 + row * .6, z + .45, .21, .37, .13, [0x8ab4a2, 0xb393bd, 0xd7b46f, 0x9bb1d0, 0xc78877][(i + row) % 5], action);
        this.stockMeshes ||= []; this.stockMeshes.push(pack);
        pack.userData.face = this.box(pack.position.x, pack.position.y + .02, z + .522, .1, .17, .013, 0xf6eacb, action);
      }
    }
  }
  plant(x, z) {
    const T = this.T; const pot = new T.Mesh(new T.CylinderGeometry(.2, .15, .4, 8), this.material(0xc69d74)); pot.position.set(x, .2, z); pot.castShadow = true; this.scene.add(pot);
    for (let i = 0; i < 5; i++) { const leaf = new T.Mesh(new T.IcosahedronGeometry(.29, 0), this.material([0x789363, 0x91a577, 0x527b55][i % 3])); leaf.position.set(x + Math.sin(i * 2) * .18, .59 + i * .075, z + Math.cos(i * 2) * .15); leaf.scale.y = 1.5; this.scene.add(leaf); }
  }
  person(color) {
    const T = this.T, group = new T.Group();
    const part = (geometry, col, x, y, z) => { const m = new T.Mesh(geometry, this.material(col)); m.position.set(x, y, z); m.castShadow = true; group.add(m); return m; };
    part(new T.BoxGeometry(.4, .5, .25), color, 0, .84, 0);
    part(new T.SphereGeometry(.215, 10, 8), 0xe3bd96, 0, 1.28, 0);
    part(new T.SphereGeometry(.225, 10, 8, 0, Math.PI * 2, 0, Math.PI * .52), 0x51463e, 0, 1.32, 0);
    for (const x of [-.075, .075]) part(new T.SphereGeometry(.023, 5, 4), 0x334239, x, 1.29, .192);
    const legs = [], arms = [];
    for (const sign of [-1, 1]) {
      legs.push(part(new T.BoxGeometry(.14, .43, .17), 0x596b70, sign * .105, .35, 0));
      part(new T.BoxGeometry(.16, .09, .25), 0x414d45, sign * .105, .09, .035);
      arms.push(part(new T.BoxGeometry(.1, .42, .12), color, sign * .26, .81, .01));
    }
    group.userData.legs = legs; group.userData.arms = arms;
    group.userData.bag = part(new T.BoxGeometry(.23, .28, .11), 0xe8c784, .28, .6, .16); group.userData.bag.visible = false;
    return group;
  }
  resize() {
    this.width = this.host.clientWidth; this.height = this.host.clientHeight; if (!this.width || !this.height) return;
    if (this.renderer) { this.renderer.setSize(this.width, this.height, false); const aspect = this.width / this.height; const half = Math.max(4.6, 6.35 / aspect); Object.assign(this.camera, {left: -half * aspect, right: half * aspect, top: half, bottom: -half}); this.updateCamera(); }
    else { const ratio = Math.min(devicePixelRatio || 1, 2); this.canvas.width = this.width * ratio; this.canvas.height = this.height * ratio; this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0); }
  }
  updateCamera() { if (!this.camera) return; this.camera.position.set(Math.sin(this.yaw) * 16, 13, Math.cos(this.yaw) * 16); this.camera.lookAt(0, .7, 0); this.camera.zoom = this.zoom; this.camera.updateProjectionMatrix(); }
  bindControls() {
    const pointers = new Map(); let start = null, lastPinch = 0;
    this.canvas.addEventListener("pointerdown", e => { pointers.set(e.pointerId, {x: e.clientX, y: e.clientY}); this.canvas.setPointerCapture(e.pointerId); if (pointers.size === 1) start = {x: e.clientX, y: e.clientY, moved: false}; else { const p = [...pointers.values()]; lastPinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); } });
    this.canvas.addEventListener("pointermove", e => {
      const old = pointers.get(e.pointerId); if (!old) return; pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
      if (pointers.size === 2) { const p = [...pointers.values()]; const distance = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); if (lastPinch) this.zoom = Math.max(.8, Math.min(1.65, this.zoom * distance / lastPinch)); lastPinch = distance; if (start) start.moved = true; }
      else { this.yaw = Math.max(.25, Math.min(1.3, this.yaw + (e.clientX - old.x) * .006)); if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) start.moved = true; } this.updateCamera();
    });
    const release = e => { const click = start && !start.moved && pointers.size === 1; pointers.delete(e.pointerId); if (click && this.renderer && e.type === "pointerup") { const rect = this.canvas.getBoundingClientRect(), ray = new this.T.Raycaster(); ray.setFromCamera(new this.T.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1), this.camera); const hit = ray.intersectObjects(this.clickables)[0]; if (hit) this.onAction(hit.object.userData.action); } if (!pointers.size) start = null; };
    this.canvas.addEventListener("pointerup", release); this.canvas.addEventListener("pointercancel", release);
    this.canvas.addEventListener("wheel", e => { e.preventDefault(); this.zoom = Math.max(.8, Math.min(1.65, this.zoom - e.deltaY * .001)); this.updateCamera(); }, {passive: false});
    this.canvas.addEventListener("keydown", e => { if (!["ArrowLeft", "ArrowRight", "+", "-"].includes(e.key)) return; e.preventDefault(); if (e.key.startsWith("Arrow")) this.yaw = Math.max(.25, Math.min(1.3, this.yaw + (e.key === "ArrowLeft" ? -.12 : .12))); else this.zoom = Math.max(.8, Math.min(1.65, this.zoom + (e.key === "+" ? .1 : -.1))); this.updateCamera(); });
  }
  resetCamera() { this.yaw = .73; this.zoom = 1; this.updateCamera(); }
  project(x, y, z) {
    if (this.camera) { const p = new this.T.Vector3(x, y, z).project(this.camera); return {x: (p.x + 1) * this.width / 2, y: (1 - p.y) * this.height / 2}; }
    const angle = this.yaw - .73, rx = x * Math.cos(angle) + z * Math.sin(angle), rz = z * Math.cos(angle) - x * Math.sin(angle);
    const unit = Math.min(this.width / 14, this.height / 11) * this.zoom; return {x: this.width / 2 + (rx - rz) * unit * .72, y: this.height * .57 + (rx + rz) * unit * .34 - y * unit};
  }
  syncInventory(save) {
    const stock = Object.values(save.shop.stock).reduce((a, b) => a + b, 0); const listed = Object.values(save.shop.listings).reduce((a, b) => a + b.count, 0);
    if (this.stockMeshes) this.stockMeshes.forEach((m, i) => { m.visible = (i * 19) % this.stockMeshes.length < Math.min(this.stockMeshes.length, stock); m.userData.face.visible = m.visible; });
    if (this.displayCards) this.displayCards.forEach((m, i) => { m.visible = i < Math.min(5, listed); m.userData.face.visible = m.visible; });
    this.inventory = {stock, listed};
  }
  render(people, dt) {
    this.time += dt;
    const alive = new Set();
    for (const person of people) {
      alive.add(person.id); let entry = this.people.get(person.id);
      if (!entry) { const label = document.createElement("span"); label.className = "customer-bubble"; this.labels.append(label); entry = {label}; if (this.renderer) { entry.mesh = this.person([0x9baecd, 0xc38d81, 0xb9ab74, 0x8cae92][person.serial % 4]); this.scene.add(entry.mesh); } this.people.set(person.id, entry); }
      if (entry.mesh) { entry.mesh.position.set(person.x, 0, person.z); entry.mesh.rotation.y = person.angle || 0; const stride = person.moving ? Math.sin(this.time * 9 + person.serial) * .38 : 0; entry.mesh.userData.legs.forEach((leg, i) => leg.rotation.x = i ? -stride : stride); entry.mesh.userData.arms.forEach((arm, i) => arm.rotation.x = i ? stride : -stride); entry.mesh.userData.bag.visible = ["toCounter", "checkout", "exit"].includes(person.phase); }
      const point = this.project(person.x, 1.75, person.z); entry.label.style.transform = `translate(${point.x}px,${point.y}px) translate(-50%,-100%)`; entry.label.textContent = person.label; entry.label.dataset.phase = person.phase;
    }
    for (const [id, entry] of this.people) if (!alive.has(id)) { if (entry.mesh) { this.scene.remove(entry.mesh); entry.mesh.traverse(object => object.geometry?.dispose()); } entry.label.remove(); this.people.delete(id); }
    const markers = {supply: ".supply-spot", stock: ".counter-spot", collection: ".collection-spot", events: ".event-spot"};
    for (const [action, coords] of Object.entries(this.anchors)) { const p = this.project(...coords); const element = this.host.querySelector(markers[action]); element.style.left = `${Math.max(55, Math.min(this.width - 55, p.x))}px`; element.style.top = `${Math.max(48, Math.min(this.height - 35, p.y))}px`; element.style.right = "auto"; }
    if (this.renderer) this.renderer.render(this.scene, this.camera); else this.drawFallback(people);
  }
  drawFallback(people) {
    const c = this.ctx; if (!c) return; c.clearRect(0, 0, this.width, this.height);
    const polygon = (points, fill) => { c.fillStyle = fill; c.beginPath(); points.forEach((p, i) => { const pt = this.project(...p); i ? c.lineTo(pt.x, pt.y) : c.moveTo(pt.x, pt.y); }); c.closePath(); c.fill(); };
    const box = (x, z, w, d, h, color) => { polygon([[x,0,z+d],[x+w,0,z+d],[x+w,h,z+d],[x,h,z+d]],color); polygon([[x+w,0,z],[x+w,0,z+d],[x+w,h,z+d],[x+w,h,z]],"#a7ad8f"); polygon([[x,h,z],[x+w,h,z],[x+w,h,z+d],[x,h,z+d]],"#e0c8a1"); };
    polygon([[-5,0,-4],[5,0,-4],[5,0,4],[-5,0,4]],"#d9bd94"); polygon([[-5,0,-4],[5,0,-4],[5,3.3,-4],[-5,3.3,-4]],"#e8e1cc"); polygon([[-5,0,-4],[-5,0,4],[-5,3.3,4],[-5,3.3,-4]],"#cbd3bc");
    const objects = [{x:-1.7,z:-.7,draw:()=>box(-2.6,-1.1,1.9,.8,1.8,"#ad966d")},{x:2.6,z:.8,draw:()=>box(1.4,.3,2.5,1,1.15,"#72977e")},{x:-3.8,z:0,draw:()=>box(-4.5,-.5,1.5,.8,1.1,"#8aa994")}];
    for (const p of people) objects.push({x:p.x,z:p.z,draw:()=>{const pt=this.project(p.x,.8,p.z);const r=Math.min(this.width/14,this.height/11);c.fillStyle=['#8da7c0','#be8d82','#b6a778'][p.serial%3];c.fillRect(pt.x-r*.15,pt.y,r*.3,r*.5);c.fillStyle='#d9b48d';c.beginPath();c.arc(pt.x,pt.y-r*.12,r*.17,0,Math.PI*2);c.fill();}});
    objects.sort((a,b)=>a.x+a.z-b.x-b.z).forEach(o=>o.draw());
  }
}
