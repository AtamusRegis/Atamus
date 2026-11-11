// Pet Delivery Co. (owner, 2026-11-08): ride your pet around town delivering mail. Pick up parcels at the post office,
// ride up to the glowing houses to deliver them, earn coins (and sometimes an item), buy eggs to hatch faster pets,
// train them. The town is a floating island (pets-world.js, shared with the server); fliers reach the small islands off
// its edge; animal control chases you. Co-op: everyone in a room rides the same town, works on contracts (alone or with a party) and
// chats. The server (packages/server/src/pets.js) shares players, runs animal control, contracts and chat.
import * as THREE from "./vendor/three.module.min.js";
import * as World from "./pets-world.js?v=1793100070";

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), hyp = Math.hypot;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const smooth = (t) => t * t * (3 - 2 * t);
const touchy = matchMedia("(pointer: coarse)").matches;

// ---- pets ----
const RARITY = [{ name: "Common", c: "#6f7d8a" }, { name: "Rare", c: "#3a8ee6" }, { name: "Legendary", c: "#e08a00" }];
// (owner, 2026-11-09) six pets: a Common, a Rare and a Legendary of each type (ground, air; water scrapped), the rarer the
// cooler. speed in m/s, bag in parcels, fly: flies, swim: swims; c / a: its colors
const SPECIES = {
  pup: { name: "Pup", r: 0, speed: 7.5, bag: 2, c: "#c98b4f", a: "#7a4f28", size: 1 },
  raptor: { name: "Raptor", r: 1, speed: 12, bag: 4, c: "#8aa04a", a: "#5a6a2a", size: 1.1 },
  trex: { name: "T-Rex", r: 2, speed: 15.5, bag: 7, c: "#4f7a3a", a: "#e5d9a8", size: 1.4 },
  parrot: { name: "Parrot", r: 0, speed: 8.5, bag: 2, fly: "fly", c: "#3fb36b", a: "#e5534b", size: 1 },
  owl: { name: "Owl", r: 1, speed: 12, bag: 4, fly: "fly", c: "#9b7a55", a: "#f3e3cc", size: 1.15 },
  dragon: { name: "Dragon", r: 2, speed: 16, bag: 5, fly: "fly", c: "#3fb36b", a: "#ffd84a", size: 1.35 },
};
// eggs: chance of each rarity (percent); the pet is any of that rarity
const EGGS = [
  { id: "basic", name: "Basic Egg", price: 150, odds: [75, 22, 3], c: "#f4ead8", s: "#d8c39c" },
  { id: "gold", name: "Golden Egg", price: 1500, odds: [0, 75, 25], c: "#ffd35a", s: "#e89a10" },
];
// training: each level +5% speed (up to level 20), every 5 levels one more parcel in the bag
const MAXLV = 20;
const petSpeed = (p) => SPECIES[p.sp].speed * (1 + 0.05 * (p.lv - 1));
const petBag = (p) => SPECIES[p.sp].bag + Math.floor((p.lv - 1) / 5);
// (owner, 2026-11-08) a pet grows a little with each level: 1.5% bigger per level
const petScale = (lv) => 1 + 0.015 * ((lv || 1) - 1);
// items dropped by deliveries (and contracts that fall short)
const ITEMS = { snack: { name: "Speed Candy", c: "#ff5aa0" }, ribbon: { name: "Training Ribbon", c: "#e5534b" }, ticket: { name: "Egg Ticket", c: "#f2b01e" } };
// (owner, 2026-11-08) Treats, like a kind's candy: a spare pet (you have another of its kind) can go live on the Pet
// Farm, leaving Treats for its kind (5, plus 1 per level it had); Treats train any pet of that kind instead of coins
// (1 per level up to level 4, 2 up to 8, and so on)
const tradeGives = (p) => 5 + (p.lv - 1);
const treatCost = (p) => Math.ceil(p.lv / 4);
const TREAT = `<svg class="ico" viewBox="0 0 24 24"><path d="M6 7a3 3 0 1 1 3-3l6 6a3 3 0 1 1 3 3 3 3 0 1 1-3 3l-6-6a3 3 0 1 1-3-3z" fill="#f6e3c0" stroke="#a0703f" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const SNACK_TIME = 30, SNACK_BOOST = 1.5;

// ---- the save (this browser) ----
const SAVE = "petdelivery.v1";
const N1 = ["Swift", "Sunny", "Brave", "Zippy", "Lucky", "Happy", "Mighty", "Cozy", "Speedy", "Jolly", "Rapid", "Breezy"];
const N2 = ["Otter", "Robin", "Badger", "Panda", "Comet", "Pebble", "Maple", "Biscuit", "Rocket", "Clover", "Sparrow", "Mochi"];
function fresh() { return { coins: 0, pets: [{ id: 1, sp: "pup", lv: 1 }], ride: 1, items: { snack: 0, ribbon: 0, ticket: 0 }, treats: {}, settings: { followArrowWhenEmpty: true }, name: pick(N1) + " " + pick(N2), delivered: 0, nextId: 2, shirt: pick(["#3a8ee6", "#e5534b", "#3fb36b", "#a352e0", "#f2b01e", "#2bb3c0"]) }; }
function load() { try { const s = JSON.parse(localStorage.getItem(SAVE)); if (s && Array.isArray(s.pets) && s.pets.length) { const f = Object.assign(fresh(), s); f.pets = f.pets.map((p) => ({ ...p, sp: World.PET_MOVED[p.sp] || p.sp })).filter((p) => SPECIES[p.sp]); if (!f.pets.length) f.pets = fresh().pets; return f; } } catch (e) { /* none yet */ } return fresh(); }
// (owner, 2026-11-08) since accounts, the server keeps the data; what was in this browser before seeds the first account
let save = load(), saveDirty = false;
const SPECIES_SET = new Set(Object.keys(SPECIES));
const persist = () => { saveDirty = true; };
const riding = () => save.pets.find((p) => p.id === save.ride) || save.pets[0];
const moveKind = () => SPECIES[riding().sp].fly || "land";
const flies = () => !!SPECIES[riding().sp].fly;

// ---- the world (shared with the server: pets-world.js; owner, 2026-11-10): the town is built from blocks by staff,
// round the town square ----
const { terrain, smoothTerrain, inside, ROAD_HALF, houses, trees, blocked, PLAZA, POST, PICKUP, BOARD, SHOP, SHOP_B, TRAIN, POUND, POUND_B, RELEASE, SPAWN } = World;
let seed = 20261108; const srnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick2 = (a) => a[Math.floor(srnd() * a.length)];
const HOUSE_C = ["#f6d9b8", "#cfe6f7", "#f7cfd8", "#d8f0c8", "#fbe7a8", "#e3d4f5", "#f9f4ea"], ROOF_C = ["#c8553d", "#3b6ea8", "#4a4f57", "#8a5a3a", "#6b5b95"];   // (owner, 2026-11-10) no green roofs
const houseColors = () => { for (const h of houses) { h.c = HOUSE_C[h.id % HOUSE_C.length]; h.roof = ROOF_C[(h.id * 7) % ROOF_C.length]; } };   // the same for everyone, by the house's id
const LIMIT = 460;   // how far out anyone can go (the extra plot island is at 400)

// ---- 3D ----
const canvas = $("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchy });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touchy ? 1.6 : 2));
renderer.shadowMap.enabled = false;   // (owner, 2026-11-09) baked shadows instead: darker ground under houses and trees, a soft spot under everyone
const scene = new THREE.Scene();
scene.background = new THREE.Color("#8fd3ff"); scene.fog = new THREE.Fog("#bfe6ff", 150, 560);
const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 1000);
{ const hemi = new THREE.HemisphereLight("#ffffff", "#8c8c8c", 1.1); hemi.layers.enableAll(); scene.add(hemi); }   // (lights reach the in-color layer too; owner 2026-11-10: the light bounced from the ground is neutral, not green, so limbs it lights do not turn pale green)
const sun = new THREE.DirectionalLight("#fff6e0", 1.6); sun.layers.enableAll(); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;   // (owner, 2026-11-08: flickering) no shadow acne
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 }); scene.add(sun, sun.target);
const dummy = new THREE.Object3D();
const MATS = new Map(), mat = (c) => { if (!MATS.has(c)) MATS.set(c, new THREE.MeshLambertMaterial({ color: c })); return MATS.get(c); };
const BOX = new THREE.BoxGeometry(1, 1, 1);
function box(w, h, d, c, x, y, z, parent, shadow = true) { const m = new THREE.Mesh(BOX, mat(c)); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; (parent || scene).add(m); return m; }
let snowCover;
const SKETCH = true;   // (owner, 2026-11-09) the world drawn in shades of gray (the pass below)
// (owner, 2026-11-09) guides and interaction circles stay in color: drawn after the sketch pass (layer 1), still hidden
// behind what stands in front of them
const inColor = (o) => { o.traverse((c) => c.layers.set(1)); return o; };
// ---- the blocks (owner, 2026-11-10): every block drawn as a box or a ramp: grass on top (roads paved), earth down the
// sides, darker underneath; sides against a neighbouring block are left out. Water blocks are see-through blue. All of
// it is rebuilt whenever staff change the world (buildWorldView). ----
const speck = (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 128; const x = cv.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 128, 128); for (let k = 0; k < 900; k++) { const v = 205 + Math.floor(Math.random() * 50); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2); } const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; })();
const blockM = new THREE.MeshLambertMaterial({ vertexColors: true, map: speck, side: THREE.DoubleSide });
const dirtM = new THREE.MeshLambertMaterial({ vertexColors: true, map: speck, side: THREE.DoubleSide, emissive: "#4e3c26" });   // (owner, 2026-11-10: dirt too dark) lit from within a little, so shaded sides stay a light brown
const waterBlockM = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: true });
const GRASS_T = [new THREE.Color("#7fc25a"), new THREE.Color("#8bc95f"), new THREE.Color("#96cf63")], EARTH = new THREE.Color("#b08658"), ROAD_T = new THREE.Color("#5c6670"), WATER_T = new THREE.Color("#3f9fd8");
const worldG = new THREE.Group(); scene.add(worldG);
snowCover = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial({ color: "#eef7ff", transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: THREE.DoubleSide })); snowCover.visible = false; snowCover.position.y = 0.025; scene.add(snowCover);
function blockGeometry() {
  const { TILE: T, STEP: S, DIRS, cellTop } = World, at = new Map(), P = [], C = [], U = [], WP = [], WC = [], TOP = [], DP = [], DC = [], DU = [];   // D: the earth (sides and undersides), drawn in color
  for (const c of World.allCells()) at.set(c.i + "," + c.j + "," + c.k, c);
  const full = (i, j, k) => { const c = at.get(i + "," + j + "," + k); return !!c && (c.t === "land" || c.t === "road" || c.t === "corner"); };
  const quad = (pts, col, f, uvf, top) => {   // 4 corners in order; f darkens
    const cc = col.clone().multiplyScalar(f), [PP, CC, UU] = col === EARTH ? [DP, DC, DU] : [P, C, U];
    for (const q of [0, 1, 2, 0, 2, 3]) { const [x, y, z] = pts[q]; PP.push(x, y, z); CC.push(cc.r, cc.g, cc.b); const [u, v] = uvf(x, y, z); UU.push(u, v); if (top) TOP.push(x, y, z); }
  };
  const tri = (pts, col, f, uvf, top) => { const cc = col.clone().multiplyScalar(f), [PP, CC, UU] = col === EARTH ? [DP, DC, DU] : [P, C, U]; for (const [x, y, z] of pts) { PP.push(x, y, z); CC.push(cc.r, cc.g, cc.b); const [u, v] = uvf(x, y, z); UU.push(u, v); if (top) TOP.push(x, y, z); } };
  const wquad = (pts, f) => { const cc = WATER_T.clone().multiplyScalar(f); for (const q of [0, 1, 2, 0, 2, 3]) { const [x, y, z] = pts[q]; WP.push(x, y, z); WC.push(cc.r, cc.g, cc.b); } };
  const topUV = (x, y, z) => [x / 9, z / 9], sideUV = (x, y, z) => [(x + z) / 9, y / 9];
  for (const c of at.values()) {
    const x0 = c.i * T, x1 = x0 + T, z0 = c.j * T, z1 = z0 + T, y0 = (c.k - 1) * S, y1 = c.k * S;
    const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]], h = c.t === "water" ? corners.map(() => y1 - 0.4) : corners.map(([x, z]) => cellTop(c, x, z));
    if (c.t === "water") {
      if (!at.has(c.i + "," + c.j + "," + (c.k + 1))) wquad(corners.map(([x, z], n) => [x, h[n], z]), 1);
      for (let s2 = 0; s2 < 4; s2++) { const [dx, dz] = DIRS[s2], n = at.get((c.i + dx) + "," + (c.j + dz) + "," + c.k); if (n && (n.t === "water" || full(c.i + dx, c.j + dz, c.k))) continue; const e = sideCorners(s2); wquad([[e[0][0], y0, e[0][1]], [e[1][0], y0, e[1][1]], [e[1][0], y1 - 0.4, e[1][1]], [e[0][0], y1 - 0.4, e[0][1]]], 0.8); }
      continue;
    }
    if (c.t === "corner" || c.t === "half") {   // (owner, 2026-11-10) cut corner to corner: road on the side between sides d and d + 1
      const rc = [2, 1, 0, 3][c.d], a = corners[(rc + 1) % 4], b = corners[(rc + 3) % 4], r = corners[rc], o = corners[(rc + 2) % 4], hsh = ((c.i * 73856093) ^ (c.j * 19349663)) >>> 0;
      const P3 = (q, y) => [q[0], y, q[1]];
      if (!full(c.i, c.j, c.k + 1)) { tri([P3(r, y1), P3(a, y1), P3(b, y1)], ROAD_T, 1, topUV, true); if (c.t === "corner") tri([P3(o, y1), P3(a, y1), P3(b, y1)], GRASS_T[hsh % 3], 1, topUV, true); }
      if (!full(c.i, c.j, c.k - 1)) { tri([P3(r, y0), P3(a, y0), P3(b, y0)], EARTH, 0.7, topUV); if (c.t === "corner") tri([P3(o, y0), P3(a, y0), P3(b, y0)], EARTH, 0.7, topUV); }
      for (let s2 = 0; s2 < 4; s2++) {
        if (c.t === "half" && s2 !== c.d && s2 !== (c.d + 1) % 4) continue;
        const [dx, dz] = DIRS[s2]; if (full(c.i + dx, c.j + dz, c.k)) continue;
        const e = s2 === 0 ? [[x0, z1], [x1, z1]] : s2 === 1 ? [[x1, z0], [x1, z1]] : s2 === 2 ? [[x0, z0], [x1, z0]] : [[x0, z0], [x0, z1]];
        quad([[e[0][0], y0, e[0][1]], [e[1][0], y0, e[1][1]], [e[1][0], y1, e[1][1]], [e[0][0], y1, e[0][1]]], EARTH, s2 % 2 ? 1 : 0.92, sideUV);
      }
      if (c.t === "half") quad([P3(a, y0), P3(b, y0), P3(b, y1), P3(a, y1)], EARTH, 0.96, sideUV);   // the cut face
      continue;
    }
    const road = c.t === "road" || c.t === "ramp", hsh = ((c.i * 73856093) ^ (c.j * 19349663)) >>> 0, topC = road ? ROAD_T : GRASS_T[hsh % 3];
    if (!full(c.i, c.j, c.k + 1)) quad(corners.map(([x, z], n) => [x, h[n], z]), topC, 1, topUV, true);
    if (!full(c.i, c.j, c.k - 1)) quad(corners.map(([x, z]) => [x, y0, z]), EARTH, 0.7, topUV);
    function sideCorners(s2) { return s2 === 0 ? [[x0, z1], [x1, z1]] : s2 === 1 ? [[x1, z0], [x1, z1]] : s2 === 2 ? [[x0, z0], [x1, z0]] : [[x0, z0], [x0, z1]]; }
    for (let s2 = 0; s2 < 4; s2++) {
      const [dx, dz] = DIRS[s2]; if (full(c.i + dx, c.j + dz, c.k)) continue;
      const e = sideCorners(s2), ha = cellTop(c, e[0][0], e[0][1]), hb = cellTop(c, e[1][0], e[1][1]); if (ha - y0 < 0.01 && hb - y0 < 0.01) continue;
      quad([[e[0][0], y0, e[0][1]], [e[1][0], y0, e[1][1]], [e[1][0], hb, e[1][1]], [e[0][0], ha, e[0][1]]], EARTH, s2 % 2 ? 1 : 0.92, sideUV);
    }
  }
  const mk = (pos, col, uv) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); if (uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g; };
  const tg = new THREE.BufferGeometry(); tg.setAttribute("position", new THREE.Float32BufferAttribute(TOP, 3)); tg.computeVertexNormals();
  return { solid: mk(P, C, U), dirt: mk(DP, DC, DU), water: mk(WP, WC, null), tops: tg };
}
// the plaza's paving
{ const m = new THREE.Mesh(new THREE.CircleGeometry(PLAZA - 4, 64).rotateX(-Math.PI / 2), mat("#e8dcc4")); m.position.y = 0.06; m.receiveShadow = true; scene.add(m); }
const ROAD_LIFT = 0;   // (owner, 2026-11-10) roads are paved blocks: their top is the road
// the camera under the water: everything goes a hazy blue (water blocks)
const UNDER = new THREE.Color("#2b6f9e");
function underwater() { if (me.inst) { scene.background.set("#000000"); scene.fog.color.set("#000000"); scene.fog.near = 60; scene.fog.far = 400; return; }   // (owner, 2026-11-09) inside a house: a black void round it
  const w = World.waterAt(camera.position.x, camera.position.z); if (w > camera.position.y) { scene.fog.color.copy(UNDER); scene.background.copy(UNDER); scene.fog.near = 0.5; scene.fog.far = 38; } }
function waterStep() {}
// ---- speed boosts (owner, 2026-11-09): glowing arrow pads laid on the roads, rings in the air and whirlpools on the
// water; run, fly or swim through one and your pet goes 1.6x for 5 s (with Speed Candy too). The rings are only there
// for fliers and gliders, the whirlpools only for swimmers; both fade out with distance. ----
const PAD_BOOST = 1.6, PAD_TIME = 5000, BOOST_SEE = 120, BOOST_FADE = 45;
const BOOSTS = [];
let padMat;
{
  for (let n = 0; n < 14; n++) { const a = (n / 14) * TAU + 0.35, r = n % 2 ? 95 : 160, x = Math.cos(a) * r, z = Math.sin(a) * r; BOOSTS.push({ k: "air", x, y: Math.max(0, terrain(x, z)) + 16 + (n % 3) * 9, z, yaw: a, r: 4 }); }
  for (const [x, z, y] of [[0, -20, 34], [0, 20, 34], [-20, 0, 48], [20, 0, 48], [-70, -70, 76], [70, -70, 76], [-70, 70, 76], [70, 70, 76]]) BOOSTS.push({ k: "air", x, y, z, yaw: Math.atan2(x, z), r: 4 });
  for (const b of BOOSTS) if (b.k === "water") { b.y = World.waterAt(b.x, b.z); b.yaw = 0; }
  // (owner, 2026-11-10) chevrons drawn by a shader, with no edge cutting them off: each comes in faintly where the pad
  // starts and fades away as it runs to the far end. uv: x across the pad (3.4 m), y along it (5 m)
  padMat = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, dir: { value: 1 } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,   // (owner, 2026-11-10) only a nudge: more drew the chevrons over the feet of anyone standing on them
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform float t; uniform float dir; varying vec2 vUv;
      void main() {
        float run = dir > 0.0 ? vUv.y : 1.0 - vUv.y;          // 0 where they come in, 1 where they leave
        float cx = (vUv.x - 0.5) * 3.4, cy = fract(run * 3.0 - t) * 1.667;
        float d = abs(cy - (1.15 - abs(cx) * 0.6));             // distance to the chevron's arms (pointing the way it runs)
        float side = 1.0 - smoothstep(1.15, 1.35, abs(cx));
        float stroke = (1.0 - smoothstep(0.17, 0.22, d)) * side, core = (1.0 - smoothstep(0.07, 0.11, d)) * side;
        float fade = smoothstep(0.0, 0.18, run) * (1.0 - smoothstep(0.35, 1.0, run));
        vec3 col = mix(vec3(1.0, 0.62, 0.1), vec3(1.0, 0.96, 0.76), core);
        gl_FragColor = vec4(col, stroke * fade * 0.9);
      }`,
  });
  const swirlTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"); g.translate(64, 64); for (let arm = 0; arm < 3; arm++) { g.beginPath(); for (let t = 0; t < 1; t += 0.01) { const a = arm * (TAU / 3) + t * 7, r = 4 + t * 58; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.strokeStyle = "rgba(255,255,255,0.95)"; g.lineWidth = 7; g.lineCap = "round"; g.stroke(); } const rg = g.createRadialGradient(0, 0, 0, 0, 0, 62); rg.addColorStop(0, "rgba(40,60,190,0.9)"); rg.addColorStop(0.7, "rgba(110,130,255,0.5)"); rg.addColorStop(1, "rgba(150,170,255,0)"); g.globalCompositeOperation = "destination-over"; g.fillStyle = rg; g.beginPath(); g.arc(0, 0, 62, 0, TAU); g.fill(); return new THREE.CanvasTexture(c); })();
  const ringG = new THREE.TorusGeometry(3.2, 0.32, 8, 32), glowG = new THREE.TorusGeometry(3.2, 0.9, 8, 32), swirlG = new THREE.CircleGeometry(2.6, 32).rotateX(-Math.PI / 2);
  BOOSTS.padT = padMat.uniforms.t;
  for (const b of BOOSTS) {
    const g = new THREE.Group(); g.position.set(b.x, b.y, b.z); g.rotation.y = b.yaw; scene.add(g); b.g = g;
    if (b.k === "air") { b.m = [new THREE.MeshBasicMaterial({ color: "#5fe3ff", transparent: true }), new THREE.MeshBasicMaterial({ color: "#5fe3ff", transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })]; g.add(new THREE.Mesh(ringG, b.m[0]), new THREE.Mesh(glowG, b.m[1])); }
    else { b.m = [new THREE.MeshBasicMaterial({ map: swirlTex, transparent: true, depthWrite: false, side: THREE.DoubleSide })]; const w = new THREE.Mesh(swirlG, b.m[0]); w.position.y = 0.06; w.renderOrder = 3; g.add(w); b.spin = w; }
  }
}
// (owner, 2026-11-10) the pads staff put on road tiles, laid on the tile (it follows a ramp), rebuilt with the world
const PAD_G = new THREE.PlaneGeometry(3.4, 5, 4, 8).rotateX(-Math.PI / 2);
function buildPads(parent) {
  for (let i = BOOSTS.length - 1; i >= 0; i--) if (BOOSTS[i].k === "pad") BOOSTS.splice(i, 1);
  for (const p of World.boosts) {
    const g = PAD_G.clone(), pos = g.attributes.position, c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    for (let n = 0; n < pos.count; n++) { const lx = pos.getX(n), lz = pos.getZ(n), x = p.x + lx * c + lz * sn, z = p.z - lx * sn + lz * c; pos.setXYZ(n, x, World.surfaceAt(x, z, p.y + 2) + 0.08, z); }
    const b = { k: "pad", x: p.x, y: p.y, z: p.z, yaw: p.yaw, r: 3 };
    b.m = padMat.clone(); b.m.uniforms = { t: padMat.uniforms.t, dir: { value: 1 } };   // each pad runs its own way (away from you), on the shared clock
    b.g = new THREE.Mesh(g, b.m); b.g.renderOrder = 2; parent.add(inColor(b.g)); BOOSTS.push(b);
  }
}
// which boosts this pet can use: road pads any pet riding; rings fliers and gliders; whirlpools swimmers
const boostFor = (b, kind) => kind !== "foot" && (b.k === "pad" || (b.k === "air" ? kind === "fly" || kind === "glide" : swims()));
function boostStep(dt) {
  const kind = me.foot ? "foot" : moveKind();
  if (BOOSTS.padT) BOOSTS.padT.value += dt * 0.9;
  for (const b of BOOSTS) {
    if (b.k === "pad") {   // (owner, 2026-11-09) the chevrons always point, and run, away from me along the road
      // (owner, 2026-11-10) away from where you and the camera are: the midpoint between them
      const vx = (me.x + camera.position.x) / 2 - b.x, vz = (me.z + camera.position.z) / 2 - b.z;
      b.m.uniforms.dir.value = vx * Math.sin(b.yaw) + vz * Math.cos(b.yaw) > 0 ? -1 : 1; continue;
    }
    const a = boostFor(b, kind) ? clamp((BOOST_SEE - hyp(b.x - me.x, b.z - me.z, (b.y - me.y) * 0.6)) / BOOST_FADE, 0, 1) : 0;
    b.g.visible = a > 0.01; if (!b.g.visible) continue;
    if (b.k === "air") { b.m[0].opacity = a; b.m[1].opacity = (0.18 + Math.sin(clock * 4) * 0.1) * a; } else { b.m[0].opacity = a; b.spin.rotation.y -= dt * 2.5; }
  }
}
function boostTouch(now, kind) {
  for (const b of BOOSTS) {
    if (!boostFor(b, kind)) continue;
    const dy = b.k === "pad" ? me.y - b.y : b.k === "water" ? me.y - b.y + 0.6 : me.y + 0.8 - b.y;
    if (hyp(me.x - b.x, me.z - b.z) < b.r && dy > (b.k === "water" ? -3 : -1.5) && dy < (b.k === "pad" ? 1.5 : 2.5)) {
      if (me.padUntil < now - 600 || !me.padUntil) emitSparks(me.x, me.y + 1, me.z, 26, 6, b.k === "pad" ? ["#ff9f1a", "#fff4c2"] : b.k === "air" ? ["#5fe3ff", "#ffffff"] : ["#8f9bff", "#ffffff"], 0.7, 0);
      me.padUntil = now + PAD_TIME; me.padC = b.k; return;
    }
  }
}
// ---- the training arena (owner, 2026-11-09): riding into the training yard takes you to a big floating arena with an
// obstacle course round a track. Clear the glowing obstacle (in order, round the track the way the arrow points) for a
// training point; enough points and your pet goes up a level: 20 for level 2, 4 more for each level after. The gold
// circle in the middle has the Training Yard panel (Treats, Training Ribbons); the purple arch takes you back to town. ----
const AR = { x: 0, z: -405, y: 20, r: 40 }, TR0 = 20, TR1 = 28, TRM = 24;
const trainNeed = (lv) => 20 + 4 * (lv - 1);
const OBS = [
  { k: "hurdle", a: 0, top: 0.7 },
  { k: "hoop", a: TAU / 8, bot: 0.5, c: 1.9, rr: 1.4 },
  { k: "plat", a: (2 * TAU) / 8, h: 0.9, da: 0.12 },
  { k: "gate", a: (3 * TAU) / 8, r0: TR0, r1: TRM },
  { k: "gate", a: (4 * TAU) / 8, r0: TRM, r1: TR1 },
  { k: "tunnel", a: (5 * TAU) / 8, da: 0.13, w0: 22, w1: 26, roof: 2.6 },
  { k: "hurdle", a: (6 * TAU) / 8, top: 0.85 },
  { k: "hoop", a: (7 * TAU) / 8, bot: 0.7, c: 2.3, rr: 1.6 },
];
const PODIUM = 3, EXIT = { x: 0, z: -9 };
const wrapA = (d) => { while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
const arLocal = (x, z) => { const lx = x - AR.x, lz = z - AR.z; return { lx, lz, r: hyp(lx, lz), a: Math.atan2(lz, lx) }; };
const inArena = (x = me.x, z = me.z, m = 0) => hyp(x - AR.x, z - AR.z) < AR.r - m;
// the floor's height above the arena (a platform where there is one)
function arenaFloor(x, z) { const q = arLocal(x, z); for (const o of OBS) if (o.k === "plat" && q.r > TR0 + 1 && q.r < TR1 - 1 && Math.abs(wrapA(q.a - o.a)) < o.da) return o.h; return 0; }
// solid parts: hurdle bars (and the sill under a hoop), gate poles, tunnel walls
function arenaBlocked(x, z, y) {
  const q = arLocal(x, z); if (q.r > AR.r) return false; const h = y - AR.y;
  for (const o of OBS) {
    const along = wrapA(q.a - o.a) * q.r;
    if ((o.k === "hurdle" || o.k === "hoop") && Math.abs(along) < 0.7 && q.r > TR0 && q.r < TR1 && h < (o.k === "hurdle" ? o.top : o.bot)) return true;
    if (o.k === "gate") for (const r of [o.r0, o.r1]) if (hyp(q.lx - Math.cos(o.a) * r, q.lz - Math.sin(o.a) * r) < 0.9 && h < 3) return true;
    if (o.k === "tunnel" && Math.abs(wrapA(q.a - o.a)) < o.da && h < o.roof + 0.4) for (const r of [o.w0, o.w1]) if (Math.abs(q.r - r) < 0.75) return true;
  }
  return false;
}
let arNext = 0, arPrev = null, arPanel = false, trainPill = "";
{
  const top = new THREE.Mesh(new THREE.CylinderGeometry(AR.r, AR.r * 0.95, 2, 48), mat("#86c95f")); top.position.set(AR.x, AR.y - 1, AR.z); top.receiveShadow = true; scene.add(top);
  const rock = new THREE.Mesh(new THREE.ConeGeometry(AR.r * 0.95, AR.r * 1.3, 12).rotateX(Math.PI), mat("#8a7f72")); rock.position.set(AR.x, AR.y - 2 - AR.r * 0.65, AR.z); scene.add(rock);
  const flat = (g, c, y) => { const m = new THREE.Mesh(g.rotateX(-Math.PI / 2), mat(c)); m.position.set(AR.x, AR.y + y, AR.z); m.receiveShadow = true; scene.add(m); return m; };
  flat(new THREE.RingGeometry(TR0, TR1, 72), "#d98b5f", 0.03); flat(new THREE.RingGeometry(TR0 - 0.3, TR0, 72), "#ffffff", 0.04); flat(new THREE.RingGeometry(TR1, TR1 + 0.3, 72), "#ffffff", 0.04);
  flat(new THREE.CircleGeometry(PODIUM, 32), "#ffd35a", 0.06);
  const W = (lx, lz) => [AR.x + lx, AR.z + lz];
  for (let n = 0; n < 40; n++) { const a = (n / 40) * TAU, [x, z] = W(Math.cos(a) * (AR.r - 1), Math.sin(a) * (AR.r - 1)); box(0.25, 1.2, 0.25, "#ffffff", x, AR.y + 0.6, z); if (n % 2 === 0) { const g = new THREE.Group(); g.position.set(x, AR.y + 1, z); g.rotation.y = -a; scene.add(g); box(0.1, 0.15, (TAU / 40) * (AR.r - 1) * 2, "#ffffff", 0, 0, 0, g); } }
  // the exit: a purple arch back to town
  { const [x, z] = W(EXIT.x, EXIT.z), g = new THREE.Group(); g.position.set(x, AR.y, z); scene.add(g); const arch = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.35, 10, 32, Math.PI), new THREE.MeshBasicMaterial({ color: "#b67cff" })); arch.position.y = 0; g.add(arch); const glow = new THREE.Mesh(new THREE.CircleGeometry(2.3, 32, 0, Math.PI), new THREE.MeshBasicMaterial({ color: "#d9b8ff", transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false })); g.add(glow); }
  for (const o of OBS) {
    const g = new THREE.Group(), [x, z] = W(Math.cos(o.a) * TRM, Math.sin(o.a) * TRM); g.position.set(x, AR.y, z); g.rotation.y = -o.a; scene.add(g); o.g = g;   // local x: out across the track, z: along it
    const span = TR1 - TR0;
    if (o.k === "hurdle") { for (const s of [-1, 1]) box(0.25, o.top + 0.4, 0.25, "#ffffff", s * span / 2, (o.top + 0.4) / 2, 0, g); for (let n = 0; n < 8; n++) box(span / 8, 0.22, 0.22, n % 2 ? "#ffffff" : "#e5534b", -span / 2 + span / 16 + (n * span) / 8, o.top - 0.11, 0, g); }
    if (o.k === "hoop") { box(span, o.bot, 0.3, "#3a8ee6", 0, o.bot / 2, 0, g); const ring = new THREE.Mesh(new THREE.TorusGeometry(o.rr, 0.18, 10, 32), mat("#ffd35a")); ring.position.set(0, o.c, 0); g.add(ring); for (const s of [-1, 1]) box(0.2, o.c, 0.2, "#ffffff", s * (o.rr + 0.2), o.c / 2, 0, g); }
    if (o.k === "plat") { const len = 2 * o.da * TRM; box(span - 2, o.h, len, "#3a8ee6", 0, o.h / 2, 0, g); box(span - 1.8, 0.08, len + 0.2, "#ffffff", 0, o.h, 0, g); }
    if (o.k === "gate") for (const r of [o.r0, o.r1]) { box(0.35, 3, 0.35, "#ffd35a", r - TRM, 1.5, 0, g); if (r === o.r0) { const b = box(Math.abs(o.r1 - o.r0), 0.6, 0.06, "#a352e0", (o.r0 + o.r1) / 2 - TRM, 2.7, 0, g); void b; } }
    if (o.k === "tunnel") { const len = 2 * o.da * TRM; for (const r of [o.w0, o.w1]) box(0.4, o.roof, len, "#e08a00", r - TRM, o.roof / 2, 0, g); box(o.w1 - o.w0 + 0.4, 0.3, len, "#c8553d", (o.w0 + o.w1) / 2 - TRM, o.roof + 0.15, 0, g); }
  }
  // the next obstacle: a gold beam and a bobbing diamond over it
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 14, 20, 1, true), new THREE.MeshBasicMaterial({ color: "#ffd35a", transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshBasicMaterial({ color: "#ffd35a" }));
  scene.add(inColor(beam), inColor(gem)); AR.beam = beam; AR.gem = gem;
}
function enterArena() {
  const a = -0.35; me.x = AR.x + Math.cos(a) * TRM; me.z = AR.z + Math.sin(a) * TRM; me.y = AR.y; me.vy = 0; cam.y = me.y;
  me.yaw = Math.atan2(-Math.sin(a), Math.cos(a)); cam.yaw = me.yaw + Math.PI; arPrev = null; arNext = 0;
  emitSparks(me.x, me.y + 1, me.z, 30, 5, ["#ffd35a", "#ffffff"], 0.8, 0); sendPos(true);
}
function leaveArena() {
  me.x = TRAIN.x; me.z = TRAIN.z + TRAIN.r + 5; me.y = terrain(me.x, me.z); me.vy = 0; cam.y = me.y; me.yaw = 0; cam.yaw = Math.PI; arPrev = null;
  if (openPanel === "p-train") closePanels(); arPanel = false; emitSparks(me.x, me.y + 1, me.z, 30, 5, ["#b67cff", "#ffffff"], 0.8, 0); sendPos(true);
}
function trainPoint() {
  const p = riding(); if (p.lv >= MAXLV) return;
  p.tp = (p.tp || 0) + 1; persist();
  emitSparks(me.x, me.y + 1.5, me.z, 18, 5, ["#ffd35a", "#ffffff"], 0.7, -2);
  if (p.tp >= trainNeed(p.lv)) { p.tp -= trainNeed(p.lv); train("points"); }
  else if (openPanel === "p-train") renderTrain();
}
// where to go through an obstacle (owner, 2026-11-09: the guide pointed at a gate's post): a gate's gap, else the middle of the track
const obsSpot = (o) => { const r = o.k === "gate" ? (o.r0 + o.r1) / 2 : TRM; return [AR.x + Math.cos(o.a) * r, AR.z + Math.sin(o.a) * r]; };
function arenaStep() {
  const here = inArena(), pill = $("trainp");
  AR.beam.visible = AR.gem.visible = here;
  if (!here) { arPrev = null; if (trainPill) { trainPill = ""; pill.style.display = "none"; } return; }
  const p = riding(), s = p.lv >= MAXLV ? "Lv " + MAXLV : `${p.tp || 0}/${trainNeed(p.lv)}`;
  if (s !== trainPill) { trainPill = s; $("trainn").textContent = s; pill.style.display = ""; }
  const o = OBS[arNext], [bx, bz] = obsSpot(o);
  AR.beam.position.set(bx, AR.y + 7, bz); AR.gem.position.set(bx, AR.y + 5 + Math.sin(clock * 3) * 0.4, bz); AR.gem.rotation.y = clock * 2;
  const q = arLocal(me.x, me.z), h = me.y - AR.y;
  // the middle: the panel on the gold circle, the arch back to town
  const onPod = q.r < PODIUM && h < 1.5;
  if (onPod && !arPanel) { arPanel = true; show("p-train"); } else if (!onPod && arPanel) { arPanel = false; if (openPanel === "p-train") closePanels(); }
  if (hyp(q.lx - EXIT.x, q.lz - EXIT.z) < 1.8 && h < 3) { leaveArena(); return; }
  if (p.lv < MAXLV) {
    let hit = false;
    if (o.k === "plat") hit = Math.abs(wrapA(q.a - o.a)) < o.da && q.r > TR0 + 1 && q.r < TR1 - 1 && Math.abs(h - o.h) < 0.12;
    else if (arPrev) {
      const d0 = wrapA(arPrev.a - o.a), d1 = wrapA(q.a - o.a);
      if (d0 < 0 && d1 >= 0 && d1 - d0 < 0.5) {   // went past it, the way round the track
        if (o.k === "hurdle") hit = q.r > TR0 && q.r < TR1 && h > o.top - 0.05;
        if (o.k === "hoop") hit = Math.abs(q.r - TRM) < o.rr && h > o.bot - 0.05 && h < o.c + o.rr;
        if (o.k === "gate") hit = q.r > o.r0 && q.r < o.r1;
        if (o.k === "tunnel") hit = q.r > o.w0 && q.r < o.w1 && h < o.roof;
      }
    }
    if (hit) { arNext = (arNext + 1) % OBS.length; trainPoint(); }
  }
  arPrev = q;
}
// houses as instances: walls, roofs, doors, mailboxes; each faces its way. Lone mailboxes (owner, 2026-11-10) have no
// house. Rebuilt with the world.
function instanced(geo, color, n, each, parent = scene) { const m = new THREE.InstancedMesh(geo, mat(color), Math.max(1, n)); m.count = n; m.castShadow = true; m.receiveShadow = true; for (let i = 0; i < n; i++) { dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); each(i, dummy); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); } parent.add(m); return m; }
const HIDE = 0.0001;
const wallAt = (h, d) => { d.position.set(h.x, h.base + 1.2, h.z); d.scale.set(9, 6.4, 9); d.rotation.y = h.yaw; if (h.box) d.scale.set(HIDE, HIDE, HIDE); };
const roofAt = (h, d) => { d.position.set(h.x, h.base + 6.1, h.z); d.scale.set(1, 1, 1); d.rotation.y = h.yaw; if (h.box) d.scale.set(HIDE, HIDE, HIDE); };
const doorAt = (h, d) => { d.position.set(h.x + Math.sin(h.yaw) * 4.55, h.base + 1.1, h.z + Math.cos(h.yaw) * 4.55); d.scale.set(1.6, 2.2, 0.15); d.rotation.y = h.yaw; if (h.box) d.scale.set(HIDE, HIDE, HIDE); };
const ROOFG = new THREE.ConeGeometry(7.2, 3.4, 4); ROOFG.rotateY(Math.PI / 4);
let houseParts = [];
// (owner, 2026-11-10) a town house someone lives in is hidden: their own house stands on its lot (its mailbox stays)
const lotTaken = (i) => !!houses[i] && plotState.has(houses[i].id);
let houseWin = null;
function winAt(h, sd, d) { const lx = sd * 2.8, lz = 4.53; d.position.set(h.x + lx * Math.cos(h.yaw) + lz * Math.sin(h.yaw), h.base + 2.5, h.z - lx * Math.sin(h.yaw) + lz * Math.cos(h.yaw)); d.rotation.set(0, h.yaw, 0); d.scale.set(h.box ? HIDE : 1.5, h.box ? HIDE : 1.3, 0.1); }
function syncLots() { for (let i = 0; i < houses.length; i++) if (!fades.has(i)) setHouse(i, true); }
function setHouse(i, on) {
  on = on && !lotTaken(i);
  if (houseWin) { for (const sd of [-1, 1]) { winAt(houses[i], sd, dummy); if (!on) dummy.scale.set(HIDE, HIDE, HIDE); dummy.updateMatrix(); houseWin.setMatrixAt(i * 2 + (sd > 0 ? 1 : 0), dummy.matrix); } houseWin.instanceMatrix.needsUpdate = true; }
  for (const [m, f] of houseParts) { dummy.rotation.set(0, 0, 0); f(houses[i], dummy); if (!on) dummy.scale.set(HIDE, HIDE, HIDE); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.instanceMatrix.needsUpdate = true; } }
// windows either side of the door: they light up at night
const windowM = new THREE.MeshBasicMaterial({ color: "#6b7f99" }), WINDOW_ON = new THREE.Color("#ffd76a");
// (owner, 2026-11-10) tall pines, three to four blocks high: a trunk and three tiers of cone
const TRUNK = new THREE.CylinderGeometry(0.22, 0.34, 1, 6).translate(0, 0.5, 0), PINE_CONE = new THREE.ConeGeometry(1, 1, 8).translate(0, 0.5, 0);
const pineH = (t) => 9 + (t.s - 0.85) * 6;   // 9 to 12 m
const PINE_TIERS = [[0.2, 0.42, 2.8], [0.42, 0.36, 2.1], [0.62, 0.38, 1.4]];   // where a tier starts, how tall it is (of the height), its radius
function buildThings(parent) {
  houseColors();
  const walls = instanced(BOX, "#ffffff", houses.length, (i, d) => wallAt(houses[i], d), parent); houses.forEach((h, i) => walls.setColorAt(i, new THREE.Color(h.c)));
  const roofs = instanced(ROOFG, "#ffffff", houses.length, (i, d) => roofAt(houses[i], d), parent); houses.forEach((h, i) => roofs.setColorAt(i, new THREE.Color(h.roof)));
  const doors = instanced(BOX, "#7a4f28", houses.length, (i, d) => doorAt(houses[i], d), parent);
  houseParts = [[walls, wallAt], [roofs, roofAt], [doors, doorAt]];
  const wm = new THREE.InstancedMesh(BOX, windowM, Math.max(1, houses.length * 2)); wm.count = houses.length * 2;
  houses.forEach((h, i) => { for (const sd of [-1, 1]) { winAt(h, sd, dummy); dummy.updateMatrix(); wm.setMatrixAt(i * 2 + (sd > 0 ? 1 : 0), dummy.matrix); } }); parent.add(wm); houseWin = wm;
  instanced(BOX, "#6b7680", houses.length, (i, d) => { const h = houses[i]; d.position.set(h.mx, h.my + 0.55, h.mz); d.scale.set(0.15, 1.1, 0.15); }, parent);
  { const mb = inColor(instanced(BOX, "#3a7aff", houses.length, (i, d) => { const h = houses[i]; d.position.set(h.mx, h.my + 1.25, h.mz); d.scale.set(0.8, 0.45, 0.6); d.rotation.y = h.yaw; }, parent)); mb.material = lightB; }   // (owner, 2026-11-10) the blue of animal control's light, in color: you deliver to them
  instanced(TRUNK, "#7a4f28", trees.length, (i, d) => { const t = trees[i], h = pineH(t); d.position.set(t.x, t.y, t.z); d.scale.set(1 + h / 30, h * 0.35, 1 + h / 30); }, parent);
  for (const [a, hh, r] of PINE_TIERS) instanced(PINE_CONE, "#3f8f4a", trees.length, (i, d) => { const t = trees[i], h = pineH(t), w = r * h / 10.5; d.position.set(t.x, t.y + a * h, t.z); d.scale.set(w, hh * h, w); d.rotation.y = (t.x * 0.37 + t.z * 0.11 + a * 2) % 6.28; }, parent);
}
// ---- the sky (owner, 2026-11-08): a day and night cycle, rain now and then, wind, god rays, more clouds; the same for
// everyone (all timed off the clock) ----
const clouds = [], cloudM = new THREE.MeshLambertMaterial({ color: "#ffffff" });
for (let k = 0; k < 56; k++) {
  const g = new THREE.Group(), n = 3 + Math.floor(srnd() * 4);
  for (let j = 0; j < n; j++) { const s = new THREE.Mesh(new THREE.SphereGeometry(4 + srnd() * 5, 8, 6), cloudM); s.position.set(j * 5 - n * 2.5, srnd() * 3, srnd() * 6 - 3); s.scale.y = 0.7; g.add(s); }
  const band = k % 3; g.position.set(-420 + srnd() * 840, band === 0 ? -40 - srnd() * 70 : band === 1 ? 140 + srnd() * 30 : 60 + srnd() * 20, -420 + srnd() * 840);
  if (band === 2 && hyp(g.position.x, g.position.z) < 260) g.position.y = 150 + srnd() * 20;   // clear of the high islands
  scene.add(g); clouds.push(g);
}
const DAY_S = World.DAY_S, RAIN_BLOCK = 240;   // a day lasts 20 minutes; the weather is decided every 4
const hemi = scene.children.find((o) => o.isHemisphereLight);
const SKY = { day: new THREE.Color("#8fd3ff"), dusk: new THREE.Color("#f2a46a"), night: new THREE.Color("#0c1530"), rain: new THREE.Color("#7d8b99"), storm: new THREE.Color("#303846"), fog: new THREE.Color("#b8c3ca") };
const FOG = { day: new THREE.Color("#bfe6ff"), dusk: new THREE.Color("#f6c08e"), night: new THREE.Color("#101a36"), rain: new THREE.Color("#8d99a5"), storm: new THREE.Color("#59616c"), fog: new THREE.Color("#c5cdd1") };
const SNOW_COLOR = new THREE.Color("#eaf4ff"), LIGHTNING_COLOR = new THREE.Color("#e8eeff");
const skyNow = { sun: new THREE.Vector3(0, 1, 0), day: 1, rain: 0, snow: 0, storm: 0, fog: 0 };
let environment = { weather: "auto", time: "auto" };
function setEnvironment(v) {
  if (!v || !["auto", "clear", "rain", "snow", "storm", "fog"].includes(v.weather) || !["auto", "sunrise", "day", "sunset", "night"].includes(v.time)) return;
  environment = { weather: v.weather, time: v.time };
  const w = $("admin-weather"), t = $("admin-time"); if (w) w.value = environment.weather; if (t) t.value = environment.time;
}
// stars, shown at night
const stars = (() => { const n = 700, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const u = Math.random(), a = Math.random() * TAU, r = Math.sqrt(1 - u * u); p.set([Math.cos(a) * r * 600, u * 600, Math.sin(a) * r * 600], i * 3); } const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3)); const m = new THREE.Points(g, new THREE.PointsMaterial({ color: "#ffffff", size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })); m.renderOrder = -1; scene.add(m); return m; })();
// rain: streaks falling around the camera
const RAIN_N = 1400, rainPos = new Float32Array(RAIN_N * 6), rainG = new THREE.BufferGeometry(); rainG.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainG, new THREE.LineBasicMaterial({ color: "#c8dcf0", transparent: true, opacity: 0, depthWrite: false })); rain.frustumCulled = false; scene.add(rain);
const drops = Array.from({ length: RAIN_N }, () => ({ x: (Math.random() - 0.5) * 70, y: Math.random() * 40, z: (Math.random() - 0.5) * 70, v: 26 + Math.random() * 10 }));
// snow: larger, slower flakes around the player, with a white cover over the island while the preset is active
const SNOW_N = 900, snowPos = new Float32Array(SNOW_N * 3), snowG = new THREE.BufferGeometry(); snowG.setAttribute("position", new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(snowG, new THREE.PointsMaterial({ color: "#ffffff", size: 2.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false })); snow.frustumCulled = false; scene.add(snow);
const flakes = Array.from({ length: SNOW_N }, () => ({ x: (Math.random() - 0.5) * 80, y: Math.random() * 45, z: (Math.random() - 0.5) * 80, v: 3 + Math.random() * 4, sway: Math.random() * TAU }));
// wind: pale streaks blowing past
const windTex = (() => { const cv = document.createElement("canvas"); cv.width = 64; cv.height = 4; const x = cv.getContext("2d"), gr = x.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, 64, 4); return new THREE.CanvasTexture(cv); })();
const winds = Array.from({ length: 26 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 0.08),   // (owner, 2026-11-09: too long, solid and many)
 new THREE.MeshBasicMaterial({ map: windTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); scene.add(m); return { m, life: 0, max: 1, x: 0, y: 0, z: 0 }; });
// (owner, 2026-11-09) the wind, the same for everyone (timed off the clock): 3 to 40 mph, easing to a new strength every
// 3 minutes (windier in the rain) with gusts on top, its direction swinging slowly round. WIND is where it blows to.
const WIND_BLOCK = 180, WIND_MIN = 3, WIND_MAX = 40;
const WIND = new THREE.Vector3(), windNow = { mph: WIND_MIN };
const windBase = (b) => WIND_MIN + (WIND_MAX - WIND_MIN) * 0.85 * (Math.abs(Math.sin(b * 78.233 + 1.7) * 43758.5453) % 1) ** 1.5;
function windAt(t, wet = weatherAt(t), storm = 0) {
  const b = Math.floor(t / WIND_BLOCK), f = smooth(t / WIND_BLOCK - b);
  let mph = windBase(b) + (windBase(b + 1) - windBase(b)) * f + wet * 10;
  mph *= 1 + 0.18 * Math.sin(t * 0.9) * Math.sin(t * 0.37 + 2) + 0.08 * Math.sin(t * 2.3);   // gusts
  if (storm) mph = WIND_MAX;
  return { mph: clamp(mph, WIND_MIN, WIND_MAX), ang: 0.35 + 1.4 * Math.sin(t / 1300) + 0.5 * Math.sin(t / 410 + 1) };
}
function windStep(t, wet, storm) { const w = windAt(t, wet, storm); windNow.mph = w.mph; WIND.set(Math.cos(w.ang), 0, Math.sin(w.ang)); }
windStep(Date.now() / 1000);
// god rays: long soft beams slanting down from the sun
const rayTex = (() => { const cv = document.createElement("canvas"); cv.width = 32; cv.height = 128; const x = cv.getContext("2d"), gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "rgba(255,240,200,0)"); gr.addColorStop(0.35, "rgba(255,240,200,1)"); gr.addColorStop(1, "rgba(255,240,200,0)"); x.fillStyle = gr; x.fillRect(0, 0, 32, 128); const g2 = x.createLinearGradient(0, 0, 32, 0); x.globalCompositeOperation = "destination-in"; g2.addColorStop(0, "rgba(0,0,0,0)"); g2.addColorStop(0.5, "rgba(0,0,0,1)"); g2.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g2; x.fillRect(0, 0, 32, 128); return new THREE.CanvasTexture(cv); })();
const rays = Array.from({ length: 7 }, (_, i) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(10 + i * 2, 170), new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide })); m.frustumCulled = false; scene.add(m); return { m, off: new THREE.Vector3((Math.random() - 0.5) * 110, 0, (Math.random() - 0.5) * 110) }; });
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpM = new THREE.Matrix4(), tmpCol = new THREE.Color();
function weatherAt(t) {   // how hard it's raining (0..1): some 4-minute blocks rain, easing in and out
  const b = Math.floor(t / RAIN_BLOCK), f = (t / RAIN_BLOCK) - b, h = Math.abs(Math.sin(b * 12.9898) * 43758.5453) % 1;
  return h < 0.28 ? Math.min(1, f * 5, (1 - f) * 5) : 0;
}
let skyOffset = 0;   // tests only
function skyStep(dt, cx, cy, cz) {
  const t = Date.now() / 1000 + skyOffset, autoPh = (t % DAY_S) / DAY_S;
  const ph = environment.time === "auto" ? autoPh : { sunrise: 0.98, day: 0.25, sunset: 0.52, night: 0.75 }[environment.time], a = ph * TAU;
  const el = Math.sin(a) + 0.2;   // the sun's height: a little more day than night
  skyNow.sun.set(Math.cos(a), Math.max(-0.4, el), 0.35).normalize();
  let day = environment.time === "auto" ? World.daylightAt(t) : smooth(clamp((el + 0.08) / 0.35, 0, 1)), dusk = clamp(1 - Math.abs(el - 0.05) / 0.3, 0, 1) * day;
  let rainK = environment.weather === "auto" ? weatherAt(t) : environment.weather === "rain" || environment.weather === "storm" ? 1 : 0;
  let snowK = environment.weather === "snow" ? 1 : 0, stormK = environment.weather === "storm" ? 1 : 0, fogK = environment.weather === "fog" ? 1 : 0;
  if (me.inst) { day = 1; dusk = 0; rainK = snowK = stormK = fogK = 0; }   // inside a home it's always bright and dry
  skyNow.day = day; skyNow.rain = rainK; skyNow.snow = snowK; skyNow.storm = stormK; skyNow.fog = fogK; windStep(t, rainK, stormK);
  const wsp = 3 + windNow.mph * 0.4;   // how fast streaks, rain and clouds go with the wind
  tmpCol.copy(SKY.night).lerp(SKY.day, day).lerp(SKY.dusk, dusk * 0.55).lerp(SKY.rain, rainK * 0.6 * (0.4 + 0.6 * day)).lerp(SKY.storm, stormK * 0.75).lerp(SKY.fog, fogK * 0.45); scene.background.copy(tmpCol);
  tmpCol.copy(FOG.night).lerp(FOG.day, day).lerp(FOG.dusk, dusk * 0.5).lerp(FOG.rain, rainK * 0.6 * (0.4 + 0.6 * day)).lerp(FOG.storm, stormK * 0.75).lerp(FOG.fog, fogK * 0.85); scene.fog.color.copy(tmpCol);
  scene.fog.far = 560 - rainK * 300 - fogK * 320; scene.fog.near = Math.max(20, 150 - rainK * 90 - fogK * 110);
  const lp = t % 8, lightning = stormK * (lp < 0.1 ? 1 - lp * 10 : lp > 0.22 && lp < 0.3 ? 1 - (lp - 0.22) / 0.08 : 0);
  if (lightning) scene.background.lerp(LIGHTNING_COLOR, lightning * 0.65);
  sun.intensity = 1.6 * day * (1 - rainK * 0.6) + lightning * 4; sun.color.set("#fff6e0").lerp(SKY.dusk, dusk * 0.6);
  if (hemi) { hemi.intensity = 0.35 + 0.75 * day - rainK * 0.15 + lightning * 2.5; hemi.color.set("#ffffff").lerp(SKY.night, (1 - day) * 0.5); }
  cloudM.color.set("#ffffff").lerp(SKY.rain, rainK * 0.7).lerp(SKY.storm, stormK * 0.75).lerp(SKY.night, (1 - day) * 0.75).lerp(SKY.dusk, dusk * 0.35);
  stars.position.set(cx, 0, cz); stars.material.opacity = (1 - day) * (1 - Math.max(rainK, snowK, fogK));
  windowM.color.set("#6b7f99").lerp(WINDOW_ON, 1 - day);
  // rain
  rain.material.opacity = rainK * (stormK ? 0.82 : 0.55); rain.visible = rainK > 0.01;
  if (rain.visible) for (let i = 0; i < RAIN_N; i++) {
    const d = drops[i]; d.y -= d.v * dt; d.x += WIND.x * wsp * 0.45 * dt; d.z += WIND.z * wsp * 0.45 * dt; if (d.y < -8) { d.y = 30 + Math.random() * 10; d.x = (Math.random() - 0.5) * 70; d.z = (Math.random() - 0.5) * 70; }
    const x = cx + d.x, y = cy + d.y, z = cz + d.z; rainPos.set([x, y, z, x - WIND.x * 0.15, y + 1.1, z - WIND.z * 0.15], i * 6);
  }
  if (rain.visible) rainG.attributes.position.needsUpdate = true;
  // snow
  snow.material.opacity = snowK * 0.9; snow.visible = snowK > 0.01;
  if (snow.visible) for (let i = 0; i < SNOW_N; i++) {
    const f = flakes[i]; f.y -= f.v * dt; f.x += (WIND.x * wsp * 0.28 + Math.sin(t * 1.7 + f.sway) * 0.6) * dt; f.z += (WIND.z * wsp * 0.28 + Math.cos(t * 1.3 + f.sway) * 0.6) * dt;
    if (f.y < -8) { f.y = 35 + Math.random() * 10; f.x = (Math.random() - 0.5) * 80; f.z = (Math.random() - 0.5) * 80; }
    snowPos.set([cx + f.x, cy + f.y, cz + f.z], i * 3);
  }
  if (snow.visible) snowG.attributes.position.needsUpdate = true;
  snowCover.visible = snowK > 0.01; snowCover.material.opacity = snowK * 0.72;
  // wind streaks, more of them the windier it is, up high and in the rain
  const windK = me.inst ? 0 : 0.3 + windNow.mph / WIND_MAX * 0.65 + rainK * 0.3 + clamp((me.y - terrain(me.x, me.z)) / 40, 0, 0.5);
  for (const w of winds) {
    w.life -= dt;
    if (w.life <= 0) { if (Math.random() > windK) { w.m.material.opacity = 0; w.life = 0.3 + Math.random(); continue; } w.max = w.life = 2 + Math.random() * 2; const a = Math.random() * TAU, r = 20 + Math.random() * 30; w.x = cx + Math.cos(a) * r - WIND.x * 10; w.y = cy - 6 + Math.random() * 16; w.z = cz + Math.sin(a) * r - WIND.z * 10; }   // (owner, 2026-11-08) out of the way, never right at the camera
    w.x += WIND.x * wsp * dt; w.z += WIND.z * wsp * dt; w.m.position.set(w.x, w.y + Math.sin(w.life * 3) * 0.3, w.z);
    tmpV.copy(camera.position).sub(w.m.position); tmpV.addScaledVector(WIND, -tmpV.dot(WIND)).normalize(); tmpV2.crossVectors(tmpV, WIND);   // long side along the wind, flat face to the camera
    tmpM.makeBasis(WIND, tmpV2, tmpV); w.m.quaternion.setFromRotationMatrix(tmpM);
    w.m.material.opacity = Math.sin((w.life / w.max) * Math.PI) * 0.16 * (0.75 + 0.25 * day) * clamp((hyp(w.x - cx, w.z - cz) - 12) / 8, 0, 1);
  }
  // god rays: brightest with the sun low, gone at night and in the rain
  const rk = me.inst ? 0 : day * (1 - rainK) * (0.35 + dusk * 0.9) * 0.22;
  for (const r of rays) {
    r.m.visible = rk > 0.005; if (!r.m.visible) continue;
    tmpV.set(cx + r.off.x, 0, cz + r.off.z); tmpV.addScaledVector(skyNow.sun, 60); tmpV.y = Math.max(tmpV.y, cy + 40); r.m.position.copy(tmpV);
    const axis = skyNow.sun, view = tmpV2.copy(camera.position).sub(r.m.position).normalize(), xAxis = new THREE.Vector3().crossVectors(axis, view).normalize(), zAxis = new THREE.Vector3().crossVectors(xAxis, axis);
    tmpM.makeBasis(xAxis, axis, zAxis); r.m.quaternion.setFromRotationMatrix(tmpM);
    r.m.material.opacity = rk * (0.6 + 0.4 * Math.sin(t * 0.3 + r.off.x));
  }
}
// the town square's buildings (owner, 2026-11-09: round the square), each drawn facing +z and turned to face the middle
const bldg = (b) => { const g = new THREE.Group(); g.position.set(b.x, 0, b.z); g.rotation.y = b.yaw; scene.add(g); return g; };
const toWorld = (b, lx, lz) => ({ x: b.x + lx * Math.cos(b.yaw) + lz * Math.sin(b.yaw), z: b.z - lx * Math.sin(b.yaw) + lz * Math.cos(b.yaw) });
// the post office, its pickup ring and the contract board
{ const g = bldg(POST); box(18, 7, 10, "#d9e4ee", 0, 3.5, 0, g); box(19, 0.8, 11, "#3a8ee6", 0, 7.4, 0, g); box(4, 3.6, 0.2, "#3a6ea8", 0, 1.8, 5.05, g);
  box(8, 1.6, 0.3, "#f2b01e", 0, 5.4, 5.1, g); box(1.6, 1.1, 0.35, "#e5534b", 0, 5.4, 5.2, g); }
const RINGG = (r) => new THREE.RingGeometry(r - 0.18, r, 64).rotateX(-Math.PI / 2);   // (owner, 2026-11-09) thin, crisp outlines
const ringM = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 });
const pickRing = new THREE.Mesh(RINGG(PICKUP.r), ringM("#f2b01e")); pickRing.position.set(PICKUP.x, 0.16, PICKUP.z); scene.add(inColor(pickRing));
box(2.6, 2, 0.25, "#8a5a3a", BOARD.x, 2.2, BOARD.z - 1.5); box(0.2, 1.4, 0.2, "#7a4f28", BOARD.x - 1, 0.7, BOARD.z - 1.5); box(0.2, 1.4, 0.2, "#7a4f28", BOARD.x + 1, 0.7, BOARD.z - 1.5); box(2.2, 1.5, 0.05, "#fbf3dc", BOARD.x, 2.25, BOARD.z - 1.35);
const boardRing = new THREE.Mesh(RINGG(BOARD.r), ringM("#e5534b")); boardRing.position.set(BOARD.x, 0.16, BOARD.z); scene.add(inColor(boardRing));
// the egg shop, with a giant egg on top
{ const g = bldg(SHOP_B); box(12, 5, 8, "#f7cfd8", 0, 2.5, 0, g); box(13, 0.6, 9, "#e5739d", 0, 5.3, 0, g); box(3, 3, 0.2, "#7a4f28", 0, 1.5, 4.05, g); }
const bigEgg = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 12), mat("#fff3d6")); bigEgg.scale.set(1, 1.3, 1); bigEgg.position.set(SHOP_B.x, 8.3, SHOP_B.z); bigEgg.castShadow = true; scene.add(bigEgg);
const shopRing = new THREE.Mesh(RINGG(SHOP.r), ringM("#e5739d")); shopRing.position.set(SHOP.x, 0.16, SHOP.z); scene.add(inColor(shopRing));
// the training yard: a track with hurdles
const track = new THREE.Mesh(new THREE.RingGeometry(9, 14, 48).rotateX(-Math.PI / 2), mat("#d98b5f")); track.position.set(TRAIN.x, 0.12, TRAIN.z); track.receiveShadow = true; scene.add(track);
for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU, x = TRAIN.x + Math.cos(a) * 11.5, z = TRAIN.z + Math.sin(a) * 11.5, g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -a; box(0.15, 1, 0.15, "#ffffff", 0, 0.5, -1.8, g); box(0.15, 1, 0.15, "#ffffff", 0, 0.5, 1.8, g); box(0.2, 0.25, 3.8, "#e5534b", 0, 1, 0, g); scene.add(g); }
const trainRing = new THREE.Mesh(RINGG(TRAIN.r - 1), ringM("#3fb36b")); trainRing.position.set(TRAIN.x, 0.16, TRAIN.z); scene.add(inColor(trainRing));
// the pound (animal control): a building with a striped front and a fenced yard in front where the caught are let out
{ const g = bldg(POUND);
  box(16, 6, 8, "#dfe6ec", 0, 3, -3, g); box(16.4, 0.7, 8.4, "#e08a00", 0, 4.6, -3, g); box(17, 0.6, 9, "#3d4650", 0, 6.3, -3, g);
  box(4, 3.4, 0.2, "#3d4650", 0, 1.7, 1.05, g);
  for (let k = 0; k < 9; k++) box(0.12, 2.6, 0.12, "#3d4650", -7 + k * 0.5 + (k > 4 ? 9.5 : 0) - (k > 4 ? 2.5 : 0), 1.6, 1.1, g);
  for (let k = -4; k <= 4; k++) { box(0.15, 1.3, 0.15, "#9aa7b2", k * 2, 0.65, 9, g); }
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) box(0.15, 1.3, 0.15, "#9aa7b2", sx * 8, 0.65, 9 - k * 2.4, g);
  box(16, 0.12, 0.12, "#9aa7b2", 0, 1.2, 9, g); }

// ---- the courier (owner, 2026-11-09): a blocky R6-style figure, matched to the owner's reference. 1 stud = 0.4 m:
// torso 2 x 2 x 1 studs, arms and legs 1 x 2 x 1 with softened edges, a rounded 1.25-stud head with two oval eyes and
// a smile; head and arms skin, torso the shirt, legs dark. It faces +z, feet at y 0; arms and legs swing from the
// shoulders and hips ----
const SKIN = "#f1c9a5", PANTS = "#3d4650", RBOX = new Map();
function roundBox(w, h, d, r, seg) {   // a box with rounded edges; the front (+z) face's UVs are flat, for the face
  const key = [w, h, d, r, seg].join(); if (RBOX.has(key)) return RBOX.get(key);
  const S = seg * 2 + 2, g = new THREE.BoxGeometry(w, h, d, S, S, S), p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, half = [w / 2, h / 2, d / 2], c = [0, 0, 0], v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const front = n.getZ(i) > 0.5;
    for (let a = 0; a < 3; a++) {   // bunch the grid toward the edges: seg steps across each rounded edge, the rest flat
      const hf = half[a], k = Math.round(((p.getComponent(i, a) / hf + 1) / 2) * S);
      c[a] = k <= seg ? -hf + (k / seg) * r : k >= S - seg ? hf - ((S - k) / seg) * r : -(hf - r) + ((k - seg) / (S - 2 * seg)) * 2 * (hf - r);
    }
    const ix = clamp(c[0], r - half[0], half[0] - r), iy = clamp(c[1], r - half[1], half[1] - r), iz = clamp(c[2], r - half[2], half[2] - r);
    v.set(c[0] - ix, c[1] - iy, c[2] - iz).normalize(); n.setXYZ(i, v.x, v.y, v.z); v.multiplyScalar(r);
    p.setXYZ(i, ix + v.x, iy + v.y, iz + v.z);
    if (front) uv.setXY(i, (ix + v.x) / w + 0.5, (iy + v.y) / h + 0.5);
  }
  RBOX.set(key, g); return g;
}
const FACES = new Map();
function faceMat(skin, blush) {   // the head's front: skin with two tall oval eyes and a smile (townsfolk: their own skin, maybe rosy cheeks)
  const key = skin + (blush ? "b" : ""); if (FACES.has(key)) return FACES.get(key);
  const cv = document.createElement("canvas"); cv.width = cv.height = 256; const x = cv.getContext("2d");
  x.fillStyle = skin; x.fillRect(0, 0, 256, 256);
  if (blush) { x.fillStyle = "rgba(240,110,120,.45)"; for (const bx of [70, 186]) { x.beginPath(); x.ellipse(bx, 140, 20, 12, 0, 0, TAU); x.fill(); } }
  x.fillStyle = x.strokeStyle = "#16181a";
  for (const ex of [103, 153]) { x.beginPath(); x.ellipse(ex, 88, 8.5, 18, 0, 0, TAU); x.fill(); }
  x.lineWidth = 10; x.lineCap = "round"; x.beginPath(); x.moveTo(86, 172); x.quadraticCurveTo(128, 254, 170, 172); x.stroke();
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.MeshLambertMaterial({ map: t }); FACES.set(key, m); return m;
}
const FACE_M = faceMat(SKIN);
// look (townsfolk only): { skin, pants, sleeve (the arms' colour: long sleeves), blush }
// (owner, 2026-11-09) people and pets stay bright at night: their materials are their own copies that glow with their
// own colour as it gets dark (nightGlow), and a soft dark spot lies on the ground under each (blobs)
const CHAR_MATS = new Map();   // (owner, 2026-11-09: light parts too bright) the night glow lifts colors to about half, not past them
function charMat(m) { if (!CHAR_MATS.has(m)) { const c = m.clone(); c.emissive = m.color ? m.color.clone().multiplyScalar(0.32) : new THREE.Color("#525252"); c.emissiveMap = m.map || null; c.emissiveIntensity = nightGlow; CHAR_MATS.set(m, c); } return CHAR_MATS.get(m); }
let nightGlow = 0;
function brighten(g) { g.traverse((o) => { if (o.isMesh && o.material && o.material.isMeshLambertMaterial && !CHAR_MATS.has(o.material) && ![...CHAR_MATS.values()].includes(o.material)) o.material = charMat(o.material); }); return g; }
const BLOB_TEX = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(0,0,0,0.42)"); r.addColorStop(0.6, "rgba(0,0,0,0.22)"); r.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const BLOB_G = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), blobs = [];
function blobUnder(g, size) { const b = new THREE.Mesh(BLOB_G, new THREE.MeshBasicMaterial({ map: BLOB_TEX, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); b.renderOrder = 1; scene.add(b); blobs.push({ g, b, size }); return b; }
function blobStep() {
  for (let i = blobs.length - 1; i >= 0; i--) {
    const q = blobs[i]; if (!q.g.parent) { scene.remove(q.b); blobs.splice(i, 1); continue; }
    let vis = q.g.visible; for (let p = q.g.parent; p && vis; p = p.parent) vis = p.visible;
    q.b.visible = vis; if (!vis) continue;
    const x = q.g.position.x, z = q.g.position.z, y = q.g.position.y, f = floorAt(x, z, y + 0.3), h = y - f, k = clamp(1 - h / 12, 0, 1);
    q.b.position.set(x, f + 0.05, z); const s = q.size * (q.g.scale.x || 1) * (0.6 + 0.4 * k); q.b.scale.set(s, 1, s); q.b.material.opacity = k;
  }
}
function courierModel(shirt, seated, look) {
  const g = new THREE.Group(), legs = [], arms = [];
  const part = (w, h, d, m, x, y, z, parent, r = 0.025, seg = 2) => { const o = new THREE.Mesh(roundBox(w, h, d, r, seg), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  for (const x of [-0.2, 0.2]) {   // legs hang from the hips (y 0.8)
    const l = new THREE.Group(); l.position.set(x, 0.8, 0); g.add(l); legs.push(l); part(0.4, 0.8, 0.4, mat((look && look.pants) || PANTS), 0, -0.4, 0, l);
    if (seated) l.rotation.set(-1.05, 0, Math.sign(x) * 0.5);   // astride the pet: forward, down and out
  }
  part(0.8, 0.8, 0.4, mat(shirt), 0, 1.2, 0, g);
  for (const x of [-0.6, 0.6]) {   // arms swing from the shoulders, a quarter of the way down
    const a = new THREE.Group(); a.position.set(x, 1.4, 0); g.add(a); arms.push(a); part(0.4, 0.8, 0.4, mat((look && (look.sleeve || look.skin)) || SKIN), 0, -0.2, 0, a);
    if (seated) a.rotation.x = -0.55;   // reaching forward to hold on
  }
  const skin = (look && look.skin) || SKIN, sk = mat(skin), head = part(0.5, 0.48, 0.5, [sk, sk, sk, sk, look ? faceMat(skin, look.blush) : FACE_M, sk], 0, 1.84, 0, g, 0.12, 4);
  return { g, legs, arms, head };
}

// ---- a pet (built from simple shapes; it faces +z) with its rider ----
// (owner, 2026-11-08: they all looked alike) each kind has its own build: body shape and size, legs, neck, head and
// snout, ears, tail and its own extras, so each reads at a glance
const SPHERE = new THREE.SphereGeometry(1, 14, 10), CONE = new THREE.ConeGeometry(1, 1, 10), CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
function ball(r, c, x, y, z, parent, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(SPHERE, mat(c)); m.scale.set(r * sx, r * sy, r * sz); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
function cone(r, h, c, x, y, z, parent, rx = 0, rz = 0) { const m = new THREE.Mesh(CONE, mat(c)); m.scale.set(r, h, r); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; parent.add(m); return m; }
// a box from point a to point b (y, z in the body's side view), w wide and t thick
function strut(w, t, c, y0, z0, y1, z1, parent, x = 0) { const len = hyp(y1 - y0, z1 - z0), m = box(w, t, len, c, x, (y0 + y1) / 2, (z0 + z1) / 2, parent); m.rotation.x = -Math.atan2(y1 - y0, z1 - z0); return m; }
// each kind: plan (quad, upright, bird, biped, butterfly), body size [width, height, length], round body, leg length,
// neck length, head size, snout length, ears, tail and extras
const LOOK = {
  pup: { plan: "quad", body: [0.8, 0.62, 1.25], leg: 0.55, head: 0.62, snout: 0.32, ears: "flop", tail: "wag", nose: "#2b1d14" },
  dragon: { plan: "quad", body: [0.95, 0.8, 1.6], leg: 0.7, neck: 0.85, head: 0.55, snout: 0.5, ears: "none", horns: "back", tail: "spade", wings: "bat", spikes: true },
  parrot: { plan: "upright", body: [0.6, 0.95, 0.6], leg: 0.32, head: 0.45, bill: "hook", wings: "feather", tail: "long", crest: true },
  owl: { plan: "upright", round: true, body: [1.0, 1.1, 0.9], leg: 0.22, head: 0.0, bill: "small", eyes: "big", ears: "tufts", wings: "feather" },
  raptor: { plan: "biped", body: [0.7, 0.75, 1.5], leg: 0.95, head: 0.6, snout: 0.45, tail: "long", claws: true, stripes: true },
  trex: { plan: "biped", body: [1.1, 1.05, 1.9], leg: 1.05, legW: 0.5, head: 1.15, snout: 0.6, tail: "long", tiny: true },
};
const RAINBOW = ["#ff6b6b", "#ffb84d", "#ffe66b", "#7ee08a", "#6bb8ff", "#b48cff"];
// (owner, 2026-11-09) a pet grows with its level but its rider stays the same size, so a big pet feels big
function sizePet(m, sc) { m.g.scale.setScalar(sc); if (m.rider) { m.rider.scale.setScalar(0.8 / sc); m.rider.position.y = m.seat - 0.52 / sc; m.top = m.seat * sc + 1.4; } else m.top *= sc; }
function petModel(sp, rider) {
  let riderG = null;
  const s = SPECIES[sp], L = LOOK[sp] || LOOK.pup, k = s.size, g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const legs = [], wings = [], tails = [], head = new THREE.Group();
  const C = s.c, A = s.a;
  let seat = 1, seatZ = -0.1 * k;
  const eyes = (hs, z, big) => { for (const ex of [-1, 1]) { if (big) { ball(hs * 0.2, "#ffffff", ex * hs * 0.24, hs * 0.08, z, head); ball(hs * 0.11, "#1d232a", ex * hs * 0.24, hs * 0.08, z + hs * 0.12, head); } else ball(hs * 0.09, "#1d232a", ex * hs * 0.26, hs * 0.12, z, head); } };
  const tail = (type, y, z) => {
    const t = new THREE.Group(); t.position.set(0, y, z); body.add(t); tails.push(t);
    if (type === "wag") { const m = box(0.14 * k, 0.14 * k, 0.5 * k, C, 0, 0.12 * k, -0.2 * k, t); m.rotation.x = 0.6; }
    else if (type === "curl") { strut(0.1 * k, 0.1 * k, C, 0, 0, 0.35 * k, -0.35 * k, t); strut(0.1 * k, 0.1 * k, C, 0.35 * k, -0.35 * k, 0.75 * k, -0.3 * k, t); }
    else if (type === "puff") ball(0.22 * k, "#ffffff", 0, 0, -0.05 * k, t);
    else if (type === "bushy") { ball(0.26 * k, C, 0, 0.05 * k, -0.45 * k, t, 1, 1, 2); ball(0.18 * k, A, 0, 0.08 * k, -0.95 * k, t, 1, 1, 1.4); }
    else if (type === "stub") ball(0.12 * k, A, 0, 0, -0.05 * k, t);
    else if (type === "hair" || type === "rainbow") { for (let i = 0; i < (type === "rainbow" ? 4 : 3); i++) { const m = box(0.12 * k, 0.9 * k, 0.12 * k, type === "rainbow" ? RAINBOW[i] : A, (i - 1) * 0.07 * k, -0.4 * k, -0.15 * k, t); m.rotation.x = 0.35; } }
    else if (type === "spike" || type === "thick" || type === "spade" || type === "long") {
      const t2 = new THREE.Group(); t2.position.set(0, -0.05 * k, -0.85 * k); t.add(t2); tails.push(t2);
      box(0.45 * k, 0.4 * k, 0.95 * k, C, 0, 0, -0.4 * k, t); box(0.28 * k, 0.26 * k, 0.95 * k, C, 0, 0, -0.4 * k, t2);
      if (type === "spike") for (const x of [-1, 1]) for (const zz of [-0.6, -0.85]) cone(0.06 * k, 0.45 * k, "#f4f1e6", x * 0.2 * k, 0.12 * k, zz * k, t2, 0, -x * 1.1);
      if (type === "spade") { const m = box(0.5 * k, 0.06, 0.4 * k, A, 0, 0, -0.95 * k, t2); m.rotation.y = Math.PI / 4; }
    }
    else if (type === "tuft") { const m = box(0.3 * k, 0.12 * k, 0.3 * k, C, 0, 0.12 * k, -0.1 * k, t); m.rotation.x = 0.5; }
    else if (type === "fire") for (const [x, c, l] of [[-0.18, "#ffd84a", 1.4], [0, "#e5534b", 1.8], [0.18, "#ffd84a", 1.4]]) { const f = box(0.14 * k, 0.05, l * k, c, x * k, 0, -l * 0.5 * k, t); f.rotation.x = -0.15; }
    else if (type === "long" && false) { /* biped handled above */ }
    return t;
  };
  if (L.plan === "quad") {
    const [bw0, bh0, bl0] = L.body, bw = bw0 * k, bh = bh0 * k, bl = bl0 * k, legH = L.leg * k, lw = (L.legW || 0.24) * k;
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const l = new THREE.Group(); l.position.set(lx * bw * 0.32, legH + (L.round ? bh * 0.2 : 0), lz * bl * 0.33); body.add(l); legs.push(l);
      const lh = legH + (L.round ? bh * 0.2 : 0); box(lw, lh, lw, L.socks || C, 0, -lh / 2, 0, l);
      if (L.hooves) box(lw * 1.1, 0.12 * k, lw * 1.1, L.hooves, 0, -lh + 0.06 * k, 0, l);
    }
    const by = legH + bh / 2;
    if (L.round) { ball(1, C, 0, by, 0, body, bw / 2, bh / 2, bl / 2); ball(1, A, 0, by - bh * 0.18, bl * 0.08, body, bw * 0.38, bh * 0.32, bl * 0.4); }
    else { box(bw, bh, bl, C, 0, by, 0, body); box(bw * 0.72, bh * 0.3, bl * 0.62, A, 0, legH + 0.05 * k, 0, body); }
    if (L.spots) for (const [x, y, z] of [[1, 0.25, 0.1], [1, 0.1, -0.25], [-1, 0.2, -0.05], [-1, 0.05, 0.3], [1, -0.05, 0.35]]) ball(0.07 * k, "#fff4e0", x * bw / 2, by + y * bh, z * bl, body);
    if (L.shell) { ball(1, A, 0, by + bh * 0.12, 0, body, bw * 0.56, bh * 0.62, bl * 0.56); for (const [x, z] of [[0, 0], [0.5, 0.45], [-0.5, 0.45], [0.5, -0.45], [-0.5, -0.45], [0, 0.85], [0, -0.85]]) ball(bw * 0.12, "#6b4f2a", x * bw * 0.28, by + bh * (0.62 - 0.12 * hyp(x, z)), z * bl * 0.25, body, 1, 0.35, 1); }   // (owner, 2026-11-09) a turtle's shell
    if (L.plates) for (let n = 0; n < 6; n++) { const p = box(0.08 * k, (0.45 + 0.2 * Math.sin((n / 5) * Math.PI)) * k, 0.4 * k, A, 0, by + bh / 2 + 0.15 * k, (n - 2.5) * bl * 0.17, body); p.rotation.y = Math.PI / 4; }
    if (L.spikes) for (let n = 0; n < 5; n++) cone(0.09 * k, 0.32 * k, L.spikes === "ice" ? "#e8f8ff" : A, 0, by + bh / 2 + 0.12 * k, (n - 2) * bl * 0.2, body);
    // neck and head
    const hs = L.head * k, front = bl / 2;
    let hy = by + bh * (L.low ? 0.0 : 0.35), hz = front + hs * 0.35;
    if (L.neck) { const ny = by + bh * 0.3, nz = front * 0.75; hy = ny + L.neck * k * 0.85; hz = nz + L.neck * k * 0.5; strut(hs * 0.7, hs * 0.75, C, ny, nz, hy, hz, body); }
    head.position.set(0, hy, hz); body.add(head);
    if (L.roundHead) ball(hs / 2, C, 0, 0, 0, head, 1.05, 0.95, 1); else box(hs, hs * 0.9, hs, C, 0, 0, 0, head);
    if (L.snout) box(hs * (L.snout > 0.45 ? 0.55 : 0.6), hs * 0.42, L.snout * k, L.snoutC === "a" ? A : C, 0, -hs * 0.18, hs / 2 + L.snout * k / 2 - 0.02, head);
    if (L.nose) ball(hs * 0.09, L.nose, 0, -hs * 0.05, hs / 2 + (L.snout || 0) * k, head);
    eyes(hs, hs * 0.48);
    const ear = (x, y, z, w, h, d, c) => box(w, h, d, c || C, x, y, z, head);
    if (L.ears === "flop") { ear(-hs * 0.55, -hs * 0.1, -hs * 0.05, 0.12 * k, hs * 0.75, hs * 0.38, A); ear(hs * 0.55, -hs * 0.1, -hs * 0.05, 0.12 * k, hs * 0.75, hs * 0.38, A); }
    else if (L.ears === "cat") for (const x of [-1, 1]) cone(0.12 * k, 0.3 * k, C, x * hs * 0.28, hs * 0.5, 0, head, 0, x * -0.2);
    else if (L.ears === "big") for (const x of [-1, 1]) { cone(0.16 * k, 0.42 * k, C, x * hs * 0.3, hs * 0.6, 0, head, 0, x * -0.15); cone(0.09 * k, 0.28 * k, "#1d232a", x * hs * 0.3, hs * 0.66, 0.04 * k, head, 0, x * -0.15); }
    else if (L.ears === "long") for (const x of [-1, 1]) { ear(x * hs * 0.2, hs * 0.85, -hs * 0.05, 0.16 * k, 0.85 * k, 0.1 * k); ear(x * hs * 0.2, hs * 0.85, -hs * 0.0, 0.09 * k, 0.65 * k, 0.11 * k, A); }
    else if (L.ears === "side") for (const x of [-1, 1]) { const e = ear(x * hs * 0.6, hs * 0.25, -hs * 0.1, 0.32 * k, 0.12 * k, 0.16 * k); e.rotation.z = x * 0.3; }
    else if (L.ears === "round") for (const x of [-1, 1]) ball(0.15 * k, C, x * hs * 0.36, hs * 0.42, -hs * 0.05, head);
    else if (L.ears === "point") for (const x of [-1, 1]) cone(0.08 * k, 0.26 * k, C, x * hs * 0.24, hs * 0.55, -hs * 0.15, head);
    if (L.whiskers) for (const x of [-1, 1]) for (const y of [-0.12, -0.22]) box(0.4 * k, 0.015, 0.015, "#ffffff", x * hs * 0.4, y * hs, hs * 0.48, head);
    if (L.horn) { const h = cone(0.08 * k, 0.7 * k, "#ffe9a8", 0, hs * 0.6, hs * 0.2, head, 0.45); h.position.y = hs * 0.75; }
    if (L.horns === "curl") for (const x of [-1, 1]) { strut(0.1 * k, 0.1 * k, A, hs * 0.45, -hs * 0.1, hs * 0.8, -hs * 0.45, head, x * hs * 0.25); strut(0.1 * k, 0.1 * k, A, hs * 0.8, -hs * 0.45, hs * 0.55, -hs * 0.75, head, x * hs * 0.3); }
    if (L.horns === "back") for (const x of [-1, 1]) cone(0.07 * k, 0.5 * k, L.spikes === "ice" ? "#e8f8ff" : A, x * hs * 0.28, hs * 0.55, -hs * 0.35, head, -1.0);
    if (L.antlers) for (const x of [-1, 1]) { strut(0.07 * k, 0.07 * k, "#c9a27e", hs * 0.4, 0, hs * 1.3, -hs * 0.2, head, x * hs * 0.35); strut(0.06 * k, 0.06 * k, "#c9a27e", hs * 1.0, -hs * 0.12, hs * 1.3, hs * 0.25, head, x * hs * 0.45); strut(0.06 * k, 0.06 * k, "#c9a27e", hs * 1.2, -hs * 0.18, hs * 1.55, -hs * 0.05, head, x * hs * 0.5); }
    if (L.beard) box(0.14 * k, 0.32 * k, 0.12 * k, "#ffffff", 0, -hs * 0.6, hs * 0.5, head);
    if (L.crest) for (let n = 0; n < 3; n++) cone(0.06 * k, 0.3 * k, "#e8f8ff", 0, hs * 0.5, -hs * 0.2 - n * 0.15 * k, head, -0.6);
    if (L.frill) { const f = box(hs * 1.9, hs * 1.4, 0.12 * k, A, 0, hs * 0.5, -hs * 0.55, head); f.rotation.x = -0.3; for (const [x, y] of [[-0.28, 0.55], [0.28, 0.55], [0, -0.05]]) cone(0.09 * k, 0.6 * k, "#f4f1e6", x * hs, y * hs, hs * 0.55, head, 1.2); }
    if (L.mane) { const nl = L.neck ? L.neck * k : 0.5 * k; for (let n = 0; n < 5; n++) { const c = L.mane === "rainbow" ? RAINBOW[n] : A; const t = n / 4; box(0.12 * k, 0.25 * k, 0.25 * k, c, 0, by + bh * 0.45 + (hy - by - bh * 0.45) * t + 0.15 * k, front * 0.7 + (hz - front * 0.7) * t - 0.15 * k, body); } box(0.14 * k, 0.15 * k, 0.25 * k, L.mane === "rainbow" ? RAINBOW[5] : A, 0, hs * 0.5, hs * 0.1, head); void nl; }
    if (L.tail !== "none") tail(L.tail, by + bh * 0.2, -bl / 2);
    if (L.wings) for (const x of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(x * bw / 2, by + bh * 0.4, bl * 0.1); body.add(w); wings.push(w);
      if (L.wings === "bat") { for (let n = 0; n < 3; n++) strut(0.08 * k, 0.08 * k, A, 0, 0, 0.1 * k, -n * 0.45 * k, w, x * (0.5 + n * 0.55) * k); box(1.9 * k, 0.05, 1.1 * k, A, x * 0.95 * k, 0, -0.4 * k, w); box(1.2 * k, 0.06, 0.6 * k, C, x * 0.6 * k, 0.01, -0.1 * k, w); }
      else { box(1.5 * k, 0.08, 0.7 * k, "#ffffff", x * 0.75 * k, 0, 0, w); box(1.1 * k, 0.09, 0.45 * k, A, x * 0.95 * k, 0.01, -0.3 * k, w); }
    }
    seat = legH + bh + (L.round ? 0 : 0) ; seatZ = L.neck ? -0.15 * k : -0.1 * k;
  } else if (L.plan === "upright" || L.plan === "bird") {
    const [bw0, bh0, bl0] = L.body, bw = bw0 * k, bh = bh0 * k, bl = bl0 * k, legH = L.leg * k, up = L.plan === "upright";
    for (const x of [-1, 1]) { const l = new THREE.Group(); l.position.set(x * bw * 0.25, legH, 0); body.add(l); legs.push(l); box(0.08 * k, legH, 0.08 * k, "#f08a24", 0, -legH / 2, 0, l); box(0.22 * k, 0.06 * k, 0.32 * k, "#f08a24", 0, -legH + 0.03, 0.08 * k, l); }
    const by = legH + bh / 2;
    if (L.round || up) ball(1, C, 0, by, 0, body, bw / 2, bh / 2, bl / 2); else box(bw, bh, bl, C, 0, by, 0, body);
    if (L.belly === "front") ball(1, A, 0, by - bh * 0.05, bl * 0.18, body, bw * 0.38, bh * 0.4, bl * 0.35);
    else ball(1, A, 0, by - bh * 0.15, up ? bl * 0.15 : 0, body, bw * 0.35, bh * 0.3, bl * 0.38);
    const hs = (L.head || 0.5) * k;
    let hy, hz;
    if (up) { hy = legH + bh * (L.head ? 1.0 : 0.72); hz = L.head ? bl * 0.08 : bl * 0.15; }
    else if (L.neck) { const ny = by + bh * 0.25, nz = bl * 0.4; hy = ny + L.neck * k * 0.85; hz = nz + L.neck * k * 0.45; strut(hs * 0.45, hs * 0.5, C, ny, nz, hy, hz, body); }
    else { hy = by + bh * 0.45; hz = bl * 0.45; }
    head.position.set(0, hy, hz); body.add(head);
    if (L.head) ball(hs / 2, C, 0, 0, 0, head);
    const face = L.head ? hs / 2 : bl / 2;
    if (L.eyes === "big") { for (const x of [-1, 1]) { ball(0.17 * k, "#ffffff", x * 0.2 * k, 0.05 * k, face * 0.85, head); ball(0.09 * k, "#ffb020", x * 0.2 * k, 0.05 * k, face * 0.85 + 0.1 * k, head); ball(0.05 * k, "#1d232a", x * 0.2 * k, 0.05 * k, face * 0.85 + 0.15 * k, head); } }
    else eyes(hs, face * 0.8);
    if (L.bill === "flat") box(hs * 0.55, hs * 0.14, hs * 0.55, "#f2a33a", 0, -hs * 0.1, face + hs * 0.2, head);
    else if (L.bill === "hook") { cone(hs * 0.16, hs * 0.4, "#f4e6c0", 0, -hs * 0.02, face + hs * 0.12, head, 1.9); }
    else if (L.bill === "long") { cone(hs * 0.13, 1.1 * k, "#e8c9a0", 0, -hs * 0.05, face + 0.5 * k, head, Math.PI / 2); }
    else if (L.bill === "point") cone(hs * 0.12, hs * 0.5, "#ffd84a", 0, -hs * 0.05, face + hs * 0.2, head, Math.PI / 2);
    else cone(0.07 * k, 0.2 * k, "#f2a33a", 0, -0.05 * k, face + 0.06 * k, head, Math.PI / 2);
    if (L.ears === "tufts") for (const x of [-1, 1]) cone(0.08 * k, 0.3 * k, A, x * 0.28 * k, (L.head ? hs * 0.5 : 0.35 * k), 0, head, 0, x * -0.3);
    if (L.crest === "back") { const c = box(0.08 * k, 0.5 * k, 0.9 * k, A, 0, hs * 0.3, -0.45 * k, head); c.rotation.x = 0.35; }
    else if (L.crest) for (let n = 0; n < 3; n++) { const c = box(0.06 * k, 0.4 * k, 0.12 * k, n === 1 ? A : C, 0, hs * 0.5 + 0.15 * k, -n * 0.1 * k, head); c.rotation.x = -0.4 - n * 0.2; }
    if (L.wings) for (const x of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(x * bw * 0.45, by + bh * (up ? 0.15 : 0.3), 0); body.add(w); wings.push(w);
      if (L.wings === "flipper") { const f = box(0.12 * k, bh * 0.6, 0.3 * k, C, x * 0.06 * k, -bh * 0.25, 0, w); f.rotation.z = x * 0.2; }
      else if (L.wings === "bat") { box(2.0 * k, 0.05, 0.9 * k, A, x * 1.0 * k, 0, -0.2 * k, w); for (let n = 0; n < 3; n++) strut(0.07 * k, 0.07 * k, C, 0, 0, 0.05 * k, -n * 0.4 * k, w, x * (0.6 + n * 0.6) * k); }
      else if (up) { const f = box(0.14 * k, bh * 0.7, bl * 0.75, A, x * 0.05 * k, -bh * 0.05, -bl * 0.05, w); f.rotation.x = -0.2; if (sp === "parrot") box(0.15 * k, bh * 0.3, bl * 0.5, "#3a8ee6", x * 0.06 * k, -bh * 0.35, -bl * 0.1, w); }
      else { box(1.4 * k, 0.07, 0.65 * k, A, x * 0.7 * k, 0, 0, w); box(0.9 * k, 0.08, 0.4 * k, "#e5534b", x * 1.0 * k, 0.01, -0.25 * k, w); }
    }
    if (L.tail === "long") { const t = new THREE.Group(); t.position.set(0, by - bh * 0.3, -bl * 0.35); body.add(t); tails.push(t); for (const [x, c] of [[-0.06, "#e5534b"], [0.06, "#3a8ee6"]]) { const f = box(0.1 * k, 0.05, 1.0 * k, c, x * k, -0.25 * k, -0.4 * k, t); f.rotation.x = 0.55; } }
    else if (L.tail && L.tail !== "none") tail(L.tail, by + bh * 0.1, -bl / 2);
    seat = up ? legH + bh * 0.95 : legH + bh; seatZ = up ? -bl * 0.35 : -0.1 * k;
  } else if (L.plan === "biped") {
    const [bw0, bh0, bl0] = L.body, bw = bw0 * k, bh = bh0 * k, bl = bl0 * k, legH = L.leg * k, lw = (L.legW || 0.32) * k;
    for (const x of [-1, 1]) { const l = new THREE.Group(); l.position.set(x * bw * 0.32, legH, -bl * 0.1); body.add(l); legs.push(l); box(lw, legH * 0.6, lw * 1.2, C, 0, -legH * 0.3, 0.05 * k, l); box(lw * 0.7, legH * 0.5, lw * 0.7, C, 0, -legH * 0.72, -0.08 * k, l); box(lw * 1.1, 0.1 * k, lw * 1.6, A, 0, -legH + 0.05, 0.12 * k, l); if (L.claws) cone(0.06 * k, 0.25 * k, "#f4f1e6", x * 0.06 * k, -legH + 0.22 * k, 0.2 * k, l, 0.6); }
    const by = legH + bh / 2;
    const b = box(bw, bh, bl, C, 0, by, 0, body); b.rotation.x = -0.12;
    box(bw * 0.7, bh * 0.35, bl * 0.6, A, 0, by - bh * 0.35, 0.05 * k, body);
    if (L.stripes) for (let n = 0; n < 3; n++) box(bw * 1.02, bh * 0.12, 0.1 * k, "#3a4a1a", 0, by + bh * 0.25, (n - 1) * 0.35 * k, body);
    const hs = L.head * k;
    head.position.set(0, by + bh * 0.55 + hs * 0.1, bl / 2 + hs * 0.25); body.add(head);
    box(hs * 0.8, hs * 0.75, hs * 1.0, C, 0, 0, 0, head); box(hs * 0.7, hs * 0.3, hs * 0.75, A, 0, -hs * 0.4, hs * 0.2, head);
    box(hs * 0.65, hs * 0.38, L.snout * k, C, 0, -hs * 0.02, hs * 0.5 + L.snout * k / 2, head);
    for (let t = -1; t <= 1; t += 0.5) box(0.05 * k, 0.12 * k, 0.05 * k, "#ffffff", t * hs * 0.28, -hs * 0.24, hs * 0.5 + L.snout * k * 0.8, head);
    eyes(hs, hs * 0.51);
    if (sp === "raptor") for (let n = 0; n < 3; n++) { const f = box(0.06 * k, 0.32 * k, 0.12 * k, "#e5534b", 0, hs * 0.45, -n * 0.12 * k, head); f.rotation.x = -0.5; }
    for (const x of [-1, 1]) box(0.11 * k, (L.tiny ? 0.3 : 0.45) * k, 0.11 * k, C, x * bw * 0.48, by - bh * 0.05, bl * 0.42, body);
    tail("long", by + bh * 0.1, -bl / 2);
    seat = legH + bh; seatZ = -0.2 * k;
  } else {   // butterfly
    const legH = 0.6 * k, bh = 0.38 * k, bl = 1.5 * k, bw = 0.4 * k;
    box(bw, bh, bl, "#2b2b35", 0, legH + bh / 2, 0, body);
    head.position.set(0, legH + bh / 2, bl / 2 + 0.2 * k); body.add(head); ball(0.22 * k, "#2b2b35", 0, 0, 0, head); eyes(0.45 * k, 0.18 * k);
    for (const x of [-1, 1]) { const a = box(0.04 * k, 0.6 * k, 0.04 * k, "#1d232a", x * 0.1 * k, 0.3 * k, 0.05 * k, head); a.rotation.z = -x * 0.4; ball(0.06 * k, "#1d232a", x * 0.22 * k, 0.58 * k, 0.05 * k, head); }
    for (const x of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(x * bw / 2, legH + bh / 2, 0); body.add(w); wings.push(w);
      box(1.7 * k, 0.05, 1.3 * k, C, x * 0.85 * k, 0, 0.35 * k, w); ball(0.25 * k, A, x * 1.1 * k, 0.03, 0.45 * k, w, 1, 0.2, 1); box(1.2 * k, 0.05, 1.0 * k, s.c2, x * 0.6 * k, 0, -0.6 * k, w);
    }
    seat = legH + bh;
  }
  let top = seat;
  if (rider) {   // the courier, seated (a little smaller): hips just above the pet's back
    const r = courierModel(rider, true); r.g.scale.setScalar(0.8); r.g.position.set(0, seat - 0.52, seatZ); body.add(r.g); top = seat + 1.4; riderG = r.g;
  }
  brighten(g);
  return { g, body, legs, wings, head, tails, k, top, seat, rider: riderG, butterfly: L.plan === "butterfly", fly: !!s.fly, hop: !!L.hop, plan: L.plan };
}
function animatePet(m, t, moving, speed, airborne) {
  const f = 6 + speed * 0.5, sw = moving && !airborne ? Math.sin(t * f) * 0.6 : 0;
  m.legs.forEach((l, i) => (l.rotation.x = airborne ? 0.6 : m.hop ? -Math.abs(sw) : m.legs.length === 2 ? (i ? sw : -sw) : (i === 0 || i === 3 ? sw : -sw)));
  m.body.position.y = airborne ? Math.sin(t * 3) * 0.25 : moving ? Math.abs(Math.sin(t * f)) * (m.hop ? 0.35 : 0.12) * m.k : (m.butterfly ? 0.3 + Math.sin(t * 3) * 0.1 : Math.sin(t * 2) * 0.02);
  if (m.plan === "upright" && moving && !airborne) m.body.rotation.z = Math.sin(t * f) * 0.08; else m.body.rotation.z = 0;   // a waddle
  const flap = m.butterfly ? 0.25 + Math.sin(t * (airborne ? 14 : 5)) * 0.7 : m.fly ? 0.15 + Math.sin(t * (airborne ? 9 : 3)) * (airborne ? 0.6 : 0.25) : 0.1 + Math.sin(t * (moving ? 12 : 3)) * 0.2;
  for (const [i, w] of m.wings.entries()) w.rotation.z = (i ? -1 : 1) * flap;
  m.tails.forEach((tl, i) => (tl.rotation.y = Math.sin(t * 4 - i * 0.8) * 0.35));
  m.head.rotation.y = Math.sin(t * 0.7) * 0.12;
}
// pet portraits for the menus, drawn once per species
const portraitR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); portraitR.setSize(168, 168);
const pScene = new THREE.Scene(); pScene.add(new THREE.HemisphereLight("#ffffff", "#9a8f80", 1.3)); const pl = new THREE.DirectionalLight("#ffffff", 1); pl.position.set(3, 5, 4); pScene.add(pl);
const pCam = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
const PORTRAITS = {};
function portrait(sp) {
  if (PORTRAITS[sp]) return PORTRAITS[sp];
  const m = petModel(sp); m.g.rotation.y = 0.7; pScene.add(m.g);
  const L = LOOK[sp] || {}, k = SPECIES[sp].size, wide = L.wings === "bat" || L.wings === "feather" && L.plan === "quad" || L.plan === "butterfly" ? 1.35 : 1, tall = (L.neck || 0) + (L.leg || 0.5) > 1.5 ? 1.3 : 1;
  pCam.position.set(0, 2.4 * k * wide * tall, 5.6 * k * wide * tall); pCam.lookAt(0, 1.0 * k * tall, 0);
  portraitR.render(pScene, pCam); pScene.remove(m.g);
  return (PORTRAITS[sp] = portraitR.domElement.toDataURL());
}

// ---- celebrations (owner, 2026-11-08): confetti, sparks and fireworks ----
const FXN = 1400;
const confetti = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), FXN);
const sparks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.18, 0), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), FXN);
for (const m of [confetti, sparks]) { m.frustumCulled = false; m.count = 0; m.setColorAt(0, new THREE.Color()); scene.add(m); }
const CONF = [], SPRK = [], ROCKETS = [];
const PARTY = ["#e5534b", "#f2b01e", "#3fb36b", "#3a8ee6", "#a352e0", "#ff7ac8", "#2bb3c0", "#ffffff"];
const tmpC = new THREE.Color();
function emitConfetti(x, y, z, n, spread = 4, up = 7) {
  for (let i = 0; i < n; i++) { if (CONF.length >= FXN) CONF.shift(); const a = Math.random() * TAU, sp = Math.random() * spread; CONF.push({ x, y, z, vx: Math.cos(a) * sp, vy: up * (0.5 + Math.random()), vz: Math.sin(a) * sp, rx: Math.random() * 6, ry: Math.random() * 6, vr: 4 + Math.random() * 8, life: 2.2 + Math.random() * 1.2, c: new THREE.Color(pick(PARTY)) }); }
}
function emitSparks(x, y, z, n, speed, colors, life = 1.2, g = 3, size = 1) {
  for (let i = 0; i < n; i++) { if (SPRK.length >= FXN) SPRK.shift(); const u = Math.random() * 2 - 1, a = Math.random() * TAU, r = Math.sqrt(1 - u * u), sp = speed * (0.6 + Math.random() * 0.4); SPRK.push({ x, y, z, vx: r * Math.cos(a) * sp, vy: u * sp, vz: r * Math.sin(a) * sp, life: life * (0.7 + Math.random() * 0.5), max: life, g, s: size, c: new THREE.Color(pick(colors)) }); }
}
// a firework: a rocket that climbs, trailing sparks, then bursts
function firework(x, y, z, delay = 0, colors) { ROCKETS.push({ x, y, z, vy: 22 + Math.random() * 6, fuse: 0.9 + Math.random() * 0.4, delay, colors: colors || [pick(PARTY), pick(PARTY), "#ffffff"] }); }
function fxStep(dt) {
  for (let i = ROCKETS.length - 1; i >= 0; i--) {
    const r = ROCKETS[i]; if (r.delay > 0) { r.delay -= dt; continue; }
    r.y += r.vy * dt; r.vy -= 6 * dt; r.fuse -= dt; emitSparks(r.x, r.y, r.z, 1, 1, ["#ffd35a"], 0.4, 0, 0.7);
    if (r.fuse <= 0) { emitSparks(r.x, r.y, r.z, 90, 13, r.colors, 1.5, 3); emitSparks(r.x, r.y, r.z, 30, 5, ["#ffffff"], 0.6, 1, 0.6); ROCKETS.splice(i, 1); }
  }
  let n = 0;
  for (let i = CONF.length - 1; i >= 0; i--) {
    const p = CONF[i]; p.life -= dt; if (p.life <= 0) { CONF.splice(i, 1); continue; }
    p.vy -= 9 * dt; p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5; if (p.vy < -2.5) p.vy = -2.5;   // flutters down
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += p.vr * dt; p.ry += p.vr * 0.7 * dt;
    const s = Math.min(1, p.life * 2); dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.rx, p.ry, 0); dummy.scale.set(s, s, s); dummy.updateMatrix();
    confetti.setMatrixAt(n, dummy.matrix); confetti.setColorAt(n, p.c); n++;
  }
  confetti.count = n; confetti.instanceMatrix.needsUpdate = true; if (confetti.instanceColor) confetti.instanceColor.needsUpdate = true;
  n = 0;
  for (let i = SPRK.length - 1; i >= 0; i--) {
    const p = SPRK[i]; p.life -= dt; if (p.life <= 0) { SPRK.splice(i, 1); continue; }
    p.vy -= p.g * dt; p.vx *= 1 - dt * 1.2; p.vy *= 1 - dt * 1.2; p.vz *= 1 - dt * 1.2; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const s = p.s * Math.min(1, p.life / (p.max * 0.5)); dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(s, s, s); dummy.updateMatrix();
    sparks.setMatrixAt(n, dummy.matrix); tmpC.copy(p.c).multiplyScalar(Math.min(1, p.life * 1.5)); sparks.setColorAt(n, tmpC); n++;
  }
  sparks.count = n; sparks.instanceMatrix.needsUpdate = true; if (sparks.instanceColor) sparks.instanceColor.needsUpdate = true;
}
// a big word across the screen
// (owner, 2026-11-09) sub: a small line under it (whose update it is)
function banner(txt, color, sub) { const b = $("banner"); b.textContent = txt; if (sub) { const s = document.createElement("small"); s.textContent = sub; b.appendChild(s); } b.style.color = color || "#fff"; b.classList.remove("go"); void b.offsetWidth; b.classList.add("go"); }
let eventFlashTimer = 0;
function eventFlash(title, sub) { const e = $("eventflash"); $("eventtitle").textContent = title; $("eventsub").textContent = sub; clearTimeout(eventFlashTimer); e.classList.remove("go"); void e.offsetWidth; e.classList.add("go"); eventFlashTimer = setTimeout(() => e.classList.remove("go"), 3250); }


// ---- me ----
const me = { inst: 0, vy: 0, longJump: false, x: SPAWN.x + (Math.random() - 0.5) * 8, y: 0, z: SPAWN.z + Math.random() * 3, yaw: Math.PI, moving: false, airborne: false, boostUntil: 0, bag: [], stunUntil: 0, stars: 0 };
let mine = null, myBubble = null;
// (owner, 2026-11-09: others saw the wrong pet) what I ride is drawn and told to the room whenever it changes, however
// it changed (riding another, training, a trade, my data coming back from the server at login or after a stale save)
let mountKey = "", sentPet = "";
const petKey = () => riding().sp + "|" + riding().lv;
function petSync() { const k = petKey(); if (k !== mountKey) mount(); if (netOk && k !== sentPet) { sentPet = k; netSend({ t: "pet", sp: riding().sp, lv: riding().lv }); } }
// (owner, 2026-11-10) players and pets are drawn in full color (the in-color layer), not gray
function mount() { mountKey = petKey(); if (mine) scene.remove(mine.g); mine = petModel(riding().sp, save.shirt); sizePet(mine, petScale(riding().lv)); scene.add(inColor(mine.g)); blobUnder(mine.g, 2.2 * (mine.k || 1)); if (myBubble) { mine.g.add(myBubble.s); myBubble.s.position.y = mine.top + 2.4; } }
mount();
// the guide (owner, 2026-11-08): a long glowing arrow lying flat around my pet, turned toward where to go; it tilts up
// only halfway toward a place above or below (fully when the place is well above me), so it never stands on end; a
// glowing marker bobs over the place itself on screen when it's in view
const pinEl = $("pin"), gt = new THREE.Vector3();
const arrowShape = new THREE.Shape(); arrowShape.moveTo(-0.32, 0); arrowShape.lineTo(0.32, 0); arrowShape.lineTo(0.32, 2.4); arrowShape.lineTo(0.85, 2.4); arrowShape.lineTo(0, 3.8); arrowShape.lineTo(-0.85, 2.4); arrowShape.lineTo(-0.32, 2.4); arrowShape.closePath();
const arrowGeo = new THREE.ShapeGeometry(arrowShape); arrowGeo.rotateX(Math.PI / 2);   // lying flat, pointing +z
const arrow = new THREE.Group(), arrowTilt = new THREE.Group(); arrow.add(arrowTilt); scene.add(arrow);
{ const core = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: "#ffe27a", side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false, fog: false })); core.position.z = 1.6; core.renderOrder = 4; arrowTilt.add(core);
  for (const [s2, o] of [[1.35, 0.35], [1.8, 0.16]]) { const g = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: "#ffb800", side: THREE.DoubleSide, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); g.scale.set(s2, s2, s2); g.position.z = 1.6 - 3.8 * (s2 - 1) * 0.4; g.renderOrder = 3; arrowTilt.add(g); } }
inColor(arrow);
function drawGuide(tx, ty, tz, on) {
  arrow.visible = on; if (!on) { pinEl.style.display = "none"; return; }
  const dx = tx - me.x, dz = tz - me.z, d = hyp(dx, dz), up = ty - me.y, el = Math.atan2(up, Math.max(1, d));
  const tilt = up > 4 ? el : el * 0.5;
  arrow.position.set(me.x, me.y + 0.6, me.z); arrow.rotation.y = Math.atan2(dx, dz); arrowTilt.rotation.x = -clamp(tilt, -0.6, 1.2);
  const pulse = 1 + Math.sin(clock * 5) * 0.06; arrowTilt.scale.set(pulse, pulse, pulse);
  gt.set(tx, ty + 2.5, tz); const v = gt.clone().applyMatrix4(camera.matrixWorldInverse);
  if (v.z < -0.5) { gt.project(camera); const vis = gt.x > -0.94 && gt.x < 0.94 && gt.y > -0.9 && gt.y < 0.86; pinEl.style.display = vis ? "block" : "none"; if (vis) pinEl.style.transform = `translate(${((gt.x + 1) / 2) * innerWidth}px, ${((1 - gt.y) / 2) * innerHeight}px)`; }
  else pinEl.style.display = "none";
}
// the courier on foot (inside houses): legs that walk, arms that swing against them
function walkerModel(shirt) { const w = courierModel(shirt); brighten(w.g); scene.add(inColor(w.g)); w.g.visible = false; blobUnder(w.g, 1.6); return w; }
const walker = walkerModel(save.shirt);
// (owner, 2026-11-09) fliers and gliders point nose-up while climbing and nose-down while diving or gliding down, by
// how they're really moving (height gained against ground covered); level on the ground. The body turns about its
// middle so the pet stays where it is.
function flightPitch(m, x, y, z, dt, airborne) {
  const f = m.fp || (m.fp = { x, y, z, a: 0 }), d = Math.max(dt, 1e-3), hs = hyp(x - f.x, z - f.z) / d, vy = (y - f.y) / d;
  f.x = x; f.y = y; f.z = z;
  const a = -Math.atan2(vy, hs + 3), want = m.fly && airborne && hs < 120 && Math.abs(vy) < 120 ? clamp(a > 0 ? a * 1.4 : a, -0.7, 0.95) : 0;   // not on a teleport; (owner, 2026-11-09) going down tips further
  f.a += (want - f.a) * Math.min(1, dt * 5);
  const c = (m.top / m.g.scale.y) * 0.45;   // the middle of pet and rider
  m.body.rotation.x = f.a; m.body.position.y += c * (1 - Math.cos(f.a)); m.body.position.z = -c * Math.sin(f.a);
}
function animateWalker(w, t, moving) { const sw = moving ? Math.sin(t * 9) * 0.7 : 0; w.legs[0].rotation.x = sw; w.legs[1].rotation.x = -sw; w.arms[0].rotation.x = -sw; w.arms[1].rotation.x = sw; }
// dizzy stars when animal control catches me
const dizzy = new THREE.Group(); for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: "#ffd84a" })); s.position.set(Math.cos((k * TAU) / 4) * 0.8, 0, Math.sin((k * TAU) / 4) * 0.8); dizzy.add(s); } dizzy.visible = false; scene.add(dizzy);
// a beam over each house I have a parcel for (pink over the islands: double pay)
const BEAMG = new THREE.CylinderGeometry(1.1, 1.1, 30, 16, 1, true), beamM = new THREE.MeshBasicMaterial({ color: "#ffd35a", transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }), skyBeamM = new THREE.MeshBasicMaterial({ color: "#ff8ad8", transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
const beams = new Map();
function syncBeams() {
  const want = new Set(me.bag);
  for (const [i, b] of beams) if (!want.has(i)) { scene.remove(b); beams.delete(i); }
  for (const i of want) if (!beams.has(i)) { const h = houses[i], g = new THREE.Group(); const m = new THREE.Mesh(BEAMG, h.sky ? skyBeamM : beamM); m.position.y = 15; g.add(inColor(m)); const p = box(0.9, 0.7, 0.9, "#c98b4f", 0, 3, 0, g, false); g.userData.parcel = p; g.position.set(h.mx, h.my, h.mz); scene.add(g); beams.set(i, g); }
}

// Every ten minutes the room gets a Package Rush for a random one to two minutes. Packages are shared and the server
// awards them once; the page only draws what the server says is still available.
const prizeBeamM = new THREE.MeshBasicMaterial({ color: "#c75cff", transparent: true, opacity: 0.27, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
const prizeRingM = new THREE.MeshBasicMaterial({ color: "#ffd84a", transparent: true, opacity: 0.9, depthWrite: false });
let packageEvent = null;
const packageMeshes = new Map(), packageClaiming = new Set();
function prizePackage(at) {
  const g = new THREE.Group(), beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 28, 16, 1, true), prizeBeamM);
  beam.position.y = 14; g.add(beam);
  const parcel = new THREE.Group(); box(1.5, 1.1, 1.35, "#d99a54", 0, 0.7, 0, parcel); box(0.22, 1.16, 1.42, "#ffd84a", 0, 0.72, 0, parcel); box(1.56, 0.22, 1.42, "#ffd84a", 0, 0.72, 0, parcel);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.12, 8, 28).rotateX(Math.PI / 2), prizeRingM); ring.position.y = 0.12; g.add(parcel, ring);
  g.position.set(at.x, at.y, at.z); g.userData.parcel = parcel; g.userData.ring = ring; inColor(beam); inColor(ring); scene.add(g); return g;
}
function dropPrize(id) { const g = packageMeshes.get(id); if (g) scene.remove(g); packageMeshes.delete(id); packageClaiming.delete(id); }
function setPackageEvent(event, announce = false) {
  for (const id of [...packageMeshes.keys()]) dropPrize(id);
  packageClaiming.clear(); packageEvent = event ? { id: event.id, ends: performance.now() + event.left * 1000, boxes: new Map() } : null;
  if (packageEvent) {
    for (const box of event.boxes || []) { packageEvent.boxes.set(box.id, box); packageMeshes.set(box.id, prizePackage(box)); }
    if (announce) { eventFlash("Package Rush!", "Prize packages are falling!"); emitConfetti(me.x, me.y + 5, me.z, 120, 7, 11); for (let i = 0; i < 4; i++) firework(me.x + (Math.random() - 0.5) * 14, me.y + 1, me.z + (Math.random() - 0.5) * 14, i * 0.25, ["#c75cff", "#ffd84a", "#ffffff"]); }
  }
  hudKey = "";
}
function rewardText(r) {
  if (!r) return "Mystery prize!";
  if (r.kind === "pet") return SPECIES[r.sp].name + " pet!";
  if (r.kind === "xp") return "+" + r.n + " training points!";
  if (r.kind === "coins") return "+" + fmt(r.n) + " coins!";
  if (r.kind === "item") return r.n + "x " + ITEMS[r.item].name + "!";
  return "Mystery prize!";
}
function packageStep() {
  if (!packageEvent || me.inst || !netOk) return;
  for (const [id, box] of packageEvent.boxes) if (!packageClaiming.has(id) && hyp(me.x - box.x, me.z - box.z) < 2.8 && Math.abs(me.y - box.y) < 4) {
    packageClaiming.add(id); sendPos(true); netSend({ t: "package", id }); break;
  }
}
function drawPackages() {
  for (const [id, g] of packageMeshes) { const k = id * 0.7; g.userData.parcel.rotation.y = clock * 1.8 + k; g.userData.parcel.position.y = 0.4 + Math.sin(clock * 3 + k) * 0.25; g.userData.ring.rotation.z = clock * 0.8 + k; const s = 1 + Math.sin(clock * 4 + k) * 0.12; g.userData.ring.scale.setScalar(s); }
}

// ---- smooth playback of what the server sends (owner, 2026-11-08: no rubber-banding): each update is stamped with the
// server's clock; others and vehicles are drawn a little in the past, gliding between the two updates around that
// moment (a short guess ahead if the next is late) ----
let clockOff = null;   // my clock minus the server's (ms), from the quickest-arriving updates
const DELAY = 140, OTHER_DELAY = 170;
function serverTime(ts) { const est = performance.now() - ts; if (clockOff === null || est < clockOff) clockOff = est; else clockOff += (est - clockOff) * 0.01; }
const renderTime = () => performance.now() - (clockOff || 0) - DELAY;
function pushSample(buf, ts, s) { if (buf.length && ts <= buf[buf.length - 1].t) return; buf.push(Object.assign({ t: ts }, s)); while (buf.length > 30) buf.shift(); }
function lerpYaw(a, b, k) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return a + d * k; }
function sampleAt(buf, t, out) {
  if (!buf.length) return false;
  let i = buf.length - 1; while (i > 0 && buf[i - 1].t > t) i--;
  const b = buf[i], a = i > 0 ? buf[i - 1] : b;
  if (t >= b.t) {   // past the newest: guess ahead a little along its last motion (not if it had stopped)
    const p = buf.length > 1 ? buf[buf.length - 2] : b, span = Math.max(1, b.t - p.t), k = b.mv === false ? 0 : Math.min(t - b.t, 200) / span;
    out.x = b.x + (b.x - p.x) * k; out.y = b.y + (b.y - p.y) * k; out.z = b.z + (b.z - p.z) * k; out.yaw = b.yaw; out.ba = b.ba; out.bd = b.bd; return true;
  }
  const k = a === b ? 1 : clamp((t - a.t) / (b.t - a.t), 0, 1);
  out.x = a.x + (b.x - a.x) * k; out.y = a.y + (b.y - a.y) * k; out.z = a.z + (b.z - a.z) * k; out.yaw = lerpYaw(a.yaw, b.yaw, k);
  if (b.ba !== undefined && a.ba !== undefined) { out.ba = lerpYaw(a.ba, b.ba, k); out.bd = a.bd + (b.bd - a.bd) * k; }   // a helicopter's searchlight
  return true;
}

// ---- animal control (owner, 2026-11-08): vans on the roads and helicopters over town (pets-world.js); online the
// server runs them for the whole room, offline this page does ----
const lightR = new THREE.MeshBasicMaterial({ color: "#ff3a3a" }), lightB = new THREE.MeshBasicMaterial({ color: "#3a7aff" });
// (owner, 2026-11-09) beams of light: an open cone from the lamp (its tip) down -y, brightest at the lamp and down the
// middle, soft at the edges; the ground and anything in the way hides the rest of it
const BEAM_CONE = new THREE.ConeGeometry(1, 1, 24, 1, true).translate(0, -0.5, 0);
const beamMat = (c) => new THREE.ShaderMaterial({
  uniforms: { c: { value: new THREE.Color(c) }, o: { value: 0.2 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: "varying vec3 vN; varying vec3 vV; varying float vT; void main() { vT = -position.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalMatrix * normal; vV = -mv.xyz; gl_Position = projectionMatrix * mv; }",
  fragmentShader: "uniform vec3 c; uniform float o; varying vec3 vN; varying vec3 vV; varying float vT; void main() { float e = abs(dot(normalize(vN), normalize(vV))); gl_FragColor = vec4(c * o * pow(e, 2.5) * (1.0 - 0.8 * clamp(vT, 0.0, 1.0)), 1.0);\n#include <colorspace_fragment>\n}",
});
const headBeamM = beamMat("#fff1c8"), searchBeamM = beamMat("#ff5a5a");   // (owner, 2026-11-09) the searchlight is red
const POOL_G = new THREE.PlaneGeometry(5.5, 11).rotateX(-Math.PI / 2);
const headPoolM = new THREE.MeshBasicMaterial({ color: "#fff1c8", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 64; const x = cv.getContext("2d"), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })(), polygonOffset: true, polygonOffsetFactor: -2 });
function vanModel(style = 1) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  box(2.4, 1.8, 3.2, "#d63a3a", 0, 1.5, -0.6, body); box(2.34, 1.4, 1.6, "#d63a3a", 0, 1.3, 1.72, body); box(2.1, 0.7, 0.1, "#3a5a7a", 0, 1.6, 2.58, body);
  box(2.46, 0.35, 3.24, "#ffffff", 0, 1.2, -0.6, body); box(2.5, 0.3, 4.9, "#3d4650", 0, 0.55, 0.2, body);
  for (const [x, z] of [[-1.1, 1.5], [1.1, 1.5], [-1.1, -1.4], [1.1, -1.4]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12), mat("#1d232a")); w.rotation.z = Math.PI / 2; w.position.set(x, 0.45, z); body.add(w); }
  for (let k = 0; k < 4; k++) { box(0.06, 1.1, 0.06, "#1d232a", -1.21, 1.5, -1.9 + k * 0.7, body); box(0.06, 1.1, 0.06, "#1d232a", 1.21, 1.5, -1.9 + k * 0.7, body); }
  const red = new THREE.Mesh(BOX, lightR.clone()); red.scale.set(0.8, 0.25, 0.35); red.position.set(-0.45, 2.15, 1.6); body.add(red);
  const blue = new THREE.Mesh(BOX, lightB.clone()); blue.scale.set(0.8, 0.25, 0.35); blue.position.set(0.45, 2.15, 1.6); body.add(blue);
  g.traverse((o) => (o.castShadow = true));
  // (owner, 2026-11-09) headlights, on while it's moving at night: lamps, two beams ahead and a pool on the road
  const lamp = new THREE.MeshBasicMaterial({ color: "#6d6a5c" }), lit = new THREE.Group(), cones = [];
  for (const x of [-0.78, 0.78]) {
    const l = new THREE.Mesh(BOX, lamp); l.scale.set(0.42, 0.26, 0.08); l.position.set(x, 0.95, 2.55); body.add(l);
    const c = new THREE.Mesh(BEAM_CONE, headBeamM); c.position.set(x, 0.95, 2.6); c.rotation.x = -(Math.PI / 2 - 0.09); c.scale.set(1.5, 10, 1.5); lit.add(c); cones.push(c);
  }
  const pool = new THREE.Mesh(POOL_G, headPoolM); pool.position.set(0, -0.12, 8.2); lit.add(pool); body.add(lit);
  // Three animal-control silhouettes share the same equipment: a compact car, the standard van and a taller SUV.
  if (style === 0) body.scale.set(0.86, 0.8, 0.84);
  else if (style === 2) { body.scale.set(1.05, 1.1, 0.92); box(2.1, 0.12, 2.5, "#3d4650", 0, 2.28, -0.25, body); }
  acRed(g); inColor(g);   // (owner, 2026-11-09) animal control is red, in color in the sketch look
  return { g, body, red, blue, lamp, lit, spd: 0 };
}
// (owner, 2026-11-09) animal control's red stays bright red, day and night
const AC_RED = new THREE.MeshLambertMaterial({ color: "#ff3b30", emissive: "#a01810" });
function acRed(g) { const r = mat("#d63a3a"); g.traverse((o) => { if (o.isMesh && o.material === r) o.material = AC_RED; }); }
function heliModel() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  box(2.4, 2, 4, "#d63a3a", 0, 0, 0, body); box(2.2, 1.2, 1.4, "#3a5a7a", 0, 0.2, 1.9, body); box(2.46, 0.4, 4.05, "#ffffff", 0, -0.3, 0, body);
  box(0.5, 0.5, 4.5, "#d63a3a", 0, 0.4, -4, body); box(0.15, 1.5, 0.9, "#ffffff", 0, 0.9, -6.1, body);
  for (const x of [-1, 1]) { box(0.15, 0.15, 4, "#3d4650", x * 1.2, -1.5, 0, body); box(0.12, 0.6, 0.12, "#3d4650", x * 1.1, -1.2, 1, body); box(0.12, 0.6, 0.12, "#3d4650", x * 1.1, -1.2, -1, body); }
  const rotor = new THREE.Group(); rotor.position.y = 1.25; body.add(rotor); box(0.3, 0.4, 0.3, "#3d4650", 0, -0.1, 0, rotor); box(11, 0.08, 0.5, "#2b3440", 0, 0.1, 0, rotor); box(0.5, 0.08, 11, "#2b3440", 0, 0.1, 0, rotor);
  const tail = new THREE.Group(); tail.position.set(0.3, 0.9, -6.1); body.add(tail); box(0.05, 2, 0.25, "#2b3440", 0, 0, 0, tail);
  const red = new THREE.Mesh(BOX, lightR.clone()); red.scale.set(0.5, 0.2, 0.5); red.position.set(-0.5, 1.05, 0.6); body.add(red);
  const blue = new THREE.Mesh(BOX, lightB.clone()); blue.scale.set(0.5, 0.2, 0.5); blue.position.set(0.5, 1.05, 0.6); body.add(blue);
  g.traverse((o) => (o.castShadow = true));
  // (owner, 2026-11-09) the searchlight (pets-world.js aims it): a lamp under the nose, a real light where it lands and
  // the beam down to it; the light is always there (only its strength changes) so nothing has to recompile
  box(0.6, 0.45, 0.6, "#2b3440", 0, -1.15, 1.6, body); const lens = new THREE.Mesh(new THREE.CircleGeometry(0.26, 16).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#35363a" })); lens.position.set(0, -1.39, 1.6); body.add(lens);
  const spot = new THREE.SpotLight("#ff6a6a", 0, 0, World.BEAM.half * 1.15, 0.45, 0); spot.layers.enableAll(); scene.add(spot, spot.target);
  const beam = new THREE.Mesh(BEAM_CONE, searchBeamM); beam.frustumCulled = false; scene.add(beam);
  acRed(g); inColor(g); inColor(beam);   // (owner, 2026-11-09) red, in color in the gray look
  return { g, body, red, blue, rotor, tail, lens, spot, beam, ba: 0, bd: 15 };
}
let localVs = [];
const vehs = [];
// (owner, 2026-11-09, like an MMO's ground telegraphs) animal control's reach drawn on the ground as red shapes: a
// translucent fill, lighter toward its edge, a bright rim, and a ring pulsing out from the middle. A van's is the shape
// of how far it sees you (your wanted stars count), shown while it's looking (not while it chases); a helicopter's is
// the circle its searchlight catches you in.
const telM = new THREE.ShaderMaterial({
  uniforms: { t: { value: 0 }, c: { value: new THREE.Color("#ff2b2b") } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
  vertexShader: "attribute float f; varying float vF; void main() { vF = f; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: "uniform float t; uniform vec3 c; varying float vF; void main() { float fill = mix(0.26, 0.12, vF); float rim = smoothstep(0.955, 0.975, vF) * (1.0 - smoothstep(0.993, 1.0, vF)) * 0.95; float p = fract(t * 0.55); float pulse = (1.0 - smoothstep(0.0, 0.06, abs(vF - p))) * 0.35 * (1.0 - p); gl_FragColor = vec4(c, clamp(fill + rim + pulse, 0.0, 1.0)); }",
});
function telegraphGeo(rOf, N = 72) {   // a fan from the middle out to rOf(angle) (angle 0 = +z, ahead); f: 0 in the middle, 1 at the edge
  const pos = [0, 0, 0], f = [0], idx = [];
  for (let n = 0; n < N; n++) { const a = (n / N) * TAU, r = rOf(a); pos.push(Math.sin(a) * r, 0, Math.cos(a) * r); f.push(1); idx.push(0, 1 + n, 1 + ((n + 1) % N)); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("f", new THREE.Float32BufferAttribute(f, 1)); g.setIndex(idx); return g;
}
const losLines = (stars) => telegraphGeo((a) => World.vanSight(Math.cos(a), Math.abs(Math.sin(a)), stars));
const DISC_G = telegraphGeo(() => 1);
// (owner, 2026-11-10) the vans and helicopters staff placed, rebuilt with the world: the ones still placed keep their
// models and carry on where they are; only added ones are made and taken-away ones removed
function buildVehicles() {
  localVs = World.makeVehicles(localVs);
  const old = new Map(vehs.map((m) => [m.id, m])), keepIds = new Set(localVs.map((v) => v.id));
  for (const m of vehs) if (!keepIds.has(m.id)) {
    scene.remove(m.g); if (m.beam) scene.remove(m.beam); if (m.spot) scene.remove(m.spot, m.spot.target); if (m.disc) scene.remove(m.disc);
    for (let i = blobs.length - 1; i >= 0; i--) if (blobs[i].g === m.g) { scene.remove(blobs[i].b); blobs.splice(i, 1); }
    old.delete(m.id);
  }
  vehs.length = 0;
  for (const v of localVs) {
    const was = old.get(v.id); if (was && was.kind === v.kind) { vehs.push(was); continue; }
    const m = v.kind ? heliModel() : vanModel(v.style); scene.add(m.g); blobUnder(m.g, v.kind ? 7 : 5);
    Object.assign(m, { id: v.id, kind: v.kind, buf: [], x: v.x, y: v.y, z: v.z, yaw: v.yaw, mode: 0, target: 0, pitch: 0 });
    if (!m.kind) { m.los = new THREE.Mesh(losLines(0), telM); m.los.position.y = -0.1; m.los.renderOrder = 2; m.losStars = 0; m.g.add(inColor(m.los)); }
    else { m.disc = new THREE.Mesh(DISC_G, telM); m.disc.renderOrder = 2; scene.add(inColor(m.disc)); }
    vehs.push(m);
  }
}
const meP = { id: 0, x: 0, y: 0, z: 0, stars: 0, lastChased: 0, lastStar: 0, immuneUntil: 0 };   // me, for running them offline
const tmpS = {}, beamB = {}, DOWN = new THREE.Vector3(0, -1, 0);
function vehiclesDraw(dt) {
  const online = netOk, rt = renderTime(), flash = Math.floor(performance.now() / 120) % 2 === 0, lightsOn = !me.inst && skyNow.day < 0.5;
  headBeamM.uniforms.o.value = 0.09; headPoolM.opacity = 0.54; searchBeamM.uniforms.o.value = 0.15; telM.uniforms.t.value = performance.now() / 1000;
  vehs.forEach((m, i) => {
    const px = m.x, pz = m.z;
    if (online) { if (sampleAt(m.buf, rt, tmpS)) { m.x = tmpS.x; m.y = tmpS.y; m.z = tmpS.z; m.yaw = tmpS.yaw; if (tmpS.ba !== undefined) { m.ba = tmpS.ba; m.bd = tmpS.bd; } } }
    else { const v = localVs[i]; m.x = v.x; m.y = v.y; m.z = v.z; m.yaw = v.yaw; m.mode = v.mode; m.target = v.target; if (v.kind) { m.ba = v.ba; m.bd = v.bd; } }
    const chasing = m.mode === 1;
    if (!m.kind) {   // (owner, 2026-11-08: rear clipping into the road) sit on the front and rear wheels, a little above the road
      const sx = Math.sin(m.yaw), sz = Math.cos(m.yaw), gy = m.y + 1.5, gnd = (x, z) => { const v = World.surfaceAt(x, z, gy); return v > -Infinity ? v : m.y - 0.22; }, front = gnd(m.x + sx * 1.6, m.z + sz * 1.6), rear = gnd(m.x - sx * 1.5, m.z - sz * 1.5);
      m.y = Math.max((front + rear) / 2, gnd(m.x, m.z)) + 0.22; m.pitch += (-Math.atan2(front - rear, 3.1) - m.pitch) * Math.min(1, dt * 10); m.body.rotation.x = m.pitch;
      if (dt > 0) m.spd += (Math.min(40, hyp(m.x - px, m.z - pz) / dt) - m.spd) * Math.min(1, dt * 4);   // headlights while it's moving
      const on = lightsOn && m.spd > 1.5; m.lit.visible = on; m.lamp.color.set(on ? "#fff8dc" : "#6d6a5c");
    }
    else {
      m.rotor.rotation.y += dt * 28; m.tail.rotation.x += dt * 34; m.body.rotation.x = chasing ? 0.18 : 0.06;
      const b = World.beamOf(m, beamB), spotY = terrain(m.x + Math.sin(m.ba) * m.bd, m.z + Math.cos(m.ba) * m.bd), overGround = spotY > -200;
      const len = overGround ? (spotY - b.ly) / Math.min(-0.05, b.dy) + 6 : 60;   // to the ground (and a little on: the ground hides it); over the void it just shines on down
      const beamHalf = SPECIES[riding().sp].fly ? World.BEAM.flyHalf : World.BEAM.half;
      tmpV.set(b.dx, b.dy, b.dz); m.beam.position.set(b.lx, b.ly, b.lz); m.beam.quaternion.setFromUnitVectors(DOWN, tmpV); const r = len * Math.tan(beamHalf); m.beam.scale.set(r, len, r);
      m.spot.position.set(b.lx, b.ly, b.lz); m.spot.target.position.set(b.lx + b.dx * len, b.ly + b.dy * len, b.lz + b.dz * len); m.spot.target.updateMatrixWorld();
      { const gx = m.x + Math.sin(m.ba) * m.bd, gz = m.z + Math.cos(m.ba) * m.bd, gy = terrain(gx, gz), rr = hyp(gx - b.lx, gy - b.ly, gz - b.lz) * Math.tan(beamHalf) + 0.8; m.disc.position.set(gx, gy + 0.14, gz); m.disc.scale.set(rr, 1, rr); m.disc.visible = !me.inst && overGround; }   // where its light catches you (owner, 2026-11-10: only on the ground, no circle hanging over the void)
      m.spot.angle = beamHalf * 1.15; m.beam.visible = true; searchBeamM.uniforms.o.value = lightsOn ? 0.2 : 0.13; m.spot.intensity = lightsOn ? 8 : 0; m.lens.material.color.set(lightsOn ? "#fffdf2" : "#ff8a8a");   // (owner, 2026-11-10) a faint red beam down to its circle by day too, so the circle comes from somewhere
    }
    m.g.position.set(m.x, m.y, m.z); m.g.rotation.y = m.yaw;
    if (m.los) { m.los.visible = !chasing && !me.inst; if (m.losStars !== (me.stars | 0)) { m.losStars = me.stars | 0; m.los.geometry.dispose(); m.los.geometry = losLines(m.losStars); } }
    m.red.material.color.set(!lightsOn ? "#4a2929" : chasing ? (flash ? "#ff3a3a" : "#5a1010") : "#7a2020");
    m.blue.material.color.set(!lightsOn ? "#293447" : chasing ? (flash ? "#1a2a5a" : "#3a7aff") : "#203a7a");
  });
}
// what animal control did to me
function onVehEvent(k, stars) {
  if (k === "chase") { if (performance.now() - lastChaseToast > 4000) toast("Animal control!", "#e5534b"); lastChaseToast = performance.now(); }
  else if (k === "escaped") { me.stars = stars; toast("Got away! " + "★".repeat(stars), "#e08a00"); hudKey = ""; }
  else if (k === "stars") { me.stars = stars; hudKey = ""; }
  else if (k === "caught") caught();
}
let lastChaseToast = 0;

// ---- the camera: behind and above me (below too, on a flier); drag to turn it, pinch (or the wheel) to zoom ----
const cam = { yaw: 0, pitch: 0.5, dist: 14, goalDist: 14, y: 0 };
const zoomMax = () => (wedit ? 160 : 45);   // (owner, 2026-11-10) staff building the town see further
const pitchMin = () => (moveKind() === "fly" && !me.inst ? -0.75 : 0.18);
// (owner, 2026-11-08) a house between the camera and me fades: the more of me it hides, the more see-through it gets,
// easing in and out (it's swapped for a see-through copy while it's faded)
const fades = new Map();   // house index -> { a: how solid now, g: its see-through copy }
const ghostPool = [];
function ghost(i) {
  const h = houses[i];
  let gh = ghostPool.pop();
  if (!gh) {
    const mk = (geo) => { const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ transparent: true })); m.matrixAutoUpdate = false; return m; };
    gh = { walls: mk(BOX), roof: mk(ROOFG), door: mk(BOX) }; gh.g = new THREE.Group(); gh.g.add(gh.walls, gh.roof, gh.door);
  }
  for (const [m, f, c] of [[gh.walls, wallAt, h.c], [gh.roof, roofAt, h.roof], [gh.door, doorAt, "#7a4f28"]]) { dummy.rotation.set(0, 0, 0); f(h, dummy); dummy.updateMatrix(); m.matrix.copy(dummy.matrix); m.material.color.set(c); }
  scene.add(gh.g); return gh;
}
// how much of me (5 points on me) a house hides from the camera
const RAY_PTS = [[0, 1], [0, 2.2], [0.8, 1.2], [-0.8, 1.2], [0, 0.3]];
function hiddenBy(h, cx, cy, cz) {
  const c = Math.cos(h.yaw), s = Math.sin(h.yaw), top = h.base + 7.9, bot = h.base - (h.sky ? 0.5 : 4);
  let hits = 0;
  for (const [ox, oy] of RAY_PTS) {
    const px = me.x + Math.cos(cam.yaw) * ox, pz = me.z - Math.sin(cam.yaw) * ox, py = me.y + oy;
    // the ray from the camera to that point, in the house's own frame
    const ax = (cx - h.x) * c - (cz - h.z) * s, az = (cx - h.x) * s + (cz - h.z) * c, bx = (px - h.x) * c - (pz - h.z) * s, bz = (px - h.x) * s + (pz - h.z) * c;
    let t0 = 0, t1 = 0.97, ok = true;
    for (const [a, b, lo, hi] of [[ax, bx, -4.7, 4.7], [cy, py, bot, top], [az, bz, -4.7, 4.7]]) {
      const d = b - a; if (Math.abs(d) < 1e-6) { if (a < lo || a > hi) { ok = false; break; } continue; }
      let u = (lo - a) / d, v = (hi - a) / d; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) { ok = false; break; }
    }
    if (ok) hits++;
  }
  return hits / RAY_PTS.length;
}
function fadeHouses(dt, cx, cy, cz) {
  const want = new Map();
  if (!me.inst) {
    const sx = cx - me.x, sz = cz - me.z, L2 = sx * sx + sz * sz || 1;
    houses.forEach((h, i) => {
      if (lotTaken(i)) return;
      const t = clamp(((h.x - me.x) * sx + (h.z - me.z) * sz) / L2, 0, 1), d = hyp(me.x + sx * t - h.x, me.z + sz * t - h.z);
      if (d < 8 && !(me.y > h.base + 4 && hyp(me.x - h.x, me.z - h.z) < 6.5)) { const f = hiddenBy(h, cx, cy, cz); if (f > 0) want.set(i, f); }   // not the roof I'm standing on
    });
  }
  for (const i of new Set([...want.keys(), ...fades.keys()])) {
    let f = fades.get(i); const target = 1 - 0.82 * (want.get(i) || 0);
    if (!f) { f = { a: 1, g: null }; fades.set(i, f); }
    f.a += (target - f.a) * Math.min(1, dt * 7);
    if (f.a < 0.985) {
      if (!f.g) { f.g = ghost(i); setHouse(i, false); }
      for (const m of [f.g.walls, f.g.roof, f.g.door]) { m.material.opacity = f.a; m.material.depthWrite = f.a > 0.9; }
    } else if (target >= 0.985) {
      if (f.g) { scene.remove(f.g.g); ghostPool.push(f.g); setHouse(i, true); } fades.delete(i);
    }
  }
}
function placeCamera(dt) {
  cam.dist += (cam.goalDist - cam.dist) * Math.min(1, dt * 8); cam.y += (me.y - cam.y) * Math.min(1, dt * 10);
  let d = cam.dist, cx, cz, cy;
  for (let i = 0; i < 14; i++) {   // at home (not while building) the camera stays inside the walls and under the roof
    cx = me.x + Math.sin(cam.yaw) * d * Math.cos(cam.pitch); cz = me.z + Math.cos(cam.yaw) * d * Math.cos(cam.pitch); cy = cam.y + 1.5 + d * Math.sin(cam.pitch);
    break;
  }
  { const gy = World.surfaceAt(cx, cz, cy); if (gy > -Infinity && cy < gy + 1.2 && cy > gy - 3) cy = gy + 1.2; }   // (owner, 2026-11-10) never inside a block
  // (owner, 2026-11-09) talking to someone in town, the camera moves in close on them and back out after
  let lx = me.x, ly = cam.y + 1.8, lz = me.z;
  shot.k += ((talk ? 1 : 0) - shot.k) * Math.min(1, dt * 3.2);
  if (shot.n && shot.k > 0.002) { const k = smooth(clamp(shot.k, 0, 1)); shotAt(shot.n); cx += (SH.cx - cx) * k; cy += (SH.cy - cy) * k; cz += (SH.cz - cz) * k; lx += (SH.lx - lx) * k; ly += (SH.ly - ly) * k; lz += (SH.lz - lz) * k; }
  cine.k += ((cine.on ? 1 : 0) - cine.k) * Math.min(1, dt * 2.2);
  if (cine.k > 0.002) { const k = smooth(clamp(cine.k, 0, 1)); cx += (cine.cx - cx) * k; cy += (cine.cy - cy) * k; cz += (cine.cz - cz) * k; lx += (cine.lx - lx) * k; ly += (cine.ly - ly) * k; lz += (cine.lz - lz) * k; }
  camera.position.set(cx, cy, cz); camera.lookAt(lx, ly, lz);
  sun.position.set(me.x + skyNow.sun.x * 90, me.y + Math.max(20, skyNow.sun.y * 90), me.z + skyNow.sun.z * 90); sun.target.position.set(me.x, me.y, me.z);
  fadeHouses(dt, cx, cy, cz);
}
// ---- the sketch look (owner, 2026-11-09: like a pencil drawing, to feel like a prototype): the world is drawn as usual
// into a texture, then one pass over the screen turns it to white paper: light grey shading by brightness, pencil
// hatching in the darker parts, and black outlines where the depth or the brightness changes sharply ----
const sketchRT = new THREE.WebGLRenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1, THREE.UnsignedIntType) });   // (owner, 2026-11-09: lines on phones) full-precision depth
const sketchMat = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: sketchRT.texture }, tDepth: { value: sketchRT.depthTexture }, texel: { value: new THREE.Vector2(1, 1) }, near: { value: camera.near }, far: { value: camera.far }, gain: { value: 1 } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: `
    uniform sampler2D tColor, tDepth; uniform vec2 texel; uniform float near, far, gain; varying vec2 vUv;
    float lin(float d) { float z = d * 2.0 - 1.0; return 2.0 * near * far / (far + near - z * (far - near)); }
    float lum(vec2 uv) { vec3 c = pow(max(texture2D(tColor, uv).rgb, 0.0), vec3(1.0 / 2.2)); return dot(c, vec3(0.299, 0.587, 0.114)); }
    float dep(vec2 uv) { return lin(texture2D(tDepth, uv).r); }
    void main() {
      // (owner, 2026-11-09: no outlines, no hatching) the world in plain shades of gray: each pixel's brightness, its
      // textures and shading kept
      float x = lum(vUv) * gain;   // gain: the night drawn a little lighter
      float L = x < 0.75 ? x : 0.75 + 0.25 * (1.0 - exp(-(x - 0.75) / 0.25));   // (owner, 2026-11-10: lit limbs blew out white) a soft shoulder: the brightest parts ease toward white, never clip
      // (owner, 2026-11-10) grass and trees keep some green: part of their own color where green leads
      vec3 c = pow(max(texture2D(tColor, vUv).rgb, 0.0), vec3(1.0 / 2.2)); float gd = c.g - max(c.r, c.b);
      vec3 tint = (c - vec3(dot(c, vec3(0.299, 0.587, 0.114)))) * 0.9 * smoothstep(0.01, 0.08, gd);
      gl_FragColor = vec4(clamp(vec3(L) + tint * (1.0 - smoothstep(0.7, 1.0, x)), 0.0, 1.0), 1.0);
      gl_FragDepthEXT = min(1.0, texture2D(tDepth, vUv).r + 0.00002);   // the world's depth (a hair farther, so rings on the ground never flicker), so what's drawn in color after is hidden behind things
    }`,
  depthTest: true, depthFunc: THREE.AlwaysDepth, depthWrite: true,
});
const sketchScene = new THREE.Scene(), sketchCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
sketchScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sketchMat));
function renderFrame() {
  if (!SKETCH) { camera.layers.enableAll(); renderer.render(scene, camera); return; }
  sketchMat.uniforms.gain.value = me.inst ? 1 : 1 / Math.max(0.36, 0.36 + 0.64 * skyNow.day);   // (owner, 2026-11-10: the dark world was back) nights lifted more
  // labels (names, speech bubbles, place labels: layer 1) go on after, as they are, so they stay readable
  camera.layers.set(0); renderer.setRenderTarget(sketchRT); renderer.render(scene, camera); renderer.setRenderTarget(null); renderer.render(sketchScene, sketchCam);
  // (owner, 2026-11-10) what's drawn in color (players, pets, dirt) gets the same lift as the gray world, so it's never darker than it at night
  const gain = sketchMat.uniforms.gain.value, lit = scene.children.filter((o) => o.isHemisphereLight || o.isDirectionalLight), was = lit.map((l) => l.intensity); lit.forEach((l) => (l.intensity *= gain));
  const bg = scene.background; scene.background = null; renderer.autoClear = false; camera.layers.set(1); renderer.render(scene, camera); lit.forEach((l, n) => (l.intensity = was[n])); renderer.autoClear = true; camera.layers.set(0); scene.background = bg;
}
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  const v = renderer.getDrawingBufferSize(new THREE.Vector2()); sketchRT.setSize(v.x, v.y); const k = renderer.getPixelRatio() > 1.4 ? 1.4 : 1; sketchMat.uniforms.texel.value.set(k / v.x, k / v.y);
}
addEventListener("resize", resize); resize();

// ---- controls: a thumb joystick on the left of the screen (where you put your thumb down), drag elsewhere to turn
// the camera, two fingers to zoom; keys WASD / arrows, mouse drag and the wheel on a computer. On a flier, moving
// forward climbs or dives the way the camera looks (owner, 2026-11-08). ----
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, drags = new Map(), keys = new Set();
const joyEl = $("joy"), knob = joyEl.firstElementChild;
const taps = new Map();   // pointer -> where and when it went down, to tell a tap from a drag
canvas.addEventListener("pointerdown", (e) => {
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not a live pointer */ }
  taps.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
  if (document.activeElement === $("chatin")) $("chatin").blur();
  if (e.pointerType !== "mouse" && joy.id === null && e.clientX < innerWidth * 0.5 && drags.size === 0) { Object.assign(joy, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 }); joyEl.style.display = "block"; joyEl.style.left = e.clientX + "px"; joyEl.style.top = e.clientY + "px"; knob.style.transform = ""; return; }
  drags.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId === joy.id) { let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const l = hyp(dx, dy), m = 48; if (l > m) { dx *= m / l; dy *= m / l; } joy.x = dx / m; joy.y = dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`; return; }
  const d = drags.get(e.pointerId); if (!d) return;
  if (drags.size >= 2) {   // pinch
    const [a, b] = [...drags.values()], before = hyp(a.x - b.x, a.y - b.y); d.x = e.clientX; d.y = e.clientY; const after = hyp(a.x - b.x, a.y - b.y);
    if (before > 0) cam.goalDist = clamp((cam.goalDist * before) / after, 7, zoomMax()); return;
  }
  cam.yaw -= (e.clientX - d.x) * 0.006; cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * 0.004, pitchMin(), 1.25); d.x = e.clientX; d.y = e.clientY;
});
const up = (e) => {
  const tp = taps.get(e.pointerId); taps.delete(e.pointerId);
  if (tp && e.type === "pointerup" && hyp(e.clientX - tp.x, e.clientY - tp.y) < 10 && performance.now() - tp.t < 400) tapAt(e.clientX, e.clientY);
  if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; joyEl.style.display = "none"; } drags.delete(e.pointerId); };
canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
canvas.addEventListener("wheel", (e) => { e.preventDefault(); cam.goalDist = clamp(cam.goalDist * Math.exp(e.deltaY * 0.001), 7, zoomMax()); }, { passive: false });
const typing = () => { const a = document.activeElement; return !!a && a.tagName === "INPUT" && a.offsetParent !== null; };
addEventListener("keydown", (e) => {
  if (typing()) return;
  if (talk) {   // talking: Space, Enter or F goes on, 1-4 picks an answer, Escape walks away
    e.preventDefault(); if (e.repeat) return;
    if (e.code === "Escape") endTalk(); else if (e.code === "Space" || e.code === "Enter" || e.code === "NumpadEnter" || e.code === "KeyF") talkNext(); else if (/^(Digit|Numpad)[1-9]$/.test(e.code)) talkPick(+e.code.slice(-1) - 1);
    return;
  }
  keys.add(e.code); if (e.code === "Escape") { if (building) closeBuild(); if (wedit) closeWorldEdit(); closePanels(); }
  if (e.code === "KeyR" && wedit) weditTurn();
  if ((e.code === "Delete" || e.code === "Backspace") && wedit) weditDeleteSel();
  if ((e.code === "Enter" || e.code === "Slash") && loggedIn) { e.preventDefault(); openChat(); }
  if (e.code === "Space") { e.preventDefault(); if (!e.repeat) jumpQueued = performance.now() + 150; }   // (owner, 2026-11-08) a press each time, never held (a flier holds it: step)
  if (e.code === "KeyF") runAct("E"); if (e.code === "KeyE") runAct("E"); if (e.code === "KeyG") runAct("G"); if (e.code === "KeyR" && building) turnBuild(e.shiftKey ? -15 : 15); if ((e.code === "Delete" || e.code === "Backspace") && building) deleteSel();
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ---- the HUD and panels ----
const fmt = (n) => Math.floor(n).toLocaleString();
let deliveryNoticeTimer = 0;
function deliveryNotice(left) { const el = $("delivery"), count = $("delivery-count"); count.textContent = left + " package" + (left === 1 ? "" : "s") + " left"; el.style.display = "flex"; clearTimeout(deliveryNoticeTimer); deliveryNoticeTimer = setTimeout(() => { el.style.display = "none"; }, 1200); }
function toast(txt, color) { const d = document.createElement("div"); d.textContent = txt; if (color) d.style.color = color; $("toast").appendChild(d); setTimeout(() => d.remove(), 1700); }
const CANDY = `<svg class="ico" viewBox="0 0 24 24"><path d="M2 8l4 4-4 4zM22 8l-4 4 4 4z" fill="#ff9ccf" stroke="#a3226a" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="12" r="6" fill="#ff5aa0" stroke="#a3226a" stroke-width="1.5"/><path d="M9 9.5c2 1 4 3 6 5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`;
let hudKey = "", windKey = "";
function hud() {
  const p = riding(), cap = petBag(p), c = contract, left = c ? Math.max(0, Math.ceil((c.ends - performance.now()) / 1000)) : 0;
  const packageLeft = packageEvent ? Math.max(0, Math.ceil((packageEvent.ends - performance.now()) / 1000)) : 0;
  const key = [Math.floor(save.coins), me.bag.length, cap, online, netOk, save.items.snack, save.items.ribbon, save.items.ticket, me.boostUntil > performance.now(), me.stars, c && [c.done, c.goal, c.mine, left, c.kind], packageEvent && [packageEvent.boxes.size, packageLeft]].join("|");
  // (owner, 2026-11-09) the wind: an arrow the way it blows (turned with the camera) and its speed; hidden inside
  const wf = -WIND.x * Math.sin(cam.yaw) - WIND.z * Math.cos(cam.yaw), wr = WIND.x * Math.cos(cam.yaw) - WIND.z * Math.sin(cam.yaw);
  const rideWind = windRideFactor(moveKind(), me.airborne && me.moving, Math.sin(me.yaw), Math.cos(me.yaw)), pct = Math.round((rideWind - 1) * 100);
  const windOn = !me.inst && !me.foot && (moveKind() === "fly" || moveKind() === "glide");   // (owner, 2026-11-09) only on a pet the wind moves
  const wkey = !windOn ? "-" : Math.round(windNow.mph) + "|" + Math.round(Math.atan2(wr, wf) * 180 / Math.PI / 3) * 3 + "|" + pct;
  if (wkey !== windKey) { windKey = wkey; $("windp").style.display = windOn ? "inline-flex" : "none"; if (windOn) { const [mph, deg, effect] = wkey.split("|"); $("windn").textContent = mph + " mph"; $("winde").textContent = +effect ? (+effect > 0 ? "+" : "") + effect + "%" : ""; $("windp").classList.toggle("tailwind", +effect > 0); $("windp").classList.toggle("headwind", +effect < 0); $("winda").style.transform = `rotate(${deg}deg)`; } }
  if (key === hudKey) return; hudKey = key;
  if (openPanel === "p-shop" && Math.floor(save.coins) !== shopCoins) renderShop();
  $("coins").textContent = fmt(save.coins); $("bagn").textContent = me.bag.length + "/" + cap;
  $("onlinen").textContent = online; $("net").classList.toggle("on", netOk); chatIn.disabled = !netOk;
  $("wanted").style.display = me.stars ? "inline-flex" : "none"; $("wanted").textContent = "★".repeat(me.stars) + "☆".repeat(World.WANTED_MAX - me.stars);
  $("contract").style.display = c ? "flex" : "none";
  if (c) { $("cname").textContent = (CONTRACTS.find((k) => k.id === c.kind) || CONTRACTS[2]).name; $("ctime").textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0"); $("cbar").style.width = Math.min(100, (c.done / c.goal) * 100) + "%"; $("cdone").textContent = c.done + " / " + c.goal; $("cmine").textContent = "You: " + c.mine; }
  $("packageevent").style.display = packageEvent ? "inline-flex" : "none";
  if (packageEvent) $("packageleft").textContent = packageEvent.boxes.size + " · " + Math.floor(packageLeft / 60) + ":" + String(packageLeft % 60).padStart(2, "0");
  // (owner, 2026-11-09: candy couldn't be tapped while moving on a phone) one candy button, kept, only its count and state change
  let cb = $("candybtn"); if (!cb) { cb = document.createElement("button"); cb.id = "candybtn"; cb.className = "btn gold"; cb.type = "button"; cb.title = ITEMS.snack.name; cb.addEventListener("pointerdown", (e) => { e.preventDefault(); if (!cb.disabled) useSnack(); }); $("items").appendChild(cb); }
  cb.style.display = save.items.snack > 0 ? "" : "none"; cb.innerHTML = `${CANDY}<span class="n">${save.items.snack}</span>`; cb.disabled = me.boostUntil > performance.now();
}
const panels = ["p-pets", "p-shop", "p-train", "p-board", "p-trade", "p-build", "p-admin", "p-settings"];
let openPanel = null;
function show(id) { if (id === "p-train" && !inArena()) return; showPanel(id); }   // (owner, 2026-11-09) the arena is an E prompt in the yard, not a teleport
function showPanel(id) { for (const p of panels) $(p).style.display = p === id ? "block" : "none"; openPanel = id; if (id === "p-pets") renderPets(); if (id === "p-shop") renderShop(); if (id === "p-train") renderTrain(); if (id === "p-board") renderBoard(); if (id === "p-trade") renderTrade(); if (id === "p-build") renderPenPick(); if (id === "p-admin") renderAdmin(); if (id === "p-settings") renderSettings(); }
function closePanels() { if (openPanel === "p-trade" && trading) netSend({ t: "trade_cancel" }); for (const p of panels) $(p).style.display = "none"; openPanel = null; }
for (const p of panels) $(p).querySelector(".x").onclick = closePanels;
$("btn-pets").onclick = () => (openPanel === "p-pets" ? closePanels() : show("p-pets"));
function renderSettings() { const el = $("settings"); el.innerHTML = ""; const label = document.createElement("label"); label.className = "setting"; const input = document.createElement("input"); input.type = "checkbox"; input.checked = !!save.settings.followArrowWhenEmpty; input.onchange = () => { save.settings.followArrowWhenEmpty = input.checked; persist(); }; label.append(input, document.createTextNode("Show the follow arrow when the bag is empty")); el.appendChild(label); }
// (owner, 2026-11-09) the gear left of the chat: a menu with Settings and, for staff, the Admin Panel
const gearMenu = $("gearmenu");
$("gear").onclick = () => { gearMenu.style.display = gearMenu.style.display === "flex" ? "none" : "flex"; $("gm-admin").style.display = isStaff() ? "" : "none"; $("gm-world").style.display = myRole === "admin" ? "" : "none"; };
$("gm-logout").onclick = () => { gearMenu.style.display = "none"; flushSave(performance.now()); setTok(null); try { localStorage.setItem("petdelivery.claimed", "1"); } catch (e) { /* private mode */ } setTimeout(() => location.reload(), 150); };   // (owner, 2026-11-09) back to the login, to use or make another account
$("gm-settings").onclick = () => { gearMenu.style.display = "none"; openPanel === "p-settings" ? closePanels() : show("p-settings"); };
const WING = `<svg class="ico" viewBox="0 0 14 12" style="width:14px;height:12px;vertical-align:-1px"><path d="M1 10C3 3 8 1 13 1c-1 5-5 9-12 9z" fill="#3a8ee6"/></svg>`;
// (owner, 2026-11-08: make fliers and gliders obvious) a coloured badge on every card: Flier (sky blue, flapping wings)
// or Glider (teal, spread wings), and the card's frame in that colour
const GLIDE_ICO = `<svg class="ico" viewBox="0 0 24 14" style="width:20px;height:12px"><path d="M1 6c4-3 7-4 11-1 4-3 7-2 11 1-4 0-7 1-11 4C8 7 5 6 1 6z" fill="currentColor"/></svg>`;
const FLY_ICO = `<svg class="ico" viewBox="0 0 24 16" style="width:20px;height:14px"><path d="M12 13C9 6 5 2 1 2c1 5 4 9 11 11zm0 0c3-7 7-11 11-11-1 5-4 9-11 11z" fill="currentColor"/></svg>`;
const SWIM_ICO = `<svg class="ico" viewBox="0 0 24 14" style="width:20px;height:12px"><path d="M1 5c3-3 5-3 7 0s4 3 7 0 5-3 8 0M1 11c3-3 5-3 7 0s4 3 7 0 5-3 8 0" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>`;
// (owner, 2026-11-09) every pet is one of three types: Ground, Air (all flying pets fly; gliders became fliers) or Water
const GROUND_ICO = `<svg class="ico" viewBox="0 0 24 16" style="width:18px;height:12px"><path d="M1 15l7-11 4 6 3-4 8 9z" fill="currentColor"/></svg>`;
const petType = (sp) => (SPECIES[sp].fly ? "air" : SPECIES[sp].swim ? "water" : "ground");
const moveBadge = (sp) => { const t = petType(sp); return t === "air" ? `<span class="mbadge air">${FLY_ICO}Air</span>` : t === "water" ? `<span class="mbadge water">${SWIM_ICO}Water</span>` : `<span class="mbadge ground">${GROUND_ICO}Ground</span>`; };
function card(sp, lines, on, onclick) {
  const s = SPECIES[sp], d = document.createElement("div"); d.className = "card" + (on ? " on" : "") + " " + petType(sp);
  d.innerHTML = `<img alt="" src="${portrait(sp)}" width="84" height="84">${moveBadge(sp)}<span class="nm">${s.name}</span><span class="rar" style="color:${RARITY[s.r].c}">${RARITY[s.r].name}</span>${lines}`;
  if (onclick) d.onclick = onclick; return d;
}
const statLine = (p) => `<span class="stats"><span>Lv ${p.lv}</span><span>${petSpeed(p).toFixed(1)} m/s</span><span>${petBag(p)} bag</span></span>`;
const PEN = `<svg class="ico" viewBox="0 0 24 24"><path d="M3 20V9m6 11V9m6 11V9m6 11V9M2 12h20M2 17h20" stroke="#a0703f" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
function renderPets() {
  const el = $("petlist"), pens = World.penPets(save); el.innerHTML = "";
  for (const p of save.pets.slice().sort((a, b) => SPECIES[b.sp].r - SPECIES[a.sp].r || a.sp.localeCompare(b.sp) || petSpeed(b) - petSpeed(a))) {
    const t = save.treats[p.sp] || 0, penned = pens.has(p.id), d = card(p.sp, statLine(p) + (t ? `<span class="stats"><span>${TREAT} ${t}</span></span>` : "") + (penned ? `<span class="stats"><span>${PEN}</span></span>` : ""), p.id === save.ride, penned ? null : () => ride(p.id));
    if (penned) d.classList.add("off");
    if (p.id !== save.ride && !penned && save.pets.some((q) => q !== p && q.sp === p.sp)) {   // a spare: it can go to the farm
      const b = document.createElement("button"); b.className = "btn ghost small"; b.type = "button"; b.innerHTML = `Pet Farm +${tradeGives(p)} ${TREAT}`;
      b.onclick = (ev) => { ev.stopPropagation(); if (b.dataset.sure) trade(p); else { b.dataset.sure = 1; b.className = "btn gold small"; b.textContent = "Sure?"; } };
      d.appendChild(b);
    }
    el.appendChild(d);
  }
}
function trade(p) {
  if (p.id === save.ride || World.penPets(save).has(p.id) || !save.pets.some((q) => q !== p && q.sp === p.sp)) return;
  const n = tradeGives(p), name = SPECIES[p.sp].name;
  save.pets = save.pets.filter((q) => q !== p); save.treats[p.sp] = (save.treats[p.sp] || 0) + n; persist();
  toast(name + " → Pet Farm", "#3fb36b"); toast("+" + n + " " + name + " Treats", "#a0703f");
  emitConfetti(me.x, me.y + 3, me.z, 50, 4, 7); renderPets();
}
function ride(id) {
  if (save.ride === id || World.penPets(save).has(id)) return; save.ride = id; persist(); mount(); netSend({ t: "pet", sp: riding().sp, lv: riding().lv });
  if (moveKind() !== "fly") cam.pitch = Math.max(cam.pitch, 0.18);
  if (!flies()) {   // island parcels need wings: they go back; off the town island, back to the plaza
    me.bag = me.bag.filter((i) => !houses[i].sky);
    if (!inside(me.x, me.z, 1.5)) { me.x = SPAWN.x; me.z = SPAWN.z; me.y = terrain(me.x, me.z); }
  }
  syncBeams(); if (openPanel === "p-pets") renderPets(); hudKey = "";
}
// (owner, 2026-11-09) the shops share one window in the middle of the screen, showing your coins and each item's price
const SHOPS = { egg: "Egg Shop" };
let shopKind = "egg", shopCoins = -1;
function renderShop() {
  $("shopname").textContent = SHOPS[shopKind]; shopCoins = Math.floor(save.coins); $("shopcash").textContent = fmt(save.coins);
  const el = $("shopitems"); el.innerHTML = "";
  for (const egg of EGGS) {
    const d = document.createElement("div"); d.className = "card";
    d.innerHTML = `<svg width="84" height="84" viewBox="0 0 84 84"><ellipse cx="42" cy="46" rx="24" ry="31" fill="${egg.c}" stroke="${egg.s}" stroke-width="4"/><circle cx="34" cy="38" r="4" fill="${egg.s}"/><circle cx="50" cy="52" r="5" fill="${egg.s}"/></svg><span class="nm">${egg.name}</span>`
      + `<span class="stats">${egg.odds.map((o, r) => (o ? `<span style="color:${RARITY[r].c}">${o}%</span>` : "")).join("")}</span>`;
    const b = document.createElement("button"); b.className = "btn gold"; b.type = "button"; b.innerHTML = `<span class="coin" style="display:inline-block;vertical-align:-3px"></span> ${fmt(egg.price)}`; b.disabled = save.coins < egg.price; b.onclick = (ev) => { ev.stopPropagation(); buyEgg(egg, false); }; d.appendChild(b);
    if (save.pets.length >= World.petCap(save)) { b.disabled = true; b.textContent = "Full"; }
    if (egg.id === "basic" && save.items.ticket > 0) { const t = document.createElement("button"); t.className = "btn"; t.type = "button"; t.textContent = ITEMS.ticket.name + " ×" + save.items.ticket; t.onclick = (ev) => { ev.stopPropagation(); buyEgg(egg, true); }; if (intro && intro.stage === "egg") t.classList.add("glow"); d.appendChild(t); }
    el.appendChild(d);
  }
}
function buyEgg(egg, ticket) {
  if (ticket ? save.items.ticket <= 0 : save.coins < egg.price) return;
  if (save.pets.length >= World.petCap(save)) return;   // (owner, 2026-11-08) beds hold more pets
  if (ticket) save.items.ticket--; else save.coins -= egg.price;
  let roll = Math.random() * 100, r = 0; while (r < RARITY.length - 1 && roll >= egg.odds[r]) { roll -= egg.odds[r]; r++; }
  const sp = pick(Object.keys(SPECIES).filter((k) => SPECIES[k].r === r)), p = { id: save.nextId++, sp, lv: 1 };
  save.pets.push(p); persist(); hatch(p, egg);
}
// (owner, 2026-11-08) hatching: the egg shakes harder and cracks, then bursts in a flash of fireworks to the pet, rays
// behind it in its rarity's color
function hatch(p, egg) {
  const s = SPECIES[p.sp], rc = RARITY[s.r].c; $("hatchn").innerHTML = s.name + " " + moveBadge(p.sp); $("hatchr").textContent = RARITY[s.r].name; $("hatchr").style.color = rc;
  const c = $("hatchc"), g = c.getContext("2d"), img = new Image(); img.src = portrait(p.sp);
  $("hatch").style.display = "flex"; $("hatchok").style.visibility = "hidden"; $("hatchno").style.visibility = "hidden"; $("hatchn").style.visibility = "hidden"; $("hatchr").style.visibility = "hidden";
  const t0 = performance.now(), parts = []; let burst = 0, lastT = 0;
  const pop = (x, y, n, sp, cols) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1 + Math.random() * 0.6, c: pick(cols), r: 3 + Math.random() * 5, star: Math.random() < 0.3 }); } };
  const cols = s.r === 2 ? ["#ffd35a", "#ffb020", "#fff4c0", "#ff7ac8"] : s.r === 1 ? ["#7fc0ff", "#3a8ee6", "#fff", "#3fb36b"] : PARTY;
  const anim = () => {
    const t = (performance.now() - t0) / 1000, dt = t - lastT; lastT = t; g.clearRect(0, 0, 440, 440);
    if (t < 1.6) {   // shaking harder and harder, cracks spreading
      const k = t / 1.6, sh = Math.sin(t * (18 + k * 30)) * (0.06 + k * 0.22);
      g.save(); g.translate(220 + Math.sin(t * 50) * k * 4, 260); g.rotate(sh); g.fillStyle = egg.c; g.strokeStyle = egg.s; g.lineWidth = 10; g.beginPath(); g.ellipse(0, 0, 110, 145, 0, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = "#5a4a2a"; g.lineWidth = 5; g.beginPath(); const cr = Math.min(1, k * 1.6); g.moveTo(-90 * cr, -10); for (let i = 0; i <= 6; i++) g.lineTo(-90 * cr + i * 30 * cr, i % 2 ? -30 : 0); g.stroke(); g.restore();
      requestAnimationFrame(anim); return;
    }
    if (!burst) { burst = 1; pop(220, 240, 160, 520, cols); pop(220, 240, 40, 260, ["#ffffff"]); }
    if (burst === 1 && t > 1.95) { burst = 2; pop(110, 140, 70, 360, cols); pop(330, 120, 70, 360, cols); }
    if (burst === 2 && t > 2.3 && s.r >= 1) { burst = 3; pop(220, 90, 90, 420, cols); pop(80, 300, 50, 300, cols); pop(360, 320, 50, 300, cols); }
    // rays
    g.save(); g.translate(220, 230); g.rotate(t * 0.6); g.globalAlpha = Math.min(0.55, (t - 1.6) * 2); g.fillStyle = rc;
    for (let i = 0; i < 12; i++) { g.rotate(TAU / 12); g.beginPath(); g.moveTo(0, 0); g.lineTo(-22, -260); g.lineTo(22, -260); g.fill(); }
    g.restore();
    // the flash
    const fl = Math.max(0, 1 - (t - 1.6) * 3); if (fl > 0) { g.fillStyle = `rgba(255,255,255,${fl})`; g.fillRect(0, 0, 440, 440); }
    const k = Math.min(1, (t - 1.6) * 3), bob = Math.sin(t * 3) * 6; g.drawImage(img, 220 - 200 * k, 230 - 200 * k + bob, 400 * k, 400 * k);
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life -= dt; if (q.life <= 0) { parts.splice(i, 1); continue; }
      q.vy += 260 * dt; q.vx *= 1 - dt * 1.5; q.vy *= 1 - dt * 1.5; q.x += q.vx * dt; q.y += q.vy * dt;
      g.globalAlpha = Math.min(1, q.life * 1.5); g.fillStyle = q.c;
      if (q.star) { g.save(); g.translate(q.x, q.y); g.rotate(t * 4); g.beginPath(); for (let j = 0; j < 10; j++) { const rr = j % 2 ? q.r * 0.45 : q.r * 1.4; g.lineTo(Math.cos(j * Math.PI / 5) * rr, Math.sin(j * Math.PI / 5) * rr); } g.fill(); g.restore(); }
      else { g.beginPath(); g.arc(q.x, q.y, q.r, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
    }
    if (t > 1.7) { $("hatchn").style.visibility = "visible"; $("hatchr").style.visibility = "visible"; $("hatchok").style.visibility = "visible"; $("hatchno").style.visibility = "visible"; }
    if (t < 5 || parts.length) requestAnimationFrame(anim);
  };
  anim();
  // (owner, 2026-11-09) Not now keeps you on the pet you're riding; the new one waits in your Pets list
  const done = (go) => {
    $("hatch").style.display = "none"; if (go) ride(p.id); if (openPanel === "p-shop") renderShop(); if (intro && intro.stage === "egg") introGo("bye");
    emitConfetti(me.x, me.y + 3, me.z, 90, 6, 9); firework(me.x - 4, me.y + 2, me.z); if (s.r >= 1) { firework(me.x + 4, me.y + 2, me.z, 0.3); firework(me.x, me.y + 2, me.z - 4, 0.6, [rc, "#ffffff"]); }
  };
  $("hatchok").onclick = () => done(true); $("hatchno").onclick = () => done(false);
}
function renderTrain() {
  const p = riding(), el = $("train"), max = p.lv >= MAXLV;
  el.innerHTML = ""; el.appendChild(card(p.sp, statLine(p) + `<span class="stats"><span>${max ? "Lv " + MAXLV : `★ ${p.tp || 0}/${trainNeed(p.lv)}`}</span></span>`, true));
  const row = document.createElement("div"); row.className = "row2";
  const t = save.treats[p.sp] || 0;
  if (t > 0 && !max) { const r = document.createElement("button"); r.className = "btn gold"; r.type = "button"; r.innerHTML = `${TREAT} ${treatCost(p)} <span class="n">${t}</span>`; r.title = SPECIES[p.sp].name + " Treats"; r.disabled = t < treatCost(p); r.onclick = () => train("treat"); row.appendChild(r); }
  if (save.items.ribbon > 0 && !max) { const r = document.createElement("button"); r.className = "btn"; r.type = "button"; r.textContent = ITEMS.ribbon.name + " ×" + save.items.ribbon; r.onclick = () => train("ribbon"); row.appendChild(r); }
  el.appendChild(row);
}
function train(how) {
  const p = riding(); if (p.lv >= MAXLV) return;
  if (how === "ribbon" || how === true) { if (save.items.ribbon <= 0) return; save.items.ribbon--; }
  else if (how === "treat") { const c = treatCost(p); if ((save.treats[p.sp] || 0) < c) return; save.treats[p.sp] -= c; }
  else if (how !== "points") return;
  p.lv++; persist(); mount(); netSend({ t: "pet", sp: p.sp, lv: p.lv }); toast(SPECIES[p.sp].name + " Lv " + p.lv, "#3fb36b"); if (openPanel === "p-train") renderTrain();
  emitSparks(me.x, me.y + 1.5, me.z, 50, 6, ["#3fb36b", "#ffd35a", "#ffffff"], 1.1, -3); emitConfetti(me.x, me.y + 2, me.z, 30, 3, 6);
}
function useSnack() { if (save.items.snack <= 0 || me.boostUntil > performance.now()) return; save.items.snack--; persist(); me.boostUntil = performance.now() + SNACK_TIME * 1000; toast(ITEMS.snack.name, ITEMS.snack.c); emitSparks(me.x, me.y + 1, me.z, 30, 5, ["#ff5aa0", "#ffffff"], 0.8, 0); hudKey = ""; }

// ---- contracts: an order you work on alone, or with your party when you're in one (owner, 2026-11-10; not the room): deliver the goal in parcels before the time's up; the
// reward is split by how many each player delivered. Falling short, whoever delivered gets something for trying: a
// Training Ribbon at 75% of the goal, 3 Speed Candies at 40% (owner, 2026-11-08). Online the server runs it; offline you
// run it alone. ----
let contract = null;   // { kind, goal, done, mine, ends, pool }
const CONTRACTS = [
  { id: "rush", name: "Rush Order", time: 150, base: 3, per: 3, pay: 22 },   // (owner, 2026-11-08: more time)
  { id: "quick", name: "Quick Contract", time: 240, base: 5, per: 4, pay: 26 },
  { id: "big", name: "Big Contract", time: 420, base: 10, per: 8, pay: 30 },
];
function renderBoard() {
  const el = $("board"); el.innerHTML = "";
  const n = netOk && party.length > 1 ? party.length : 1;
  for (const k of CONTRACTS) {
    const running = contract && contract.kind === k.id, goal = running ? contract.goal : k.base + k.per * n, pool = running ? contract.pool : goal * k.pay;
    const d = document.createElement("div"); d.className = "card wide"; d.style.cursor = "default";
    d.innerHTML = `<svg width="56" height="56" viewBox="0 0 84 84"><rect x="14" y="22" width="56" height="44" rx="6" fill="#c98b4f" stroke="#8a5a2b" stroke-width="4"/><path d="M14 36h56M42 22v44" stroke="#8a5a2b" stroke-width="4"/></svg>`
      + `<span class="col"><span class="nm">${k.name}</span><span class="stats"><span>${running ? contract.done + " / " : ""}${goal}</span><span>${Math.floor(k.time / 60)}:${String(k.time % 60).padStart(2, "0")}</span><span><span class="coin" style="display:inline-block;width:12px;height:12px;vertical-align:-2px"></span> ${fmt(pool)}</span></span></span>`;
    if (!contract) { const b = document.createElement("button"); b.className = "btn gold"; b.type = "button"; b.textContent = "Start"; b.onclick = () => startContract(k.id); d.appendChild(b); }
    el.appendChild(d);
  }
}
function startContract(kind = "big") {
  if (contract) return;
  const k = CONTRACTS.find((q) => q.id === kind) || CONTRACTS[2];
  if (netOk) netSend({ t: "start", kind: k.id });
  else { const goal = k.base + k.per; contract = { kind: k.id, goal, done: 0, mine: 0, ends: performance.now() + k.time * 1000, pool: goal * k.pay, local: true }; banner(k.name + "!", "#ffd35a"); }
  renderBoard(); hudKey = "";
}
function contractStep() {
  if (!contract || !contract.local) return;
  if (contract.done >= contract.goal) { const c = contract; contract = null; contractOver(true, c.pool, 1, true); }
  else if (performance.now() > contract.ends) { const c = contract; contract = null; contractOver(false, 0, c.done / c.goal, c.mine > 0); }
}
function contractOver(won, payN, progress, helped) {
  hudKey = ""; if (openPanel === "p-board") renderBoard();
  if (won) {
    if (payN > 0) { save.coins += payN; persist(); toast("+" + fmt(payN), "#e08a00"); }
    banner("Contract complete!", "#ffd35a");
    for (let k = 0; k < 7; k++) firework(me.x + (Math.random() - 0.5) * 16, me.y + 1, me.z + (Math.random() - 0.5) * 16, k * 0.35);
    emitConfetti(me.x, me.y + 5, me.z, 160, 7, 10);
    return;
  }
  banner("Time's up", "#ffffff");
  if (!helped) return;
  if (progress >= 0.75) { save.items.ribbon++; persist(); toast(ITEMS.ribbon.name, ITEMS.ribbon.c); emitConfetti(me.x, me.y + 3, me.z, 40, 4, 7); }
  else if (progress >= 0.4) { save.items.snack += 3; persist(); toast("3× " + ITEMS.snack.name, ITEMS.snack.c); emitConfetti(me.x, me.y + 3, me.z, 30, 4, 7); }
  hudKey = "";
}

// ---- delivering: the post office fills my bag with parcels for houses around town (and, on a flier, the islands);
// riding up to a house's mailbox delivers its parcel: coins (more the further from the post office, double on an
// island, more with a wanted level) and sometimes an item ----
const STAR_PAY = 0.2;
function fillBag() {
  const cap = petBag(riding()), before = me.bag.length; if (before >= cap || !houses.length) return;   // (owner, 2026-11-10) no mailboxes yet: nothing to take
  // (owner, 2026-11-08) how far parcels go: a new courier's stay near the post office; the faster your best pet of the
  // kind you're riding (land pets, or fliers and gliders), the further out they go. Riding a flier or glider some go to
  // islands in reach (any on a flapping flier, only the low ones off the edge on a glider).
  const kind = moveKind(), air = kind !== "land", taken = new Set(me.bag), far = reach(air);
  let town = houses.map((h, i) => i).filter((i) => !houses[i].sky && houses[i].d <= far);
  const isl = air ? houses.map((h, i) => i).filter((i) => houses[i].sky && houses[i].d <= far && (kind === "fly" || houses[i].base < 20)) : [];
  if (town.length < cap + 6) town = houses.map((h, i) => i).filter((i) => !houses[i].sky).sort((a, b) => houses[a].d - houses[b].d).slice(0, cap + 6);
  for (let tries = 0; me.bag.length < cap && tries < 500; tries++) { const i = isl.length && (!town.length || Math.random() < 0.3) ? pick(isl) : pick(town); if (i !== undefined && !taken.has(i)) { taken.add(i); me.bag.push(i); } }
  const got = me.bag.length - before; if (!got) return;   // (owner, 2026-11-10) every address already in the bag: nothing new, no "+"
  toast("+" + got); syncBeams(); hudKey = "";
  emitSparks(me.x, me.y + 2, me.z, 20, 4, ["#ffd35a", "#ffffff"], 0.7, -1, 0.8);
}
function reach(air) {
  const best = Math.max(0, ...save.pets.filter((p) => !!SPECIES[p.sp].fly === air).map(petSpeed));
  return air ? 90 + Math.max(0, best - 9) * 40 : 75 + Math.max(0, best - 7) * 32;
}
function deliver(i) {
  const h = houses[i]; me.bag.splice(me.bag.indexOf(i), 1); syncBeams(); deliveryNotice(me.bag.length); if (intro && intro.parcels && intro.parcels.includes(i)) intro.dl.push(i);
  const coins = Math.round((8 + Math.round(h.d / 10)) * (h.sky ? 2 : 1) * (1 + STAR_PAY * me.stars)); save.coins += coins; save.delivered++;
  toast("+" + coins, "#e08a00");
  emitConfetti(h.mx, h.my + 1.8, h.mz, h.sky ? 80 : 45, 4, 7); emitSparks(h.mx, h.my + 1.5, h.mz, 14, 5, ["#ffd35a", "#fff4c0"], 0.8, 2);
  if (h.sky) firework(h.mx, h.my + 1, h.mz);
  const r = Math.random();
  const item = r < 0.01 ? "ticket" : r < 0.05 ? "ribbon" : r < 0.17 ? "snack" : null;
  if (item) { save.items[item]++; toast(ITEMS[item].name, ITEMS[item].c); }
  persist(); hudKey = "";
  if (netOk) netSend({ t: "del" });
  if (contract && contract.local) { contract.done++; contract.mine++; }
}
// caught by animal control (owner, 2026-11-08): taken straight to the pound (no stun), parcels gone, wanted cleared
function caught() {
  me.stars = 0; endTalk();
  if (me.bag.length) { me.bag = []; syncBeams(); }
  me.x = RELEASE.x + (Math.random() - 0.5) * 10; me.z = RELEASE.z + (Math.random() - 0.5) * 3; me.y = terrain(me.x, me.z); cam.y = me.y; cam.yaw = Math.PI;
  toast("Caught!", "#e5534b"); emitSparks(me.x, me.y + 2, me.z, 24, 4, ["#ffd84a", "#ffffff"], 0.8, 1); hudKey = "";
  sendPos(true);
}

// ---- chat (owner, 2026-11-08; like Roblox's, 2026-11-09): the window at the top left holds the room's messages since
// you logged in, with the line to type in at its foot (/ or Enter, or a tap on it); left alone, its background fades.
// The chat button beside the gear shows or hides it. What you say also shows over your head. ----
const chatBar = $("chatbar"), chatIn = $("chatin"), rchat = $("rchat"), rmsgs = $("rmsgs");
const chatHist = [];
const NAME_COLORS = ["#fd2943", "#01a2ff", "#02b857", "#a75ff1", "#f5cd30", "#e8ac85", "#d7c59a", "#fd8c3c", "#4ec0c4", "#ff9be1"];
const nameColor = (n) => { let h = 0; for (const ch of String(n)) h = (h * 31 + ch.charCodeAt(0)) | 0; return NAME_COLORS[Math.abs(h) % NAME_COLORS.length]; };
let chatIdle = 0;
function chatWake() { rchat.classList.remove("idle"); clearTimeout(chatIdle); chatIdle = setTimeout(() => { if (document.activeElement !== chatIn && !rchat.matches(":hover")) rchat.classList.add("idle"); }, 6000); }
function openChat() { rchat.classList.remove("off"); $("chatbtn").classList.add("on"); chatWake(); chatIn.focus(); }
function closeChat() { chatIn.blur(); chatWake(); }
$("chatbtn").onclick = () => { const off = !rchat.classList.toggle("off"); $("chatbtn").classList.toggle("on", off); if (off) chatWake(); };
rchat.addEventListener("pointerenter", chatWake); rchat.addEventListener("pointerdown", chatWake);
chatIn.addEventListener("focus", chatWake); chatIn.addEventListener("blur", chatWake);
chatBar.addEventListener("submit", (e) => {
  e.preventDefault(); const text = chatIn.value.replace(/\s+/g, " ").trim().slice(0, 120); chatIn.value = "";
  if (text[0] === "/" && isStaff()) { slash(text); closeChat(); return; }   // (owner, 2026-11-09) staff commands
  if (text) { netSend({ t: "chat", text }); chatLine(save.name, text, true); myBubble = bubble(text, myBubble, mine.g, mine.top); }
  closeChat();
});
chatIn.addEventListener("keydown", (e) => { if (e.key === "Escape") closeChat(); e.stopPropagation(); });
function chatLine(name, text, mineToo) {
  chatHist.push({ name, text, mine: !!mineToo }); if (chatHist.length > 300) chatHist.shift();
  const d = document.createElement("div"), b = document.createElement("b"); b.textContent = name + ": "; b.style.color = nameColor(name); d.append(b, document.createTextNode(text));
  const atEnd = rmsgs.scrollTop + rmsgs.clientHeight >= rmsgs.scrollHeight - 8; rmsgs.appendChild(d); while (rmsgs.children.length > 120) rmsgs.firstChild.remove();
  if (atEnd) rmsgs.scrollTop = rmsgs.scrollHeight; chatWake();
}
chatWake();
// a speech bubble over a rider for a few seconds
function bubble(text, old, parent, top) {
  if (old) { parent.remove(old.s); clearTimeout(old.timer); }
  const c = document.createElement("canvas"); c.width = 512; c.height = 128; const g = c.getContext("2d");
  g.font = "700 30px system-ui, sans-serif"; const words = text.split(" "), lines = [""];
  for (const w of words) { const t = (lines[lines.length - 1] + " " + w).trim(); if (g.measureText(t).width > 460 && lines[lines.length - 1]) { if (lines.length === 2) { lines[1] += "…"; break; } lines.push(w); } else lines[lines.length - 1] = t; }
  const w = Math.min(500, Math.max(...lines.map((l) => g.measureText(l).width)) + 36), h = lines.length * 36 + 22;
  g.fillStyle = "rgba(255,255,255,.95)"; g.beginPath(); g.roundRect((512 - w) / 2, 116 - h, w, h - 10, 20); g.fill(); g.beginPath(); g.moveTo(244, 106); g.lineTo(256, 122); g.lineTo(268, 106); g.fill();
  g.fillStyle = "#23303b"; g.textAlign = "center"; g.textBaseline = "middle"; lines.forEach((l, i) => g.fillText(l, 256, 116 - h + 22 + i * 36));
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); s.scale.set(6, 1.5, 1); s.layers.set(1); s.renderOrder = 6; s.position.y = top + 2.4; parent.add(s);
  const o = { s }; o.timer = setTimeout(() => { parent.remove(s); if (myBubble === o) myBubble = null; }, 6000); return o;
}

// ---- co-op: everyone in a room sees the others riding; the server keeps your account and shares where everyone is,
// runs animal control, contracts, chat, parties and trades. A tab that's put away disconnects (and reconnects when it's
// back), and logging in again replaces the old connection, so nobody's left standing in town after they've gone. ----
// the game server: set in pets.html (<meta name="pets-server">, alongside its connect-src); a local copy uses its own host
const WS_URL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? `ws://${location.host}/pets` : (document.querySelector('meta[name="pets-server"]') || {}).content || "wss://play.atamus.io/pets";
let lastActual = 0;
let ws = null, netOk = false, myId = null, online = 1, retry = 1000, lastSent = 0, lastPos = "", hidden = document.hidden;
const others = new Map();   // id -> { name, sp, lv, shirt, stars, inst, buf, x, y, z, yaw, moving, m, tag, bub }
function netSend(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function connect() {
  if (ws || kicked) return;
  try { ws = new WebSocket(WS_URL); } catch (e) { ws = null; setTimeout(connect, retry); return; }
  const sock = ws;
  ws.onopen = () => {
    retry = 1000; $("lgo").disabled = $("lnew").disabled = false;
    if (pendingAuth) { netSend(pendingAuth); pendingAuth = null; }
    else if (getTok()) netSend(Object.assign({ t: "resume", token: getTok() }, meFields()));
    else showLogin();
  };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } onNet(m); };
  ws.onclose = () => {
    if (ws === sock) ws = null;
    const was = netOk; netOk = false; myId = null; clockOff = null; saving = false; for (const id of [...others.keys()]) dropOther(id); online = 1; if (contract && !contract.local) contract = null; setPackageEvent(null); hudKey = "";
    party = []; renderParty(); if (trading) { trading = null; if (openPanel === "p-trade") closePanels(); }
    if (building) closeBuild(); for (const id of [...plotState.keys()]) setPlot(id, 0); myPlot = -1;
    $("lgo").disabled = $("lnew").disabled = true;
    if (was && !hidden) toast("Offline");
    if (!kicked) { setTimeout(connect, retry); retry = Math.min(15000, retry * 2); }
  };
  ws.onerror = () => {};
}
// (owner, 2026-11-09) a tab that's put away (minimized, behind another window) stays in the game: you stop where you are
document.addEventListener("visibilitychange", () => {
  hidden = document.hidden;
  if (hidden) { keys.clear(); joy.id = null; joy.x = joy.y = 0; joyEl.style.display = "none"; drags.clear(); me.moving = false; sendPos(true); flushSave(true); } else { retry = 1000; last = performance.now(); connect(); }
});
addEventListener("pagehide", () => flushSave(true));

// ---- accounts (owner, 2026-11-08): a username and password; your pets, coins and home are kept on the server. This
// browser remembers you (a token) so you're logged straight back in. The first account made in a browser starts from
// the progress it had before accounts. ----
const TOKEN = "petdelivery.token";
let loggedIn = false, myName = "", rev = 0, saving = false, kicked = false, pendingAuth = null, lastSave = 0;
const getTok = () => { try { return localStorage.getItem(TOKEN); } catch (e) { return null; } };
const setTok = (t) => { try { if (t) localStorage.setItem(TOKEN, t); else localStorage.removeItem(TOKEN); } catch (e) { /* private mode */ } };
const ERR = { name: "Names are 3–16 letters, numbers or _", pass: "Passwords need at least 4 characters", taken: "That name is taken", wrong: "Wrong name or password", server: "Something went wrong", kicked: "Logged in somewhere else" };
function showLogin(msg) { $("login").style.display = "flex"; $("lerr").textContent = msg || ""; }
function meFields() { return { sp: riding().sp, lv: riding().lv, shirt: save.shirt, x: me.x, y: me.y, z: me.z }; }
function authSend(kind) {
  const m = Object.assign({ t: kind, user: $("luser").value.trim(), pass: $("lpass").value }, meFields());
  if (kind === "register") { try { if (!localStorage.getItem("petdelivery.claimed")) { const local = JSON.parse(localStorage.getItem(SAVE)); if (local) m.data = local; } } catch (e) { /* none */ } }
  $("lerr").textContent = ""; kicked = false; registering = kind === "register";
  if (ws && ws.readyState === 1) netSend(m); else { pendingAuth = m; connect(); }
}
let registering = false;
$("login").addEventListener("submit", (e) => { e.preventDefault(); authSend("login"); });
$("lnew").onclick = () => authSend("register");
// what I've changed goes to the server: one save at a time, built on the copy it last confirmed
function flushSave(now) {
  if (!loggedIn || saving || !saveDirty || !netOk) return;
  if (!now && performance.now() - lastSave < 1500) return;
  saving = true; saveDirty = false; lastSave = performance.now();
  const d = Object.assign({}, save); delete d.name; netSend({ t: "save", rev, data: d });
}
function adopt(data, r) {
  save = Object.assign(World.cleanData(data, SPECIES_SET), { name: myName }); rev = r; saveDirty = false;
  mount(); if (!SPECIES[riding().sp].fly) me.bag = me.bag.filter((i) => !houses[i].sky);
  syncBeams(); hudKey = ""; uiKey = ""; if (openPanel && openPanel !== "p-trade") show(openPanel);
  refreshMyPlot();
}

function nameTag(name, stars) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 96; const g = c.getContext("2d");
  g.font = "800 30px system-ui, sans-serif"; const w = Math.min(250, g.measureText(name).width + 28);
  g.fillStyle = "rgba(255,255,255,.92)"; g.beginPath(); g.roundRect((256 - w) / 2, 42, w, 44, 22); g.fill(); g.fillStyle = "#23303b"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(name, 128, 65);
  if (stars) { g.font = "800 30px system-ui, sans-serif"; g.fillStyle = "#e5534b"; g.strokeStyle = "#fff"; g.lineWidth = 6; const st = "★".repeat(stars); g.strokeText(st, 128, 20); g.fillText(st, 128, 20); }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); s.scale.set(4, 1.5, 1); s.layers.set(1); s.renderOrder = 5; return s;
}
function addOther(p) {
  if (p.id === myId) return; const old = others.get(p.id); dropOther(p.id);
  const sp = SPECIES[p.sp] ? p.sp : "pup", m = petModel(sp, p.shirt || "#3a8ee6"), lv = clamp(p.lv | 0, 1, MAXLV), sc = petScale(lv); sizePet(m, sc); const stars = p.stars || 0, tag = nameTag(String(p.name || "Courier").slice(0, 18), stars);
  tag.position.y = m.top + 1.2; m.g.add(tag); const y = Number.isFinite(p.y) ? p.y : terrain(p.x, p.z); m.g.position.set(p.x, y, p.z); scene.add(inColor(m.g)); blobUnder(m.g, 2.2 * (m.k || 1));
  others.set(p.id, { name: p.name, sp, lv, shirt: p.shirt, stars, inst: p.inst || 0, buf: old ? old.buf : [], x: p.x, y, z: p.z, yaw: p.yaw || 0, moving: false, m, tag, bub: null });
}
function dropOther(id) { const o = others.get(id); if (!o) return; scene.remove(o.m.g); if (o.walker) scene.remove(o.walker.g); if (o.bub) clearTimeout(o.bub.timer); others.delete(id); }
function setContract(c) {
  const before = contract;
  contract = c ? { kind: c.kind || "big", goal: c.goal, done: c.done, mine: c.mine || 0, ends: performance.now() + c.left * 1000, pool: c.pool } : null;
  if (!before && contract) banner((CONTRACTS.find((k) => k.id === contract.kind) || CONTRACTS[2]).name + "!", "#ffd35a");
  hudKey = ""; if (openPanel === "p-board") renderBoard();
}
function onNet(m) {
  switch (m.t) {
    case "welcome": {
      if (stale(m.web, false, m.by)) return;
      if (m.world) { World.setWorld(m.world); buildWorldView(); }
      sentPet = "";   // tell the room again what I ride once I'm in
      setTok(m.token); if (registering) { try { localStorage.setItem("petdelivery.claimed", "1"); } catch (e) { /* private mode */ } registering = false; }
      const again = loggedIn && myName === m.name; myName = m.name; myId = m.id; netOk = true; loggedIn = true; $("login").style.display = "none"; if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (again && saveDirty && m.rev === rev) { save.name = myName; flushSave(true); } else adopt(m.data, m.rev);   // back after a drop: my unsaved progress goes up
      if (!again) { chatHist.length = 0; rmsgs.innerHTML = ""; }   // a fresh login starts a fresh chat history
      myRole = m.role || "player";
      setEnvironment(m.environment);
      isVip = !!m.vip; for (const id of [...plotState.keys()]) setPlot(id, 0); myPlot = m.plot >= 0 ? m.plot : -1;
      for (const q of m.plots || []) if (q.id !== myId) setPlot(q.plot, q.id, q.name, q.pieces, q.penSp, q.ext); refreshMyPlot();
      for (const p of m.players) addOther(p); online = m.players.length + 1; setContract(m.contract); setPackageEvent(m.packageEvent, !!m.packageEvent); me.stars = m.stars || 0; hudKey = ""; uiKey = "";
      break;
    }
    case "auth_err": if (m.why === "expired") { setTok(null); showLogin(); } else showLogin(m.why === "banned" ? banText(m.until) : ERR[m.why] || ERR.server); break;
    case "kicked": kicked = true; loggedIn = false; showLogin(m.why === "kick" ? "Kicked" : m.why === "banned" ? banText(m.until) : ERR.kicked); break;
    case "muted": if (m.until) toast(m.until === -1 ? "Muted" : "Muted " + untilText(m.until), "#e5534b"); break;
    case "role": myRole = m.role; uiKey = ""; break;
    case "admin_list": adminList = m.list; setEnvironment(m.environment); renderAdmin(); break;
    case "admin_msg": toast(m.msg); break;
    case "admin_data": if (editTo && editTo.id === m.id) { editData = m.data; renderAdmin(); } break;
    case "environment": setEnvironment(m.environment); break;
    case "saved": rev = m.rev; saving = false; break;
    case "data": saving = false; adopt(m.data, m.rev); break;
    case "join": addOther(m.p); online = others.size + 1; hudKey = ""; break;
    case "leave": dropOther(m.id); online = others.size + 1; hudKey = ""; break;
    case "snap":
      serverTime(m.ts);
      for (const [id, x, z, yaw, mv, y, st, inst, ct, ft] of m.ps) {
        const o = others.get(id); if (!o) continue; o.foot = !!ft;
        if ((inst || 0) !== o.inst) { o.inst = inst || 0; o.buf.length = 0; o.snap = true; }
        // stamped with the sender's own clock: how far it is from mine, from the quickest-arriving updates
        const t = ct || m.ts, est = performance.now() - t;
        if (o.off === undefined || est < o.off || o.ctMode !== !!ct) { o.off = est; o.ctMode = !!ct; } else o.off += (est - o.off) * 0.005;
        // a sample stamped by the server's clock (sent before their first position) can't be ordered against ones on
        // their own clock: start the buffer again, or every later sample looks older and they freeze (issue #7)
        const lastS = o.buf[o.buf.length - 1]; if (lastS && lastS.c !== !!ct) o.buf.length = 0;
        pushSample(o.buf, t, { x, y: Number.isFinite(y) ? y : terrain(x, z), z, yaw, mv: !!mv, c: !!ct }); o.moving = !!mv;
        if ((st || 0) !== o.stars) { o.stars = st || 0; o.m.g.remove(o.tag); o.tag = nameTag(String(o.name || "Courier").slice(0, 18), o.stars); o.tag.position.y = o.m.top + 1.2; o.m.g.add(o.tag); }
      }
      break;
    case "veh": serverTime(m.ts); m.v.forEach((r, i) => { const h = vehs[i]; if (!h) return; pushSample(h.buf, m.ts, r.length > 6 ? { x: r[0], y: r[1], z: r[2], yaw: r[3], ba: r[6], bd: r[7] } : { x: r[0], y: r[1], z: r[2], yaw: r[3] }); h.mode = r[4]; h.target = r[5]; }); break;
    case "pet": { const o = others.get(m.id); if (o) addOther({ id: m.id, name: o.name, sp: m.sp, lv: m.lv, shirt: o.shirt, stars: o.stars, inst: o.inst, x: o.x, y: o.y, z: o.z, yaw: o.yaw }); break; }
    case "fx": { const o = others.get(m.id); if (o && o.inst === me.inst) emitConfetti(o.x, o.y + 2.5, o.z, 35, 4, 7); break; }
    case "chat": { const o = others.get(m.id); chatLine(o ? o.name : m.name, m.text); if (o) o.bub = bubble(m.text, o.bub, o.m.g, o.m.top); break; }
    case "chase": case "caught": case "escaped": case "stars": onVehEvent(m.t, m.stars || 0); break;
    case "reload": stale(m.web, true, m.by); break;
    case "contract": setContract(m.c); break;
    case "world": if (m.all) World.setWorld(m.all); else if (m.edits) World.applyEdits(m.edits); buildWorldView(); break;
    case "done": contractOver(m.won, m.pay || 0, m.progress || 0, !!m.helped); break;
    case "package_event": setPackageEvent(m.event, !!m.event); break;
    case "package_taken": if (packageEvent) packageEvent.boxes.delete(m.id); dropPrize(m.id); hudKey = ""; break;
    case "package_reward": { const text = rewardText(m.reward); eventFlash("Prize package!", text); toast(text, "#8b3fbd"); emitConfetti(me.x, me.y + 3, me.z, 90, 5, 9); firework(me.x, me.y + 2, me.z, 0, ["#c75cff", "#ffd84a", "#ffffff"]); hudKey = ""; break; }
    case "invited": invites.push({ from: m.from, name: m.name, kind: m.kind, until: performance.now() + 28000 }); renderInvite(); break;
    case "declined": toast(m.name + " ✕"); break;
    case "party": party = m.members || []; renderParty(); uiKey = ""; break;
    case "trade": { const first = !trading; trading = m; if (first) { offer = { pets: new Set(), coins: 0 }; show("p-trade"); } else if (openPanel === "p-trade") renderTrade(); break; }
    case "trade_end": trading = null; if (openPanel === "p-trade") closePanels(); toast(m.done ? "Traded!" : "Trade cancelled", m.done ? "#3fb36b" : undefined); if (m.done) emitConfetti(me.x, me.y + 3, me.z, 60, 4, 7); break;
    case "plot": if (m.id !== myId) setPlot(m.plot, m.id, m.name, m.pieces, m.penSp, m.ext); break;
    case "myplot": if (myPlot >= 0 && myPlot !== m.plot) setPlot(myPlot, 0); myPlot = m.plot; refreshMyPlot(); break;   // (owner, 2026-11-10) my town house changed (the old one was taken down)
    case "vip": isVip = !!m.on; toast(m.on ? "VIP ★" : "VIP ✕", "#e08a00"); break;
  }
}
// (owner, 2026-11-08) updates: when a new build of the page is live, everyone reloads onto it (progress is saved on the
// server); this page's own build is read from version.json when it loads
let myBuild = null;
// (owner, 2026-11-09) what's new: once an update is live, a small panel shows the latest entry of the front page's
// Updates (the game's lines) until you close it; it comes back only when that entry changes. Someone new to the game
// doesn't get it.
fetch("index.html?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.text() : "")).then((html) => {
  const art = new DOMParser().parseFromString(html, "text/html").querySelector("article.update"); if (!art) return;
  const items = [...art.querySelectorAll("li")].map((li) => li.textContent.replace(/^\s*Pet Delivery Co\.:\s*/, "").trim()).filter(Boolean); if (!items.length) return;
  const t = art.querySelector("time"), key = (t ? t.getAttribute("datetime") : "") + "|" + items.join("|");
  let seen = null; try { seen = localStorage.getItem("petdelivery.news"); } catch (e) { return; }
  const remember = () => { try { localStorage.setItem("petdelivery.news", key); } catch (e) { /* private mode */ } };
  if (seen === key) return; if (seen === null && !getTok()) { remember(); return; }
  $("newsd").textContent = t ? t.textContent : ""; $("newsl").innerHTML = ""; for (const it of items) { const li = document.createElement("li"); li.textContent = it[0].toUpperCase() + it.slice(1); $("newsl").appendChild(li); }
  $("news").style.display = "block"; $("newsx").onclick = () => { $("news").style.display = "none"; remember(); };
}).catch(() => {});
fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.v) myBuild = j.v; }).catch(() => {});
function stale(web, told, by) {
  if (!told && (!web || !myBuild || web === myBuild)) return false;
  let lastR = 0; try { lastR = +sessionStorage.getItem("petdelivery.reload") || 0; } catch (e) { /* none */ }
  if (Date.now() - lastR < 60000) return false;   // never loop
  try { sessionStorage.setItem("petdelivery.reload", String(Date.now())); } catch (e) { /* private mode */ }
  flushSave(true); banner("Updating!", "#ffd35a", by ? by + "'s Update" : ""); setTimeout(() => location.reload(), 1500); return true;
}
function sendPos(force) {
  const s = [me.x.toFixed(2), me.y.toFixed(1), me.z.toFixed(2), me.yaw.toFixed(2), me.moving ? 1 : 0, me.bag.length, me.foot ? 1 : 0, me.inst].join();
  if (!force && s === lastPos) return;
  netSend({ t: "pos", x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(2), mv: me.moving ? 1 : 0, ct: Math.round(performance.now()), bag: me.bag.length, ft: me.foot ? 1 : 0, inst: me.inst }); lastPos = s; lastActual = performance.now();
}

// ---- players (owner, 2026-11-08): F next to someone opens a menu to trade with them or invite them to your party;
// invites pop up to accept or turn down. A party can visit each other's homes. ----
let party = [], invites = [], target = null;
function nearPlayer() { let best = null, bd = 5; for (const [id, o] of others) { if (o.inst !== me.inst) continue; const d = hyp(o.x - me.x, o.z - me.z, o.y - me.y); if (d < bd) { bd = d; best = id; } } return best; }
// (owner, 2026-11-09: no player panel) tapping another player opens two buttons right there: Trade and Party
const pmenu = $("pmenu");
function playerMenu(id, px, py) {
  const o = others.get(id); if (!o) return; target = id; pmenu.innerHTML = "";
  const inParty = party.some((q) => q.id === id);
  const t = document.createElement("button"); t.className = "btn gold"; t.type = "button"; t.textContent = "Trade"; t.disabled = !!trading; t.onclick = () => { netSend({ t: "invite", id, kind: "trade" }); toast("→ " + o.name); closePlayerMenu(); };
  const p = document.createElement("button"); p.className = "btn green"; p.type = "button"; p.textContent = inParty ? "Party ✓" : "Party"; p.disabled = inParty; p.onclick = () => { netSend({ t: "invite", id, kind: "party" }); toast("→ " + o.name); closePlayerMenu(); };
  pmenu.append(t, p); pmenu.style.display = "flex";
  pmenu.style.left = clamp(px, 90, innerWidth - 90) + "px"; pmenu.style.top = clamp(py, 70, innerHeight - 40) + "px";
}
function closePlayerMenu() { pmenu.style.display = "none"; target = null; }
// a tap on another player (in reach)
function playerHit(px, py) {
  ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const objs = []; for (const [id, o] of others) { if (o.inst !== me.inst || hyp(o.x - me.x, o.z - me.z) > 20) continue; for (const g of [o.m.g, o.walker && o.walker.g]) if (g && g.visible) { g.userData.pid = id; objs.push(g); } }
  for (const h of ray.intersectObjects(objs, true)) { if (h.object.isSprite) continue; let g = h.object; while (g && g.userData.pid === undefined) g = g.parent; if (g) return g.userData.pid; }
  return null;
}
const KIND_NAME = { party: "Party", trade: "Trade", home: "Visit home" };
function renderInvite() {
  invites = invites.filter((v) => v.until > performance.now());
  const el = $("invite"), v = invites[0]; if (!v) { el.style.display = "none"; return; }
  el.style.display = "flex"; $("iname").textContent = v.name; $("ikind").textContent = KIND_NAME[v.kind] || "";
  $("iyes").onclick = () => { netSend({ t: "answer", from: v.from, kind: v.kind, yes: true }); invites.shift(); renderInvite(); };
  $("ino").onclick = () => { netSend({ t: "answer", from: v.from, kind: v.kind, yes: false }); invites.shift(); renderInvite(); };
}
function renderParty() {
  const el = $("party"); el.innerHTML = "";
  if (party.length < 2) { el.style.display = "none"; return; }
  el.style.display = "flex";
  for (const q of party) { const s = document.createElement("span"); s.className = "pill"; s.textContent = q.id === myId ? myName : q.name; el.appendChild(s); }
  const x = document.createElement("button"); x.className = "x"; x.type = "button"; x.textContent = "✕"; x.onclick = () => netSend({ t: "party_leave" }); el.appendChild(x);
}
// a trade: each side picks pets (not ones in a playpen) and coins to give; when both are ready the server swaps them
let trading = null, offer = { pets: new Set(), coins: 0 };
function sendOffer() { netSend({ t: "trade_offer", pets: [...offer.pets], coins: offer.coins }); }
function renderTrade() {
  if (!trading) return;
  const pens = World.penPets(save), el = $("trade"); $("tname").textContent = trading.name; el.innerHTML = "";
  const chip = (p, on, click) => { const d = document.createElement("button"); d.type = "button"; d.className = "chip" + (on ? " on" : ""); d.innerHTML = `<img alt="" src="${portrait(p.sp)}"><span>Lv ${p.lv}</span>`; d.title = SPECIES[p.sp].name; if (click) d.onclick = click; else d.disabled = true; return d; };
  const mineH = document.createElement("div"); mineH.className = "tside";
  mineH.innerHTML = `<b>${myName}${trading.me.ready ? " ✓" : ""}</b>`;
  const grid = document.createElement("div"); grid.className = "chips";
  for (const p of save.pets) if (!pens.has(p.id)) grid.appendChild(chip(p, offer.pets.has(p.id), () => { if (offer.pets.has(p.id)) offer.pets.delete(p.id); else offer.pets.add(p.id); sendOffer(); renderTrade(); }));
  const coin = document.createElement("label"); coin.className = "coinin"; coin.innerHTML = `<span class="coin"></span>`;
  const inp = document.createElement("input"); inp.type = "number"; inp.min = 0; inp.max = Math.floor(save.coins); inp.value = offer.coins; inp.inputMode = "numeric";
  inp.onchange = () => { offer.coins = clamp(Math.floor(+inp.value || 0), 0, Math.floor(save.coins)); inp.value = offer.coins; sendOffer(); };
  coin.appendChild(inp); mineH.append(grid, coin);
  const theirs = document.createElement("div"); theirs.className = "tside"; theirs.innerHTML = `<b>${trading.name}${trading.them.ready ? " ✓" : ""}</b>`;
  const g2 = document.createElement("div"); g2.className = "chips"; for (const p of trading.them.pets) g2.appendChild(chip(p, true, null));
  const c2 = document.createElement("span"); c2.className = "coinin"; c2.innerHTML = `<span class="coin"></span> ${fmt(trading.them.coins)}`;
  theirs.append(g2, c2);
  const row = document.createElement("div"); row.className = "row2";
  const ready = document.createElement("button"); ready.className = "btn green"; ready.type = "button"; ready.style.flex = "1"; ready.textContent = trading.me.ready ? "Ready ✓" : "Ready";
  ready.onclick = () => { flushSave(true); netSend({ t: "trade_ready", on: !trading.me.ready }); };
  row.appendChild(ready); el.append(mineH, theirs, row);
}

// ---- houses on plots (owner, 2026-11-08): everyone in a room gets a plot (20 x 20 m) where their house stands, seen
// by everyone: 3 near the middle (first come, first served), 2 on the VIP island above the middle, 5 around town (given
// at random), and an island off the edge with more when a room has more than 10 players. Build it however you like
// from pieces (floors, walls, windows, doors, roofs, slopes, stairs on a 5 x 5 grid of 4 m squares, up to 3 floors;
// furniture anywhere), in any wall colour. Inside a house you're on foot. Tap a playpen to choose its pet. ----
const { PLOTS, PLOT, CELL, GRID, LEVELS, LEVEL_H, PIECES, COLORS, lotPoint } = World;
const LOT = (id) => World.lotById.get(id) || null;   // (owner, 2026-11-10) a lot by its town house's id
const plotState = new Map();   // plot id -> { id (player), name, pieces, g, col: { walls, surfaces, ramps }, pens }
let myPlot = -1, isVip = false;
const plotOrigin = (p) => ({ x: p.x - PLOT / 2, z: p.z - PLOT / 2, y: p.y });
// (owner, 2026-11-10) plots stand where staff placed them; the lift at the square takes you to yours
const LIFT = { x: 0, z: 22 }, LIFTS = [{ x: LIFT.x, z: LIFT.z, y: 0, to: "plot" }];
const liftBeamM = new THREE.MeshBasicMaterial({ color: "#7fd8ff", transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
for (const l of LIFTS) { const r = new THREE.Mesh(RINGG(2.2), ringM("#2bb3c0")); r.position.set(l.x, l.y + 0.18, l.z); scene.add(r); const b = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 14, 20, 1, true), liftBeamM); b.position.set(l.x, l.y + 7, l.z); scene.add(b); l.ring = r; inColor(r); inColor(b); }
// (owner, 2026-11-09) a speech-bubble label floats over each place, saying what it is: clear up close, fading out with
// distance (and hidden while building)
const POIS = [
  { x: PICKUP.x, y: 7.5, z: PICKUP.z - 1, name: "Post Office", what: "Pick up parcels here" },
  { x: BOARD.x, y: 4.6, z: BOARD.z - 1.5, name: "Contract Board", what: "Start a contract" },
  { x: SHOP.x, y: 4.6, z: SHOP.z, name: "Egg Shop", what: "Buy eggs to hatch new pets" },
  { x: TRAIN.x, y: 4.5, z: TRAIN.z, name: "Training Yard", what: "Train the pet you ride" },
  { x: toWorld(POUND, 0, 3).x, y: 4.4, z: toWorld(POUND, 0, 3).z, name: "Animal Control", what: "Where caught couriers end up" },
  { x: LIFT.x, y: 6, z: LIFT.z, name: "Sky Lift", what: "Up to your plot" },
];
function poiBubble(name, what) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 176; const g = c.getContext("2d");
  g.font = "800 46px system-ui, sans-serif"; const w1 = g.measureText(name).width; g.font = "600 32px system-ui, sans-serif"; const w2 = g.measureText(what).width;
  const w = Math.min(500, Math.max(w1, w2) + 56);
  g.fillStyle = "rgba(255,255,255,.95)"; g.beginPath(); g.roundRect((512 - w) / 2, 6, w, 136, 30); g.fill();
  g.beginPath(); g.moveTo(236, 140); g.lineTo(256, 170); g.lineTo(276, 140); g.fill();
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#23303b"; g.font = "800 46px system-ui, sans-serif"; g.fillText(name, 256, 54, 470);
  g.fillStyle = "#5a6a78"; g.font = "600 32px system-ui, sans-serif"; g.fillText(what, 256, 104, 470);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); sp.scale.set(6.4, 2.2, 1); sp.layers.set(1); sp.renderOrder = 4; return sp;
}
for (const q of POIS) { q.s = poiBubble(q.name, q.what); q.s.position.set(q.x, q.y, q.z); scene.add(q.s); }
let homeMarker = null;
function makeHomeMarker() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 176; const g = c.getContext("2d");
  g.fillStyle = "rgba(255,255,255,.96)"; g.beginPath(); g.roundRect(8, 8, 496, 136, 28); g.fill();
  g.beginPath(); g.moveTo(236, 142); g.lineTo(256, 170); g.lineTo(276, 142); g.fill();
  g.fillStyle = "#f2b01e"; g.strokeStyle = "#8a5a00"; g.lineWidth = 6; g.beginPath(); g.moveTo(48, 74); g.lineTo(86, 42); g.lineTo(124, 74); g.lineTo(118, 74); g.lineTo(118, 116); g.lineTo(54, 116); g.lineTo(54, 74); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "#8a5a00"; g.fillRect(78, 88, 16, 28);
  g.fillStyle = "#23303b"; g.textAlign = "left"; g.textBaseline = "middle"; g.font = "800 42px system-ui, sans-serif"; g.fillText("YOUR HOME", 150, 82);
  g.fillStyle = "#5a6a78"; g.font = "600 27px system-ui, sans-serif"; g.fillText("Your plot", 150, 119);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(7.2, 2.45, 1); s.layers.set(1); s.renderOrder = 4; return s;
}
function homeStep() {
  if (myPlot < 0 || !LOT(myPlot)) { if (homeMarker) homeMarker.visible = false; return; }
  if (!homeMarker) { homeMarker = makeHomeMarker(); scene.add(homeMarker); }
  const p = LOT(myPlot), [hx, hz] = lotPoint(p, 0, -PLOT / 2 - 0.8); homeMarker.position.set(hx, p.y + 5.1, hz);
  const d = hyp(p.x - me.x, p.z - me.z, (p.y - me.y) * 0.5), a = building || talk ? 0 : clamp((100 - d) / 65, 0, 1);
  homeMarker.visible = a > 0.01; homeMarker.material.opacity = a;
}
function poiStep() {
  for (const q of POIS) {
    const d = hyp(q.x - me.x, q.z - me.z, (q.y - me.y) * 0.5), f = clamp((45 - d) / 35, 0, 1) * clamp((hyp(q.x - camera.position.x, q.y - camera.position.y, q.z - camera.position.z) - 5) / 6, 0, 1), a = building || talk || false ? 0 : f * f;   // and not right in front of the camera   // (owner, 2026-11-09) fainter the further, gone past 45 m
    q.s.visible = a > 0.01; q.s.material.opacity = a; const k = 1 + clamp((d - 15) / 60, 0, 0.3); q.s.scale.set(6.4 * k, 2.2 * k, 1);
  }
  homeStep();
}
// ---- the walk-through (owner, 2026-11-09): once, for every courier (new or not, `intro` in their data), after the
// What's New panel: Walt the mailman asks for help; two short scenes circle an animal control van, then a helicopter
// (the camera 45° above, going round them); back with Walt, he hands over two parcels and the camera moves to the
// nearest one's mailbox; delivering both earns an Egg Ticket and the arrow points to the egg shop, where the ticket
// button glows; once the egg hatches the camera goes back to Walt, who tells about contracts and wishes you luck.
// Walking away from Walt (Escape) skips the rest. ----
let intro = null, introWait = 0;
const cine = { on: false, k: 0, cx: 0, cy: 0, cz: 0, lx: 0, ly: 0, lz: 0 };
const walt = () => TOWN.find((n) => n.id === "walt");
function introSay(node) { const w = walt(); w.cool = 0; intro.talking = true; startTalk(w, node); }
function introGo(stage) {
  if (!intro) return;
  intro.stage = stage; intro.t = 0; intro.talking = false; cine.on = false;
  if (stage === "van" || stage === "heli") { cine.on = true; introSay(stage === "van" ? "i2" : "i3"); }
  else if (stage === "parcels") introSay("i4");
  else if (stage === "mailbox") {
    // two parcels for the nearest houses to the post office; the camera goes to the first one's mailbox
    const near = houses.map((h, i) => i).filter((i) => !houses[i].sky).sort((a, b) => houses[a].d - houses[b].d).slice(0, 2);
    me.bag = near.slice(); intro.parcels = near; intro.dl = []; syncBeams(); hudKey = ""; if (near.length) toast("+" + near.length);
    const h = houses[near[0]]; if (h) { cine.on = true; cine.lx = h.mx; cine.ly = h.my + 1; cine.lz = h.mz; const a = Math.atan2(walt().x - h.mx, walt().z - h.mz); cine.cx = h.mx + Math.sin(a) * 11; cine.cz = h.mz + Math.cos(a) * 11; cine.cy = h.my + 6; }
    introSay("i5");
  } else if (stage === "egg") {
    save.items.ticket++; persist(); toast(ITEMS.ticket.name, ITEMS.ticket.c); emitConfetti(me.x, me.y + 3, me.z, 60, 4, 7); hudKey = "";
    if (save.pets.length >= World.petCap(save)) introGo("bye");   // no room for an egg: straight on
  } else if (stage === "bye") { closePanels(); introSay("i6"); }
  else if (stage === "done") { intro = null; save.intro = 1; persist(); }
}
function introGuide() { if (!intro) return null; if (intro.stage === "back") { const w = walt(); return [w.x, w.y, w.z]; } return intro.stage === "egg" ? [SHOP.x, 0, SHOP.z] : null; }
function introStep(dt) {
  if (!intro) {
    let skip = false; try { skip = !!localStorage.getItem("petdelivery.nointro"); } catch (e) { /* none */ }
    const ready = loggedIn && !save.intro && !skip && !talk && !building && !me.inst && $("news").style.display !== "block" && $("login").style.display === "none";
    introWait = ready ? introWait + dt : 0;
    if (introWait > 1.2) {   // begin by the post office, facing Walt
      intro = { stage: "meet", t: 0 }; const w = walt(); me.x = w.x + 1.5; me.z = w.z + 7; me.y = terrain(me.x, me.z); me.vy = 0; cam.y = me.y; cam.yaw = 0; me.flying = false;
      introSay("i1");
    }
    return;
  }
  intro.t += dt;
  if (intro.stage === "back" && !talk && !building && !me.inst) { const w = walt(); if (hyp(me.x - w.x, me.z - w.z) < 7) introSay("i7"); }   // back at Walt: he gives the voucher
  const orbit = (m, r) => { const a = intro.t * 0.45; cine.lx = m.x; cine.ly = m.y; cine.lz = m.z; cine.cx = m.x + Math.cos(a) * r; cine.cz = m.z + Math.sin(a) * r; cine.cy = m.y + r; };   // 45° above, going round
  if (intro.stage === "van" || intro.stage === "heli") {
    if (!intro.m) intro.m = {};
    const want = intro.stage === "heli" ? 1 : 0;
    if (!intro.m[intro.stage]) intro.m[intro.stage] = vehs.filter((m) => (m.kind ? 1 : 0) === want).sort((a, b) => hyp(a.x - me.x, a.z - me.z) - hyp(b.x - me.x, b.z - me.z))[0];
    const m = intro.m[intro.stage]; if (m) orbit(m, want ? 24 : 12);
  }
  if (intro.stage === "deliver") {
    const rest = intro.parcels.filter((i) => !intro.dl.includes(i));
    if (!rest.length) introGo("back");
    else if (rest.every((i) => !me.bag.includes(i))) { me.bag.push(...rest); syncBeams(); hudKey = ""; }   // caught: the parcels still to go come back
  }
}
// ---- townsfolk (owner, 2026-11-09): people who live in town: a keeper at each shop and a few folk around the post
// office, each dressed their own way, standing about their own way, with their own things to talk about. Their name
// shows in their colour with a speech bubble over it. F next to one (or a tap on them) talks: the camera moves in on
// them, black bars slide in, and what they say types out a line at a time; a typed line stays until you go on (a
// click or tap finishes the line, or goes straight on to the next); after their last line, answers to pick. They live
// on this page only, the same people in the same places for everyone. ----
const TALK_RANGE = 4.5, TYPE_MAX = 1.5;   // (owner, 2026-11-09) a typed line stays until a click or tap
function cyl(r, h, c, x, y, z, parent, rx = 0, rz = 0) { const m = new THREE.Mesh(CYL, mat(c)); m.scale.set(r, h, r); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); m.castShadow = true; parent.add(m); return m; }
const GLASS_M = new THREE.MeshLambertMaterial({ color: "#d6eeff", transparent: true, opacity: 0.4 });
// what each one wears (on the courier's build: head 0.5 m at 1.84, its front at z 0.25; torso 0.8 x 0.8 x 0.4 at 1.2)
const DRESS = {
  hazel(w, g) {   // apron with an egg in its pocket, hair in a bun
    box(0.66, 0.92, 0.05, "#fffaf2", 0, 1.02, 0.215, g); ball(0.07, "#ffd35a", 0.16, 0.92, 0.25, g, 1, 1.3, 0.6);
    box(0.54, 0.12, 0.54, "#6b3f22", 0, 2.07, 0, g); box(0.54, 0.36, 0.08, "#6b3f22", 0, 1.9, -0.25, g); ball(0.15, "#6b3f22", 0, 2.2, -0.2, g);
  },
  rusty(w, g) {   // cowboy hat, vest, bandana, mustache, belt buckle
    for (const x of [-0.27, 0.27]) box(0.27, 0.8, 0.43, "#7a4f28", x, 1.2, 0, g);
    box(0.52, 0.1, 0.44, "#2bb3c0", 0, 1.6, 0, g); cone(0.13, 0.2, "#2bb3c0", 0, 1.47, 0.2, g, Math.PI);
    box(0.84, 0.08, 0.44, "#2b1d12", 0, 0.84, 0, g); box(0.16, 0.11, 0.04, "#f2b01e", 0, 0.84, 0.22, g);
    cyl(0.5, 0.04, "#8a5a3a", 0, 2.1, 0, g); cyl(0.27, 0.28, "#8a5a3a", 0, 2.25, 0, g); cyl(0.275, 0.06, "#2b1d12", 0, 2.15, 0, g);
    box(0.28, 0.06, 0.04, "#4a2f1c", 0, 1.76, 0.26, g);
  },
  walt(w, g) {   // the mailman: postal cap, a big mustache, a mail bag on a strap
    cyl(0.27, 0.16, "#2f5d9e", 0, 2.13, 0, g); box(0.42, 0.04, 0.2, "#1d3a66", 0, 2.07, 0.3, g); box(0.1, 0.08, 0.02, "#f2b01e", 0, 2.15, 0.27, g);
    box(0.24, 0.06, 0.04, "#6b4a32", 0, 1.76, 0.265, g);
    const strap = box(0.06, 1.05, 0.03, "#7a4f28", 0, 1.2, 0.215, g); strap.rotation.z = -0.62;
    box(0.4, 0.34, 0.18, "#8a5a3a", 0.32, 0.86, 0.12, g); box(0.42, 0.1, 0.2, "#6b4428", 0.32, 1.02, 0.12, g);
  },
  mabel(w, g) {   // postal cap and badge, glasses, a mail bag, a letter in hand
    cyl(0.27, 0.16, "#23395e", 0, 2.13, 0, g); box(0.42, 0.04, 0.2, "#16263f", 0, 2.07, 0.3, g); box(0.1, 0.08, 0.02, "#f2b01e", 0, 2.15, 0.27, g);
    for (const x of [-0.065, 0.065]) { const l = new THREE.Mesh(BOX, GLASS_M); l.scale.set(0.11, 0.09, 0.02); l.position.set(x, 1.915, 0.262); g.add(l); }
    box(0.3, 0.025, 0.025, "#222222", 0, 1.965, 0.262, g);
    const strap = box(0.06, 1.05, 0.03, "#7a4f28", 0, 1.2, 0.215, g); strap.rotation.z = 0.62;
    box(0.3, 0.26, 0.12, "#8a5a3a", 0.25, 0.86, 0.27, g); box(0.3, 0.06, 0.13, "#f2b01e", 0.25, 0.95, 0.27, g);
    box(0.24, 0.03, 0.17, "#fffaf2", 0, -0.6, 0.12, w.arms[1]);
  },
  gus(w, g) {   // straw hat, overalls over a shirt, white beard, a broom
    box(0.82, 0.22, 0.42, "#e8dcc0", 0, 1.5, 0, g); for (const x of [-0.25, 0.25]) box(0.07, 0.07, 0.03, "#f2b01e", x, 1.36, 0.21, g);
    cyl(0.56, 0.03, "#e8c56a", 0, 2.1, 0, g); cyl(0.26, 0.18, "#e8c56a", 0, 2.2, 0, g); cyl(0.265, 0.05, "#c8553d", 0, 2.14, 0, g);
    box(0.42, 0.2, 0.08, "#f2f2f2", 0, 1.67, 0.25, g); box(0.3, 0.06, 0.05, "#f2f2f2", 0, 1.77, 0.27, g);
    const b = new THREE.Group(); b.position.set(0, 0.95, 0.42); b.rotation.x = 0.5; g.add(b); w.broom = b;
    box(0.05, 1.4, 0.05, "#a07040", 0, -0.45, 0, b); box(0.42, 0.18, 0.12, "#d8b25a", 0, -1.18, 0, b);
  },
  ziggy(w, g) {   // backwards cap, headphones, hood, white sneakers
    cyl(0.27, 0.14, "#e5534b", 0, 2.12, 0, g); box(0.36, 0.04, 0.2, "#e5534b", 0, 2.07, -0.3, g);
    box(0.6, 0.05, 0.07, "#23303b", 0, 2.21, 0, g); for (const x of [-0.29, 0.29]) { cyl(0.11, 0.09, "#23303b", x, 1.88, 0, g, 0, Math.PI / 2); cyl(0.07, 0.1, "#ffd35a", x * 1.03, 1.88, 0, g, 0, Math.PI / 2); }
    box(0.56, 0.18, 0.12, "#7a36b0", 0, 1.62, -0.24, g);
    for (const l of w.legs) box(0.42, 0.12, 0.5, "#ffffff", 0, -0.76, 0.04, l);
  },
  penny(w, g) {   // a striped shirt, pigtails, a red balloon
    for (const y of [0.98, 1.2, 1.42]) box(0.82, 0.08, 0.42, "#e5534b", 0, y, 0, g);
    box(0.54, 0.12, 0.54, "#d2642a", 0, 2.07, 0, g); box(0.54, 0.3, 0.08, "#d2642a", 0, 1.93, -0.25, g); for (const x of [-0.32, 0.32]) ball(0.12, "#d2642a", x, 1.95, -0.1, g);
    const b = new THREE.Group(); b.position.set(-0.62, 0.85, 0.05); g.add(b); w.balloon = b;
    box(0.015, 2, 0.015, "#ffffff", 0, 1, 0, b); ball(0.34, "#e5534b", 0, 2.25, 0, b, 1, 1.2, 1);
  },
};
function townTag(name, color) {   // their name in their colour, with a speech bubble over it
  const c = document.createElement("canvas"); c.width = 256; c.height = 160; const g = c.getContext("2d");
  g.font = "800 30px system-ui, sans-serif"; const w = Math.min(250, g.measureText(name).width + 32);
  g.fillStyle = "#ffffff"; g.beginPath(); g.roundRect((256 - w) / 2 - 3, 103, w + 6, 50, 25); g.fill();
  g.fillStyle = color; g.beginPath(); g.roundRect((256 - w) / 2, 106, w, 44, 22); g.fill();
  g.fillStyle = "#ffffff"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(name, 128, 129);
  g.fillStyle = "#ffffff"; g.strokeStyle = color; g.lineWidth = 5; g.beginPath(); g.roundRect(94, 8, 68, 50, 22); g.moveTo(118, 58); g.lineTo(128, 78); g.lineTo(138, 58); g.fill(); g.stroke();
  g.fillStyle = "#ffffff"; g.fillRect(116, 52, 24, 9); g.fillStyle = color; for (const x of [111, 128, 145]) { g.beginPath(); g.arc(x, 33, 6, 0, TAU); g.fill(); }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); s.scale.set(3.6, 2.25, 1); s.layers.set(1); s.renderOrder = 5; return s;
}
const RPS = ["Rock", "Paper", "Scissors"];
function rpsNode(n) { return { say: [pick(["Rock, paper, scissors...", "Ready? Rock, paper, scissors..."])], opts: RPS.map((r, i) => [r, () => rpsGo(n, i)]) }; }
function rpsGo(n, i) {
  const j = Math.floor(Math.random() * 3), r = (i - j + 3) % 3;   // 0 a tie, 1 I win, 2 they win
  if (r === 1) emitConfetti(n.x, n.y + 2.6 * n.s, n.z, 40, 2.5, 5); else if (r === 2) n.dance = 1.6;
  return { say: [RPS[j] + "!", pick(r === 0 ? ["A tie!", "Great minds think alike!"] : r === 1 ? n.rpsLose : n.rpsWin)], opts: [["Again!", "rps"], ["Something else", "menu"]] };
}
const fastest = () => Object.values(SPECIES).reduce((a, b) => (b.speed > a.speed ? b : a)).name;
let hopFor = 0;
// where Penny hides in hide and seek: around the plaza, clear of the buildings and rings
const HIDES = [-54, 18, 90, 162, 234].flatMap((d) => [[Math.cos((d * Math.PI) / 180) * 50, Math.sin((d * Math.PI) / 180) * 50], [Math.cos(((d + 36) * Math.PI) / 180) * 16, Math.sin(((d + 36) * Math.PI) / 180) * 16]]);
const TOWN = [
  {
    id: "hazel", name: "Hazel", color: "#e5739d", x: toWorld(SHOP_B, -3.4, 5.3).x, z: toWorld(SHOP_B, -3.4, 5.3).z, yaw: SHOP_B.yaw, s: 1, idle: "shop", cps: 42,
    look: { skin: "#e3b089", shirt: "#e5739d", pants: "#7a5a6a", blush: true },
    more: ["Anything else, dear?", "What else can I do for you?"],
    menu: [["Show me the eggs", () => openShop("egg")], ["Which egg is best?", "best"], ["Where do the eggs come from?", "where"], ["Bye", "bye"]],
    says: {
      hello: { say: ["Oh! A customer!", "Welcome to the Egg Shop, {name}. Every egg in here is warm and ready to hatch."], opts: "menu" },
      again: { say: [() => pick(["Back for another egg, {name}?", "Hello again, {name}!", "Shh... I think one of them just wiggled."])], opts: "menu" },
      best: { say: ["Basic Eggs are cheap and cheerful.", "Golden Eggs never hatch a Common, and every so often a Legendary pops out!"], opts: "menu" },
      where: { say: ["Ha! That's a family secret.", "Let's just say a certain Phoenix owes me a favor."], opts: "menu" },
      bye: { say: [() => pick(["Come back soon!", "Keep them warm!", "Bye bye, {name}!"])] },
    },
  },
  {
    id: "mabel", name: "Mabel", color: "#3a8ee6", x: POST.x - 6.2, z: POST.z + 7.2, yaw: 0.35, s: 1, idle: "sort", cps: 48,
    look: { skin: "#8d5a3b", shirt: "#2f5d9e", sleeve: "#2f5d9e", pants: "#23395e" },
    more: ["Anything else? Quickly now!", "What else, {name}?"],
    menu: [["Any tips?", "tips"], ["Tell me a joke", "joke"], ["Can I have a raise?", "raise"], ["Bye", "bye"]],
    says: {
      hello: { say: ["Hey you! Yes, you!", "We've got parcels stacked to the ceiling. Grab some from the gold ring and get them out the door!"], opts: "menu" },
      again: { say: [() => pick(["Back already? Splendid.", "Busy day, {name}. Busy, busy day.", "Those parcels won't deliver themselves!"])], opts: "menu" },
      tips: { say: () => [pick(["Parcels for the floating islands pay double. You'll want something with wings.", "Animal control only bothers couriers carrying parcels. Keep your head down.", "The further away the house, the more it pays.", "Wanted stars make you easier to spot, but each one adds to your delivery pay.", "Start a contract at the board and the whole town pitches in."])], opts: "menu" },
      joke: { say: () => pick([["What do you call a dinosaur that delivers mail?", "A Postosaurus!"], ["What did the stamp say to the envelope?", "Stick with me and we'll go places!"], ["What's a cat's favorite thing to deliver?", "Purr-cels!"], ["Why did the parcel go to school?", "To get a little more address-ucation!"]]), opts: "menu" },
      raise: { say: ["A raise? Ha!", "Train that pet of yours and deliver faster. There's your raise."], opts: "menu" },
      bye: { say: [() => pick(["Off you go!", "Mind the mailboxes!", "Deliver safely!"])] },
    },
  },
  {   // (owner, 2026-11-09) the mailman, who walks new couriers through the job
    id: "walt", name: "Walt", color: "#2f6fd0", x: PICKUP.x - 4.6, z: PICKUP.z - 1.2, yaw: 0.25, s: 1, idle: "sort", cps: 44,
    look: { skin: "#e0a77f", shirt: "#8fb8e8", sleeve: "#8fb8e8", pants: "#23395e" },
    more: ["What else, {name}?", "Anything else before you head out?"],
    menu: [["Any tips?", "tips"], ["Bye", "bye"]],
    says: {
      hello: { say: ["Ah, {name}! Good to see you."], opts: "menu" },
      again: { say: [() => pick(["Back again, {name}?", "Mail never sleeps!", "How's the route treating you?"])], opts: "menu" },
      tips: { say: () => [pick(["Grab parcels from the gold ring here, then follow the arrow.", "Faster pets get the far houses, and far houses pay more.", "Animal control can't see past those red lines on the ground. Mostly."])], opts: "menu" },
      bye: { say: [() => pick(["Off you go!", "Deliver safely!", "See you around, {name}!"])] },
      i1: { say: ["Oh! There you are, {name}!", "My helper ran off chasing a squirrel, and the mail is piling up to the ceiling.", "You and your pet look quick. Could you help me deliver some mail?"], then: () => introGo("van") },
      i2: { say: ["Careful out there, though. Animal control roams the streets, taking pets back to the animal shelter.", "Their vans patrol every road, and if one spots you carrying parcels, it gives chase!", "Those red lines on the ground show how far it can see."], then: () => introGo("heli") },
      i3: { say: ["And their helicopters sweep the town with searchlights. Stay out of the light!"], then: () => introGo("parcels") },
      i4: { say: ["Right then. Here are two parcels for you."], then: () => introGo("mailbox") },
      i5: { say: ["Take them to the highlighted mailboxes, like that one, to earn some coins.", "Deliver both and I'll give you a voucher for a free egg!"], then: () => introGo("deliver") },
      i7: { say: ["Both delivered! You're a natural, {name}.", "As promised, here's a voucher for a free egg.", "Take it to the Egg Shop and see what hatches!"], then: () => introGo("egg") },
      i6: { say: ["Look at that! A brand-new pet.", "One more thing: the Contract Board in the middle of the square. Take one on yourself, or with your party, and deliver before time's up for a big reward.", "That's everything. Good luck out there, {name}!"], then: () => introGo("done") },
    },
  },
  {
    id: "gus", name: "Gus", color: "#5a8f3e", x: POST.x + 7.5, z: POST.z + 7.4, yaw: -0.4, s: 1, idle: "sweep", wander: 2.5, speed: 0.6, cps: 30,
    look: { skin: "#f0c8a8", shirt: "#4f7f3a", sleeve: "#e8dcc0", pants: "#4f7f3a" },
    more: ["Anything else, young one?", "Hm? Something else?"],
    menu: [["How's the weather?", "weather"], ["Tell me a story", "story"], ["Need a hand?", "help"], ["Bye", "bye"]],
    says: {
      hello: { say: ["Hm? Oh, hello there.", "Don't mind me. Just keeping the plaza tidy."], opts: "menu" },
      again: { say: [() => pick(["Ah, {name}. Good to see you.", "Back again? Mind the dust.", "Hello, hello."])], opts: "menu" },
      weather: { say: () => skyNow.rain > 0.2 ? ["Wet one today.", "Good for the flowers. Bad for the paper."] : skyNow.day < 0.3 ? ["Clear night. Look at all those stars.", "Best time for a quiet sweep."] : ["Lovely day for it.", "Not a cloud in the sky... well, a few hundred. We do float, after all."], opts: "menu" },
      story: { say: () => pick([["I once found a parcel addressed to the moon.", "Still have it. Haven't met a pet that flies that high."], ["Forty years I've swept this plaza.", "Found a lot of feathers. Found a Dragon scale once, too."], ["Back in my day we delivered on foot.", "Uphill. Both ways. On a floating island!"]]), opts: "menu" },
      help: { say: ["Kind of you to offer.", "Just keep that confetti off my clean plaza, eh?"], opts: "menu" },
      bye: { say: [() => pick(["Take care now.", "Mind the cliffs.", "Off you go, then."])] },
    },
  },
  {
    id: "ziggy", name: "Ziggy", color: "#a352e0", x: -14, z: 10, yaw: 1.2, s: 1, idle: "groove", wander: 3.5, speed: 1.6, cps: 60,
    look: { skin: "#c99070", shirt: "#8e44c9", sleeve: "#8e44c9", pants: "#2b2f36" },
    more: ["What else, what else?", "Yo, anything else?"],
    menu: [["Dance with me!", "dance"], ["Rock, paper, scissors", "rps"], ["What are you listening to?", "music"], ["Bye", "bye"]],
    rpsWin: ["Ha! Gotcha!", "Too easy!"], rpsLose: ["No way! You're good!", "Okay, okay, you got me."],
    says: {
      hello: { say: ["Yo! Can you hear it?", "The beat! The whole town's got a beat!"], opts: "menu" },
      again: { say: [() => pick(["Yo yo yo, {name}!", "Back for more moves?", "My favorite courier!"])], opts: "menu" },
      dance: (n) => { n.dance = 5; hopFor = 4.5; emitSparks(n.x, n.y + 2.2, n.z, 24, 3, ["#a352e0", "#ffd35a", "#ffffff"], 1, 1); return { say: ["Yeah! Let's go!", "Look at you go, {name}!"], opts: "menu" }; },
      rps: rpsNode,
      music: { say: () => pick([["Lo-fi delivery beats. Very chill.", "Perfect for long rides."], ["Mostly just the sound of mailboxes clanking.", "It's a whole vibe."]]), opts: "menu" },
      bye: { say: [() => pick(["Stay funky!", "Peace!", "Keep it moving!"])] },
    },
  },
  {
    id: "penny", name: "Penny", color: "#e5534b", x: 9, z: 12, yaw: -2.6, s: 0.72, idle: "bounce", wander: 5, speed: 2.4, cps: 55,
    look: { skin: "#f3d2b5", shirt: "#ffd35a", pants: "#3a8ee6", blush: true },
    more: ["What now? What now?", "Wanna do something else?"],
    menu: [["High five!", "high5"], ["Hide and seek!", "hide"], ["What's your favorite pet?", "fav"], ["Bye", "bye"]],
    rpsWin: ["I win!"], rpsLose: ["Aww!"],
    says: {
      hello: { say: ["Hi! Hi! Is that your pet?", "It's SO cool. When I grow up I'm gonna ride a Dragon!"], opts: "menu" },
      again: { say: [() => pick(["{name}! You came back!", "Hi again!", "Yay, it's you!"])], opts: "menu" },
      found: { say: ["Aww, you found me!", "You're really good at this!"], opts: "menu" },
      high5: (n) => { n.high5 = 1.4; setTimeout(() => emitSparks(n.x, n.y + 2.4 * n.s, n.z, 20, 3, ["#ffd35a", "#ffffff"], 0.7, 1), 300); return { say: ["Up high!", "Woo! Best high five ever!"], opts: "menu" }; },
      hide: { say: ["Okay! Close your eyes and count to ten!", "No peeking!"], then: (n) => blink(() => { const [hx, hz] = pick(HIDES.filter(([x, z]) => hyp(x - n.x, z - n.z) > 10)); n.x = n.tx = n.hx = hx; n.z = n.tz = n.hz = hz; n.hidden = true; n.wait = 0; }) },
      fav: { say: () => ["Ummm...", `The ${pick(Object.values(SPECIES)).name}! No wait... all of them!`], opts: "menu" },
      bye: { say: [() => pick(["Bye bye!", "See ya later, alligator!", "Come play again!"])] },
    },
  },
];
// opening a shop from its keeper uses the same centered shop window as riding into its ring
const SHOP_OPEN = {
  egg: () => { shopKind = "egg"; show("p-shop"); },
};
function openShop(kind) { endTalk(); SHOP_OPEN[kind](); return null; }
for (const n of TOWN) {
  if (n.only && !n.only()) { n.off = true; continue; }
  Object.assign(n, { hx: n.x, hz: n.z, home: [n.x, n.z], tx: n.x, tz: n.z, wait: Math.random() * 3, talks: 0, ph: Math.random() * 10, dance: 0, high5: 0, wave: 0, waved: false, cool: 0, walking: false, y: terrain(n.x, n.z), face: n.yaw });
  n.w = courierModel(n.look.shirt, false, n.look); DRESS[n.id](n.w, n.w.g); brighten(n.w.g); blobUnder(n.w.g, 1.6 * (n.s || 1));
  n.tag = townTag(n.name, n.color); n.tag.position.y = 3.05; n.w.g.add(n.tag);
  n.w.g.scale.setScalar(n.s); n.w.g.position.set(n.x, n.y, n.z); n.w.g.rotation.y = n.yaw; n.w.g.traverse((o) => { o.userData.npc = n; }); scene.add(n.w.g);
}
const folk = TOWN.filter((n) => !n.off);
function nearFolk() { let best = null, bd = TALK_RANGE; if (me.inst) return null; for (const n of folk) { const d = hyp(n.x - me.x, n.z - me.z); if (d < bd && Math.abs(n.y - me.y) < 3 && n.cool <= 0) { bd = d; best = n; } } return best; }
// (owner, 2026-11-09) pets bump into them rather than through them (but can always step away)
function folkBlock(x, z, y) { for (const n of folk) { const r = 0.9, d = hyp(x - n.x, z - n.z); if (d < r && d < hyp(me.x - n.x, me.z - n.z) && y < n.y + 2.2 * n.s) return true; } return false; }
function folkHit(px, py) {
  if (me.inst) return null;
  ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  for (const h of ray.intersectObjects(folk.map((n) => n.w.g), true)) { const n = h.object.userData.npc; if (n && !h.object.isSprite && hyp(n.x - me.x, n.z - me.z) < 14 && n.cool <= 0) return n; }
  return null;
}
function folkStep(dt) {
  if (hopFor > 0) { hopFor -= dt; const fl = floorAt(me.x, me.z, me.y); if (me.vy === 0 && me.y - fl < 0.05 && moveKind() !== "fly" && !me.foot) me.vy = 5.5; }
  for (const n of folk) {
    const w = n.w, g = w.g, t = clock + n.ph, dme = hyp(me.x - n.x, me.z - n.z); g.visible = !me.inst; if (me.inst) continue;
    n.cool -= dt; n.dance -= dt; n.high5 -= dt; n.wave -= dt;
    const talking = talk && talk.n === n;
    // walking about (Penny hides where she's put until she's found)
    n.walking = false;
    if (n.wander && !talking && !n.hidden) {
      if (n.wait > 0) n.wait -= dt;
      else {
        const dx = n.tx - n.x, dz = n.tz - n.z, d = hyp(dx, dz);
        if (d < 0.15) {
          for (let k = 0; k < 8; k++) { const a = Math.random() * TAU, r = Math.random() * n.wander, x = n.hx + Math.cos(a) * r, z = n.hz + Math.sin(a) * r; if (!blocked(x, z, 0)) { n.tx = x; n.tz = z; break; } }
          n.wait = 2 + Math.random() * 4;
        } else { const s2 = Math.min(d, dt * n.speed); n.x += (dx / d) * s2; n.z += (dz / d) * s2; n.face = Math.atan2(dx, dz); n.walking = true; }
      }
    }
    if (talking) n.face = Math.atan2(me.x - n.x, me.z - n.z);
    else if (!n.walking && dme < 7 && !n.hidden) n.face = Math.atan2(me.x - n.x, me.z - n.z);
    else if (!n.walking && !n.wander) n.face = n.yaw;
    g.rotation.y = lerpYaw(g.rotation.y, n.face, Math.min(1, dt * 5));
    if (n.dance > 0) g.rotation.y += Math.sin(t * 3) * dt * 2;
    // a wave when someone first comes near
    if (dme < 9 && !n.waved && !talking) { n.waved = true; n.wave = 1.6; } else if (dme > 16) n.waved = false;
    // how they stand about, walk, talk and play
    let la = Math.sin(t * 1.6) * 0.04, ra = -la, laz = 0, raz = 0, ll = 0, rl = 0, bob = 0, hx = 0, hy = 0;
    if (n.idle === "sort") { ra = -1.05 + Math.sin(t * 2) * 0.08; la = -0.7; hx = 0.18 + Math.sin(t * 0.7) * 0.05; }
    else if (n.idle === "groove") { const b = Math.sin(t * 4.2); bob = Math.abs(b) * 0.06; la = -0.35 + b * 0.45; ra = -0.35 - b * 0.45; hx = Math.sin(t * 8.4) * 0.1; }
    else if (n.idle === "bounce") { bob = Math.max(0, Math.sin(t * 5)) * 0.1 * (Math.sin(t * 0.9) > 0.3 ? 1 : 0); hy = Math.sin(t * 1.3) * 0.25; }
    if (n.walking) { const sw = Math.sin(t * 9) * 0.7; ll = sw; rl = -sw; if (n.idle !== "sweep") { la = -sw; ra = sw; } }
    if (n.idle === "sweep") { const s = Math.sin(t * 2.4); la = ra = -0.75; laz = raz = s * 0.18; if (w.broom) w.broom.rotation.z = s * 0.35; if (talking) { la = ra = -0.2; if (w.broom) w.broom.rotation.z = 0; } }
    if (talking && talk.shown < (talk.q[talk.i] || "").length) { hx = Math.sin(t * 11) * 0.07; ra = -0.55 + Math.sin(t * 3) * 0.25; }
    if (n.wave > 0) { ra = -2.7; raz = Math.sin(t * 12) * 0.35; }
    if (n.high5 > 0) { ra = -2.95; raz = 0; bob = 0.08; }
    if (n.dance > 0) { const b = Math.sin(t * 8); la = -2.6 + b * 0.4; ra = -2.6 - b * 0.4; ll = b * 0.3; rl = -b * 0.3; bob = Math.abs(b) * 0.15; hx = b * 0.12; }
    w.arms[0].rotation.set(la, 0, laz); w.arms[1].rotation.set(ra, 0, raz); w.legs[0].rotation.x = ll; w.legs[1].rotation.x = rl; w.head.rotation.set(hx, hy, 0);
    if (w.balloon) { w.balloon.rotation.set(Math.sin(t * 1.1) * 0.12, 0, Math.sin(t * 1.4) * 0.12); }
    n.y = terrain(n.x, n.z); g.position.set(n.x, n.y + bob * n.s, n.z);
    n.tag.visible = !talk && !building && dme < 40; n.tag.position.y = 3.05 + Math.sin(t * 2.5) * 0.06;
  }
}
// the talk: what they say, a line at a time, then the answers
let talk = null;
const talkEl = $("talk"), talkWho = $("tkwho"), talkText = $("tktext"), talkOpts = $("tkopts"), shot = { k: 0, n: null, side: 1 }, SH = {};
function startTalk(n, open) {
  if (talk || building || !loggedIn || n.cool > 0) return;
  closePanels(); closeChat();
  joy.x = joy.y = 0; keys.clear(); hopFor = 0;
  me.yaw = Math.atan2(n.x - me.x, n.z - me.z);
  talk = { n, q: [], i: 0, shown: 0, hold: 0, opts: null, then: null };
  // the camera comes round from whichever side it's nearer
  const toMe = Math.atan2(me.x - n.x, me.z - n.z); shot.n = n; shot.yaw = toMe;
  const c = camera.position, side = (k) => hyp(n.x + Math.sin(toMe + 0.75 * k) * 3 - c.x, n.z + Math.cos(toMe + 0.75 * k) * 3 - c.z); shot.side = side(1) < side(-1) ? 1 : -1;
  talkWho.textContent = n.name; talkWho.style.background = n.color;
  document.body.classList.add("talking"); talkEl.style.display = "block";
  const first = open || (n.hidden ? "found" : n.talks++ ? "again" : "hello");
  if (n.hidden) { n.hidden = false; n.hx = n.home[0]; n.hz = n.home[1]; }
  goTalk(first);
}
function goTalk(target) {
  const n = talk && talk.n; if (!n) return;
  let node = typeof target === "function" ? target(n) : target;
  if (!talk) return;   // the answer ended the talk itself (opening a shop)
  if (typeof node === "string") node = node === "menu" ? { say: [pick(n.more)], opts: "menu" } : n.says[node];
  if (typeof node === "function") node = node(n);
  if (!node) return endTalk();
  const say = typeof node.say === "function" ? node.say(n) : node.say || [];
  talk.q = say.map((l) => (typeof l === "function" ? l(n) : l).replace(/\{name\}/g, save.name));
  talk.opts = node.opts === "menu" ? n.menu : node.opts || null; talk.then = node.then || null; talk.i = -1;
  nextLine();
}
function nextLine() {
  const t = talk; t.i++; talkOpts.innerHTML = ""; talkEl.classList.remove("more");
  if (t.i >= t.q.length) { if (t.opts) return showOpts(); return endTalk(t.then); }
  const line = t.q[t.i]; t.shown = 0; t.hold = 0; t.cps = Math.max(t.n.cps || 45, line.length / TYPE_MAX); talkText.textContent = "";
}
function lineDone() {
  const t = talk; talkText.textContent = t.q[t.i];
  if (t.i === t.q.length - 1 && t.opts) showOpts(); else talkEl.classList.add("more");
}
function showOpts() {
  talkOpts.innerHTML = ""; talkEl.classList.remove("more");
  talk.opts.forEach(([label, target], k) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "btn ghost small"; b.innerHTML = touchy ? "" : `<kbd>${k + 1}</kbd>`; b.append(document.createTextNode(label));
    b.onclick = (e) => { e.stopPropagation(); goTalk(target); }; talkOpts.appendChild(b);
  });
}
function talkStep(dt) {
  const t = talk; if (!t || t.i < 0 || t.i >= t.q.length) return;
  const line = t.q[t.i];
  if (t.shown < line.length) { const was = Math.floor(t.shown); t.shown = Math.min(line.length, t.shown + dt * t.cps); if (Math.floor(t.shown) !== was) talkText.textContent = line.slice(0, Math.floor(t.shown)); if (t.shown >= line.length) lineDone(); return; }
}
function talkNext() {   // a click or tap: finish the line, or on to the next
  const t = talk; if (!t || t.i < 0 || t.i >= t.q.length) return;
  const line = t.q[t.i];
  if (t.shown < line.length) { t.shown = line.length; lineDone(); return; }
  if (t.i < t.q.length - 1 || !t.opts) nextLine();
}
function talkPick(k) { if (talk && talk.opts && talkOpts.children[k]) talkOpts.children[k].click(); }
function endTalk(then) {
  const t = talk; if (!t) return; talk = null; t.n.cool = 0.6;
  document.body.classList.remove("talking"); talkEl.style.display = "none"; talkOpts.innerHTML = ""; talkText.textContent = "";
  if (then) then(t.n); else if (intro && intro.talking) introGo("done");   // walked away (Escape): the walk-through is skipped
}
talkEl.addEventListener("click", talkNext);
// the screen blinks to black and back (Penny hiding)
function blink(fn) { const f = $("fade"); f.classList.add("on"); setTimeout(fn, 450); setTimeout(() => f.classList.remove("on"), 1100); }
// the camera close on them, from the front and a little to one side, their head above the middle of the screen
function shotAt(n) {
  const a = shot.yaw + 0.75 * shot.side, D = 2.3 + 1.4 * n.s;
  SH.cx = n.x + Math.sin(a) * D; SH.cz = n.z + Math.cos(a) * D; SH.cy = n.y + 1.95 * n.s + 0.25;
  SH.lx = n.x; SH.ly = n.y + 1.5 * n.s; SH.lz = n.z;
}
// each lot someone lives on: a pale outline on the ground and a sign with its owner's name (built with their house)
const LOT_LINE_M = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.5 });
function lotLines(p, g) { const o = plotOrigin(p); for (const [w, d, x, z] of [[PLOT, 0.25, PLOT / 2, 0], [PLOT, 0.25, PLOT / 2, PLOT], [0.25, PLOT, 0, PLOT / 2], [0.25, PLOT, PLOT, PLOT / 2]]) { const b = new THREE.Mesh(BOX, LOT_LINE_M); b.scale.set(w, 0.06, d); b.position.set(o.x + x, o.y + 0.08, o.z + z); g.add(b); } }
// one mesh per house: every box of every piece in one geometry, coloured per vertex (glass on its own)
function Merger() { this.p = []; this.n = []; this.c = []; this.i = []; }
const unitBox = new THREE.BoxGeometry(1, 1, 1), mtx = new THREE.Matrix4(), nmx = new THREE.Matrix3(), qq = new THREE.Quaternion(), ee = new THREE.Euler(), vv = new THREE.Vector3(), sc = new THREE.Vector3(), colr = new THREE.Color();
Merger.prototype.box = function (w, h, d, x, y, z, ry, color, rx = 0) {
  ee.set(rx, ry, 0, "YXZ"); qq.setFromEuler(ee); mtx.compose(vv.set(x, y, z), qq, sc.set(w, h, d)); nmx.getNormalMatrix(mtx); colr.set(color);
  const P = unitBox.attributes.position, N = unitBox.attributes.normal, I = unitBox.index, base = this.p.length / 3, t = new THREE.Vector3();
  for (let k = 0; k < P.count; k++) { t.fromBufferAttribute(P, k).applyMatrix4(mtx); this.p.push(t.x, t.y, t.z); t.fromBufferAttribute(N, k).applyMatrix3(nmx).normalize(); this.n.push(t.x, t.y, t.z); this.c.push(colr.r, colr.g, colr.b); }
  for (let k = 0; k < I.count; k++) this.i.push(base + I.getX(k));
};
Merger.prototype.mesh = function (material) {
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3)); g.setIndex(this.i);
  const m = new THREE.Mesh(g, material); m.castShadow = true; m.receiveShadow = true; return m;
};
const houseMat = new THREE.MeshLambertMaterial({ vertexColors: true }), houseGlass = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false });
// ---- houses (owner, 2026-11-09: rebuilt). Outside, each lot has one of 5 ready-made houses (home.ext); its front door
// (E) leads inside, to the house's own space: a 20 x 20 m floor and the front door, a black void round them, built
// freely. Everyone in the same house (me.inst: whose house) sees each other there. ----
const INT = { x: 3000, z: 3000, y: 0 };   // where a house's inside is drawn (far off; only the one I'm in)
const inHouse = () => me.inst > 0;
let inter = null;   // the inside I'm in: { owner, g, col, layers, pens, pieces }
// collision shapes, turned rectangles: point-in tests in their own frame
// does the line from (x0, z0) to (x1, z1) cross a turned rectangle (grown by m)?
function segRect(r, x0, z0, x1, z1, m = 0) {
  const lx = (x, z) => (x - r.x) * r.c - (z - r.z) * r.s, lz = (x, z) => (x - r.x) * r.s + (z - r.z) * r.c;
  const ax = lx(x0, z0), az = lz(x0, z0), dx = lx(x1, z1) - ax, dz = lz(x1, z1) - az; let t0 = 0, t1 = 1;
  for (const [p, d, h] of [[ax, dx, r.hw + m], [az, dz, r.hd + m]]) {
    if (Math.abs(d) < 1e-9) { if (Math.abs(p) > h) return false; continue; }
    let a = (-h - p) / d, b = (h - p) / d; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) return false;
  }
  return true;
}
const inRect = (r, x, z, m = 0) => { const dx = x - r.x, dz = z - r.z, lx = dx * r.c - dz * r.s, lz = dx * r.s + dz * r.c; return Math.abs(lx) < r.hw + m && Math.abs(lz) < r.hd + m ? [lx, lz] : null; };
const VIEW_TEX = World.VIEWS.map((name, i) => {   // what a window looks out on (painted)
  const c = document.createElement("canvas"); c.width = 256; c.height = 192; const g = c.getContext("2d");
  const sky = [["#8fd3ff", "#d8f1ff"], ["#7cc8ff", "#e9f7ff"], ["#9cc7ef", "#e6f1fb"], ["#0b1736", "#22305e"], ["#9fd6a0", "#e2f5d9"], ["#f5a25d", "#ffd9a8"]][i];
  const gr = g.createLinearGradient(0, 0, 0, 192); gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]); g.fillStyle = gr; g.fillRect(0, 0, 256, 192);
  const hill = (col, y, amp, f) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, 192); for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x * f) * amp); g.lineTo(256, 192); g.fill(); };
  if (i === 0) { hill("#8fd06a", 120, 10, 0.03); hill("#6cb84f", 145, 8, 0.05); for (let k = 0; k < 14; k++) { g.fillStyle = ["#ffd35a", "#ff8fb1", "#ffffff"][k % 3]; g.beginPath(); g.arc(10 + k * 18, 160 + (k % 3) * 9, 3, 0, TAU); g.fill(); } }
  if (i === 1) { g.fillStyle = "#3aa7d8"; g.fillRect(0, 105, 256, 40); g.fillStyle = "#f3dfa7"; g.fillRect(0, 145, 256, 47); g.fillStyle = "#ffe066"; g.beginPath(); g.arc(200, 40, 18, 0, TAU); g.fill(); }
  if (i === 2) { g.fillStyle = "#7d8a9c"; g.beginPath(); g.moveTo(0, 150); g.lineTo(70, 50); g.lineTo(130, 140); g.lineTo(180, 40); g.lineTo(256, 150); g.lineTo(256, 192); g.lineTo(0, 192); g.fill(); g.fillStyle = "#ffffff"; for (const [x, y] of [[70, 50], [180, 40]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x - 18, y + 26); g.lineTo(x + 18, y + 26); g.fill(); } hill("#6fae5a", 160, 6, 0.04); }
  if (i === 3) { for (let k = 0; k < 60; k++) { g.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.6})`; g.fillRect(Math.random() * 256, Math.random() * 140, 2, 2); } g.fillStyle = "#f4f1d0"; g.beginPath(); g.arc(190, 45, 16, 0, TAU); g.fill(); hill("#14213d", 160, 8, 0.04); }
  if (i === 4) { hill("#4f9a4a", 150, 6, 0.04); for (let k = 0; k < 11; k++) { const x = 12 + k * 23, h = 50 + (k * 37) % 40; g.fillStyle = "#6b4a2b"; g.fillRect(x - 3, 160 - h * 0.3, 6, h * 0.3); g.fillStyle = k % 2 ? "#2f7a3a" : "#3f9a46"; g.beginPath(); g.moveTo(x, 150 - h); g.lineTo(x - 16, 165 - h * 0.3); g.lineTo(x + 16, 165 - h * 0.3); g.fill(); } }
  if (i === 5) { for (let k = 0; k < 12; k++) { const x = k * 22, h = 50 + ((k * 53) % 70); g.fillStyle = k % 2 ? "#4a4f6a" : "#5b6183"; g.fillRect(x, 192 - h, 20, h); g.fillStyle = "#ffe08a"; for (let y = 192 - h + 8; y < 186; y += 12) for (let wx = x + 3; wx < x + 17; wx += 7) if ((wx + y) % 3) g.fillRect(wx, y, 4, 5); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
});
const viewMats = VIEW_TEX.map((map) => new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }));
const VIEW_G = new THREE.PlaneGeometry(1.8, 1.8);
// a piece's boxes (into M, glass into G), what it does to walking (into col) and its window views (into W), at the
// house space's corner o
function pieceBoxes(t, o, M, G, col, W) {
  const lb = o.y + t.l * LEVEL_H, C = COLORS[t.c] || COLORS[0], ry = (t.a * Math.PI) / 180, cs = Math.cos(ry), sn = Math.sin(ry), px = o.x + t.x, pz = o.z + t.z, H = LEVEL_H, T = 0.25;
  const wx = (lx, lz) => px + lx * cs + lz * sn, wz = (lx, lz) => pz - lx * sn + lz * cs;
  const at = (lx, ly, lz, w, h, d, color, rx = 0, glass = false) => (glass ? G : M).box(w, h, d, wx(lx, lz), lb + ly, wz(lx, lz), ry, color, rx);
  const rect = (lx, lz, hw, hd) => ({ x: wx(lx, lz), z: wz(lx, lz), c: cs, s: sn, hw, hd });
  if (t.k === "floor") { at(0, 0.125, 0, 4, 0.25, 4, t.c === 0 ? "#c9a27e" : C); col.surfaces.push({ ...rect(0, 0, 2, 2), h: lb + 0.25 }); return; }
  if (t.k === "roof") { at(0, H + 0.15, 0, 4.2, 0.3, 4.2, C); col.surfaces.push({ ...rect(0, 0, 2.1, 2.1), h: lb + H + 0.3 }); return; }
  if (t.k === "slope") { const rise = 2.2, len = hyp(4, rise), ang = Math.atan2(rise, 4); at(0, H + rise / 2 + 0.12, 0, 4.2, 0.25, len + 0.1, C, -ang); col.ramps.push({ ...rect(0, 0, 2, 2), y0: lb + H, rise }); return; }
  if (t.k === "stairs") { for (let n = 0; n < 10; n++) { const sh = ((n + 1) / 10) * H; at(0, sh / 2, -2 + (n + 0.5) * 0.4, 3.4, sh, 0.4, n % 2 ? "#b88a5e" : "#a87a4e"); } col.ramps.push({ ...rect(0, 0, 1.7, 2), y0: lb + 0.25, rise: H }); return; }
  if (PIECES[t.k] && PIECES[t.k].t === "wall") {
    const seg = (a, b, y0, y1, color = C) => { at((a + b) / 2 - 2, (y0 + y1) / 2, 0, b - a, y1 - y0, T, color); col.walls.push({ ...rect((a + b) / 2 - 2, 0, (b - a) / 2, T / 2), y0: lb + y0, y1: lb + y1 }); };
    if (t.k === "wall") seg(0, 4, 0, H);
    else if (t.k === "window") { seg(0, 1, 0, H); seg(3, 4, 0, H); seg(1, 3, 0, 1.1); seg(1, 3, 2.9, H); at(0, 1.1, 0, 2.1, 0.12, 0.45, "#ffffff"); if (W) W.push({ x: wx(0, 0), y: lb + 2, z: wz(0, 0), ry, w: t.w | 0 }); }
    else { seg(0, 1.1, 0, H); seg(2.9, 4, 0, H); seg(1.1, 2.9, 2.8, H); for (const a of [-0.9, 0.9]) at(a, 1.4, 0, 0.12, 2.8, 0.32, "#8a5a3a"); }
    return;
  }
  const f = (lx, ly, lz, w, h, d, color) => at(lx, 0.25 + ly, lz, w, h, d, color);
  switch (t.k) {
    case "bed": f(0, 0.15, 0, 1.8, 0.3, 1.4, "#8a5a3a"); f(0, 0.33, 0, 1.5, 0.16, 1.1, C === COLORS[0] ? "#9ad0ff" : C); f(0, 0.45, -0.62, 1.8, 0.6, 0.16, "#8a5a3a"); f(-0.82, 0.38, 0, 0.16, 0.45, 1.4, "#8a5a3a"); f(0.82, 0.38, 0, 0.16, 0.45, 1.4, "#8a5a3a"); break;
    case "pen": for (let n = 0; n < 12; n++) { const a = (n / 12) * TAU; f(Math.cos(a) * 1.9, 0.45, Math.sin(a) * 1.9, 0.14, 0.9, 0.14, "#c98b4f"); } for (let n = 0; n < 4; n++) { const a = (n / 4) * TAU + Math.PI / 4; f(Math.cos(a) * 1.35, 0.8, Math.sin(a) * 1.35, n % 2 ? 0.08 : 2.6, 0.08, n % 2 ? 2.6 : 0.08, "#c98b4f"); } f(0, 0.02, 0, 3.6, 0.04, 3.6, "#9bd66f"); break;
    case "chair": f(0, 0.45, 0, 0.6, 0.08, 0.6, C === COLORS[0] ? "#c98b4f" : C); f(0, 0.85, -0.27, 0.6, 0.8, 0.08, C === COLORS[0] ? "#c98b4f" : C); for (const [a, b] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) f(a, 0.22, b, 0.07, 0.45, 0.07, "#7a4f28"); break;
    case "table": f(0, 0.8, 0, 1.8, 0.1, 1.1, C === COLORS[0] ? "#b88a5e" : C); for (const [a, b] of [[-0.8, -0.45], [0.8, -0.45], [-0.8, 0.45], [0.8, 0.45]]) f(a, 0.38, b, 0.1, 0.76, 0.1, "#7a4f28"); break;
    case "shelf": f(-0.78, 1, 0, 0.06, 2, 0.4, "#8a5a3a"); f(0.78, 1, 0, 0.06, 2, 0.4, "#8a5a3a"); for (const h of [0.1, 0.7, 1.3, 1.95]) f(0, h, 0, 1.6, 0.06, 0.4, "#8a5a3a"); for (const [a, h, c] of [[-0.5, 0.85, "#e5534b"], [-0.3, 0.85, "#3a8ee6"], [0.4, 1.45, "#f2b01e"], [0.1, 0.25, "#3fb36b"]]) f(a, h, 0, 0.14, 0.24, 0.26, c); break;
    case "cabinet": f(0, 0.7, 0, 1.2, 1.4, 0.6, C === COLORS[0] ? "#c9a27e" : C); f(0, 0.7, 0.31, 0.03, 1.3, 0.02, "#7a4f28"); f(-0.1, 0.8, 0.32, 0.05, 0.15, 0.04, "#f2b01e"); f(0.1, 0.8, 0.32, 0.05, 0.15, 0.04, "#f2b01e"); break;
    case "plant": f(0, 0.25, 0, 0.5, 0.5, 0.5, "#c8553d"); f(0, 0.8, 0, 0.7, 0.6, 0.7, "#4fae4a"); f(0.15, 1.2, 0.1, 0.45, 0.5, 0.45, "#5fbe5a"); f(-0.15, 1.15, -0.1, 0.4, 0.45, 0.4, "#3f9e3a"); break;
    case "rug": f(0, 0.015, 0, 2.6, 0.03, 1.8, C === COLORS[0] ? "#e5739d" : C); f(0, 0.02, 0, 2.2, 0.03, 1.4, "#fbe7a8"); break;
    case "poster": f(0, 1.7, 0, 1.0, 1.4, 0.05, "#ffffff"); f(0, 1.75, 0.03, 0.85, 0.75, 0.02, C === COLORS[0] ? "#3a8ee6" : C); f(0, 1.25, 0.03, 0.85, 0.15, 0.02, "#f2b01e"); break;
  }
}
// roughly how far a piece reaches (for pointing at it): [half along, half across]
const pieceSize = (t) => (PIECES[t.k].t === "tile" ? [2.1, 2.1] : PIECES[t.k].t === "wall" ? [2, 0.5] : t.k === "pen" ? [2, 2] : t.k === "rug" ? [1.3, 0.9] : t.k === "bed" || t.k === "table" ? [0.95, 0.75] : [0.7, 0.6]);
// ---- the 5 houses outside: each a few boxes, its door at the front (toward the lot's front, -z) ----
function exteriorBoxes(ext, p, M, G, col) {
  // (owner, 2026-11-10) drawn facing -z, then turned with the lot (p.yaw) so its front faces the way the town house did
  const y = p.y, a = p.yaw || 0, ca = Math.cos(a), sa = Math.sin(a), W = (x, z) => lotPoint(p, x, z);
  const rect = (o, turn = 0) => { const [x, z] = W(o.x, o.z), c0 = o.c, s0 = o.s; return { ...o, x, z, c: c0 * ca - s0 * sa, s: s0 * ca + c0 * sa }; };   // a collision box (in the lot's frame) in the world
  const b = (w, h, d, x, yy, z, color, rx = 0, glass = false) => { const [wx, wz] = W(x, z); (glass ? G : M).box(w, h, d, wx, y + yy, wz, a, color, rx); };
  const solid = (hw, hd, h, x = 0, z = 0) => col.walls.push(rect({ x, z, c: 1, s: 0, hw, hd, y0: y - 1, y1: y + h }));
  const flat = (hw, hd, h, x = 0, z = 0) => col.surfaces.push(rect({ x, z, c: 1, s: 0, hw, hd, h: y + h }));
  const gable = (w, d, h0, rise, color, x = 0, z = 0, wall = null) => {   // a pitched roof, ridge along x; walkable both sides
    const half = d / 2 + 0.6, len = hyp(half, rise), ang = Math.atan2(rise, half);
    if (wall) { const N = 8; for (let n = 0; n < N; n++) b(w, rise / N + 0.02, Math.max(0.2, d * (1 - (n + 0.5) / N)), x, h0 + rise * (n + 0.5) / N, z, wall); }   // (owner, 2026-11-10) the gable ends filled in under the roof
    b(w + 1.2, 0.3, len, x, h0 + rise / 2, z - half / 2, color, -ang); b(w + 1.2, 0.3, len, x, h0 + rise / 2, z + half / 2, color, ang);
    col.ramps.push(rect({ x, z: z - half / 2, c: 1, s: 0, hw: w / 2 + 0.6, hd: half / 2, y0: y + h0, rise })); col.ramps.push(rect({ x, z: z + half / 2, c: -1, s: 0, hw: w / 2 + 0.6, hd: half / 2, y0: y + h0, rise }));
  };
  const door = (z, color = "#7a4f28", w = 1.8, h = 3) => { b(w, h, 0.2, 0, h / 2, z - 0.1, color); b(0.18, 0.18, 0.1, 0.55, h * 0.5, z - 0.25, "#f2b01e"); };
  const win = (x, yy, z, w = 1.6, h = 1.4) => { b(w + 0.3, h + 0.3, 0.16, x, yy, z - 0.05, "#ffffff"); b(w, h, 0.18, x, yy, z - 0.1, "#9fd8ff", 0, true); };
  let fd = 10;
  if (ext === 0) {   // Cottage: cream walls, a red gable roof, a chimney
    b(12, 5, 10, 0, 2.5, 0, "#f4ead8"); solid(6, 5, 5); gable(12, 10, 5, 3, "#c8553d", 0, 0, "#f4ead8"); b(1.2, 3, 1.2, 3.5, 7, 1.5, "#9a8f80");
    door(-5); win(-3.6, 2.8, -5); win(3.6, 2.8, -5); fd = 10;
  } else if (ext === 1) {   // Cabin: log walls, a green roof, a porch
    for (let k = 0; k < 9; k++) b(12.2, 0.56, 10.2, 0, 0.28 + k * 0.56, 0, k % 2 ? "#8a5a3a" : "#7a4a2a"); solid(6.1, 5.1, 5); gable(12, 10, 5, 2.4, "#5a3a2a", 0, 0, "#7a4a2a");
    b(6, 0.25, 3, 0, 3.4, -6.3, "#4f7a3a"); for (const x of [-2.8, 2.8]) b(0.3, 3.4, 0.3, x, 1.7, -7.6, "#6b4a2b"); b(6, 0.2, 3, 0, 0.1, -6.3, "#a87a4e"); flat(3, 1.5, 3.55, 0, -6.3);
    door(-5.1, "#5a3a1a"); win(-3.6, 2.8, -5.1); win(3.6, 2.8, -5.1); fd = 10.2;
  } else if (ext === 2) {   // Modern: two white blocks, flat roofs, wide glass
    b(14, 4.5, 10, 0, 2.25, 0, "#f7f7f2"); b(14.4, 0.3, 10.4, 0, 4.6, 0, "#3d4650"); solid(7, 5, 4.75); flat(7.2, 5.2, 4.75);
    b(9, 4, 8, 2, 6.75, 1, "#e8eef3"); b(9.4, 0.3, 8.4, 2, 8.9, 1, "#3d4650"); col.walls.push(rect({ x: 2, z: 1, c: 1, s: 0, hw: 4.5, hd: 4, y0: y + 4.6, y1: y + 9.05 })); flat(4.7, 4.2, 9.05, 2, 1);
    b(5, 2.6, 0.18, -4, 2, -5.1, "#9fd8ff", 0, true); b(6, 2.4, 0.18, 2, 6.8, -3.1, "#9fd8ff", 0, true); door(-5, "#3d4650", 1.8, 3.2); fd = 10;
  } else if (ext === 3) {   // Barn: red with white trim and a tall two-step roof
    b(12, 5.5, 12, 0, 2.75, 0, "#b8433a"); solid(6, 6, 5.5); gable(12, 12, 5.5, 4, "#5a3a32", 0, 0, "#b8433a");
    b(4, 4, 0.2, 0, 2, -6.1, "#f4f1ea"); b(3.6, 3.6, 0.22, 0, 2, -6.12, "#b8433a"); b(0.25, 5, 0.24, 0, 2, -6.15, "#f4f1ea", 0.78); b(0.25, 5, 0.24, 0, 2, -6.15, "#f4f1ea", -0.78);
    win(0, 6.6, -6.2, 1.6, 1.4); fd = 12;
  } else {   // Tower: grey stone, battlements on a flat top, a flag
    b(9, 10, 9, 0, 5, 0, "#9aa0a8"); solid(4.5, 4.5, 10); flat(4.5, 4.5, 10);
    for (let k = 0; k < 4; k++) for (const s of [-1, 1]) { const along = -3.4 + k * 2.27; b(1.1, 1, 1.1, along, 10.5, s * 4, "#8a9098"); b(1.1, 1, 1.1, s * 4, 10.5, along, "#8a9098"); }
    b(0.15, 4, 0.15, 3, 12, 3, "#5b4a3a"); b(1.6, 1, 0.08, 3.8, 13.4, 3, "#e5534b");
    for (const yy of [3.5, 7]) win(0, yy, -4.6, 1, 1.6); door(-4.5, "#5b4a3a", 2, 3.2); fd = 9;
  }
  return fd;
}
// a lot: the house outside (everyone sees it), the owner's name on a post
function buildPlot(id) {
  const st = plotState.get(id), p = LOT(id); if (!st) return;
  if (st.g) scene.remove(st.g);
  if (!p) { st.g = null; st.col = null; return; }   // (owner, 2026-11-10) its town house is gone
  const M = new Merger(), G = new Merger(), col = { walls: [], surfaces: [], ramps: [] }, g = new THREE.Group();
  st.fd = exteriorBoxes(st.ext | 0, p, M, G, col);
  g.add(M.mesh(houseMat)); if (G.p.length) g.add(G.mesh(houseGlass));
  lotLines(p, g);
  if (st.name) { const [nx, nz] = lotPoint(p, -PLOT / 2 + 1, -PLOT / 2 - 0.6), tag = nameTag(st.name, 0); tag.position.set(nx, p.y + 3.4, nz); g.add(tag); box(0.15, 2.4, 0.15, "#8a5a3a", nx, p.y + 1.2, nz, g); }
  scene.add(g); st.g = g; st.col = col;
}
// the inside of a house (whose: owner), where I am in it
function buildInside(owner, pieces) {
  if (inter && inter.g) scene.remove(inter.g);
  const o = { x: INT.x, y: INT.y, z: INT.z }, Ms = [], Gs = [], Ws = [], col = { walls: [], surfaces: [], ramps: [] }, g = new THREE.Group(), pens = [];
  for (let k = 0; k <= LEVELS; k++) { Ms.push(new Merger()); Gs.push(new Merger()); Ws.push([]); }
  Ms[0].box(World.HOME_SIZE, 0.25, World.HOME_SIZE, o.x + World.HOME_SIZE / 2, o.y + 0.125, o.z + World.HOME_SIZE / 2, 0, "#c9a27e");   // the floor, always there
  col.surfaces.push({ x: o.x + World.HOME_SIZE / 2, z: o.z + World.HOME_SIZE / 2, c: 1, s: 0, hw: World.HOME_SIZE / 2, hd: World.HOME_SIZE / 2, h: o.y + 0.25 });
  pieceBoxes({ k: "door", x: World.FRONT_DOOR.x, z: World.FRONT_DOOR.z, l: 0, a: 0, c: 10 }, o, Ms[0], Gs[0], col, null);   // and the front door
  const walls = [];   // (owner, 2026-11-09) walls each on their own, to go see-through between the camera and me
  for (const t of pieces) {
    if (!PIECES[t.k]) continue; const layer = t.k === "roof" || t.k === "slope" ? t.l + 1 : t.l;
    if (PIECES[t.k].t === "wall") { const M1 = new Merger(), c1 = { walls: [], surfaces: [], ramps: [] }; pieceBoxes(t, o, M1, Gs[layer], c1, Ws[layer]); col.walls.push(...c1.walls); const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 1 }), mesh = M1.mesh(mat); walls.push({ mesh, mat, rects: c1.walls, layer, a: 1 }); Ms[layer].wallMeshes = (Ms[layer].wallMeshes || []).concat(mesh); continue; }
    pieceBoxes(t, o, Ms[layer], Gs[layer], col, Ws[layer]);
    if (t.k === "pen" && t.pet) { const pet = (owner === myId ? save.pets : []).find((q) => q.id === t.pet), st = [...plotState.values()].find((s) => s.id === owner), sp = pet ? pet.sp : st && st.penSp && st.penSp[t.pet]; if (sp && SPECIES[sp]) { const m = petModel(sp); m.g.scale.setScalar(0.7); g.add(inColor(m.g)); const x = o.x + t.x, z = o.z + t.z, y = o.y + t.l * LEVEL_H + 0.25; pens.push({ m, cx: x, cz: z, x, z, y, yaw: 0, tx: x, tz: z, wait: 0 }); } }
  }
  const layers = [];
  for (let k = 0; k <= LEVELS; k++) {
    const lg = new THREE.Group(); if (Ms[k].p.length) lg.add(Ms[k].mesh(houseMat)); if (Gs[k].p.length) lg.add(Gs[k].mesh(houseGlass)); for (const m of Ms[k].wallMeshes || []) lg.add(m);
    for (const w of Ws[k]) { const v = new THREE.Mesh(VIEW_G, viewMats[w.w] || viewMats[0]); v.position.set(w.x, w.y, w.z); v.rotation.y = w.ry; lg.add(v); }
    g.add(lg); layers.push(lg);
  }
  scene.add(g); inter = { owner, g, col, layers, pens, pieces, walls };
}
// inside a house the floors above mine (and the roof) are hidden, so I can see in
function cutaway() {
  if (!inter) return;
  const L = Math.floor((me.y - INT.y + 0.6) / LEVEL_H);
  inter.layers.forEach((lg, k) => (lg.visible = k <= L));
  // a wall between the camera and me fades to see-through
  const hx = me.x, hz = me.z, cx = camera.position.x, cz = camera.position.z, dt = 1 / 60;
  for (const w of inter.walls) {
    const hit = w.layer === L && w.rects.some((r) => segRect(r, cx, cz, hx, hz, 0.25));
    w.a += ((hit ? 0.2 : 1) - w.a) * 0.2; w.mat.opacity = w.a; w.mat.depthWrite = w.a > 0.95; w.mesh.renderOrder = w.a > 0.95 ? 0 : 3;
  }
}
function setPlot(id, owner, name, pieces, penSp, ext) {
  const st = plotState.get(id); if (st && st.g) scene.remove(st.g);
  if (!owner) { plotState.delete(id); if (inter && st && inter.owner === st.id && me.inst === st.id) leaveHouse(true); }
  else { plotState.set(id, { id: owner, name, pieces: pieces || [], penSp: penSp || {}, ext: ext | 0 }); buildPlot(id); if (me.inst === owner && owner !== myId) buildInside(owner, pieces || []); }
  syncLots();
}
function refreshMyPlot() { if (myPlot >= 0 && save.home) setPlot(myPlot, myId, myName, save.home.pieces, null, save.home.ext); if (me.inst === myId && save.home) buildInside(myId, save.home.pieces); }
// walking: the floors, steps and slopes under me, and walls in the way (outside: the houses on lots; inside: this house)
function nearPlots(x, z, m = 2) { if (inHouse()) return inter ? [inter.col] : []; const out = []; for (const [id, st] of plotState) { const p = LOT(id); if (st.col && p && Math.abs(x - p.x) < PLOT / 2 + m && Math.abs(z - p.z) < PLOT / 2 + m) out.push(st.col); } return out; }
function houseSurface(x, z, y) {
  let best = -Infinity;
  for (const col of nearPlots(x, z)) {
    for (const s of col.surfaces) if (s.h <= y + 0.6 && s.h > best && inRect(s, x, z)) best = s.h;
    for (const r of col.ramps) { const q = inRect(r, x, z); if (q) { const h = r.y0 + clamp((q[1] / r.hd + 1) / 2, 0, 1) * r.rise; if (h <= y + 0.6 && h > best) best = h; } }
  }
  return best;
}
function houseWall(x, z, y) {
  for (const col of nearPlots(x, z)) for (const w of col.walls) if (y + 0.3 < w.y1 && y + 1.9 > w.y0 && inRect(w, x, z, 0.45)) return true;
  return false;
}
let stuckFor = 0;
// going in and out of houses: the front door outside (E: the owner, or someone in their party) and inside
function lotDoor(id) { const p = LOT(id), st = plotState.get(id); if (!p) return { x: 0, z: 0, y: -1000 }; const [x, z] = lotPoint(p, 0, -(st && st.fd ? st.fd : 10) / 2 - 1.4); return { x, z, y: p.y }; }
function nearDoor() {
  if (inHouse() || !loggedIn) return null;
  for (const [id, st] of plotState) { const d = lotDoor(id); if (hyp(me.x - d.x, me.z - d.z) < 2.6 && Math.abs(me.y - d.y) < 2.5 && (st.id === myId || party.some((q) => q.id === st.id))) return id; }
  return null;
}
function enterHouse(id) {
  const st = plotState.get(id); if (!st) return;
  if (building) closeBuild();
  me.inst = st.id; buildInside(st.id, st.id === myId ? save.home.pieces : st.pieces);
  me.x = INT.x + World.FRONT_DOOR.x; me.z = INT.z + World.FRONT_DOOR.z + 2; me.y = INT.y + 0.25; me.vy = 0; me.yaw = 0; cam.yaw = Math.PI; cam.y = me.y;
  if (st.id === myId) collectPens();
  sendPos(true); uiKey = "";
}
function leaveHouse(gone) {
  const id = [...plotState.keys()].find((k) => plotState.get(k).id === me.inst);
  if (building) closeBuild();
  me.inst = 0; if (inter) { scene.remove(inter.g); inter = null; }
  if (id !== undefined && !gone) { const d = lotDoor(id); me.x = d.x; me.z = d.z - 1.2; me.y = floorAt(me.x, me.z, d.y + 3); me.yaw = Math.PI; cam.yaw = 0; }
  else { me.x = SPAWN.x; me.z = SPAWN.z; me.y = terrain(me.x, me.z); }
  me.vy = 0; cam.y = me.y; sendPos(true); uiKey = "";
}
const nearFrontDoor = () => inHouse() && hyp(me.x - (INT.x + World.FRONT_DOOR.x), me.z - (INT.z + World.FRONT_DOOR.z)) < 2.4 && me.y < INT.y + 2;
// playpens: their coins (collected when you come into your house), and choosing their pet
function collectPens() {
  if (!save.home) return 0;
  let total = 0; const now = Date.now();
  for (const t of save.home.pieces) if (t.k === "pen" && t.pet) {
    const p = save.pets.find((q) => q.id === t.pet); if (!p) { delete t.pet; continue; }
    const min = Math.min((now - (t.since || now)) / 60000, World.PEN_MAX_H * 60);
    total += min * World.PEN_RATE[SPECIES[p.sp].r] * (1 + 0.05 * (p.lv - 1)); t.since = now;
  }
  total = Math.floor(total);
  if (total > 0) { save.coins += total; toast("+" + fmt(total), "#e08a00"); emitConfetti(me.x, me.y + 3, me.z, 40, 4, 7); hudKey = ""; }
  persist(); return total;
}
let picking = -1;
function renderPenPick() {
  const el = $("build"), t = save.home.pieces[picking]; el.innerHTML = ""; if (!t || t.k !== "pen") { closePanels(); return; }
  const pens = World.penPets(save), grid = document.createElement("div"); grid.className = "grid";
  const none = document.createElement("div"); none.className = "card"; none.innerHTML = `<span class="nm">—</span>`; none.onclick = () => setPen(picking, null); grid.appendChild(none);
  for (const p of save.pets) if (p.id !== save.ride && (!pens.has(p.id) || t.pet === p.id)) grid.appendChild(card(p.sp, statLine(p), t.pet === p.id, () => setPen(picking, p.id)));
  el.appendChild(grid);
}
function setPen(i, id) {
  collectPens(); const t = save.home.pieces[i]; if (!t) return;
  if (id) { t.pet = id; t.since = Date.now(); } else { delete t.pet; delete t.since; }
  picking = -1; persist(); flushSave(true); refreshMyPlot(); closePanels();
}

// ---- building (owner, 2026-11-09). Outside on your lot: pick one of the 5 houses. Inside your house: pick a piece in
// the bar; it follows the pointer on the floor you're on, shown as it will look (red when you can't afford it), placed
// anywhere at any angle (R or ⟳ turns it 15°; walls and tiles meet up when brought close); a tap puts it down. A
// window takes the view chosen in the bar. Delete: what you point at shows red; a tap selects it; Del (or the Del
// button) removes it for half its price. Paint recolours what you tap. ----
const TOOLS = [["floor", "Floor"], ["wall", "Wall"], ["window", "Window"], ["door", "Door"], ["roof", "Roof"], ["slope", "Slope roof"], ["stairs", "Stairs"],
  ["bed", "Pet bed"], ["pen", "Pet pen"], ["chair", "Chair"], ["table", "Table"], ["shelf", "Shelf"], ["cabinet", "Cabinet"], ["plant", "Plant"], ["rug", "Rug"], ["poster", "Poster"]];
let building = null;   // outside: { mode: "ext" }; inside: { mode: "in", tool, a, color, w, hover, sel }
const ghostOk = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false }), ghostBad = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, color: "#ff7a70" });
const ghostRed = new THREE.MeshBasicMaterial({ color: "#ff3b30", transparent: true, opacity: 0.55, depthWrite: false }), ghostSel = new THREE.MeshBasicMaterial({ color: "#ff3b30", transparent: true, opacity: 0.8, depthWrite: false });
let bghost = new THREE.Group(), ghostKey = "", markG = new THREE.Group(), markKey = "";
scene.add(bghost, markG); bghost.visible = false;
const onMyPlot = (m = 2) => !inHouse() && myPlot >= 0 && !!LOT(myPlot) && Math.abs(me.x - LOT(myPlot).x) < PLOT / 2 + m && Math.abs(me.z - LOT(myPlot).z) < PLOT / 2 + m;
const curLevel = () => clamp(Math.floor((me.y - INT.y + 0.6) / LEVEL_H), 0, LEVELS - 1);
let camSave = null;
function openBuild() {
  if (wedit) closeWorldEdit();
  if (me.inst === myId) { building = { mode: "in", tool: "floor", a: 0, color: 0, w: 0, hover: -1, sel: -1 }; }
  else if (onMyPlot()) { building = { mode: "ext" }; camSave = { d: cam.goalDist, p: cam.pitch }; cam.goalDist = 30; cam.pitch = 0.6; }
  else return;
  closePanels(); renderBuildBar(); $("buildbar").style.display = "flex"; uiKey = "";
}
function closeBuild() { building = null; bghost.visible = false; markG.visible = false; $("buildbar").style.display = "none"; if (camSave) { cam.goalDist = camSave.d; cam.pitch = camSave.p; camSave = null; } uiKey = ""; }
function renderBuildBar() {
  const el = $("buildbar"); el.innerHTML = "";
  const row1 = document.createElement("div"), row2 = document.createElement("div"); row1.className = row2.className = "bbrow";
  const tool = (row, label, on, fn, cls = "") => { const b = document.createElement("button"); b.type = "button"; b.className = "bbbtn " + cls + (on ? " on" : ""); b.textContent = label; b.onclick = fn; row.appendChild(b); return b; };
  if (building.mode === "ext") {
    World.EXTERIORS.forEach((name, i) => tool(row1, name, (save.home.ext | 0) === i, () => { save.home.ext = i; persist(); flushSave(true); refreshMyPlot(); renderBuildBar(); }));
    tool(row1, "✕", false, closeBuild); el.append(row1); return;
  }
  for (const [k, name] of TOOLS) { const b = document.createElement("button"); b.type = "button"; b.className = "bbtool" + (building.tool === k ? " on" : ""); b.innerHTML = `<b>${name}</b><span><span class="coin"></span>${PIECES[k].p}</span>`; b.onclick = () => { building.tool = k; building.sel = -1; renderBuildBar(); }; row1.appendChild(b); }
  let paletteRow = null;
  // (owner, 2026-11-09) one colour circle; a tap opens the colours, picking one closes them
  { const b = document.createElement("button"); b.type = "button"; b.className = "swatch on"; b.style.background = COLORS[building.color]; b.onclick = () => { building.palette = !building.palette; renderBuildBar(); }; row2.appendChild(b); }
  if (building.palette) { const rowc = document.createElement("div"); rowc.className = "bbrow"; for (let c = 0; c < COLORS.length; c++) { const b = document.createElement("button"); b.type = "button"; b.className = "swatch" + (building.color === c ? " on" : ""); b.style.background = COLORS[c]; b.onclick = () => { building.color = c; building.palette = false; renderBuildBar(); }; rowc.appendChild(b); } paletteRow = rowc; } else paletteRow = null;
  const sel = building.sel >= 0 ? save.home.pieces[building.sel] : null;
  if (building.tool === "window" || (sel && sel.k === "window")) {   // the view out of a window
    const row3 = document.createElement("div"); row3.className = "bbrow";
    World.VIEWS.forEach((name, i) => tool(row3, name, (sel ? sel.w | 0 : building.w) === i, () => { if (sel) { sel.w = i; persist(); flushSave(true); refreshMyPlot(); } else building.w = i; renderBuildBar(); }));
    el.append(row1, row3, row2);
  } else el.append(row1, row2);
  if (paletteRow) el.append(paletteRow);
  tool(row2, "Paint", building.tool === "paint", () => { building.tool = "paint"; building.sel = -1; renderBuildBar(); });
  tool(row2, "Delete", building.tool === "delete", () => { building.tool = "delete"; building.sel = -1; renderBuildBar(); }, "red");
  if (building.tool === "delete") tool(row2, "Del", false, deleteSel, "red").disabled = building.sel < 0;
  tool(row2, "⟳", false, () => turnBuild(15));
  tool(row2, "✕", false, closeBuild);
}
function turnBuild(d) { if (building && building.mode === "in") building.a = (((building.a + d) % 360) + 360) % 360; }
// where the pointer is on the floor I'm on, in the house's metres
function aimAt(px, py) {
  if (!building || building.mode !== "in" || !inter) return null;
  const l = curLevel(), y = INT.y + l * LEVEL_H + 0.25;
  ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); plane.constant = -y;
  if (!ray.ray.intersectPlane(plane, hitV)) return null;
  const lx = hitV.x - INT.x, lz = hitV.z - INT.z, S = World.HOME_SIZE; if (lx < -1 || lz < -1 || lx > S + 1 || lz > S + 1) return null;
  return { lx: clamp(lx, 0, S), lz: clamp(lz, 0, S), l };
}
// the piece about to go down: where the pointer is, at the chosen angle; brought close to a wall's end (walls) or a
// tile's side (tiles) of the same angle, it meets it
function pieceFor(k, a) {
  const t = { k, x: a.lx, z: a.lz, l: a.l, a: building.a, c: building.color }; if (k === "window") t.w = building.w;
  const ty = PIECES[k].t, r = (building.a * Math.PI) / 180, ax = Math.cos(r), az = -Math.sin(r);   // the piece's own x axis in the house
  let best = 0.9, sx = 0, sz = 0;
  for (const q of save.home.pieces) {
    if (q.l !== t.l || PIECES[q.k].t !== ty || ty === "free") continue;
    const qr = (q.a * Math.PI) / 180, qx = Math.cos(qr), qz = -Math.sin(qr);
    if (ty === "wall") for (const e of [-2, 2]) for (const f of [-2, 2]) { const ex = q.x + qx * e, ez = q.z + qz * e, mx = t.x + ax * f, mz = t.z + az * f, d = hyp(ex - mx, ez - mz); if (d < best) { best = d; sx = ex - mx; sz = ez - mz; } }
    if (ty === "tile" && Math.abs(((q.a - t.a) % 90 + 90) % 90) < 1) for (const [u, v] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {   // a neighbouring square of a tile
      const cx = q.x + u * qx + v * Math.sin(qr), cz = q.z + u * qz + v * Math.cos(qr), d = hyp(cx - t.x, cz - t.z); if (d < best) { best = d; sx = cx - t.x; sz = cz - t.z; } }
  }
  t.x = clamp(Math.round((t.x + sx) * 20) / 20, 0, World.HOME_SIZE); t.z = clamp(Math.round((t.z + sz) * 20) / 20, 0, World.HOME_SIZE);
  return t;
}
// the piece the pointer is on (on my floor): furniture first, then walls, then stairs and floors, then roofs below me
function pieceAt(a) {
  const ps = save.home.pieces; let best = -1, rank = 9;
  ps.forEach((t, i) => {
    const order = PIECES[t.k].t === "free" ? 0 : PIECES[t.k].t === "wall" ? 1 : t.k === "roof" || t.k === "slope" ? 3 : 2;
    const onFloor = t.k === "roof" || t.k === "slope" ? t.l === a.l - 1 || t.l === a.l : t.l === a.l; if (!onFloor || order >= rank) return;
    const [hw, hd] = pieceSize(t), r = (t.a * Math.PI) / 180;
    if (inRect({ x: t.x, z: t.z, c: Math.cos(r), s: Math.sin(r), hw, hd }, a.lx, a.lz)) { best = i; rank = order; }
  });
  return best;
}
// a piece drawn on its own (at the house's corner), for the preview and the red marks
function pieceMesh(t, material) {
  const M = new Merger(), G = new Merger(); pieceBoxes({ ...t, x: 0, z: 0, l: 0 }, { x: 0, y: 0, z: 0 }, M, G, { walls: [], surfaces: [], ramps: [] }, null);
  const g = new THREE.Group(); if (M.p.length) g.add(M.mesh(material)); if (G.p.length) g.add(G.mesh(material)); g.traverse((o) => { o.castShadow = false; o.renderOrder = 5; }); return g;
}
function placeMesh(g, t) { g.position.set(INT.x + t.x, INT.y + t.l * LEVEL_H, INT.z + t.z); }
function showGhost(px, py) {
  if (!building || building.mode !== "in") { bghost.visible = false; return; }
  const a = aimAt(px, py);
  if (building.tool === "delete" || building.tool === "paint") {
    bghost.visible = false; building.hover = a ? pieceAt(a) : -1; markPieces(); return;
  }
  if (!a) { bghost.visible = false; return; }
  const t = pieceFor(building.tool, a), bad = save.coins < PIECES[t.k].p, key = [t.k, t.a, t.c, t.w, bad].join("|");
  if (key !== ghostKey) { ghostKey = key; scene.remove(bghost); bghost = pieceMesh(t, bad ? ghostBad : ghostOk); scene.add(bghost); }
  placeMesh(bghost, t); bghost.visible = true; building.at = t;
}
// red over what's pointed at (Delete, Paint) and stronger over what's selected
function markPieces() {
  const ps = save.home.pieces, h = building ? building.hover : -1, s = building ? building.sel : -1, key = [h, s, h >= 0 && JSON.stringify(ps[h]), s >= 0 && JSON.stringify(ps[s])].join("|");
  markG.visible = !!building; if (key === markKey) return; markKey = key;
  scene.remove(markG); markG = new THREE.Group(); scene.add(markG);
  for (const [i, m] of [[s, ghostSel], [h !== s ? h : -1, ghostRed]]) if (i >= 0 && ps[i]) { const g = pieceMesh(ps[i], m); placeMesh(g, ps[i]); g.scale.setScalar(1.02); markG.add(g); }
}
function deleteSel() {
  if (!building || building.sel < 0) return; const ps = save.home.pieces, t = ps[building.sel]; if (!t) return;
  if (t.k === "pen") collectPens(); ps.splice(building.sel, 1); save.coins += Math.floor(PIECES[t.k].p / 2); building.sel = -1; building.hover = -1;
  persist(); flushSave(true); refreshMyPlot(); hudKey = ""; markPieces(); renderBuildBar();
}
// is q the same piece as t in the same place? (the same kind on the same floor, within half a metre, turned the same way:
// floors and roofs any quarter turn, walls, windows and doors either way round, slopes, stairs and furniture exactly)
function samePlace(q, t) {
  if (q.k !== t.k || q.l !== t.l || hyp(q.x - t.x, q.z - t.z) > 0.5) return false;
  const d = (((q.a - t.a) % 360) + 360) % 360, sym = t.k === "floor" || t.k === "roof" ? 90 : PIECES[t.k].t === "wall" ? 180 : PIECES[t.k].t === "free" ? 360 : 360;
  const m = d % sym; return m < 8 || m > sym - 8 || PIECES[t.k].t === "free";
}
function buildTap(px, py) {
  if (building.mode !== "in") return false;
  showGhost(px, py);   // a tap on a phone is where the pointer is
  const a = aimAt(px, py); if (!a) return false;
  const ps = save.home.pieces;
  if (building.tool === "delete") { building.sel = pieceAt(a); markPieces(); renderBuildBar(); return true; }
  if (building.tool === "paint") { const i = pieceAt(a); if (i < 0) return true; ps[i].c = building.color; }
  else {
    const t = pieceFor(building.tool, a), price = PIECES[t.k].p;
    // (owner, 2026-11-09) the same piece already there: it takes the colour (and a window the view) instead of a second one
    const same = ps.find((q) => samePlace(q, t));
    if (same) { if (same.c === t.c && (t.k !== "window" || (same.w | 0) === (t.w | 0))) return true; same.c = t.c; if (t.k === "window") same.w = t.w; }
    else { if (save.coins < price || ps.length >= World.MAX_PIECES) return true; ps.push(t); save.coins -= price; }
  }
  persist(); flushSave(true); refreshMyPlot(); hudKey = ""; emitSparks(me.x, me.y + 2, me.z, 8, 3, ["#ffffff", "#ffd35a"], 0.5, 1); return true;
}
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitV = new THREE.Vector3();
function tapAt(px, py) {
  if (wedit) return weditTap(px, py);
  if (building) return buildTap(px, py);
  if (talk) { talkNext(); return true; }
  const fk = folkHit(px, py); if (fk) { closePlayerMenu(); startTalk(fk); return true; }
  const ph = netOk ? playerHit(px, py) : null; if (ph !== null) { playerMenu(ph, px, py); return true; }
  if (pmenu.style.display === "flex") { closePlayerMenu(); return true; }
  // tap a playpen in your house to choose its pet
  if (me.inst === myId && save.home) {
    const o = INT;
    ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    for (let l = LEVELS - 1; l >= 0; l--) {
      plane.constant = -(o.y + l * LEVEL_H + 0.6); if (!ray.ray.intersectPlane(plane, hitV)) continue;
      const i = save.home.pieces.findIndex((t) => t.k === "pen" && t.l === l && hyp(o.x + t.x - hitV.x, o.z + t.z - hitV.z) < 2);
      if (i >= 0) { picking = i; show("p-build"); return true; }
    }
  }
  return false;
}
canvas.addEventListener("pointermove", (e) => { if (building && e.pointerType === "mouse") showGhost(e.clientX, e.clientY); if (wedit && e.pointerType === "mouse") weditAim(e.clientX, e.clientY); });
$("btn-build").onclick = () => (building ? closeBuild() : openBuild());

// ---- the minimap (owner, 2026-11-09): a square map in the top right, turned with the camera so up on it is always the
// way the camera looks. The town drawn once (land shaded by height and slope, roads, the plaza, houses, trees, the
// islands; the ones above the town fade in as you climb), then live: everyone's plots and houses, the houses in my bag,
// animal control and the searchlights, the other players (party green; above or below me marked; on the edge when
// they're off the map), the way the camera sees, me in the middle and where the guide points. A tap zooms. ----
const MAP_PX = 2, MAP_R = 460, MAP_N = MAP_R * 2 * MAP_PX;   // the drawn world: 2 px a metre, out to 460 m
function mapLayer() { const c = document.createElement("canvas"); c.width = c.height = MAP_N; const g = c.getContext("2d"); g.setTransform(MAP_PX, 0, 0, MAP_PX, MAP_R * MAP_PX, MAP_R * MAP_PX); g.lineJoin = g.lineCap = "round"; return [c, g]; }
const [mapGround, mgG] = mapLayer(), [mapSky, mgS] = mapLayer();
const SKY_Y = 60;   // above this, the sky layer (the town tops out under 50 m; the VIP island is at 62)
// (owner, 2026-11-09) the map is drawn like the world: white paper, black ink; only the markers keep their colors
const INK = "#1d1d22", PAPER = "#faf8f2", PAPER2 = "#e9e7e1";
function mapHouse(g, h) {   // seen from above: its roof (a pyramid), the door at the front, the mailbox
  if (h.box) { g.fillStyle = INK; g.fillRect(h.mx - 0.7, h.mz - 0.7, 1.4, 1.4); return; }
  g.save(); g.translate(h.x, h.z); g.rotate(-h.yaw);
  g.fillStyle = PAPER; g.fillRect(-4.5, -4.5, 9, 9); g.strokeStyle = INK; g.lineWidth = 0.55; g.strokeRect(-4.5, -4.5, 9, 9);
  g.strokeStyle = "rgba(29,29,34,.45)"; g.lineWidth = 0.3; g.beginPath(); g.moveTo(-4.5, -4.5); g.lineTo(4.5, 4.5); g.moveTo(4.5, -4.5); g.lineTo(-4.5, 4.5); g.stroke();
  g.fillStyle = INK; g.fillRect(-0.9, 4.3, 1.8, 0.9);
  g.restore(); g.fillStyle = INK; g.fillRect(h.mx - 0.5, h.mz - 0.5, 1, 1);
}
function mapTree(g, t) { g.fillStyle = PAPER; g.strokeStyle = INK; g.lineWidth = 0.35; g.beginPath(); g.arc(t.x, t.z, 2.8 * pineH(t) / 10.5, 0, TAU); g.fill(); g.stroke(); }
const mapRing = (g, x, z, r, c, w = 0.9) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.arc(x, z, r, 0, TAU); g.stroke(); };
const mapPlotLine = (g, p, c, w) => { g.save(); g.setLineDash([2, 1.5]); g.strokeStyle = c; g.lineWidth = w; g.strokeRect(p.x - PLOT / 2, p.z - PLOT / 2, PLOT, PLOT); g.restore(); };
// (owner, 2026-11-10) the map drawn from the blocks: each tile seen from above (land paper, roads gray, water hatched,
// ramps marked with their way up), an ink line round the land's edges, a soft shadow under it; blocks topping out above
// SKY_Y go on the sky layer. Redrawn whenever the world changes.
function drawMapLayers() {
  for (const g of [mgG, mgS]) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, MAP_N, MAP_N); g.restore(); }
  const T = World.TILE, tops = new Map();
  for (const c of World.allCells()) { const k = c.i + "," + c.j, o = tops.get(k); if (!o || c.k > o.k) tops.set(k, c); }
  const layerOf = (c) => (c.k * World.STEP >= SKY_Y ? mgS : mgG);
  for (const g of [mgG, mgS]) { g.save(); g.shadowColor = "rgba(0,0,0,.2)"; g.shadowBlur = 12; g.shadowOffsetX = 6; g.shadowOffsetY = 8; g.fillStyle = PAPER; for (const c of tops.values()) if (layerOf(c) === g) g.fillRect(c.i * T, c.j * T, T, T); g.restore(); }
  for (const c of tops.values()) {
    const g = layerOf(c), x = c.i * T, z = c.j * T;
    if (c.t === "road" || c.t === "ramp") { g.fillStyle = PAPER2; g.fillRect(x, z, T, T); }
    else if (c.t === "corner" || c.t === "half") {   // the road's triangle (a half block's other half is empty)
      const rc = [2, 1, 0, 3][c.d], q = [[x, z], [x + T, z], [x + T, z + T], [x, z + T]], a = q[(rc + 1) % 4], b = q[(rc + 3) % 4], r = q[rc];
      if (c.t === "half") { g.clearRect(x, z, T, T); g.fillStyle = PAPER; g.beginPath(); g.moveTo(...r); g.lineTo(...a); g.lineTo(...b); g.closePath(); g.fill(); }
      g.fillStyle = PAPER2; g.beginPath(); g.moveTo(...r); g.lineTo(...a); g.lineTo(...b); g.closePath(); g.fill();
      if (c.t === "half") { g.strokeStyle = INK; g.lineWidth = 0.8; g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
    }
    else if (c.t === "water") { g.fillStyle = "#d6d8de"; g.fillRect(x, z, T, T); g.strokeStyle = "rgba(29,29,34,.5)"; g.lineWidth = 0.3; g.beginPath(); for (let q = 1; q < 6; q++) { g.moveTo(x, z + q); g.lineTo(x + q, z); g.moveTo(x + q, z + T); g.lineTo(x + T, z + q); } g.stroke(); }
    else g.fillStyle = PAPER;
    if (c.t === "wedge" || c.t === "ramp") { const [dx, dz] = World.DIRS[c.d], mx = x + T / 2, mz = z + T / 2; g.strokeStyle = INK; g.lineWidth = 0.4; g.beginPath(); g.moveTo(mx - dx * 2 - dz * 1.5, mz - dz * 2 + dx * 1.5); g.lineTo(mx + dx * 2, mz + dz * 2); g.lineTo(mx - dx * 2 + dz * 1.5, mz - dz * 2 - dx * 1.5); g.stroke(); }
    g.strokeStyle = INK; g.lineWidth = 0.8; g.beginPath();   // the edges: where the next tile is missing or a different height
    for (let s2 = 0; s2 < 4; s2++) { const [dx, dz] = World.DIRS[s2], n = tops.get((c.i + dx) + "," + (c.j + dz)); if (n && n.k === c.k) continue; const [ax, az, bx2, bz] = s2 === 0 ? [x, z + T, x + T, z + T] : s2 === 1 ? [x + T, z, x + T, z + T] : s2 === 2 ? [x, z, x + T, z] : [x, z, x, z + T]; g.moveTo(ax, az); g.lineTo(bx2, bz); }
    g.stroke();
  }
  const g = mgG;
  // the plaza, its buildings and rings: post office, egg shop, training track, pound, contract board, the lift
  g.fillStyle = PAPER2; g.strokeStyle = INK; g.lineWidth = 0.7; g.beginPath(); g.arc(0, 0, PLAZA - 4, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = PAPER2; g.strokeStyle = INK; g.lineWidth = 0.6; g.beginPath(); g.arc(TRAIN.x, TRAIN.z, 14, 0, TAU); g.arc(TRAIN.x, TRAIN.z, 9, 0, TAU, true); g.fill(); g.stroke();
  const inFrame = (b, f) => { g.save(); g.translate(b.x, b.z); g.rotate(-b.yaw); f(); g.restore(); };   // a building drawn facing +z, turned as it stands
  const bx = (x, z, w, h) => { g.fillStyle = PAPER; g.fillRect(x, z, w, h); g.strokeStyle = INK; g.lineWidth = 0.6; g.strokeRect(x, z, w, h); };
  inFrame(POST, () => { bx(-9.5, -5.5, 19, 11); bx(-7.5, -3.5, 15, 7); g.fillStyle = INK; g.fillRect(-4, 4.6, 8, 0.9); });
  inFrame(SHOP_B, () => { bx(-6.5, -4.5, 13, 9); g.beginPath(); g.ellipse(0, 0, 2, 2.6, 0, 0, TAU); g.stroke(); });
  inFrame(POUND, () => { bx(-8.5, -7.5, 17, 9); g.fillStyle = INK; g.fillRect(-8.2, 0.0, 16.4, 0.8); g.lineWidth = 0.4; g.setLineDash([1, 1]); g.strokeRect(-8, 1.1, 16, 7.9); g.setLineDash([]); });
  g.fillStyle = INK; g.fillRect(BOARD.x - 1.3, BOARD.z - 1.8, 2.6, 0.6);
  for (const [x, z, r] of [[PICKUP.x, PICKUP.z, PICKUP.r], [BOARD.x, BOARD.z, BOARD.r], [SHOP.x, SHOP.z, SHOP.r], [TRAIN.x, TRAIN.z, TRAIN.r - 1], [LIFTS[0].x, LIFTS[0].z, 2.2]]) mapRing(g, x, z, r, INK, 0.6);
  for (const h of houses) mapHouse(h.base >= SKY_Y ? mgS : mgG, h);
  for (const t of trees) mapTree(t.y >= SKY_Y ? mgS : mgG, t);
}
const mapEl = $("map"), mapG = mapEl.getContext("2d"), MAP_ZOOMS = [40, 80, 170, 300];   // half the map's width, in metres
let mapZoom = 1, mapHalf = 80, mapLast = 0;
try { const v = localStorage.getItem("pets-map-zoom"); if (v !== null) mapZoom = clamp(Math.floor(+v) || 0, 0, MAP_ZOOMS.length - 1); } catch (err) { /* no storage */ }
mapHalf = MAP_ZOOMS[mapZoom];
mapEl.addEventListener("click", () => { mapZoom = (mapZoom + 1) % MAP_ZOOMS.length; try { localStorage.setItem("pets-map-zoom", String(mapZoom)); } catch (err) { /* no storage */ } });
const mapCells = new WeakMap();   // a plot's pieces -> its squares seen from above (the roof, else the floor)
function plotCells(pieces) {
  let c = mapCells.get(pieces); if (c) return c;
  const top = new Map();
  for (const t of pieces) { if (!PIECES[t.k] || PIECES[t.k].t !== "cell") continue; const key = t.x + "," + t.z, h = t.l * 2 + (t.k === "floor" || t.k === "stairs" ? 0 : 1), o = top.get(key); if (!o || h >= o.h) top.set(key, { x: t.x, z: t.z, h, c: t.k === "floor" && t.c === 0 ? "#c9a27e" : COLORS[t.c] || COLORS[0], roof: h % 2 === 1 }); }
  c = [...top.values()]; mapCells.set(pieces, c); return c;
}
const mapLerp = (a, b, k) => "rgb(" + a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(",") + ")";
function drawMap(now, tx, tz, tsky, guide) {
  const off = !!me.inst; mapEl.style.display = off ? "none" : ""; if (off || now - mapLast < 33) return; mapLast = now;
  const dpr = Math.min(2, devicePixelRatio || 1), px = Math.round(mapEl.clientWidth * dpr); if (!px) return;
  if (mapEl.width !== px) mapEl.width = mapEl.height = px;
  const g = mapG, H = px / 2; mapHalf += (MAP_ZOOMS[mapZoom] - mapHalf) * 0.25;
  const s = H / mapHalf, cyw = Math.cos(cam.yaw), syw = Math.sin(cam.yaw), u = dpr, dark = 1 - skyNow.day;
  const toMap = (x, z) => { const dx = x - me.x, dz = z - me.z; return [H + (dx * cyw - dz * syw) * s, H + (dx * syw + dz * cyw) * s]; };
  const edge = (p, m) => { const ex = p[0] - H, ey = p[1] - H, k = (H - m) / Math.max(Math.abs(ex), Math.abs(ey), 1e-6); return k < 1 ? [H + ex * k, H + ey * k, true] : [p[0], p[1], false]; };
  const ang = (a) => Math.PI + cam.yaw - a;   // a heading in the world -> turn on the map (0: up)
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
  g.fillStyle = mapLerp([214, 212, 206], [150, 150, 154], dark * 0.6); g.fillRect(0, 0, px, px);
  // the world, turned with the camera
  g.setTransform(1, 0, 0, 1, H, H); g.rotate(cam.yaw); g.scale(s, s); g.translate(-me.x, -me.z);
  const rr = mapHalf * 1.45 + 4, sub = (img) => { const x0 = clamp(me.x - rr, -MAP_R, MAP_R), z0 = clamp(me.z - rr, -MAP_R, MAP_R), x1 = clamp(me.x + rr, -MAP_R, MAP_R), z1 = clamp(me.z + rr, -MAP_R, MAP_R); if (x1 > x0 && z1 > z0) g.drawImage(img, (x0 + MAP_R) * MAP_PX, (z0 + MAP_R) * MAP_PX, (x1 - x0) * MAP_PX, (z1 - z0) * MAP_PX, x0, z0, x1 - x0, z1 - z0); };
  g.imageSmoothingEnabled = true; sub(mapGround);
  const skyA = 0.3 + 0.7 * smooth(clamp((me.y - 8) / 45, 0, 1));   // the islands above fade in as I climb
  const plots = (sky) => { for (const [id, st] of plotState) { const p = LOT(id); if (!p || (p.y >= SKY_Y) !== sky) continue; mapPlotLine(g, p, INK, 0.6); if (id === myPlot) mapPlotLine(g, p, "#f2b01e", 1.1); } };
  plots(false);
  g.globalAlpha = skyA; sub(mapSky); plots(true); g.globalAlpha = 1;
  // the helicopters' searchlights: the beam out to its spot on the ground
  for (const m of vehs) {
    if (!m.kind) continue; const gx = m.x + Math.sin(m.ba) * m.bd, gz = m.z + Math.cos(m.ba) * m.bd, r = Math.max(2, hyp(m.bd, m.y - terrain(gx, gz)) * Math.tan(World.BEAM.half));
    const a = Math.atan2(gz - m.z, gx - m.x), gr = g.createRadialGradient(gx, gz, 0, gx, gz, r * 1.3);
    gr.addColorStop(0, "rgba(29,29,34,.22)"); gr.addColorStop(1, "rgba(29,29,34,0)");
    g.fillStyle = "rgba(29,29,34,.08)"; g.beginPath(); g.moveTo(m.x, m.z); g.lineTo(gx + Math.cos(a + 1.5708) * r, gz + Math.sin(a + 1.5708) * r); g.lineTo(gx + Math.cos(a - 1.5708) * r, gz + Math.sin(a - 1.5708) * r); g.closePath(); g.fill();
    g.fillStyle = gr; g.beginPath(); g.arc(gx, gz, r * 1.3, 0, TAU); g.fill();
  }
  // night falls on the map too
  g.setTransform(1, 0, 0, 1, 0, 0); if (dark > 0.05) { g.fillStyle = `rgba(0,0,0,${dark * 0.18})`; g.fillRect(0, 0, px, px); }
  // the way the camera sees (always up)
  const fov = Math.atan(Math.tan((camera.fov * Math.PI) / 360) * camera.aspect), vg = g.createLinearGradient(H, H, H, 0);
  vg.addColorStop(0, "rgba(29,29,34,.16)"); vg.addColorStop(1, "rgba(29,29,34,0)"); g.fillStyle = vg;
  g.beginPath(); g.moveTo(H, H); g.lineTo(H - Math.tan(fov) * H, 0); g.lineTo(H + Math.tan(fov) * H, 0); g.closePath(); g.fill();
  const flash = Math.floor(now / 150) % 2 === 0, pulse = 0.5 + 0.5 * Math.sin(now / 160);
  // the houses in my bag (pink: an island house)
  for (const i of me.bag) { const h = houses[i], [x, y] = toMap(h.mx, h.mz); if (x < -8 || y < -8 || x > px + 8 || y > px + 8) continue; g.fillStyle = h.sky ? "#ff5aa0" : "#f2b01e"; g.strokeStyle = "#fff"; g.lineWidth = 1.5 * u; g.beginPath(); g.arc(x, y, 3.6 * u, 0, TAU); g.fill(); g.stroke(); }
  // my home: a small gold house marker, kept on the edge when it is out of view
  if (myPlot >= 0 && LOT(myPlot)) { const p = LOT(myPlot), [x, y, out] = edge(toMap(p.x, p.z), 8 * u); g.save(); g.translate(x, y); g.fillStyle = "#f2b01e"; g.strokeStyle = "#fff8dc"; g.lineWidth = 1.5 * u; g.beginPath(); g.moveTo(0, -5 * u); g.lineTo(5 * u, 0); g.lineTo(4 * u, 5 * u); g.lineTo(-4 * u, 5 * u); g.lineTo(-5 * u, 0); g.closePath(); g.fill(); g.stroke(); g.fillStyle = "#8a5a00"; g.fillRect(-1 * u, 1 * u, 2 * u, 4 * u); if (out) { g.strokeStyle = "#8a5a00"; g.beginPath(); g.moveTo(0, -8 * u); g.lineTo(0, 8 * u); g.stroke(); } g.restore(); g.save(); g.font = `800 ${Math.max(9, 10 * u)}px system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "top"; g.lineWidth = 3 * u; g.strokeStyle = "rgba(35,48,59,.9)"; g.strokeText("Home", x, y + 7 * u); g.fillStyle = "#fff8dc"; g.fillText("Home", x, y + 7 * u); g.restore(); }
  // animal control: vans (lights flashing when they chase) and helicopters (rotors turning)
  for (const m of vehs) {
    const [x, y] = toMap(m.x, m.z); if (x < -10 || y < -10 || x > px + 10 || y > px + 10) continue; const chasing = m.mode === 1;
    g.save(); g.translate(x, y); g.rotate(ang(m.yaw));
    if (!m.kind) {
      g.fillStyle = "#d63a3a"; g.strokeStyle = chasing ? (flash ? "#ffffff" : "#3a7aff") : "#7a1a1a"; g.lineWidth = (chasing ? 2 : 1.2) * u;   // (owner, 2026-11-09) red, as in town
      g.fillRect(-3 * u, -5 * u, 6 * u, 10 * u); g.strokeRect(-3 * u, -5 * u, 6 * u, 10 * u); g.fillStyle = "#ffffff"; g.fillRect(-3 * u, 0, 6 * u, 1.5 * u);
      g.fillStyle = chasing && flash ? "#ff3a3a" : "#7a2020"; g.fillRect(-2.4 * u, -3 * u, 2.2 * u, 1.3 * u); g.fillStyle = chasing && !flash ? "#3a7aff" : "#203a7a"; g.fillRect(0.2 * u, -3 * u, 2.2 * u, 1.3 * u);
    } else {
      g.fillStyle = "#d63a3a"; g.strokeStyle = "#7a1a1a"; g.lineWidth = 1.2 * u; g.beginPath(); g.ellipse(0, -1 * u, 3.2 * u, 4.6 * u, 0, 0, TAU); g.fill(); g.stroke();
      g.fillRect(-0.8 * u, 3 * u, 1.6 * u, 5 * u); g.strokeRect(-0.8 * u, 3 * u, 1.6 * u, 5 * u);
      g.rotate(now / 60); g.strokeStyle = "rgba(43,52,64,.75)"; g.lineWidth = 1.3 * u; g.beginPath(); g.moveTo(-7 * u, 0); g.lineTo(7 * u, 0); g.moveTo(0, -7 * u); g.lineTo(0, 7 * u); g.stroke();
    }
    g.restore();
  }
  // the others: a dot in their shirt's colour facing their way; my party ringed green, wanted ones red; above or below
  // me marked; on the edge when they're off the map
  const inParty = new Set(party.map((q) => q.id));
  for (const [id, o] of others) {
    if (o.inst !== me.inst) continue; const [x, y, out] = edge(toMap(o.x, o.z), 7 * u), r = (out ? 3.4 : 4.6) * u;
    g.save(); g.translate(x, y); g.globalAlpha = out ? 0.85 : 1;
    if (!out) { g.save(); g.rotate(ang(o.yaw)); g.fillStyle = "#fff"; g.beginPath(); g.moveTo(0, -r - 3.2 * u); g.lineTo(2.6 * u, -r + 0.6 * u); g.lineTo(-2.6 * u, -r + 0.6 * u); g.closePath(); g.fill(); g.restore(); }
    const ring = inParty.has(id) ? "#3fb36b" : o.stars ? (flash ? "#e5534b" : "#ff9a94") : null;
    if (ring) { g.fillStyle = ring; g.beginPath(); g.arc(0, 0, r + 2.2 * u, 0, TAU); g.fill(); }
    g.fillStyle = o.shirt || "#3a8ee6"; g.strokeStyle = "#fff"; g.lineWidth = 1.5 * u; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.stroke();
    const dy = o.y - me.y; if (Math.abs(dy) > 6) { g.fillStyle = "#fff"; g.strokeStyle = "#23303b"; g.lineWidth = 1 * u; const sgn = dy > 0 ? -1 : 1, bx = r + 2 * u, by = -r; g.beginPath(); g.moveTo(bx, by + sgn * 2.4 * u); g.lineTo(bx + 2.8 * u, by - sgn * 2 * u); g.lineTo(bx - 2.8 * u, by - sgn * 2 * u); g.closePath(); g.fill(); g.stroke(); }
    g.restore();
  }
  // where the guide points: a glowing marker, or a chevron on the edge pointing the way
  if (guide) {
    const p = toMap(tx, tz), [x, y, out] = edge(p, 8 * u);
    g.save(); g.translate(x, y); g.shadowColor = "#ffb800"; g.shadowBlur = 8 * u; g.fillStyle = tsky ? "#ff5aa0" : "#ffd35a"; g.strokeStyle = "#fff8dc"; g.lineWidth = 1.5 * u;
    if (out) { g.rotate(Math.atan2(p[0] - H, H - p[1])); g.beginPath(); g.moveTo(0, -6 * u); g.lineTo(5 * u, 3 * u); g.lineTo(0, 0.5 * u); g.lineTo(-5 * u, 3 * u); g.closePath(); g.fill(); g.stroke(); }
    else { g.beginPath(); g.arc(0, 0, (4.5 + pulse * 1.5) * u, 0, TAU); g.fill(); g.stroke(); g.shadowBlur = 0; g.strokeStyle = tsky ? "rgba(255,90,160,.6)" : "rgba(255,211,90,.7)"; g.beginPath(); g.arc(0, 0, (8 + pulse * 5) * u, 0, TAU); g.stroke(); }
    g.restore();
  }
  // me: an arrow the way my pet faces, in my shirt's colour
  g.save(); g.translate(H, H); g.rotate(ang(me.yaw)); g.shadowColor = "rgba(0,0,0,.4)"; g.shadowBlur = 3 * u; g.fillStyle = save.shirt || "#3a8ee6"; g.strokeStyle = "#fff"; g.lineWidth = 2 * u;
  g.beginPath(); g.moveTo(0, -7.5 * u); g.lineTo(5.5 * u, 5.5 * u); g.lineTo(0, 2.5 * u); g.lineTo(-5.5 * u, 5.5 * u); g.closePath(); g.stroke(); g.fill(); g.restore();
  // north, on the edge
  const [nx, ny] = edge([H + syw * H * 4, H - cyw * H * 4], 9 * u);
  g.fillStyle = "rgba(35,48,59,.85)"; g.beginPath(); g.arc(nx, ny, 7 * u, 0, TAU); g.fill(); g.fillStyle = "#fff"; g.font = `800 ${9 * u}px ui-rounded, system-ui, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("N", nx, ny + 0.5 * u);
}

// ---- what I can do where I am: talk to someone (F), take a lift (E); buttons for them on a phone ----
let uiKey = "", acts = [];
function nearLift() { return LIFTS.find((l) => hyp(me.x - l.x, me.z - l.z) < 2.6 && Math.abs(me.y - l.y) < 3 && (l.to === "plaza" || myPlot >= 0)); }
function nearPen() {
  if (me.inst !== myId || !save.home) return null;
  const o = INT; let best = null, bd = 3.2;
  for (let i = 0; i < save.home.pieces.length; i++) {
    const t = save.home.pieces[i]; if (t.k !== "pen") continue;
    const d = hyp(me.x - (o.x + t.x), me.z - (o.z + t.z));
    if (d < bd && Math.abs(me.y - (o.y + t.l * LEVEL_H)) < 3) { bd = d; best = i; }
  }
  return best;
}
function ride_lift(l) {   // up to my plot (in front of it), or back down to the plaza
  if (l.to === "plaza") { me.x = LIFT.x + 3; me.z = LIFT.z; me.y = terrain(me.x, me.z); }
  else { const p = LOT(myPlot); if (!p) return; [me.x, me.z] = lotPoint(p, 0, -PLOT / 2 - 2.5); me.y = floorAt(me.x, me.z, p.y + 3); cam.yaw = Math.PI + p.yaw; }
  me.vy = 0; cam.y = me.y; emitSparks(me.x, me.y + 1, me.z, 30, 5, ["#7fd8ff", "#ffffff"], 0.8, -1); sendPos(true);
}
function context() {
  const a = [];
  if (talk) return a;
  const l = loggedIn && nearLift(); if (l) a.push({ key: "E", label: l.to === "plaza" ? "▼" : "Home ▲", fn: () => ride_lift(l) });
  if (!a.length && loggedIn && !me.inst && !inArena() && hyp(me.x - TRAIN.x, me.z - TRAIN.z) < TRAIN.r && me.y - terrain(me.x, me.z) < 3.5) a.push({ key: "E", label: "Training Arena", fn: enterArena });
  const dr = !a.length ? nearDoor() : null; if (dr !== null) a.push({ key: "E", label: "Enter", fn: () => enterHouse(dr) });   // (owner, 2026-11-09) into the house
  if (!a.length && nearFrontDoor()) a.push({ key: "E", label: "Leave", fn: () => leaveHouse() });
  const pen = !a.length ? nearPen() : null; if (pen !== null) a.push({ key: "E", label: "Pet pen", fn: () => { picking = pen; show("p-build"); } });
  // (owner, 2026-11-09) people have no buttons: tap them (E still works on a computer, after the places above)
  const pl = !a.length && netOk ? nearPlayer() : null; if (pl !== null) a.push({ key: "E", hidden: true, label: "", fn: () => { const o = others.get(pl), v = new THREE.Vector3(o.x, o.y + 2, o.z).project(camera); playerMenu(pl, (v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight); } });
  const fk = !a.length && loggedIn ? nearFolk() : null; if (fk) a.push({ key: "E", hidden: true, label: "", fn: () => startTalk(fk) });
  return a;
}
function runAct(key) { const a = acts.find((q) => q.key === key); if (a) a.fn(); }
function ui() {
  acts = context();
  if (pmenu.style.display === "flex" && (!others.has(target) || hyp(others.get(target).x - me.x, others.get(target).z - me.z) > 14)) closePlayerMenu();
  const kind = me.foot ? "foot" : moveKind(), mine2 = onMyPlot();
  const key = acts.filter((a) => !a.hidden).map((a) => a.key + a.label).join("|") + "|" + kind + "|" + !!me.flying + "|" + !!me.swim + "|" + mine2 + "|" + me.inst + "|" + !!building + "|" + !!wedit + "|" + party.length + "|" + myRole;
  if (key === uiKey) return; uiKey = key;
  const el = $("acts"); el.innerHTML = "";
  for (const a of acts) { if (a.hidden) continue; const b = document.createElement("button"); b.className = "btn ghost"; b.type = "button"; b.innerHTML = touchy || a.key.length > 1 ? a.label : `<kbd class="interact-key">${a.key}</kbd> ${a.label}`; b.onclick = () => runAct(a.key); el.appendChild(b); }
  const bld = building || wedit;   // (owner, 2026-11-10) the bar along the bottom while building
  $("btn-jump").style.display = bld ? "none" : "";
  $("btn-jump").textContent = me.swim ? "Swim ▲" : kind === "fly" ? "Fly ▲" : kind === "glide" ? "Flap ▲" : "Jump";
  $("btn-down").textContent = me.swim ? "Swim ▼" : "Fly ▼";
  $("btn-down").style.display = ((kind === "fly" && me.flying) || me.swim) && !bld ? "" : "none";
  $("flykeys").style.display = kind === "fly" && !bld && !touchy ? "" : "none";   // (owner, 2026-11-09) only on a flier
  $("btn-build").style.display = !wedit && (mine2 || me.inst === myId || building) ? "" : "none"; $("btn-build").textContent = building ? "Done" : "Build";
}

// ---- staff (owner, 2026-11-08): Nyssary is admin and makes admins; admins make moderators and give items; moderators
// mute, kick and ban. The Admin button opens the panel: everyone online, and any account by name. ----
let myRole = "player", adminList = [], adminQ = "", giveTo = null, giveWhat = null, editTo = null, editData = null;
const untilText = (u) => { const m = Math.round((u - Date.now()) / 60000); return m < 60 ? m + "m" : m < 2880 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d"; };
const banText = (u) => (u === -1 ? "Banned" : "Banned " + untilText(u));
const isStaff = () => myRole === "moderator" || myRole === "admin";
const GIVES = () => [{ id: "coins", name: "Coins" }, ...Object.entries(ITEMS).map(([id, it]) => ({ id, name: it.name })), ...Object.entries(SPECIES).map(([id, sp]) => ({ id: "pet:" + id, name: sp.name, pet: true })), ...Object.entries(SPECIES).map(([id, sp]) => ({ id: "treat:" + id, name: sp.name + " Treats" }))];
let adminTimer = 0;
function adminSend(o) { netSend(Object.assign({ t: "admin", q: adminQ }, o)); }
// (owner, 2026-11-09) admins' quick commands: on yourself from the top of the panel, on anyone from their row's Quick
// menu, or typed in chat (slash below)
const QUICK = [["coins:10000", "+10K"], ["coins:100000", "+100K"], ["coins:1000000", "+1M"], ["allpets", "All pets"], ["maxlv", "Max levels"], ["items", "Items"], ["treats", "Treats"], ["unwanted", "Clear wanted"], ["everything", "Everything"]];
const quick = (target, v) => { const [cmd, n] = v.split(":"); adminSend(Object.assign({ op: "quick", cmd, n: +n || 0 }, target)); };
let adminBuilt = "";
function renderAdmin() {
  const el = $("admin"); if (!el) return;
  if (giveTo) { adminBuilt = ""; return renderGive(); }
  if (editTo) { adminBuilt = ""; return renderEdit(); }
  if (adminBuilt !== myRole) {   // the search box and quick commands are built once, so typing keeps its focus while the list refreshes
    adminBuilt = myRole; el.innerHTML = "";
    const q = document.createElement("input"); q.className = "field asearch"; q.placeholder = "Search"; q.value = adminQ; q.maxLength = 16;
    q.oninput = () => { adminQ = q.value.trim(); renderAdmin(); clearTimeout(adminTimer); adminTimer = setTimeout(() => adminSend({ op: "list" }), 250); };
    el.appendChild(q);
    if (myRole === "admin") {
      const eh = document.createElement("div"); eh.className = "ahead"; eh.textContent = "Environment";
      const eg = document.createElement("div"); eg.className = "envgrid";
      const envSelect = (id, name, opts, value) => {
        const s = document.createElement("select"); s.id = id; s.className = "field"; s.title = name;
        for (const [v, text] of opts) { const o = document.createElement("option"); o.value = v; o.textContent = text; o.selected = v === value; s.appendChild(o); }
        return s;
      };
      const weather = envSelect("admin-weather", "Weather", [["auto", "Weather: Auto"], ["clear", "Clear"], ["rain", "Rain"], ["snow", "Snow"], ["storm", "Storm"], ["fog", "Fog"]], environment.weather);
      const time = envSelect("admin-time", "Time of day", [["auto", "Time: Auto"], ["sunrise", "Sunrise"], ["day", "Day"], ["sunset", "Sunset"], ["night", "Night"]], environment.time);
      const changeEnvironment = () => adminSend({ op: "environment", weather: weather.value, time: time.value });
      weather.onchange = time.onchange = changeEnvironment; eg.append(weather, time); el.append(eh, eg);
      const h = document.createElement("div"); h.className = "ahead"; h.textContent = "Me";
      const g = document.createElement("div"); g.className = "qgrid";
      for (const [v, t] of QUICK) {
        const b = document.createElement("button"); b.type = "button"; b.className = "btn small" + (v.startsWith("coins") ? " gold" : v === "everything" ? " green" : " ghost");
        b.innerHTML = v.startsWith("coins") ? `<span class="coin"></span>` : ""; b.append(document.createTextNode(t)); b.onclick = () => quick({ name: myName }, v); g.appendChild(b);
      }
      el.append(h, g);
    }
    const h = document.createElement("div"); h.className = "ahead"; h.innerHTML = `Players <span class="cnt" id="admin-n"></span>`;
    const rows = document.createElement("div"); rows.className = "arows"; rows.id = "arows";
    el.append(h, rows);
  }
  const owner = myName.toLowerCase() === "nyssary";
  const sel = (opts, val, on) => { const s = document.createElement("select"); s.className = "field small"; for (const [v, t] of opts) { const o = document.createElement("option"); o.value = v; o.textContent = t; if (v === val) o.selected = true; s.appendChild(o); } s.onchange = () => on(s.value); return s; };
  const TIMES = [["", "—"], ["10", "10m"], ["60", "1h"], ["1440", "1d"], ["10080", "7d"], ["43200", "30d"], ["perma", "Perma"], ["off", "Off"]];
  const btn = (txt, cls, on) => { const b = document.createElement("button"); b.className = "btn small " + cls; b.type = "button"; b.textContent = txt; b.onclick = on; return b; };
  const rows = $("arows"); rows.innerHTML = "";
  const list = adminList.filter((r) => !adminQ || r.name.toLowerCase().startsWith(adminQ.toLowerCase())).sort((x, y) => y.online - x.online || x.name.localeCompare(y.name));
  $("admin-n").textContent = adminList.filter((r) => r.online).length + " online";
  for (const p of list) {
    const r = document.createElement("div"); r.className = "arow" + (p.online ? " on" : "") + (p.name === myName ? " me" : "");
    const nm = document.createElement("div"); nm.className = "aname";
    nm.innerHTML = `<span class="dot${p.online ? " on" : ""}"></span><b></b><span class="role ${p.role}">${p.role}</span>${p.vip ? `<span class="tag vip">VIP</span>` : ""}${p.muted ? `<span class="tag">Muted ${p.muted === -1 ? "" : untilText(p.muted)}</span>` : ""}${p.banned ? `<span class="tag">Banned ${p.banned === -1 ? "" : untilText(p.banned)}</span>` : ""}`;
    nm.querySelector("b").textContent = p.name; r.appendChild(nm);
    const acts = document.createElement("div"); acts.className = "aacts";
    const canRole = owner ? p.role !== "owner" : myRole === "admin" && (p.role === "player" || p.role === "moderator");
    if (canRole && p.name !== myName) acts.appendChild(sel(owner ? [["player", "Player"], ["moderator", "Moderator"], ["admin", "Admin"]] : [["player", "Player"], ["moderator", "Moderator"]], p.role, (v) => adminSend({ op: "role", id: p.id, role: v })));
    if (p.name !== myName) {
      acts.appendChild(sel(TIMES.map(([v, t]) => [v, v ? "Mute " + t : "Mute"]), "", (v) => v && adminSend({ op: "mute", id: p.id, mins: v })));
      acts.appendChild(sel(TIMES.map(([v, t]) => [v, v ? "Ban " + t : "Ban"]), "", (v) => v && adminSend({ op: "ban", id: p.id, mins: v })));
      if (p.online) acts.appendChild(btn("Kick", "", () => adminSend({ op: "kick", id: p.id })));
    }
    if (myRole === "admin") {
      acts.appendChild(sel([["", "Quick"], ...QUICK], "", (v) => v && quick({ id: p.id }, v)));
      acts.appendChild(btn(p.vip ? "VIP ★" : "VIP", p.vip ? "gold" : "ghost", () => adminSend({ op: "vip", id: p.id, on: !p.vip })));
      acts.appendChild(btn("Give", "gold", () => { giveTo = p; giveWhat = null; renderAdmin(); }));
      acts.appendChild(btn("Edit", "", () => { editTo = p; editData = null; adminSend({ op: "inspect", id: p.id }); renderAdmin(); }));
    }
    r.appendChild(acts); rows.appendChild(r);
  }
}
// give someone an item, coins, Treats or a pet: type to narrow the list, pick one (owner, 2026-11-09: pets show the
// Flier / Glider badge here too)
// (owner, 2026-11-09) an admin edits someone's inventory: coins, items, Treats, and pets' levels (or takes pets away);
// Save sends it all at once
function renderEdit() {
  const el = $("admin"); el.innerHTML = "";
  const head = document.createElement("div"); head.className = "row2"; head.style.marginTop = "0";
  const back = document.createElement("button"); back.className = "btn ghost small"; back.type = "button"; back.textContent = "←"; back.onclick = () => { editTo = null; editData = null; renderAdmin(); };
  const who = document.createElement("b"); who.textContent = editTo.name; who.style.flex = "1"; head.append(back, who); el.appendChild(head);
  if (!editData) return;
  const d = editData, rows = document.createElement("div"); rows.className = "eform";
  const field = (label, value, max, html) => { const r = document.createElement("label"); r.className = "erow"; const t = document.createElement("span"); if (html) t.innerHTML = html; else t.textContent = label; const i = document.createElement("input"); i.className = "field small"; i.type = "number"; i.min = 0; i.max = max; i.value = value; r.append(t, i); rows.appendChild(r); return i; };
  const hd = (t) => { const h = document.createElement("div"); h.className = "ahead"; h.textContent = t; rows.appendChild(h); };
  const coins = field("Coins", Math.floor(d.coins), 1e12, `<span class="coin"></span> Coins`);
  hd("Items"); const items = {}; for (const k of Object.keys(d.items)) items[k] = field(ITEMS[k] ? ITEMS[k].name : k, d.items[k], 1e6);
  const treats = {}; const tk = Object.keys(d.treats).filter((sp) => SPECIES[sp]); if (tk.length) { hd("Treats"); for (const sp of tk) treats[sp] = field(SPECIES[sp].name, d.treats[sp], 1e6); }
  hd("Pets"); const pets = {};
  for (const q of d.pets) {
    if (!SPECIES[q.sp]) continue;
    const i = field("", q.lv, 20, `${SPECIES[q.sp].name} ${moveBadge(q.sp)}${q.id === d.ride ? " ★" : ""}`); i.min = 1;
    const x = document.createElement("button"); x.type = "button"; x.className = "btn small ghost"; x.textContent = "✕"; x.onclick = () => { const off = x.classList.toggle("red"); i.disabled = off; i.parentElement.classList.toggle("gone", off); };
    i.parentElement.appendChild(x); pets[q.id] = { i, x };
  }
  const save2 = document.createElement("button"); save2.type = "button"; save2.className = "btn green"; save2.textContent = "Save";
  save2.onclick = () => {
    const msg = { op: "edit", id: editTo.id, coins: +coins.value, items: {}, treats: {}, pets: {} };
    for (const k in items) msg.items[k] = +items[k].value; for (const sp in treats) msg.treats[sp] = +treats[sp].value;
    for (const id in pets) msg.pets[id] = pets[id].x.classList.contains("red") ? 0 : +pets[id].i.value;
    adminSend(msg);
  };
  el.append(rows, save2);
}
function renderGive() {
  const el = $("admin"); el.innerHTML = "";
  const head = document.createElement("div"); head.className = "row2"; head.style.marginTop = "0";
  const back = document.createElement("button"); back.className = "btn ghost small"; back.type = "button"; back.textContent = "←"; back.onclick = () => { giveTo = null; renderAdmin(); };
  const who = document.createElement("b"); who.textContent = giveTo.name; who.style.flex = "1"; head.append(back, who); el.appendChild(head);
  const q = document.createElement("input"); q.className = "field"; q.placeholder = "Item or pet"; q.value = giveWhat ? giveWhat.name : "";
  const list = document.createElement("div"); list.className = "picklist";
  const fill = () => { list.innerHTML = ""; const t = q.value.trim().toLowerCase(); for (const o of GIVES().filter((o) => !t || o.name.toLowerCase().includes(t)).slice(0, 40)) { const b = document.createElement("button"); b.type = "button"; b.className = "pick" + (giveWhat && giveWhat.id === o.id ? " on" : ""); b.innerHTML = o.pet ? `<img alt="" src="${portrait(o.id.slice(4))}">` : ""; b.append(document.createTextNode(o.name)); if (o.pet) b.insertAdjacentHTML("beforeend", moveBadge(o.id.slice(4))); b.onclick = () => { giveWhat = o; q.value = o.name; fill(); lv.style.display = o.pet ? "" : "none"; }; list.appendChild(b); } };
  q.oninput = () => { giveWhat = null; fill(); };
  const row = document.createElement("div"); row.className = "row2";
  const n = document.createElement("input"); n.className = "field small"; n.type = "number"; n.min = 1; n.value = 1; n.inputMode = "numeric"; n.title = "Amount";
  const lv = document.createElement("input"); lv.className = "field small"; lv.type = "number"; lv.min = 1; lv.max = MAXLV; lv.value = 1; lv.inputMode = "numeric"; lv.title = "Lv"; lv.style.display = giveWhat && giveWhat.pet ? "" : "none";
  const go = document.createElement("button"); go.className = "btn gold"; go.type = "button"; go.textContent = "Give"; go.style.flex = "1";
  go.onclick = () => { if (!giveWhat) return; adminSend({ op: "give", id: giveTo.id, what: giveWhat.id, n: +n.value || 1, lv: +lv.value || 1 }); };
  row.append(n, lv, go); el.append(q, list, row); fill();
}
$("gm-admin").onclick = () => { gearMenu.style.display = "none"; if (openPanel === "p-admin") closePanels(); else { giveTo = null; show("p-admin"); adminSend({ op: "list" }); } };

// ---- the world as it is now (owner, 2026-11-10): the blocks, houses, trees, pads, vans, helicopters, plots and the map,
// all rebuilt from the shared world whenever staff change it ----
let worldMeshes = [], houseKey = "";
function buildWorldView() {
  for (const o of [...worldG.children]) { worldG.remove(o); if (o.userData.own) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); }
  const { solid, dirt, water, tops } = blockGeometry();
  const sm = new THREE.Mesh(solid, blockM), dm = new THREE.Mesh(dirt, dirtM), wm = new THREE.Mesh(water, waterBlockM); sm.castShadow = sm.receiveShadow = true; wm.renderOrder = 1; sm.userData.own = dm.userData.own = wm.userData.own = true;
  inColor(dm);   // (owner, 2026-11-10) the earth down the sides keeps its dirt brown
  worldG.add(sm, dm, wm); worldMeshes = [sm, dm, wm];
  snowCover.geometry.dispose(); snowCover.geometry = tops;
  buildThings(worldG); buildPads(worldG); for (const b of BOOSTS) if (b.k === "pad") b.g.userData.own = true;
  buildVehicles(); for (const id of plotState.keys()) buildPlot(id); syncLots();
  for (const f of fades.values()) if (f.g) { scene.remove(f.g.g); ghostPool.push(f.g); } fades.clear();
  const hk = houses.map((h) => h.id).join(); if (hk !== houseKey) { if (houseKey && me.bag.length) { me.bag = []; syncBeams(); hudKey = ""; } houseKey = hk; }   // the houses changed: parcels for old addresses are gone
  drawMapLayers(); if (wedit) { if (wedit.sel !== undefined && !vehThings().some((t) => t.id === wedit.sel)) { wedit.sel = undefined; renderWorldBar(); } weditAim(wedit.px, wedit.py); }
}
// ---- building the town (owner, 2026-11-10, admins only): pick a piece, see where it goes, tap to place it (or with
// Erase, tap to take it away). Blocks go against the face you point at (on top, or beside it), or on a chosen level
// to build in the air; things stand on the tile you point at. Everyone sees each change as it's made. ----
let wedit = null;   // { tool, d (0-3), lvl (null: against what you point at), r (helicopter radius), p (plot number), px, py, aim }
const WTOOLS = [["land", "Land"], ["wedge", "Wedge"], ["road", "Road"], ["ramp", "Road Ramp"], ["corner", "Road Corner"], ["half", "Half Road"], ["water", "Water"], ["tree", "Tree"], ["house", "House"], ["mailbox", "Mailbox"], ["boost", "Boost"], ["van", "Van"], ["heli", "Helicopter"], ["erase", "Erase"]];
const HELI_R = [40, 80, 150, 250];
const wghost = new THREE.Group(); scene.add(wghost); wghost.visible = false;
const wOk = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.45, depthWrite: false }), wBad = new THREE.MeshBasicMaterial({ color: "#ff3b30", transparent: true, opacity: 0.5, depthWrite: false });
const WEDGE_G = (() => {   // a 6 x 3 x 6 ramp rising toward +z, its base at y 0
  const T = World.TILE, S = World.STEP, h = T / 2, v = [[-h, 0, -h], [h, 0, -h], [h, 0, h], [-h, 0, h], [-h, S, h], [h, S, h]];
  const f = [[0, 2, 1], [0, 3, 2], [3, 4, 5], [3, 5, 2], [0, 1, 5], [0, 5, 4], [0, 4, 3], [1, 2, 5]], pos = [];
  for (const t of f) for (const n of t) pos.push(...v[n]);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); return g;
})();
const HALF_G = (() => {   // the road half of a tile (its corner at +x +z), 3 m tall, its base at y 0
  const h = World.TILE / 2, S = World.STEP, v = [[h, 0, h], [h, 0, -h], [-h, 0, h], [h, S, h], [h, S, -h], [-h, S, h]];
  const f = [[0, 1, 2], [3, 5, 4], [0, 4, 1], [0, 3, 4], [0, 2, 5], [0, 5, 3], [1, 4, 5], [1, 5, 2]], pos = [];
  for (const t of f) for (const n of t) pos.push(...v[n]);
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); return g;
})();
const CUBE_G = new THREE.BoxGeometry(World.TILE, World.STEP, World.TILE).translate(0, World.STEP / 2, 0);
const levelGrid = new THREE.GridHelper(240, 40, "#ffffff", "#ffffff"); levelGrid.material.transparent = true; levelGrid.material.opacity = 0.35; levelGrid.visible = false; scene.add(levelGrid);
function openWorldEdit() {
  if (myRole !== "admin") return;
  if (building) closeBuild(); closePanels();
  wedit = { tool: "land", d: 0, lvl: null, r: 80, p: 0, px: innerWidth / 2, py: innerHeight / 2, aim: null, camD: cam.goalDist };
  cam.goalDist = 40; renderWorldBar(); $("buildbar").style.display = "flex"; uiKey = "";
}
function closeWorldEdit() { if (!wedit) return; cam.goalDist = Math.min(wedit.camD, 45); wedit = null; wghost.visible = false; selBox.visible = false; levelGrid.visible = false; $("buildbar").style.display = "none"; uiKey = ""; }
function weditTurn() { if (!wedit) return; wedit.d = (wedit.d + 1) % 4; weditAim(wedit.px, wedit.py); }
// (owner, 2026-11-10) vans and helicopters can be picked out where they are now: tap one to select it (Delete, or Del,
// takes it away), or tap it with Erase. vehThings()[n] is the thing vehs[n] was made from (the same order).
const vehThings = () => World.allThings().filter((t) => t.k === "van" || t.k === "heli");
const selBox = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), wOk); selBox.visible = false; selBox.renderOrder = 5; scene.add(inColor(selBox));
function vehHit() {   // the vehicle under the ray (its sight shape doesn't count)
  let best = -1, bd = Infinity; ray.layers.enable(1);   // they're drawn in color (layer 1)
  vehs.forEach((m, i) => { const h = ray.intersectObject(m.g, true).find((x) => x.object !== m.los); if (h && h.distance < bd) { bd = h.distance; best = i; } });
  ray.layers.disable(1); return best;
}
function weditDeleteSel() { if (!wedit || wedit.sel === undefined) return; adminSend({ op: "world", edits: [{ op: "rm", id: wedit.sel }] }); wedit.sel = undefined; renderWorldBar(); }
function weditMark() {   // a box round the selected vehicle (or the one pointed at), following it
  const sel = wedit && wedit.sel !== undefined ? vehThings().findIndex((t) => t.id === wedit.sel) : -1, hov = wedit && wedit.aim && wedit.aim.veh !== undefined ? wedit.aim.veh : -1, n = sel >= 0 ? sel : hov, m = vehs[n];
  selBox.visible = !!m; if (!m) return;
  selBox.material = wedit.tool === "erase" && n === hov ? wBad : wOk;
  const [w, h, l] = m.kind ? [7, 5, 11] : [3.4, 3.4, 6.6];
  selBox.scale.set(w, h, l); selBox.position.set(m.g.position.x, m.g.position.y + h / 2 - (m.kind ? 1 : 0.2), m.g.position.z); selBox.rotation.y = m.g.rotation.y;
}
function renderWorldBar() {
  const el = $("buildbar"); el.innerHTML = "";
  const row1 = document.createElement("div"), row2 = document.createElement("div"); row1.className = row2.className = "bbrow";
  const tool = (row, label, on, fn, cls = "") => { const b = document.createElement("button"); b.type = "button"; b.className = "bbbtn " + cls + (on ? " on" : ""); b.textContent = label; b.onclick = fn; row.appendChild(b); return b; };
  for (const [k, name] of WTOOLS) tool(row1, name, wedit.tool === k, () => { wedit.tool = k; renderWorldBar(); weditAim(wedit.px, wedit.py); }, k === "erase" ? "red" : "");
  tool(row2, "⟳", false, weditTurn);
  tool(row2, "−", false, () => { wedit.lvl = (wedit.lvl === null ? weditLevel() : wedit.lvl) - 1; wedit.lvl = clamp(wedit.lvl, -9, 60); renderWorldBar(); weditAim(wedit.px, wedit.py); });
  tool(row2, wedit.lvl === null ? "Auto" : String(wedit.lvl), wedit.lvl !== null, () => { wedit.lvl = null; renderWorldBar(); weditAim(wedit.px, wedit.py); });
  tool(row2, "+", false, () => { wedit.lvl = (wedit.lvl === null ? weditLevel() : wedit.lvl) + 1; wedit.lvl = clamp(wedit.lvl, -9, 60); renderWorldBar(); weditAim(wedit.px, wedit.py); });
  if (wedit.tool === "heli") tool(row2, wedit.r + " m", true, () => { wedit.r = HELI_R[(HELI_R.indexOf(wedit.r) + 1) % HELI_R.length]; renderWorldBar(); weditAim(wedit.px, wedit.py); });
  if (wedit.sel !== undefined) tool(row2, "Delete", false, weditDeleteSel, "red");
  tool(row2, "✕", false, closeWorldEdit);
  el.append(row1, row2);
}
const weditLevel = () => Math.floor((me.y + 0.01) / World.STEP) + 1;   // the level of the block above the one I stand on
const BLOCK_TOOLS = ["land", "wedge", "road", "ramp", "water", "corner", "half"];
const cellAtP = (x, y, z) => [Math.floor(x / World.TILE), Math.floor(z / World.TILE), Math.floor(y / World.STEP) + 1];
const hasCell = (i, j, k) => [...World.allCells()].some((c) => c.i === i && c.j === j && c.k === k);
// what a tap at (px, py) would do: { put | del (a cell) | add (a thing) | rm (a thing's id), ok }
function weditTarget(px, py) {
  const T = World.TILE, S = World.STEP, tl = wedit.tool;
  ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  { const vi = vehHit(), t = vehThings()[vi]; if (vi >= 0 && t) return { veh: vi, id: t.id, ok: true }; }
  let hit = null, n = null;
  if (wedit.lvl !== null) { plane.normal.set(0, 1, 0); plane.constant = -(wedit.lvl - 1) * S; if (ray.ray.intersectPlane(plane, hitV)) hit = hitV.clone(); n = new THREE.Vector3(0, 1, 0); }
  else { ray.layers.enable(1); const h = ray.intersectObjects(worldMeshes, false)[0]; ray.layers.disable(1); if (h) { hit = h.point.clone(); n = h.face.normal.clone(); if (n.dot(ray.ray.direction) > 0) n.negate(); } }
  if (!hit) return null;
  const inC = cellAtP(hit.x - n.x * 0.1, hit.y - n.y * 0.1, hit.z - n.z * 0.1);   // the block pointed at
  const top = World.surfaceAt(hit.x, hit.z, hit.y + 0.3), ty = top > -Infinity ? top : hit.y;
  const ti = Math.floor(hit.x / T), tj = Math.floor(hit.z / T);
  if (tl === "erase") {
    const th = World.allThings().find((t) => Math.abs(t.y - ty) < 3.5 && (t.k === "house" ? Math.abs(tileMid(t.i) - hit.x) < World.PLOT / 2 && Math.abs(tileMid(t.j) - hit.z) < World.PLOT / 2 : t.i === ti && t.j === tj));
    if (th) return { rm: th, ok: true };
    const c = wedit.lvl !== null ? [ti, tj, wedit.lvl] : inC; return { del: c, ok: hasCell(...c) };
  }
  if (BLOCK_TOOLS.includes(tl)) {
    let c;
    if (wedit.lvl !== null) c = [ti, tj, wedit.lvl];
    else { const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z); c = ay >= ax && ay >= az ? [inC[0], inC[1], inC[2] + Math.sign(n.y)] : ax >= az ? [inC[0] + Math.sign(n.x), inC[1], inC[2]] : [inC[0], inC[1] + Math.sign(n.z), inC[2]]; }
    return { put: [c[0], c[1], c[2], World.KINDS.indexOf(tl), wedit.d], ok: true };   // a block already there is replaced
  }
  const t = { k: tl, i: ti, j: tj, y: Math.round(ty * 100) / 100, d: wedit.d };
  if (tl === "heli") t.r = wedit.r;
  const ok = tl === "van" || tl === "boost" ? World.isRoad(ti, tj) : top > -Infinity;
  return { add: t, ok };
}
const tileMid = World.tileMid;
function weditAim(px, py) {
  if (!wedit) return; wedit.px = px; wedit.py = py;
  const a = weditTarget(px, py); wedit.aim = a;
  for (const c of [...wghost.children]) { wghost.remove(c); if (c.userData.own) c.geometry.dispose(); }
  levelGrid.visible = wedit.lvl !== null; if (wedit.lvl !== null) { levelGrid.position.set(Math.round(me.x / World.TILE) * World.TILE, (wedit.lvl - 1) * World.STEP + 0.02, Math.round(me.z / World.TILE) * World.TILE); }
  if (!a || a.veh !== undefined) { wghost.visible = false; return; }
  const T = World.TILE, S = World.STEP, m = a.ok && !a.del && !a.rm ? wOk : wBad, add = (geo, x, y, z, yaw = 0, own = false) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = yaw; o.renderOrder = 5; o.userData.own = own; wghost.add(o); return o; };
  const YAW = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  if (a.put || a.del) {
    const [i, j, k] = a.put || a.del, kind = a.put ? World.KINDS[a.put[3]] : "land";
    add(kind === "wedge" || kind === "ramp" ? WEDGE_G : kind === "half" ? HALF_G : CUBE_G, tileMid(i), (k - 1) * S + 0.01, tileMid(j), a.put ? YAW[wedit.d] : 0).scale.setScalar(a.del ? 1.03 : 1);
    if (kind === "corner") add(HALF_G, tileMid(i), k * S + 0.03, tileMid(j), YAW[wedit.d]).scale.set(1, 0.06, 1);   // which half is road
  } else if (a.rm) {
    const t = a.rm, x = tileMid(t.i), z = tileMid(t.j), w = t.k === "house" ? World.PLOT : T;
    add(new THREE.BoxGeometry(w, 4, w).translate(0, 2, 0), x, t.y, z, 0, true);
  } else {
    const t = a.add, x = tileMid(t.i), z = tileMid(t.j);
    if (t.k === "house") { add(new THREE.BoxGeometry(9, 4.4, 9).translate(0, 2.2, 0), x, t.y, z, YAW[t.d], true); add(new THREE.BoxGeometry(World.PLOT, 0.2, World.PLOT), x, t.y + 0.1, z, 0, true); add(new THREE.BoxGeometry(0.8, 1.4, 0.8), x + World.DIRS[t.d][0] * 7.8, t.y + 0.7, z + World.DIRS[t.d][1] * 7.8); }   // (owner, 2026-11-10) its 3 x 3 lot
    else if (t.k === "heli") { add(new THREE.CylinderGeometry(0.6, 0.6, 14, 8).translate(0, 7, 0), x, t.y, z, 0, true); const ring = add(new THREE.TorusGeometry(t.r, 0.4, 6, 96).rotateX(Math.PI / 2), x, t.y + 0.3, z, 0, true); ring.renderOrder = 5; }
    else if (t.k === "mailbox") add(new THREE.BoxGeometry(0.8, 1.4, 0.8).translate(0, 0.7, 0), x, t.y, z, YAW[t.d], true);
    else if (t.k === "tree") add(new THREE.ConeGeometry(2.8, 10.5, 8).translate(0, 5.25, 0), x, t.y, z, 0, true);
    else if (t.k === "boost") add(new THREE.BoxGeometry(3.4, 0.2, 5), x, t.y + 0.1, z, YAW[t.d], true);
    else add(new THREE.BoxGeometry(2.4, 2.4, 5).translate(0, 1.2, 0), x, t.y, z, YAW[t.d], true);   // van
  }
  wghost.visible = true; inColor(wghost);
}
function weditTap(px, py) {
  weditAim(px, py); const a = wedit.aim;
  if (a && a.veh !== undefined) { if (wedit.tool === "erase") adminSend({ op: "world", edits: [{ op: "rm", id: a.id }] }); else { wedit.sel = a.id; renderWorldBar(); } return true; }
  if (wedit.sel !== undefined) { wedit.sel = undefined; renderWorldBar(); return true; }   // a tap away lets go of it
  if (!a || !a.ok) return true;
  adminSend({ op: "world", edits: [a.put ? { op: "put", c: a.put } : a.del ? { op: "del", c: a.del } : a.rm ? { op: "rm", id: a.rm.id } : { op: "add", t: a.add }] });
  return true;
}
$("gm-world").onclick = () => { gearMenu.style.display = "none"; if (wedit) closeWorldEdit(); else openWorldEdit(); };
// (owner, 2026-11-09) staff chat commands, never sent as chat: /coins 1m, /allpets, /maxlv, /items, /treats, /everything
// (or /all), /unwanted, each on yourself or a player named after it (/coins 50k Name); /kick Name, /mute Name 1h, /ban
// Name 7d (minutes, or m / h / d, perma, off)
function slash(text) {
  const [c, ...a] = text.slice(1).split(" "), cmd = c.toLowerCase(), who = (s) => (s && /^[A-Za-z0-9_]{3,16}$/.test(s) ? s : null);
  const QC = { allpets: "allpets", maxlv: "maxlv", items: "items", treats: "treats", everything: "everything", all: "everything", unwanted: "unwanted" };
  const dur = (s) => { s = (s || "").toLowerCase(); if (s === "perma" || s === "off") return s; const r = /^(\d+)([mhd]?)$/.exec(s); return r ? String(+r[1] * { "": 1, m: 1, h: 60, d: 1440 }[r[2]]) : "60"; };
  if (cmd === "coins") { const r = /^(\d+(?:\.\d+)?)([km]?)$/i.exec(a[0] || ""); if (!r) return toast("Unknown"); return adminSend({ op: "quick", cmd: "coins", n: Math.floor(+r[1] * { "": 1, k: 1e3, m: 1e6 }[r[2].toLowerCase()]), name: who(a[1]) || myName }); }
  if (QC[cmd]) return adminSend({ op: "quick", cmd: QC[cmd], name: who(a[0]) || myName });
  if ((cmd === "kick" || cmd === "mute" || cmd === "ban") && who(a[0])) return adminSend(cmd === "kick" ? { op: "kick", name: a[0] } : { op: cmd, name: a[0], mins: dur(a[1]) });
  toast("Unknown");
}

// ---- the loop ----
let last = performance.now(), clock = 0, zone = null, jumpQueued = 0, flyUp = false, flyDown = false;   // flyUp / flyDown: Fly ▲ / Fly ▼ held
const SLOPE = 0.8, FLY_TOP = 130, FLY_SPEED_UP = 0.85, GRAV = 26;
// (owner, 2026-11-08) how each pet gets around: land pets jump (high from standing, far on the run); flapping fliers go
// anywhere but fly and walk slower; gliders are fast but can't climb, sinking slowly as they glide, and walk well
// (owner, 2026-11-08) Space, pressed each time: land pets jump (straight up when not moving, far when running); a flier
// rises straight up; a glider jumps off the ground and gets one flap up in the air. Inside a house (on its floors) you
// walk, off your pet.
const MOVE = { land: { ground: 1, air: 1 }, fly: { ground: 0.7, air: 0.75 }, glide: { ground: 0.95, air: 1.25 }, foot: { ground: 1, air: 1 } };
const FOOT_SPEED = 5.5;
// (owner, 2026-11-09) airborne fliers and gliders gain up to 10% pointing downwind and lose up to 5% pointing into it.
// The dot product makes the change taper smoothly to no change while crossing the wind.
function windRideFactor(kind, airborne, dx, dz, wx = WIND.x, wz = WIND.z) {
  const d = hyp(dx, dz); if (!airborne || (kind !== "fly" && kind !== "glide") || d < 0.08) return 1;
  const along = clamp((dx * wx + dz * wz) / d, -1, 1);
  return 1 + along * (along >= 0 ? 0.1 : 0.05);
}
// (owner, 2026-11-09) the town's roofs: a pet that jumps or flies up onto one stands on it (a pyramid over the walls)
const ROOF_HALF = 7.2 * Math.SQRT1_2, ROOF_RISE = 3.4;
function roofTop(x, z, y) {
  let best = -Infinity;
  for (const h of houses) {
    const dx = x - h.x, dz = z - h.z; if (dx * dx + dz * dz > 60) continue;
    const top = h.base + 4.4; if (y < top - 0.6) continue;
    const c = Math.cos(h.yaw), s = Math.sin(h.yaw), lx = Math.abs(dx * c - dz * s), lz = Math.abs(dx * s + dz * c), m = Math.max(lx, lz);
    if (m < ROOF_HALF) best = Math.max(best, top + ROOF_RISE * (1 - m / ROOF_HALF));
  }
  return best;
}
// (owner, 2026-11-10) blocks are solid boxes: anyone caught inside one (falling down a side, landing on an edge) is pushed
// out sideways the shortest way to open air, and falls (or walks on) from there; never stuck in it, never lifted on top
function unstick() {
  if (inHouse() || me.inst || inArena(me.x, me.z)) return;
  const inBlock = (x, z) => { const col = World.colAt(x, z); if (!col) return false; for (const c of col) { if (c.t === "water") continue; const top = World.cellTop(c, x, z), bottom = (c.k - 1) * World.STEP; if (top > me.y + 0.6 && bottom < me.y + 1.5) return true; } return false; };
  if (!inBlock(me.x, me.z)) return;
  const T = World.TILE, i = Math.floor(me.x / T), j = Math.floor(me.z / T), u = me.x - i * T, v = me.z - j * T, R = 0.8;
  const out = [[i * T - R, me.z, u], [(i + 1) * T + R, me.z, T - u], [me.x, j * T - R, v], [me.x, (j + 1) * T + R, T - v]].sort((a, b) => a[2] - b[2]);
  for (const [x, z] of out) if (!inBlock(x, z) && !blocked(x, z, me.y)) { me.x = x; me.z = z; return; }
}
function groundAt(x, z, y) {
  const rf = roofTop(x, z, y); if (rf > -Infinity) return rf;
  if (inArena(x, z) && y > AR.y - 3) return AR.y + arenaFloor(x, z);
  const sy = World.surfaceAt(x, z, y - 0.6); if (sy === -Infinity) return -200;   // (owner, 2026-11-10) the blocks: the highest top at most a step (0.6 m) above me; higher is a side, never a step up
  // (owner, 2026-11-09) in the water: a swimmer goes down to the bottom (it swims, below), a flier or glider hovers
  // over it, and anyone else would float (but is put back on the shore: only swimmers go in the water)
  const w = World.waterAt(x, z); if (w > -Infinity) return waterMode === "swim" ? terrain(x, z) + 0.25 : waterMode === "hover" ? w + 0.8 : w - SWIM_SINK;
  return sy;
}
// (owner, 2026-11-09) swimmers swim fast; anyone else paddles slowly, and can't wade in from the shore (they can jump in)
const SWIM_SINK = 0.55, SWIM_FAST = 1.35, SWIM_UP = 0.7;
let waterMode = "float";
// the nearest dry ground (on the island) to a spot in the water
function nearestDry(x, z) { for (let r = 1; r < 50; r += 1) for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (inside(px, pz, 2) && World.waterAt(px, pz) === -Infinity && World.waterAt(px + Math.cos(a), pz + Math.sin(a)) === -Infinity) return [px + Math.cos(a), pz + Math.sin(a)]; } return [SPAWN.x, SPAWN.z]; }
const swims = () => !!SPECIES[riding().sp].swim;
function floorAt(x, z, y) { return Math.max(groundAt(x, z, y), houseSurface(x, z, y)); }
function step(dt) {
  clock += dt; petSync();
  const now = performance.now();
  if (!loggedIn) { joy.x = joy.y = 0; }
  // where the joystick (or keys) point, turned by the camera
  let jx = joy.x, jy = joy.y;
  if (loggedIn && !typing()) {
    if (keys.has("KeyW") || keys.has("ArrowUp")) jy -= 1; if (keys.has("KeyS") || keys.has("ArrowDown")) jy += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) jx -= 1; if (keys.has("KeyD") || keys.has("ArrowRight")) jx += 1;
  }
  if (talk) jx = jy = 0;
  const l = hyp(jx, jy); if (l > 1) { jx /= l; jy /= l; }
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  const mx = fx * -jy + rx * jx, mz = fz * -jy + rz * jx, ml = hyp(mx, mz);
  // (owner, 2026-11-09) on foot only inside a house (through its front door); riding everywhere outside, lots too
  me.foot = inHouse();
  const kind = me.foot ? "foot" : moveKind(), M = MOVE[kind], p = riding(), stunned = me.stunUntil > now;
  waterMode = kind !== "foot" && swims() ? "swim" : kind === "fly" || kind === "glide" ? "hover" : "float";
  const floor0 = floorAt(me.x, me.z, me.y), grounded = me.y - floor0 < 0.08;
  // (owner, 2026-11-09) a flier walks on the ground until Space takes it up; off the ground it's always flying
  if (kind !== "fly") me.flying = false; else if (me.y - floor0 > 1.2) me.flying = true;
  const flying = kind === "fly" && me.flying;
  if (grounded) me.flapped = false;
  if (!me.inst && kind !== "foot") boostTouch(now, kind);
  let sp = (kind === "foot" ? FOOT_SPEED : petSpeed(p)) * (me.boostUntil > now ? SNACK_BOOST : 1) * (me.padUntil > now && kind !== "foot" ? PAD_BOOST : 1) * (grounded ? M.ground : M.air);
  sp *= windRideFactor(kind, me.y - floor0 > 1.2, mx, mz);
  if ((kind === "land" || kind === "foot") && !grounded && me.longJump) sp *= 1.6;
  const wNow = World.waterAt(me.x, me.z), wet = waterMode === "swim" && wNow > -Infinity && me.y < wNow - 0.2;
  if (wet) sp *= SWIM_FAST;
  me.moving = ml > 0.08 && !stunned;
  if (!me.moving) stuckFor = 0;
  if (me.moving) {
    const v = sp * Math.min(1, ml) * dt, nx = me.x + (mx / ml) * v, nz = me.z + (mz / ml) * v;
    const ok = (x, z) => {
      if (inHouse()) { const lx = x - INT.x, lz = z - INT.z; return lx > 0.4 && lz > 0.4 && lx < World.HOME_SIZE - 0.4 && lz < World.HOME_SIZE - 0.4 && !houseWall(x, z, me.y) && floorAt(x, z, me.y) - me.y <= SLOPE * v + 0.05; }   // inside: the floor's edge is the end
      if (hyp(x, z) > LIMIT || blocked(x, z, me.y) || houseWall(x, z, me.y) || arenaBlocked(x, z, me.y) || (!me.inst && folkBlock(x, z, me.y))) return false;
      if (flying) return true;
      const hs = houseSurface(x, z, me.y); if (hs > -Infinity && hs >= groundAt(x, z, me.y) && hs - me.y <= 0.6) return true;   // floors, steps and slopes of houses
      if ((kind === "land" || kind === "foot") && !inside(x, z) && !inArena(x, z, 1.5)) return false;   // the edge (gliders can step off)
      if (kind === "land" || kind === "foot") {   // (owner, 2026-11-10) no stepping off a block's edge down into a hole or off a ledge: heights change only on wedges and ramps
        const g0 = World.surfaceAt(me.x, me.z, me.y);
        if (g0 > -Infinity && me.y - g0 < 0.3 && World.surfaceAt(x, z, me.y) < g0 - 1.2) return false;
      }
      if (waterMode !== "swim" && !flying && World.waterAt(x, z) > me.y - 2.5) return false;   // (owner, 2026-11-09) only swimmers go in the water
      if (wet && !inside(x, z, 2.5)) return false;   // not over the waterfall
      return floorAt(x, z, me.y) - me.y <= SLOPE * v + 0.05 + (wet ? 1.1 : 0);   // too steep to climb (a jump gets you up a ledge; out of the water too)
    };
    const bx = me.x, bz = me.z;
    if (ok(nx, me.z)) me.x = nx; if (ok(me.x, nz)) me.z = nz;   // slide along walls
    // shut in a room with no way out (walled over, or dropped in from above): pushing on, you're put out in front of the plot
    if (hyp(me.x - bx, me.z - bz) < v * 0.2 && !flying) stuckFor += dt; else stuckFor = 0;
    if (stuckFor > 3 && inHouse()) { stuckFor = 0; me.x = INT.x + World.FRONT_DOOR.x; me.z = INT.z + World.FRONT_DOOR.z + 2; me.y = INT.y + 0.25; me.vy = 0; cam.y = me.y; sendPos(true); }   // walled in: back by the front door
    me.yaw = lerpYaw(me.yaw, Math.atan2(mx, mz), Math.min(1, dt * 12));   // turn to where it's going (fliers also pitch: flightPitch)
  }
  unstick();
  const floor = floorAt(me.x, me.z, me.y);
  const held = loggedIn && !typing(), upH = flyUp || (held && keys.has("Space")), downH = flyDown || (held && (keys.has("ShiftLeft") || keys.has("ShiftRight")));
  if (kind === "fly" && !flying && !stunned && (upH || jumpQueued > now)) { me.flying = true; jumpQueued = 0; me.y = Math.max(me.y, floor) + 0.6; }   // Space on the ground: take off
  if (kind === "fly" && me.flying) {   // (owner, 2026-11-09) Space / Shift fly vertically; otherwise forward flight follows the camera's climb or dive
    me.vy = 0; jumpQueued = 0;
    const keyedLift = (upH ? 1 : 0) - (downH ? 1 : 0), forward = me.moving ? clamp(-jy, 0, 1) : 0, cameraLift = forward * clamp((0.42 - cam.pitch) * 1.8, -1, 1);
    if (!stunned) me.y += (upH || downH ? keyedLift : cameraLift) * sp * FLY_SPEED_UP * dt;
    me.y = Math.min(me.y, FLY_TOP); if (me.y <= floor) { me.y = floor; if (!upH && World.waterAt(me.x, me.z) === -Infinity) me.flying = false; }   // back on the ground: walking (over water it keeps flying)
  } else {
    if (kind === "fly") jumpQueued = 0;   // a walking flier doesn't jump (Space takes off)
    const surf = wNow - SWIM_SINK, swimming = wet && me.y <= surf + 0.05 && !(me.vy > 0);
    if (swimming && jumpQueued > now && me.y > surf - 0.3 && !stunned) { me.vy = 8.5; me.y = surf + 0.06; jumpQueued = 0; }   // a leap out at the surface
    else if (swimming) {   // (owner, 2026-11-09) swimmers swim underwater: Space (or Swim ▲) up, Shift (or Swim ▼) down; they drift up to the surface
      me.vy = 0; if (jumpQueued && jumpQueued < now) jumpQueued = 0;
      if (!stunned) me.y += (upH ? 1 : downH ? -1 : 0.3) * sp * SWIM_UP * dt;
      me.y = clamp(me.y, floor, surf); me.longJump = false;
    } else {
    if (jumpQueued > now && grounded && !stunned) { me.vy = me.moving ? (kind === "glide" ? 9 : 7.5) : kind === "glide" ? 10 : 11; me.longJump = me.moving && kind !== "glide"; jumpQueued = 0; }
    else if (jumpQueued > now && kind === "glide" && !grounded && !me.flapped && !stunned) { me.vy = 8; me.flapped = true; jumpQueued = 0; }   // a glider's one flap up
    me.vy = (me.vy || 0) - GRAV * dt;
    if (kind === "glide" && me.vy < 0 && me.y - floor > 1.2) me.vy = Math.max(me.vy, -(1.6 + Math.max(0, cam.pitch - 0.42) * 10));   // gliding down
    me.y += me.vy * dt;
    if (me.y <= floor || (grounded && me.vy <= 0 && me.y - floor < 0.6)) { me.y = floor; me.vy = 0; me.longJump = false; }
    if (jumpQueued && jumpQueued < now) jumpQueued = 0;   // landed (and keeping to the ground going downhill)
    if (me.y < -150) { me.x = SPAWN.x; me.z = SPAWN.z; me.y = terrain(me.x, me.z); me.vy = 0; toast("Whoosh!"); }   // fell off into the clouds: back to the plaza
    }
  }
  // (owner, 2026-11-09) only swimmers go in the water: anyone else who ends up on it (a jump, a glide, a teleport) is put on the nearest shore
  if (waterMode !== "swim" && !(kind === "fly" && me.flying) && !me.inst && World.waterAt(me.x, me.z) > -Infinity && me.y - floorAt(me.x, me.z, me.y) < 0.3) {
    const [dx, dz] = nearestDry(me.x, me.z); me.x = dx; me.z = dz; me.y = floorAt(dx, dz, me.y + 3); me.vy = 0; emitSparks(me.x, me.y + 0.5, me.z, 14, 3, ["#ffffff", "#bfe6ff"], 0.6, 4); sendPos(true);
  }
  if (wet && me.y < wNow - SWIM_SINK - 0.6 && me.moving && Math.random() < dt * 10) emitSparks(me.x, me.y + 1, me.z, 1, 0.6, ["#ffffff", "#cfefff"], 1.2, -2, 0.6);   // bubbles
  if (me.padUntil > now && me.moving && Math.random() < dt * 24) emitSparks(me.x - Math.sin(me.yaw) * 0.8, me.y + 0.8, me.z - Math.cos(me.yaw) * 0.8, 2, 1.2, me.padC === "pad" ? ["#ff9f1a", "#fff4c2"] : me.padC === "air" ? ["#5fe3ff", "#ffffff"] : ["#8f9bff", "#ffffff"], 0.45, 0, 0.8);   // a boost's trail
  me.swim = wet;
  if (wet && me.y > wNow - SWIM_SINK - 0.3 && me.moving && Math.random() < dt * 14) emitSparks(me.x, wNow + 0.1, me.z, 2, 1.6, ["#ffffff", "#bfe6ff"], 0.5, 5, 0.7);   // a splash
  // (owner, 2026-11-09) a strong wind (from 12 mph, most at 40) gently pushes a flier or glider in the air along with it
  // and bumps it about a little; never on the ground, at home or inside
  const gust = me.inst || stunned || !me.airborne || (kind !== "fly" && kind !== "glide") ? 0 : clamp((windNow.mph - 12) / 28, 0, 1);
  if (gust > 0) {
    const dr = gust * 1.4 * dt, side = gust * 0.7 * Math.sin(clock * 1.3) * Math.sin(clock * 0.47 + 1) * dt;
    const free = (x, z) => hyp(x, z) <= LIMIT && !blocked(x, z, me.y) && !houseWall(x, z, me.y) && floorAt(x, z, me.y) < me.y - 0.5;
    const nx = me.x + WIND.x * dr - WIND.z * side, nz = me.z + WIND.z * dr + WIND.x * side;
    if (free(nx, me.z)) me.x = nx; if (free(me.x, nz)) me.z = nz;
    me.y = Math.max(floorAt(me.x, me.z, me.y), me.y + gust * 0.6 * (Math.sin(clock * 2.1) + 0.5 * Math.sin(clock * 3.7 + 2)) * dt);
    if (kind === "fly") me.y = Math.min(me.y, FLY_TOP);
  }
  me.airborne = me.y - floor > 1.2;
  arenaStep();
  const low = me.y - floor < 3.5;
  if (!me.inst) {
    // the post office fills my bag; a mailbox I have a parcel for takes it
    if (hyp(me.x - PICKUP.x, me.z - PICKUP.z) < PICKUP.r && low) fillBag();
    for (const i of me.bag) { const h = houses[i]; if (hyp(me.x - h.mx, me.z - h.mz) < 3.6 && Math.abs(me.y - h.my) < 4.5) { deliver(i); break; } }
    packageStep();
  }
  // animal control: offline this page runs it
  if (!netOk) {
    Object.assign(meP, { x: me.inst ? 9999 : me.x, y: me.y, z: me.z, stars: me.stars, bag: me.bag.length, airMount: !!SPECIES[riding().sp].fly });
    const daylight = environment.time === "auto" ? undefined : environment.time === "day";
    for (const e of World.stepVehicles(localVs, [meP], dt, now / 1000, daylight)) onVehEvent(e.k, e.stars || 0);
  }
  // the shops, the training yard and the board open their panel when I ride in
  const z = !low || me.inst ? null : hyp(me.x - SHOP.x, me.z - SHOP.z) < SHOP.r ? "p-shop:egg" : hyp(me.x - TRAIN.x, me.z - TRAIN.z) < TRAIN.r ? "p-train" : hyp(me.x - BOARD.x, me.z - BOARD.z) < BOARD.r ? "p-board" : null;
  if (z !== zone) { if (zone && openPanel === zone.split(":")[0]) closePanels(); zone = z; if (z) { const [id, kind] = z.split(":"); if (kind) shopKind = kind; show(id); } }
  contractStep(); fxStep(dt);
  const cs = (0.5 + windNow.mph * 0.08) * dt;   // clouds drift with the wind
  for (const c of clouds) { c.position.x += WIND.x * cs; c.position.z += WIND.z * cs; for (const ax of ["x", "z"]) { if (c.position[ax] > 420) c.position[ax] -= 840; else if (c.position[ax] < -420) c.position[ax] += 840; } }
  // send where I am, 10 times a second (by the real clock) when it changes, and every 2 s regardless; save now and then
  if (netOk && now - lastSent > 50) { sendPos(now - lastActual > 1000); lastSent = now; }
  flushSave(false);
}
function draw(dt) {
  if (wedit && performance.now() - (wedit.t || 0) > 100) { wedit.t = performance.now(); weditAim(wedit.px, wedit.py); }   // the preview follows the camera
  weditMark();
  const now = performance.now();
  mine.g.position.set(me.x, me.y, me.z); mine.g.rotation.set(0, me.yaw, 0); mine.g.visible = !me.foot;
  walker.g.visible = !!me.foot; if (me.foot) { walker.g.position.set(me.x, me.y, me.z); walker.g.rotation.y = me.yaw; animateWalker(walker, clock, me.moving); }
  animatePet(mine, clock, me.moving, petSpeed(riding()), me.airborne); flightPitch(mine, me.x, me.y, me.z, dt, me.airborne);
  dizzy.visible = me.stunUntil > now; if (dizzy.visible) { dizzy.position.set(me.x, me.y + mine.top + 0.5, me.z); dizzy.rotation.y = clock * 6; }
  for (const o of others.values()) {
    const vis = o.inst === me.inst; o.m.g.visible = vis && !o.foot;
    if (o.foot && !o.walker) o.walker = walkerModel(o.shirt || "#3a8ee6"); if (o.walker) o.walker.g.visible = vis && !!o.foot;
    if (!vis) continue;
    // replayed a little in the past on its own clock; a correction after a guess ahead is eased in, never snapped
    if (o.off !== undefined && sampleAt(o.buf, performance.now() - o.off - OTHER_DELAY, tmpS)) {
      if (o.snap || hyp(tmpS.x - o.x, tmpS.z - o.z) > 25) { o.x = tmpS.x; o.y = tmpS.y; o.z = tmpS.z; o.snap = false; }
      const k = Math.min(1, dt * 18); o.x += (tmpS.x - o.x) * k; o.y += (tmpS.y - o.y) * k; o.z += (tmpS.z - o.z) * k; o.yaw = lerpYaw(o.yaw, tmpS.yaw, k);
    }
    o.m.g.position.set(o.x, o.y, o.z); o.m.g.rotation.y = o.yaw;
    if (o.walker && o.foot) { o.walker.g.position.set(o.x, o.y, o.z); o.walker.g.rotation.y = o.yaw; animateWalker(o.walker, clock + o.x, o.moving); }
    if (o.foot) o.tag.position.y = 2.6; else o.tag.position.y = o.m.top + 1.2;
    const air = o.m.fly && o.y - (inside(o.x, o.z) ? terrain(o.x, o.z) : -60) > 1.2;
    animatePet(o.m, clock + o.x * 0.1, o.moving, 10, air); flightPitch(o.m, o.x, o.y, o.z, dt, air);
  }
  vehiclesDraw(dt);
  for (const q of inter ? inter.pens : []) {   // pets in playpens wander about
    if (q.wait > 0) q.wait -= dt; else { const dx = q.tx - q.x, dz = q.tz - q.z, d = hyp(dx, dz); if (d < 0.1) { const a = Math.random() * TAU, r = Math.random() * 1.2; q.tx = q.cx + Math.cos(a) * r; q.tz = q.cz + Math.sin(a) * r; q.wait = 1 + Math.random() * 2; } else { const s2 = Math.min(d, dt * 1.5); q.x += (dx / d) * s2; q.z += (dz / d) * s2; q.yaw = lerpYaw(q.yaw, Math.atan2(dx, dz), Math.min(1, dt * 6)); } }
    q.m.g.position.set(q.x, q.y, q.z); q.m.g.rotation.y = q.yaw; animatePet(q.m, clock + q.cx, q.wait <= 0, 3, false);
  }
  // the arrow: to the nearest house in my bag, else back to the post office
  let tx = PICKUP.x, tz = PICKUP.z, best = 1e9;
  for (const i of me.bag) { const h = houses[i], d = hyp(h.mx - me.x, h.mz - me.z); if (d < best) { best = d; tx = h.mx; tz = h.mz; } }
  const ti = me.bag.find((i) => houses[i].mx === tx && houses[i].mz === tz), ty = ti !== undefined ? houses[ti].my : 0;
  for (const b of beams.values()) { b.userData.parcel.rotation.y = clock * 2; b.userData.parcel.position.y = 3 + Math.sin(clock * 3) * 0.3; }
  drawPackages();
  pickRing.material.opacity = 0.55 + Math.sin(clock * 4) * 0.3; bigEgg.rotation.y = clock * 0.6;
  folkStep(dt); talkStep(dt); introStep(dt); cutaway(); poiStep(); waterStep(dt); boostStep(dt); placeCamera(dt); camera.updateMatrixWorld(); const ig = introGuide(), gd = ig || (inArena() ? [obsSpot(OBS[arNext])[0], AR.y, obsSpot(OBS[arNext])[1]] : [tx, ty, tz]); drawGuide(gd[0], gd[1], gd[2], loggedIn && !building && !talk && (!!ig || me.bag.length > 0 || save.settings.followArrowWhenEmpty) && hyp(gd[0] - me.x, gd[2] - me.z) > 6); drawMap(now, gd[0], gd[2], ti !== undefined && houses[ti].sky, loggedIn && !building && !talk); skyStep(dt, camera.position.x, camera.position.y, camera.position.z); underwater();
  nightGlow = me.inst ? 0 : clamp((1 - skyNow.day) * 0.4, 0, 0.4); for (const m of CHAR_MATS.values()) m.emissiveIntensity = nightGlow; blobStep();
  renderFrame();
}
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.1); last = now;
  if (dt > 0.05) { step(dt / 2); step(dt / 2); } else step(dt);
  draw(dt); hud(); ui(); if (invites.length && invites[0].until < now) renderInvite();
  requestAnimationFrame(frame);
}
$("btn-jump").addEventListener("pointerdown", (e) => { e.preventDefault(); jumpQueued = performance.now() + 150; flyUp = true; });
$("btn-down").addEventListener("pointerdown", (e) => { e.preventDefault(); flyDown = true; });
for (const ev of ["pointerup", "pointercancel", "pointerleave"]) { $("btn-jump").addEventListener(ev, () => { flyUp = false; }); $("btn-down").addEventListener(ev, () => { flyDown = false; }); }
buildWorldView();
me.y = terrain(me.x, me.z); cam.y = me.y;
syncBeams(); hud(); requestAnimationFrame(frame); connect();
$("lgo").disabled = $("lnew").disabled = true;

// for tests
window.Pets = { get save() { return save; }, openWorldEdit, weditTap, get wedit() { return wedit; }, get intro() { return intro; }, talkNext, enterHouse, leaveHouse, get inter() { return inter; }, lotDoor, nearDoor, deleteSel, turnBuild, get myPlotId() { return myPlot; }, INT, get mine() { return mine; }, BOOSTS, nearestDry, get arena() { return { AR, OBS, next: arNext, TRM, obsSpot }; }, me, houses, get contract() { return contract; }, get packageEvent() { return packageEvent; }, get packageMeshes() { return packageMeshes; }, get online() { return online; }, get netOk() { return netOk; }, get loggedIn() { return loggedIn; }, get others() { return others; }, get myPlot() { return myPlot; }, plotState, get party() { return party; }, get trading() { return trading; }, step, deliver, fillBag, buyEgg, folk, startTalk, talkNext, talkPick, endTalk, get talk() { return talk; }, train, startContract, ride, setPen, collectPens, openBuild, closeBuild, get building() { return building; }, buildTap, showGhost, runAct, netSend, setPackageEvent, eventFlash, EGGS, SPECIES, PICKUP, SHOP, TRAIN, BOARD, World, vehs, localVs, cam, terrain, contractOver, houseSurface, houseWall, refreshTest: () => refreshMyPlot(), emitConfetti, firework, caught, trade, persist, flushSave, set skyOffset(v) { skyOffset = v; }, get daylight() { return skyNow.day; }, get environment() { return { ...environment }; }, get sky() { return { day: skyNow.day, rain: skyNow.rain, snow: skyNow.snow, storm: skyNow.storm, fog: skyNow.fog }; }, get wind() { return { mph: windNow.mph, x: WIND.x, z: WIND.z }; }, windRideFactor, reach, camera, V3: THREE.Vector3, teleport: (x, z, y) => { me.x = x; me.z = z; me.y = y === undefined ? terrain(x, z) : y; me.vy = 0; } };
