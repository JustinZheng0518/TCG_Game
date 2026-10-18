"use strict";
// Original low-poly shop geometry. No art or models from the reference game.
class ShopWorld {
  constructor(host, onAction) {
    this.host = host; this.onAction = onAction; this.yaw = .73; this.zoom = 1; this.view = "first"; this.lookYaw = 0; this.pitch = -.05; this.player = {x: .35, z: 3.2}; this.keys = new Set(); this.people = new Map(); this.time = 0;
    this.canvas = document.createElement("canvas"); this.canvas.className = "shop-world-canvas";
    this.canvas.tabIndex = 0; this.canvas.setAttribute("aria-label", "第一人称卡店：拖动环顾，WASD 行走，E 互动");
    host.prepend(this.canvas); this.labels = document.getElementById("customer-labels");
    this.anchors = {supply: [-3.7, 1.2, 2.4], stock: [2.65, 1.7, .9], collection: [-3.8, 1.65, -.2], events: [.3, 2.5, -3.7]};
    try { this.init3D(); this.mode = "3d"; } catch { this.renderer?.dispose(); this.renderer = null; this.camera = null; this.canvas.remove(); this.canvas = document.createElement("canvas"); this.canvas.className = "shop-world-canvas"; this.canvas.setAttribute("aria-label", "等距卡店场景"); host.prepend(this.canvas); this.ctx = this.canvas.getContext("2d"); this.mode = "2.5d"; this.view = "overview"; document.getElementById("world-view").disabled = true; }
    this.canvas.tabIndex = 0; host.classList.add("is-3d"); host.dataset.renderMode = this.mode; host.classList.toggle("is-first-person", this.mode === "3d");
    this.bindControls(); new ResizeObserver(() => this.resize()).observe(host); this.resize();
  }
  init3D() {
    const T = globalThis.THREE; if (!T) throw new Error("3D unavailable"); this.T = T;
    this.renderer = new T.WebGLRenderer({canvas: this.canvas, antialias: true, alpha: true, powerPreference: "low-power"});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace; this.renderer.setClearColor(0xf0ead9, 0);
    this.scene = new T.Scene();
    this.scene.background = new T.Color(0xf5eadc);
    this.firstCamera = new T.PerspectiveCamera(70, 1, .06, 55);
    this.overviewCamera = new T.OrthographicCamera(-8, 8, 5, -5, .1, 100);
    this.camera = this.firstCamera;
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
    this.sign("小小卡店", 0x315d4c, 0xfff1ce, 2.6, .4, 1.9, 3.34, -3.72);
    this.sign("活动公告", 0xb68a53, 0xfff5d3, 1.55, .85, -.5, 2.25, -3.9, "events");
    for (let n = 0; n < 4; n++) this.box(-1.04 + n * .34, 2.2 + (n % 2) * .15, -3.79, .22, .32, .02, [0xeacb78, 0xb4d5bb, 0xe5b4a7, 0xc8bee3][n]);
    this.shelf(2.55, -3.45, 3.4, "stock"); this.shelf(-1.65, -.65, 1.9, "stock");
    // Card display on left, counter on right.
    const display = this.box(-3.85, .48, -.1, 1.55, .95, .85, 0x668b78, "collection");
    const glass = this.box(-3.85, 1.1, -.1, 1.5, .55, .8, 0xd9f1e6, "collection"); glass.material = new T.MeshStandardMaterial({color: 0xdbf3e8, transparent: true, opacity: .32, roughness: .15, metalness: .1});
    this.displayCards = [];
    for (let i = 0; i < 5; i++) this.displayCards.push(this.card(-4.35 + i * .26, .99, .07, .22, "collection"));
    this.box(2.65, .56, .85, 2.5, 1.12, 1, 0xe2a69d, "checkout"); this.box(2.65, 1.18, .85, 2.65, .17, 1.13, 0xeed2b1, "checkout");
    for (let i = 0; i < 7; i++) this.box(1.65 + i * .32, .6, 1.36, .035, .98, .025, 0x51755e);
    this.box(3.25, 1.35, .8, .55, .22, .4, 0x314a43, "checkout"); const screen = this.box(3.25, 1.61, .75, .5, .36, .07, 0x36534a, "checkout"); screen.rotation.x = -.22;
    this.box(3.25, 1.63, .8, .41, .22, .02, 0x9bc9a3);
    this.cashier = this.person(0x3f7357); this.cashier.position.set(2.6, 0, -.14); this.scene.add(this.cashier);
    // Delivery crates, table, plants, rug and doorway.
    this.box(-3.7, .35, 2.6, .95, .7, .8, 0xbd9267, "supply"); this.box(-3.7, .73, 2.6, 1.02, .08, .88, 0xd7af79, "supply");
    this.box(-4.28, .22, 3.1, .65, .45, .65, 0xcba577, "supply");
    this.sign("补货", 0xeadab1, 0x6c845c, .48, .29, -3.7, .38, 3.02, "supply");
    this.box(.5, .025, 2, 2.2, .02, 1.4, 0x8b9a7b); this.box(3.75, .045, 3.2, 1.55, .02, 1, 0x627e68);
    this.plant(-4.25, -3.1); this.plant(4.25, -3.15); this.plant(4.35, 2.6);
    this.sign("入口", 0x76917a, 0xfff2cf, .9, .35, 4.6, .65, 3.35);
    this.decorate();
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
  decorate() {
    const T = this.T;
    this.firstObjects = [
      this.box(5.1, 1.7, 0, .18, 3.5, 8.2, 0xf0ded9),
      this.box(0, 3.6, 0, 10.4, .12, 8.2, 0xfff2dc),
      this.box(-1.1, 1.7, 4.15, 8.1, 3.5, .1, 0xd0e6df),
      this.box(4.7, 1.7, 4.15, .8, 3.5, .1, 0xd0e6df)
    ];
    // Front window and cheerful striped awning, made for this game.
    const window = this.box(-1.1, 1.8, 4.05, 6.5, 2.2, .08, 0xc5e8e7);
    this.firstObjects.push(window);
    const view = this.sign("欢迎光临 ♡", 0xc5e8e7, 0x729f91, 2.7, .65, -1.1, 1.9, 3.99); view.rotation.y = Math.PI; this.firstObjects.push(view);
    for (let i = 0; i < 15; i++) this.box(-4.65 + i * .65, 3.03, -3.8, .62, .33, .15, i % 2 ? 0xffe9d8 : 0xe7a6a3);
    for (let i = 0; i < 13; i++) {
      const x = -4.2 + i * .7, y = 2.85 - Math.sin(i / 12 * Math.PI) * .28;
      const shape = new T.Shape(); shape.moveTo(-.17, 0); shape.lineTo(.17, 0); shape.lineTo(0, -.28); shape.closePath();
      const flag = new T.Mesh(new T.ShapeGeometry(shape), new T.MeshStandardMaterial({color: [0xe8b0b5, 0xffd88a, 0xaecdc1, 0xc6b6d9][i % 4], side: T.DoubleSide})); flag.position.set(x, y, -3.58); this.scene.add(flag);
    }
    const poster = this.sign("好卡好运气 ✦", 0xf6d9de, 0xa56c7c, 1.55, .68, -4.96, 2.55, 0); poster.rotation.y = Math.PI / 2;
    this.sign("单卡小铺 ♡", 0xecd9ab, 0x678978, 1.35, .37, -3.85, 1.6, -.48, "collection");
    this.sign("今日好货", 0xf3d9a6, 0x6b8070, 1.55, .4, 2.5, 2.22, -3.43, "stock");
    this.sign("收银处", 0xe4b0b2, 0xfffcf0, 1.2, .38, 2.3, .82, 1.37, "checkout");
    // A round bunny mascot sitting beside the register.
    const bunny = new T.Group();
    const ball = (x,y,z,sx,sy,sz,color) => { const m = new T.Mesh(new T.SphereGeometry(1,12,10),this.material(color)); m.position.set(x,y,z); m.scale.set(sx,sy,sz); bunny.add(m); };
    ball(0,.17,0,.18,.19,.15,0xffeddf); ball(0,.41,0,.2,.18,.15,0xffeddf);
    for(const x of [-.09,.09]) {ball(x,.66,0,.065,.18,.055,0xffeddf);ball(x,.67,.045,.033,.12,.02,0xeeb4b7);ball(x*.75,.43,.145,.022,.027,.015,0x6b514b);ball(x*1.4,.37,.14,.035,.02,.012,0xe8b1b1);}
    ball(0,.37,.16,.025,.018,.015,0xd09593); bunny.position.set(1.8,1.28,.9); this.scene.add(bunny);
    // Pendant lamps and a soft pool of light.
    for (const x of [-2.6,2.2]) {
      this.box(x,3.13,-1.8,.025,.75,.025,0xb19d83);
      const shade = new T.Mesh(new T.ConeGeometry(.38,.25,16,1,true),new T.MeshStandardMaterial({color:0xf3c7b8,side:T.DoubleSide})); shade.position.set(x,2.76,-1.8); this.scene.add(shade);
      const light = new T.PointLight(0xffe5b8,3.5,7,2);light.position.set(x,2.65,-1.8);this.scene.add(light);
    }
  }
  resize() {
    this.width = this.host.clientWidth; this.height = this.host.clientHeight; if (!this.width || !this.height) return;
    if (this.renderer) {
      this.renderer.setSize(this.width, this.height, false);
      const aspect = this.width / this.height, half = Math.max(4.6, 6.35 / aspect);
      Object.assign(this.overviewCamera, {left:-half*aspect,right:half*aspect,top:half,bottom:-half});
      this.firstCamera.aspect = aspect; this.firstCamera.fov = aspect < 1 ? 90 : 70; this.firstCamera.updateProjectionMatrix();
      this.updateCamera();
    } else { const ratio = Math.min(devicePixelRatio || 1, 2); this.canvas.width = this.width * ratio; this.canvas.height = this.height * ratio; this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0); }
  }
  updateCamera() {
    if (!this.camera) return;
    if (this.view === "first") {
      this.camera.position.set(this.player.x,1.65,this.player.z);
      this.camera.lookAt(this.player.x + Math.sin(this.lookYaw)*Math.cos(this.pitch),1.65+Math.sin(this.pitch),this.player.z-Math.cos(this.lookYaw)*Math.cos(this.pitch));
    } else {
      this.camera.position.set(Math.sin(this.yaw)*16,13,Math.cos(this.yaw)*16);this.camera.lookAt(0,.7,0);this.camera.zoom=this.zoom;
    }
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
  }
  setView(view) {
    this.view = this.renderer ? view : "overview"; this.keys.clear();
    this.camera = this.renderer ? (this.view === "first" ? this.firstCamera : this.overviewCamera) : null;
    this.host.classList.toggle("is-first-person",this.view === "first");
    document.getElementById("world-view").textContent = this.view === "first" ? "俯瞰" : "进店";
    this.updateCamera();
  }
  canWalk(x,z) {
    if(x < -4.65 || x > 4.65 || z < -3.65 || z > 3.7) return false;
    const obstacles=[[-2.85,-.45,-1.35,.22],[1.1,4.15,.08,1.65],[-4.8,-2.85,-.85,.65],[.65,4.5,-4,-2.7],[-4.8,-3,2,3.55]];
    return !obstacles.some(([left,right,back,front])=>x>left&&x<right&&z>back&&z<front);
  }
  walk(forward,side,dt) {
    const length=Math.hypot(forward,side)||1,speed=2.2*dt/Math.max(1,length);
    const dx=(Math.sin(this.lookYaw)*forward+Math.cos(this.lookYaw)*side)*speed;
    const dz=(-Math.cos(this.lookYaw)*forward+Math.sin(this.lookYaw)*side)*speed;
    if(this.canWalk(this.player.x+dx,this.player.z))this.player.x+=dx;
    if(this.canWalk(this.player.x,this.player.z+dz))this.player.z+=dz;
    this.updateCamera();
  }
  interactAt(clientX,clientY) {
    if(!this.renderer)return;
    const rect=this.canvas.getBoundingClientRect(),ray=new this.T.Raycaster();
    ray.setFromCamera(new this.T.Vector2((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1),this.camera);
    const hit=ray.intersectObjects(this.scene.children,true).find(hit=>hit.object.visible&&hit.object.material?.opacity!==0);
    if(hit?.object.userData.action && (this.view!=="first"||hit.distance<6))this.onAction(hit.object.userData.action);
  }
  bindControls() {
    const pointers=new Map();let start=null,lastPinch=0;
    this.canvas.addEventListener("pointerdown",e=>{if(e.button!==0)return;this.canvas.focus({preventScroll:true});pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});this.canvas.setPointerCapture(e.pointerId);if(pointers.size===1)start={x:e.clientX,y:e.clientY,moved:false};else{const p=[...pointers.values()];lastPinch=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(start)start.moved=true;}});
    this.canvas.addEventListener("pointermove",e=>{
      const old=pointers.get(e.pointerId);if(!old)return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pointers.size===2){const p=[...pointers.values()],distance=Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);if(this.view!=="first"&&lastPinch)this.zoom=Math.max(.8,Math.min(1.65,this.zoom*distance/lastPinch));lastPinch=distance;}
      else if(this.view==="first"&&this.renderer){this.lookYaw-=(e.clientX-old.x)*.005;this.pitch=Math.max(-.65,Math.min(.65,this.pitch+(e.clientY-old.y)*.004));}
      else this.yaw=Math.max(.25,Math.min(1.3,this.yaw+(e.clientX-old.x)*.006));
      if(start&&Math.hypot(e.clientX-start.x,e.clientY-start.y)>5)start.moved=true;this.updateCamera();
    });
    const release=e=>{const click=start&&!start.moved&&pointers.size===1;pointers.delete(e.pointerId);if(click&&e.type==="pointerup")this.interactAt(e.clientX,e.clientY);if(!pointers.size)start=null;};
    this.canvas.addEventListener("pointerup",release);this.canvas.addEventListener("pointercancel",release);this.canvas.addEventListener("lostpointercapture",e=>{pointers.delete(e.pointerId);if(!pointers.size)start=null;});
    this.canvas.addEventListener("wheel",e=>{if(this.view==="first")return;e.preventDefault();this.zoom=Math.max(.8,Math.min(1.65,this.zoom-e.deltaY*.001));this.updateCamera();},{passive:false});
    const clear=()=>{this.keys.clear();pointers.clear();start=null;};
    window.addEventListener("blur",clear);document.addEventListener("visibilitychange",()=>{if(document.hidden)clear();});
    document.addEventListener("keydown",e=>{
      if(state.mode!=="shop"||document.querySelector("dialog[open]")||e.target.closest("input:not([type=checkbox]),select,textarea,[contenteditable=true]"))return;
      const key=e.key.toLowerCase();if(!["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright","e"].includes(key))return;
      e.preventDefault();this.keys.add(key);
      if(key==="e"&&!e.repeat){const r=this.canvas.getBoundingClientRect();this.interactAt(r.left+r.width/2,r.top+r.height/2);}
    });
    document.addEventListener("keyup",e=>this.keys.delete(e.key.toLowerCase()));
    for(const button of document.querySelectorAll("[data-walk]")){
      const release=()=>this.keys.delete(button.dataset.walk);
      button.addEventListener("pointerdown",e=>{e.preventDefault();this.keys.add(button.dataset.walk);button.setPointerCapture(e.pointerId);});
      button.addEventListener("pointerup",release);button.addEventListener("pointercancel",release);button.addEventListener("lostpointercapture",release);
      button.addEventListener("click",e=>{if(e.detail===0)this.walk(button.dataset.walk==="w"?1:button.dataset.walk==="s"?-1:0,button.dataset.walk==="d"?1:button.dataset.walk==="a"?-1:0,.22);});
    }
  }
  resetCamera() { this.player={x:.35,z:3.2};this.lookYaw=0;this.pitch=-.05;this.yaw=.73;this.zoom=1;this.keys.clear();this.updateCamera(); }

  project(x, y, z) {
    if (this.camera) { const p = new this.T.Vector3(x, y, z).project(this.camera); return {x: (p.x + 1) * this.width / 2, y: (1 - p.y) * this.height / 2, visible: p.z > -1 && p.z < 1 && Math.abs(p.x)<.95 && Math.abs(p.y)<.9}; }
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
    const controlsActive = state.mode === "shop" && !document.hidden && !document.querySelector("dialog[open]");
    if (!controlsActive) this.keys.clear();
    if (this.renderer && this.view === "first" && controlsActive) {
      if(this.keys.has("arrowleft"))this.lookYaw-=dt*1.6;
      if(this.keys.has("arrowright"))this.lookYaw+=dt*1.6;
      this.walk((this.keys.has("w")||this.keys.has("arrowup")?1:0)-(this.keys.has("s")||this.keys.has("arrowdown")?1:0),(this.keys.has("d")?1:0)-(this.keys.has("a")?1:0),dt);
    }
    if(this.firstObjects)this.firstObjects.forEach(mesh=>mesh.visible=this.view==="first");
    const alive = new Set();
    for (const person of people) {
      alive.add(person.id); let entry = this.people.get(person.id);
      if (!entry) { const label = document.createElement("span"); label.className = "customer-bubble"; this.labels.append(label); entry = {label}; if (this.renderer) { entry.mesh = this.person([0x9baecd, 0xc38d81, 0xb9ab74, 0x8cae92][person.serial % 4]); this.scene.add(entry.mesh); } this.people.set(person.id, entry); }
      if (entry.mesh) { entry.mesh.position.set(person.x, 0, person.z); entry.mesh.rotation.y = person.angle || 0; const stride = person.moving ? Math.sin(this.time * 9 + person.serial) * .38 : 0; entry.mesh.userData.legs.forEach((leg, i) => leg.rotation.x = i ? -stride : stride); entry.mesh.userData.arms.forEach((arm, i) => arm.rotation.x = i ? stride : -stride); entry.mesh.userData.bag.visible = ["toCounter", "checkout", "exit"].includes(person.phase); }
      const point = this.project(person.x, 1.75, person.z); entry.label.style.transform = `translate(${point.x}px,${point.y}px) translate(-50%,-100%)`; entry.label.textContent = person.label; entry.label.dataset.phase = person.phase; entry.label.hidden = this.view === "first" && (!point.visible || Math.hypot(person.x-this.player.x,person.z-this.player.z)>7);
    }
    for (const [id, entry] of this.people) if (!alive.has(id)) { if (entry.mesh) { this.scene.remove(entry.mesh); entry.mesh.traverse(object => object.geometry?.dispose()); } entry.label.remove(); this.people.delete(id); }
    const markers = {supply: ".supply-spot", stock: ".counter-spot", collection: ".collection-spot", events: ".event-spot"};
    for (const [action, coords] of Object.entries(this.anchors)) { if(this.view === "first" && this.renderer) continue; const p = this.project(...coords); const element = this.host.querySelector(markers[action]); element.style.left = `${Math.max(55, Math.min(this.width - 55, p.x))}px`; element.style.top = `${Math.max(48, Math.min(this.height - 35, p.y))}px`; element.style.right = "auto"; }
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
