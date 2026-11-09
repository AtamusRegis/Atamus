// Pet Delivery Co. (owner, 2026-11-08): ride your pet around town delivering mail. Pick up parcels at the post office,
// ride up to the glowing houses to deliver them, earn coins (and sometimes an item), buy eggs to hatch faster pets,
// train them. The town is a floating island (pets-world.js, shared with the server); fliers reach the small islands off
// its edge; animal control chases you. Co-op: everyone in a room rides the same town, works on contracts together and
// chats. The server (packages/server/src/pets.js) shares players, runs animal control, contracts and chat.
import * as THREE from "./vendor/three.module.min.js";
import * as World from "./pets-world.js?v=1793100003";

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), hyp = Math.hypot;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const smooth = (t) => t * t * (3 - 2 * t);
const touchy = matchMedia("(pointer: coarse)").matches;

// ---- pets ----
const RARITY = [{ name: "Common", c: "#6f7d8a" }, { name: "Rare", c: "#3a8ee6" }, { name: "Epic", c: "#a352e0" }, { name: "Legendary", c: "#e08a00" }];
// speed in m/s, bag in parcels, fly: "fly" (flaps: goes anywhere, slower) or "glide" (fast, can't climb) (owner, 2026-11-08); body: how it's built; ears: what's on
// its head; c / a: its colors
const SPECIES = {
  pup: { name: "Pup", r: 0, speed: 7, bag: 2, c: "#c98b4f", a: "#7a4f28", body: "quad", ears: "flop", size: 1 },
  kitten: { name: "Kitten", r: 0, speed: 7.5, bag: 2, c: "#f2a65a", a: "#fff1e0", body: "quad", ears: "point", size: 0.9 },
  bunny: { name: "Bunny", r: 0, speed: 8, bag: 2, c: "#f4f1ee", a: "#f3a7b5", body: "quad", ears: "long", size: 0.9 },
  duck: { name: "Duck", r: 0, speed: 6.5, bag: 3, c: "#ffd84a", a: "#f08a24", body: "bird", size: 0.9 },
  fox: { name: "Fox", r: 1, speed: 9.5, bag: 3, c: "#e8722c", a: "#fff4ea", body: "quad", ears: "point", size: 1 },
  penguin: { name: "Penguin", r: 1, speed: 8.5, bag: 4, c: "#2b3440", a: "#f4f4f4", body: "bird", size: 1 },
  goat: { name: "Goat", r: 1, speed: 9, bag: 4, c: "#e6e1d6", a: "#9b8f7a", body: "quad", ears: "horns", size: 1.05 },
  butterfly: { name: "Butterfly", r: 1, speed: 9, bag: 2, fly: "fly", c: "#3a8ee6", a: "#ffd84a", c2: "#e5534b", body: "butterfly", size: 1.1 },
  parrot: { name: "Parrot", r: 1, speed: 9.5, bag: 3, fly: "glide", c: "#3fb36b", a: "#e5534b", body: "bird", wings: true, size: 1 },
  stego: { name: "Stegosaurus", r: 1, speed: 8.5, bag: 5, c: "#7fae5a", a: "#e08a3a", body: "quad", plates: true, tail: "long", size: 1.25 },
  deer: { name: "Deer", r: 2, speed: 11.5, bag: 3, c: "#b9824e", a: "#f3e3cc", body: "quad", ears: "antlers", size: 1.15 },
  bear: { name: "Bear", r: 2, speed: 10, bag: 6, c: "#6b4a32", a: "#c9a27e", body: "quad", ears: "round", size: 1.3 },
  horse: { name: "Horse", r: 2, speed: 12.5, bag: 4, c: "#8a5a3a", a: "#2b1d14", body: "quad", ears: "point", legs: 1.4, size: 1.2 },
  owl: { name: "Owl", r: 2, speed: 11, bag: 4, fly: "fly", c: "#9b7a55", a: "#f3e3cc", body: "bird", wings: true, ears: "tufts", size: 1.15 },
  trike: { name: "Triceratops", r: 2, speed: 11, bag: 6, c: "#5a8fb0", a: "#f3e3cc", body: "quad", frill: true, tail: "long", size: 1.3 },
  raptor: { name: "Raptor", r: 2, speed: 13, bag: 3, c: "#8aa04a", a: "#5a6a2a", body: "biped", tail: "long", size: 1.05 },
  dragon: { name: "Dragon", r: 3, speed: 15, bag: 5, fly: "fly", c: "#3fb36b", a: "#ffd84a", body: "quad", wings: "big", ears: "horns", tail: "long", size: 1.35 },
  unicorn: { name: "Unicorn", r: 3, speed: 16, bag: 4, c: "#fbf7ff", a: "#ff7ac8", body: "quad", ears: "horn", legs: 1.4, size: 1.25 },
  pegasus: { name: "Pegasus", r: 3, speed: 15.5, bag: 4, fly: "glide", c: "#f4f6ff", a: "#9ad0ff", body: "quad", wings: "big", ears: "point", legs: 1.4, size: 1.25 },
  phoenix: { name: "Phoenix", r: 3, speed: 17, bag: 3, fly: "glide", c: "#ff6a2a", a: "#ffd84a", body: "bird", wings: "big", tail: "fire", size: 1.25 },
  trex: { name: "T-Rex", r: 3, speed: 14.5, bag: 7, c: "#4f7a3a", a: "#e5d9a8", body: "biped", tail: "long", big: true, size: 1.4 },
  ptero: { name: "Pterodactyl", r: 3, speed: 15, bag: 5, fly: "glide", c: "#b07a5a", a: "#e8c9a0", body: "bird", wings: "big", ears: "crest", size: 1.25 },
  icedragon: { name: "Ice Dragon", r: 3, speed: 16, bag: 5, fly: "fly", c: "#bfe6ff", a: "#3a8ee6", body: "quad", wings: "big", ears: "horns", tail: "long", size: 1.35 },
};
// eggs: chance of each rarity (percent); the pet is any of that rarity
const EGGS = [
  { id: "basic", name: "Basic Egg", price: 150, odds: [72, 24, 4, 0], c: "#f4ead8", s: "#d8c39c" },
  { id: "gold", name: "Golden Egg", price: 1500, odds: [0, 60, 32, 8], c: "#ffd35a", s: "#e89a10" },
];
// training: each level +5% speed (up to level 20), every 5 levels one more parcel in the bag
const MAXLV = 20;
const petSpeed = (p) => SPECIES[p.sp].speed * (1 + 0.05 * (p.lv - 1));
const petBag = (p) => SPECIES[p.sp].bag + Math.floor((p.lv - 1) / 5);
// (owner, 2026-11-08) a pet grows a little with each level: 1.5% bigger per level
const petScale = (lv) => 1 + 0.015 * ((lv || 1) - 1);
const trainCost = (p) => Math.round(40 * Math.pow(1.32, p.lv - 1) * [1, 1.6, 2.6, 4][SPECIES[p.sp].r]);
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
function fresh() { return { coins: 0, pets: [{ id: 1, sp: "pup", lv: 1 }], ride: 1, items: { snack: 0, ribbon: 0, ticket: 0 }, treats: {}, name: pick(N1) + " " + pick(N2), delivered: 0, nextId: 2, shirt: pick(["#3a8ee6", "#e5534b", "#3fb36b", "#a352e0", "#f2b01e", "#2bb3c0"]) }; }
function load() { try { const s = JSON.parse(localStorage.getItem(SAVE)); if (s && Array.isArray(s.pets) && s.pets.length) { const f = Object.assign(fresh(), s); f.pets = f.pets.filter((p) => SPECIES[p.sp]); if (!f.pets.length) f.pets = fresh().pets; return f; } } catch (e) { /* none yet */ } return fresh(); }
// (owner, 2026-11-08) since accounts, the server keeps the data; what was in this browser before seeds the first account
let save = load(), saveDirty = false;
const SPECIES_SET = new Set(Object.keys(SPECIES));
const persist = () => { saveDirty = true; };
const riding = () => save.pets.find((p) => p.id === save.ride) || save.pets[0];
const moveKind = () => SPECIES[riding().sp].fly || "land";
const flies = () => !!SPECIES[riding().sp].fly;

// ---- the world (shared with the server: pets-world.js): the town is a big floating island of plateaus and cliffs with
// winding roads, houses along them and the plaza in the middle; small islands float off its edge ----
const { terrain, smoothTerrain, inside, edgeR, ROADS, ROAD_HALF, houses, trees, ISLANDS, islandAt, blocked, PLAZA, POST, PICKUP, BOARD, SHOP, SHOP_B, TRAIN, POUND, RELEASE, SPAWN } = World;
let seed = 20261108; const srnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick2 = (a) => a[Math.floor(srnd() * a.length)];
const HOUSE_C = ["#f6d9b8", "#cfe6f7", "#f7cfd8", "#d8f0c8", "#fbe7a8", "#e3d4f5", "#f9f4ea"], ROOF_C = ["#c8553d", "#3b6ea8", "#5a8f3e", "#8a5a3a", "#6b5b95"];
for (const h of houses) { h.c = pick2(HOUSE_C); h.roof = pick2(ROOF_C); }
const LIMIT = 360;   // how far out anyone can go

// ---- 3D ----
const canvas = $("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchy });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touchy ? 1.6 : 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#8fd3ff"); scene.fog = new THREE.Fog("#bfe6ff", 150, 560);
const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 1000);
scene.add(new THREE.HemisphereLight("#ffffff", "#7aa35a", 1.1));
const sun = new THREE.DirectionalLight("#fff6e0", 1.6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;   // (owner, 2026-11-08: flickering) no shadow acne
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 }); scene.add(sun, sun.target);
const dummy = new THREE.Object3D();
const MATS = new Map(), mat = (c) => { if (!MATS.has(c)) MATS.set(c, new THREE.MeshLambertMaterial({ color: c })); return MATS.get(c); };
const BOX = new THREE.BoxGeometry(1, 1, 1);
function box(w, h, d, c, x, y, z, parent, shadow = true) { const m = new THREE.Mesh(BOX, mat(c)); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; (parent || scene).add(m); return m; }
// the ground: rings out from the middle to the island's edge, grass on the flat, rock on the cliffs
{
  const NA = 360, NR = 116, pos = [], idx = [];
  pos.push(0, terrain(0, 0), 0);
  for (let j = 1; j <= NR; j++) for (let i = 0; i < NA; i++) { const a = (i / NA) * TAU, r = (edgeR(a) * j) / NR, x = Math.cos(a) * r, z = Math.sin(a) * r; pos.push(x, terrain(x, z), z); }
  const V = (j, i) => (j === 0 ? 0 : 1 + (j - 1) * NA + (((i % NA) + NA) % NA));
  for (let i = 0; i < NA; i++) idx.push(0, V(1, i + 1), V(1, i));
  for (let j = 1; j < NR; j++) for (let i = 0; i < NA; i++) { const a = V(j, i), b = V(j, i + 1), c = V(j + 1, i), d = V(j + 1, i + 1); idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  // (owner, 2026-11-08: smooth it out) colors blend gradually: by the slope of the land over a few metres (so cliffs
  // fade into rock), by height, and in broad patches; a fine speckled texture on top
  const cols = new Float32Array((pos.length / 3) * 3), uvs = new Float32Array((pos.length / 3) * 2), c = new THREE.Color(), c2 = new THREE.Color();
  const GRASS = [new THREE.Color("#7fc25a"), new THREE.Color("#96cf63"), new THREE.Color("#a9d46e")], ROCK = new THREE.Color("#a08f7a"), ROCK2 = new THREE.Color("#8a7a68");
  for (let i = 0; i < pos.length / 3; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    const slope = hyp(terrain(x + 3, z) - terrain(x - 3, z), terrain(x, z + 3) - terrain(x, z - 3)) / 6;
    const patch = 0.5 + 0.25 * Math.sin(x / 23 + Math.cos(z / 31)) + 0.25 * Math.sin(z / 19 - x / 41);
    c.copy(GRASS[0]).lerp(GRASS[1], patch).lerp(GRASS[2], smooth(clamp(y / 45, 0, 1)) * 0.7);
    c2.copy(ROCK).lerp(ROCK2, patch);
    c.lerp(c2, smooth(clamp((slope - 0.3) / 0.7, 0, 1)));
    cols.set([c.r, c.g, c.b], i * 3); uvs.set([x / 9, z / 9], i * 2);
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  const speck = (() => { const cv = document.createElement("canvas"); cv.width = cv.height = 128; const x = cv.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 128, 128); for (let k = 0; k < 900; k++) { const v = 205 + Math.floor(Math.random() * 50); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2); } const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; })();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map: speck })); m.receiveShadow = true; scene.add(m);
  // (owner, 2026-11-08) tall rocks standing on the cliffs and steep slopes, and boulders at their feet
  const rocks = [], rr = World.rng(77);
  for (let n = 0; n < 9000 && rocks.length < 320; n++) {
    const a = rr() * TAU, r = Math.sqrt(rr()) * (World.R_TOWN - 6), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!inside(x, z, 4) || r < PLAZA + 6 || World.roadDist(x, z) < 9) continue;
    const slope = hyp(terrain(x + 2, z) - terrain(x - 2, z), terrain(x, z + 2) - terrain(x, z - 2)) / 4; if (slope < 0.9) continue;
    if (houses.some((h) => !h.sky && hyp(h.x - x, h.z - z) < 9)) continue;
    const lo = Math.min(terrain(x + 2, z), terrain(x - 2, z), terrain(x, z + 2), terrain(x, z - 2)), tall = rr() < 0.55;
    rocks.push({ x, z, y: lo, w: tall ? 1.4 + rr() * 1.8 : 1 + rr() * 1.4, h: tall ? 4 + rr() * 9 : 1 + rr() * 1.5, rot: rr() * TAU, c: rr() });
  }
  const rockG = new THREE.DodecahedronGeometry(1, 0); rockG.translate(0, 0.8, 0);
  const rockM = new THREE.InstancedMesh(rockG, new THREE.MeshLambertMaterial({ color: "#ffffff", flatShading: true }), rocks.length); rockM.castShadow = true; rockM.receiveShadow = true;
  rocks.forEach((k, i) => { dummy.position.set(k.x, k.y - 0.4, k.z); dummy.rotation.set(0, k.rot, 0); dummy.scale.set(k.w, k.h / 1.6, k.w * (0.8 + k.c * 0.4)); dummy.updateMatrix(); rockM.setMatrixAt(i, dummy.matrix); rockM.setColorAt(i, new THREE.Color().setHSL(0.08, 0.14 + k.c * 0.08, 0.5 + k.c * 0.12)); });
  scene.add(rockM);
  // its underside: a cliff face at the edge, then rock tapering away below
  const RINGS = [[1, 0], [1.01, -9], [0.9, -30], [0.72, -62], [0.48, -98], [0.22, -132]], up = [], ui = [];
  for (let k = 0; k < RINGS.length; k++) for (let i = 0; i < NA; i += 3) {
    const a = (i / NA) * TAU, e = edgeR(a), top = terrain(Math.cos(a) * e, Math.sin(a) * e), j = k ? 1 + (Math.sin(i * 1.7 + k * 3.1) * 0.5 + 0.5) * 0.08 : 1, r = e * RINGS[k][0] * j;
    up.push(Math.cos(a) * r, k ? Math.min(top - 2, 0) + RINGS[k][1] - (k > 1 ? Math.abs(Math.sin(i * 0.37 + k)) * 12 : 0) : top, Math.sin(a) * r);
  }
  up.push(0, -165, 0); const NU = NA / 3, apex = up.length / 3 - 1;
  for (let k = 0; k < RINGS.length - 1; k++) for (let i = 0; i < NU; i++) { const a = k * NU + i, b = k * NU + ((i + 1) % NU), c2 = (k + 1) * NU + i, d = (k + 1) * NU + ((i + 1) % NU); ui.push(a, c2, b, b, c2, d); }
  for (let i = 0; i < NU; i++) ui.push((RINGS.length - 1) * NU + i, apex, (RINGS.length - 1) * NU + ((i + 1) % NU));
  const ug = new THREE.BufferGeometry(); ug.setAttribute("position", new THREE.Float32BufferAttribute(up, 3)); ug.setIndex(ui); ug.computeVertexNormals();
  scene.add(new THREE.Mesh(ug, new THREE.MeshLambertMaterial({ color: "#8a7a68", flatShading: true, side: THREE.DoubleSide })));
}
// the plaza's paving
{ const m = new THREE.Mesh(new THREE.CircleGeometry(PLAZA - 4, 64).rotateX(-Math.PI / 2), mat("#e8dcc4")); m.position.y = 0.06; m.receiveShadow = true; scene.add(m); }
// roads: a ribbon along each, laid on the land, with the dashed center line
const roadTex = (() => { const c = document.createElement("canvas"); c.width = 32; c.height = 64; const g = c.getContext("2d"); g.fillStyle = "#5c6670"; g.fillRect(0, 0, 32, 64); g.fillStyle = "#6c757e"; g.fillRect(0, 0, 2, 64); g.fillRect(30, 0, 2, 64); g.fillStyle = "#f4f1e6"; g.fillRect(14.5, 8, 3, 30); const t = new THREE.CanvasTexture(c); t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; })();
const roadM = new THREE.MeshLambertMaterial({ map: roadTex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
const ROAD_LIFT = 0.1;   // (owner, 2026-11-08: clipping) every road vertex sits just above the land under it, and pets stand on that
ROADS.forEach((R, k) => {
  const P = R.loop ? [...R.pts, R.pts[0]] : R.pts, S = R.loop ? [...R.S, R.len] : R.S, pos = [], uv = [], idx = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], fx = b[0] - a[0], fz = b[1] - a[1], fl = hyp(fx, fz) || 1, rx = -fz / fl, rz = fx / fl;
    for (const sd of [-1, -0.5, 0, 0.5, 1]) { const x = P[i][0] + rx * ROAD_HALF * sd, z = P[i][1] + rz * ROAD_HALF * sd; pos.push(x, terrain(x, z) + ROAD_LIFT + k * 0.004, z); uv.push((sd + 1) / 2, S[i] / 8); }
    if (i) { const q = (i - 1) * 5; for (let c = 0; c < 4; c++) idx.push(q + c, q + c + 1, q + c + 5, q + c + 1, q + c + 6, q + c + 5); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, roadM); m.receiveShadow = true; scene.add(m);
});
// houses as instances: walls (reaching down into the slope), roofs, doors, mailboxes; each faces its road
function instanced(geo, color, n, each) { const m = new THREE.InstancedMesh(geo, mat(color), n); m.castShadow = true; m.receiveShadow = true; for (let i = 0; i < n; i++) { dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); each(i, dummy); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); } scene.add(m); return m; }
const wallAt = (h, d) => { d.position.set(h.x, h.base + 2.2 - (h.sky ? 0 : 2), h.z); d.scale.set(9, 4.4 + (h.sky ? 0 : 4), 9); d.rotation.y = h.yaw; };
const roofAt = (h, d) => { d.position.set(h.x, h.base + 6.1, h.z); d.scale.set(1, 1, 1); d.rotation.y = h.yaw; };
const doorAt = (h, d) => { d.position.set(h.x + Math.sin(h.yaw) * 4.55, h.base + 1.1, h.z + Math.cos(h.yaw) * 4.55); d.scale.set(1.6, 2.2, 0.15); d.rotation.y = h.yaw; };
const walls = instanced(BOX, "#ffffff", houses.length, (i, d) => wallAt(houses[i], d)); houses.forEach((h, i) => walls.setColorAt(i, new THREE.Color(h.c)));
const ROOFG = new THREE.ConeGeometry(7.2, 3.4, 4); ROOFG.rotateY(Math.PI / 4);
const roofs = instanced(ROOFG, "#ffffff", houses.length, (i, d) => roofAt(houses[i], d)); houses.forEach((h, i) => roofs.setColorAt(i, new THREE.Color(h.roof)));
const doors = instanced(BOX, "#7a4f28", houses.length, (i, d) => doorAt(houses[i], d));
const houseParts = [[walls, wallAt], [roofs, roofAt], [doors, doorAt]];
function setHouse(i, on) { for (const [m, f] of houseParts) { dummy.rotation.set(0, 0, 0); f(houses[i], dummy); if (!on) dummy.scale.set(0.0001, 0.0001, 0.0001); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.instanceMatrix.needsUpdate = true; } }
// windows either side of the door: they light up at night
const windowM = new THREE.MeshBasicMaterial({ color: "#6b7f99" }), WINDOW_ON = new THREE.Color("#ffd76a");
{ const wm = new THREE.InstancedMesh(BOX, windowM, houses.length * 2); houses.forEach((h, i) => { for (const sd of [-1, 1]) { const lx = sd * 2.8, lz = 4.53; dummy.position.set(h.x + lx * Math.cos(h.yaw) + lz * Math.sin(h.yaw), h.base + 2.5, h.z - lx * Math.sin(h.yaw) + lz * Math.cos(h.yaw)); dummy.rotation.set(0, h.yaw, 0); dummy.scale.set(1.5, 1.3, 0.1); dummy.updateMatrix(); wm.setMatrixAt(i * 2 + (sd > 0 ? 1 : 0), dummy.matrix); } }); scene.add(wm); }
instanced(BOX, "#6b7680", houses.length, (i, d) => { const h = houses[i]; d.position.set(h.mx, h.my + 0.55, h.mz); d.scale.set(0.15, 1.1, 0.15); });
instanced(BOX, "#e5534b", houses.length, (i, d) => { const h = houses[i]; d.position.set(h.mx, h.my + 1.25, h.mz); d.scale.set(0.8, 0.45, 0.6); d.rotation.y = h.yaw; });
// trees
const TRUNK = new THREE.CylinderGeometry(0.25, 0.3, 2, 6), LEAF = new THREE.SphereGeometry(1.6, 8, 6);
instanced(TRUNK, "#7a4f28", trees.length, (i, d) => { const t = trees[i]; d.position.set(t.x, t.y + t.s, t.z); d.scale.set(t.s, t.s, t.s); });
instanced(LEAF, "#4fae4a", trees.length, (i, d) => { const t = trees[i]; d.position.set(t.x, t.y + 2.6 * t.s, t.z); d.scale.set(t.s, t.s, t.s); });
// the small islands: a grassy top on a rock that tapers away beneath it; clouds drifting around and below
for (const isl of ISLANDS) {
  const top = new THREE.Mesh(new THREE.CylinderGeometry(isl.r, isl.r * 0.94, 1.6, 28), mat("#86c95f")); top.position.set(isl.x, isl.y - 0.8, isl.z); top.receiveShadow = true; top.castShadow = true; scene.add(top);
  const rock = new THREE.Mesh(new THREE.ConeGeometry(isl.r * 0.94, isl.r * 1.4, 10).rotateX(Math.PI), mat("#8a7f72")); rock.position.set(isl.x, isl.y - 1.6 - isl.r * 0.7, isl.z); rock.castShadow = true; scene.add(rock);
  for (let k = 0; k < 4; k++) { const a = k * 1.7 + isl.r, x = isl.x + Math.cos(a) * isl.r * 0.55, z = isl.z + Math.sin(a) * isl.r * 0.55; const b = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2 + (k % 2), 0), mat("#9a8f80")); b.position.set(x, isl.y - 4 - k * 2.5, z); scene.add(b); }
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
const DAY_S = 1200, RAIN_BLOCK = 240;   // a day lasts 20 minutes; the weather is decided every 4
const hemi = scene.children.find((o) => o.isHemisphereLight);
const SKY = { day: new THREE.Color("#8fd3ff"), dusk: new THREE.Color("#f2a46a"), night: new THREE.Color("#0c1530"), rain: new THREE.Color("#7d8b99") };
const FOG = { day: new THREE.Color("#bfe6ff"), dusk: new THREE.Color("#f6c08e"), night: new THREE.Color("#101a36"), rain: new THREE.Color("#8d99a5") };
const skyNow = { sun: new THREE.Vector3(0, 1, 0), day: 1, rain: 0 };
// stars, shown at night
const stars = (() => { const n = 700, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const u = Math.random(), a = Math.random() * TAU, r = Math.sqrt(1 - u * u); p.set([Math.cos(a) * r * 600, u * 600, Math.sin(a) * r * 600], i * 3); } const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3)); const m = new THREE.Points(g, new THREE.PointsMaterial({ color: "#ffffff", size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })); m.renderOrder = -1; scene.add(m); return m; })();
// rain: streaks falling around the camera
const RAIN_N = 1400, rainPos = new Float32Array(RAIN_N * 6), rainG = new THREE.BufferGeometry(); rainG.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainG, new THREE.LineBasicMaterial({ color: "#c8dcf0", transparent: true, opacity: 0, depthWrite: false })); rain.frustumCulled = false; scene.add(rain);
const drops = Array.from({ length: RAIN_N }, () => ({ x: (Math.random() - 0.5) * 70, y: Math.random() * 40, z: (Math.random() - 0.5) * 70, v: 26 + Math.random() * 10 }));
// wind: pale streaks blowing past
const windTex = (() => { const cv = document.createElement("canvas"); cv.width = 64; cv.height = 4; const x = cv.getContext("2d"), gr = x.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.5, "rgba(255,255,255,1)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, 64, 4); return new THREE.CanvasTexture(cv); })();
const winds = Array.from({ length: 36 }, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 0.12), new THREE.MeshBasicMaterial({ map: windTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); scene.add(m); return { m, life: 0, max: 1, x: 0, y: 0, z: 0 }; });
const WIND = new THREE.Vector3(1, 0, 0.35).normalize();
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
  const t = Date.now() / 1000 + skyOffset, ph = (t % DAY_S) / DAY_S, a = ph * TAU;
  const el = Math.sin(a) + 0.2;   // the sun's height: a little more day than night
  skyNow.sun.set(Math.cos(a), Math.max(-0.4, el), 0.35).normalize();
  let day = smooth(clamp((el + 0.08) / 0.35, 0, 1)), dusk = clamp(1 - Math.abs(el - 0.05) / 0.3, 0, 1) * day, rainK = weatherAt(t);
  if (me.inst) { day = 1; dusk = 0; rainK = 0; }   // inside a home it's always bright and dry
  skyNow.day = day; skyNow.rain = rainK;
  tmpCol.copy(SKY.night).lerp(SKY.day, day).lerp(SKY.dusk, dusk * 0.55).lerp(SKY.rain, rainK * 0.6 * (0.4 + 0.6 * day)); scene.background.copy(tmpCol);
  tmpCol.copy(FOG.night).lerp(FOG.day, day).lerp(FOG.dusk, dusk * 0.5).lerp(FOG.rain, rainK * 0.6 * (0.4 + 0.6 * day)); scene.fog.color.copy(tmpCol);
  scene.fog.far = 560 - rainK * 300; scene.fog.near = 150 - rainK * 90;
  sun.intensity = 1.6 * day * (1 - rainK * 0.6); sun.color.set("#fff6e0").lerp(SKY.dusk, dusk * 0.6);
  if (hemi) { hemi.intensity = 0.35 + 0.75 * day - rainK * 0.15; hemi.color.set("#ffffff").lerp(SKY.night, (1 - day) * 0.5); }
  cloudM.color.set("#ffffff").lerp(SKY.rain, rainK * 0.7).lerp(SKY.night, (1 - day) * 0.75).lerp(SKY.dusk, dusk * 0.35);
  stars.position.set(cx, 0, cz); stars.material.opacity = (1 - day) * (1 - rainK);
  windowM.color.set("#6b7f99").lerp(WINDOW_ON, 1 - day);
  // rain
  rain.material.opacity = rainK * 0.55; rain.visible = rainK > 0.01;
  if (rain.visible) for (let i = 0; i < RAIN_N; i++) {
    const d = drops[i]; d.y -= d.v * dt; d.x += WIND.x * 4 * dt; if (d.y < -8) { d.y = 30 + Math.random() * 10; d.x = (Math.random() - 0.5) * 70; d.z = (Math.random() - 0.5) * 70; }
    const x = cx + d.x, y = cy + d.y, z = cz + d.z; rainPos.set([x, y, z, x - WIND.x * 0.15, y + 1.1, z - WIND.z * 0.15], i * 6);
  }
  if (rain.visible) rainG.attributes.position.needsUpdate = true;
  // wind streaks, more of them up high and in the rain
  const windK = me.inst ? 0 : 0.35 + rainK * 0.4 + clamp((me.y - terrain(me.x, me.z)) / 40, 0, 0.5);
  for (const w of winds) {
    w.life -= dt;
    if (w.life <= 0) { if (Math.random() > windK) { w.m.material.opacity = 0; w.life = 0.3 + Math.random(); continue; } w.max = w.life = 2 + Math.random() * 2; const a = Math.random() * TAU, r = 20 + Math.random() * 30; w.x = cx + Math.cos(a) * r - WIND.x * 10; w.y = cy - 6 + Math.random() * 16; w.z = cz + Math.sin(a) * r - WIND.z * 10; }   // (owner, 2026-11-08) out of the way, never right at the camera
    w.x += WIND.x * 9 * dt; w.z += WIND.z * 9 * dt; w.m.position.set(w.x, w.y + Math.sin(w.life * 3) * 0.3, w.z);
    tmpV.copy(camera.position).sub(w.m.position); tmpV.addScaledVector(WIND, -tmpV.dot(WIND)).normalize(); tmpV2.crossVectors(tmpV, WIND);   // long side along the wind, flat face to the camera
    tmpM.makeBasis(WIND, tmpV2, tmpV); w.m.quaternion.setFromRotationMatrix(tmpM);
    w.m.material.opacity = Math.sin((w.life / w.max) * Math.PI) * 0.16 * (0.4 + 0.6 * day) * clamp((hyp(w.x - cx, w.z - cz) - 12) / 8, 0, 1);
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
// the post office, its pickup ring and the contract board
box(18, 7, 10, "#d9e4ee", POST.x, 3.5, POST.z); box(19, 0.8, 11, "#3a8ee6", POST.x, 7.4, POST.z); box(4, 3.6, 0.2, "#3a6ea8", POST.x, 1.8, POST.z + 5.05);
box(8, 1.6, 0.3, "#f2b01e", POST.x, 5.4, POST.z + 5.1); box(1.6, 1.1, 0.35, "#e5534b", POST.x, 5.4, POST.z + 5.2);
const RINGG = (r) => new THREE.RingGeometry(r - 0.35, r, 40).rotateX(-Math.PI / 2);
const ringM = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 });
const pickRing = new THREE.Mesh(RINGG(PICKUP.r), ringM("#f2b01e")); pickRing.position.set(PICKUP.x, 0.16, PICKUP.z); scene.add(pickRing);
box(2.6, 2, 0.25, "#8a5a3a", BOARD.x, 2.2, BOARD.z - 1.5); box(0.2, 1.4, 0.2, "#7a4f28", BOARD.x - 1, 0.7, BOARD.z - 1.5); box(0.2, 1.4, 0.2, "#7a4f28", BOARD.x + 1, 0.7, BOARD.z - 1.5); box(2.2, 1.5, 0.05, "#fbf3dc", BOARD.x, 2.25, BOARD.z - 1.35);
const boardRing = new THREE.Mesh(RINGG(BOARD.r), ringM("#e5534b")); boardRing.position.set(BOARD.x, 0.16, BOARD.z); scene.add(boardRing);
// the egg shop, with a giant egg on top
box(12, 5, 8, "#f7cfd8", SHOP_B.x, 2.5, SHOP_B.z); box(13, 0.6, 9, "#e5739d", SHOP_B.x, 5.3, SHOP_B.z); box(3, 3, 0.2, "#7a4f28", SHOP_B.x, 1.5, SHOP_B.z + 4.05);
const bigEgg = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 12), mat("#fff3d6")); bigEgg.scale.set(1, 1.3, 1); bigEgg.position.set(SHOP_B.x, 8.3, SHOP_B.z); bigEgg.castShadow = true; scene.add(bigEgg);
const shopRing = new THREE.Mesh(RINGG(SHOP.r), ringM("#e5739d")); shopRing.position.set(SHOP.x, 0.16, SHOP.z); scene.add(shopRing);
// the training yard: a track with hurdles
const track = new THREE.Mesh(new THREE.RingGeometry(9, 14, 48).rotateX(-Math.PI / 2), mat("#d98b5f")); track.position.set(TRAIN.x, 0.12, TRAIN.z); track.receiveShadow = true; scene.add(track);
for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU, x = TRAIN.x + Math.cos(a) * 11.5, z = TRAIN.z + Math.sin(a) * 11.5, g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -a; box(0.15, 1, 0.15, "#ffffff", 0, 0.5, -1.8, g); box(0.15, 1, 0.15, "#ffffff", 0, 0.5, 1.8, g); box(0.2, 0.25, 3.8, "#e5534b", 0, 1, 0, g); scene.add(g); }
const trainRing = new THREE.Mesh(RINGG(TRAIN.r - 1), ringM("#3fb36b")); trainRing.position.set(TRAIN.x, 0.16, TRAIN.z); scene.add(trainRing);
// the pound (animal control): a building with a striped front and a fenced yard where the caught are let out
box(16, 6, 8, "#dfe6ec", POUND.x, 3, POUND.z + 3); box(16.4, 0.7, 8.4, "#e08a00", POUND.x, 4.6, POUND.z + 3); box(17, 0.6, 9, "#3d4650", POUND.x, 6.3, POUND.z + 3);
box(4, 3.4, 0.2, "#3d4650", POUND.x, 1.7, POUND.z - 1.05);
for (let k = 0; k < 9; k++) box(0.12, 2.6, 0.12, "#3d4650", POUND.x - 7 + k * 0.5 + (k > 4 ? 9.5 : 0) - (k > 4 ? 2.5 : 0), 1.6, POUND.z - 1.1);
for (let k = -4; k <= 4; k++) { box(0.15, 1.3, 0.15, "#9aa7b2", POUND.x + k * 2, 0.65, POUND.z - 9); }
for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) box(0.15, 1.3, 0.15, "#9aa7b2", POUND.x + sx * 8, 0.65, POUND.z - 9 + k * 2.4);
box(16, 0.12, 0.12, "#9aa7b2", POUND.x, 1.2, POUND.z - 9);

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
  kitten: { plan: "quad", body: [0.55, 0.5, 1.1], leg: 0.5, head: 0.58, roundHead: true, snout: 0.06, ears: "cat", tail: "curl", whiskers: true, nose: "#f3a7b5" },
  bunny: { plan: "quad", round: true, body: [0.9, 0.82, 1.0], leg: 0.22, head: 0.6, roundHead: true, snout: 0.05, ears: "long", tail: "puff", nose: "#f3a7b5", hop: true },
  fox: { plan: "quad", body: [0.62, 0.55, 1.35], leg: 0.6, head: 0.55, snout: 0.5, snoutC: "a", ears: "big", tail: "bushy", nose: "#1d232a", socks: "#2b1d14" },
  goat: { plan: "quad", body: [0.85, 0.75, 1.25], leg: 0.72, head: 0.5, snout: 0.35, ears: "side", horns: "curl", beard: true, tail: "stub", hooves: "#4a3a2a" },
  deer: { plan: "quad", body: [0.72, 0.68, 1.35], leg: 1.05, neck: 0.65, head: 0.48, snout: 0.38, ears: "side", antlers: true, tail: "stub", spots: true, hooves: "#3a2a1a" },
  bear: { plan: "quad", round: true, body: [1.3, 1.1, 1.65], leg: 0.48, legW: 0.42, head: 0.85, roundHead: true, snout: 0.3, snoutC: "a", ears: "round", tail: "none", nose: "#1d232a" },
  horse: { plan: "quad", body: [0.82, 0.85, 1.7], leg: 1.25, neck: 0.95, head: 0.45, snout: 0.6, ears: "point", mane: "a", tail: "hair", hooves: "#2b1d14" },
  unicorn: { plan: "quad", body: [0.82, 0.85, 1.7], leg: 1.25, neck: 0.95, head: 0.45, snout: 0.6, ears: "point", mane: "rainbow", tail: "rainbow", horn: true, hooves: "#e0c070" },
  pegasus: { plan: "quad", body: [0.82, 0.85, 1.7], leg: 1.25, neck: 0.95, head: 0.45, snout: 0.6, ears: "point", mane: "a", tail: "hair", wings: "feather", hooves: "#8aa6c8" },
  stego: { plan: "quad", body: [1.05, 0.95, 1.9], leg: 0.55, legW: 0.38, head: 0.42, snout: 0.25, ears: "none", plates: true, tail: "spike", low: true },
  trike: { plan: "quad", body: [1.2, 1.0, 1.8], leg: 0.6, legW: 0.42, head: 0.75, snout: 0.35, ears: "none", frill: true, tail: "thick" },
  dragon: { plan: "quad", body: [0.95, 0.8, 1.6], leg: 0.7, neck: 0.85, head: 0.55, snout: 0.5, ears: "none", horns: "back", tail: "spade", wings: "bat", spikes: true },
  icedragon: { plan: "quad", body: [0.95, 0.8, 1.6], leg: 0.7, neck: 0.85, head: 0.55, snout: 0.5, ears: "none", horns: "back", tail: "spade", wings: "bat", spikes: "ice", crest: true },
  duck: { plan: "bird", round: true, body: [0.85, 0.7, 1.05], leg: 0.32, head: 0.48, bill: "flat", tail: "tuft" },
  penguin: { plan: "upright", body: [0.85, 1.3, 0.75], leg: 0.18, head: 0.5, bill: "small", belly: "front", wings: "flipper" },
  parrot: { plan: "upright", body: [0.6, 0.95, 0.6], leg: 0.32, head: 0.45, bill: "hook", wings: "feather", tail: "long", crest: true },
  owl: { plan: "upright", round: true, body: [1.0, 1.1, 0.9], leg: 0.22, head: 0.0, bill: "small", eyes: "big", ears: "tufts", wings: "feather" },
  phoenix: { plan: "bird", body: [0.55, 0.55, 1.1], leg: 0.6, neck: 0.55, head: 0.42, bill: "point", wings: "feather", tail: "fire", crest: true },
  ptero: { plan: "bird", body: [0.5, 0.45, 0.9], leg: 0.5, neck: 0.45, head: 0.4, bill: "long", crest: "back", wings: "bat", tail: "none" },
  raptor: { plan: "biped", body: [0.7, 0.75, 1.5], leg: 0.95, head: 0.6, snout: 0.45, tail: "long", claws: true, stripes: true },
  trex: { plan: "biped", body: [1.1, 1.05, 1.9], leg: 1.05, legW: 0.5, head: 1.15, snout: 0.6, tail: "long", tiny: true },
  butterfly: { plan: "butterfly" },
};
const RAINBOW = ["#ff6b6b", "#ffb84d", "#ffe66b", "#7ee08a", "#6bb8ff", "#b48cff"];
function petModel(sp, rider) {
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
  if (rider) {   // the courier: a shirt, a cap and a mail bag
    const r = new THREE.Group(); r.position.set(0, seat, seatZ); body.add(r);
    box(0.55, 0.75, 0.35, rider, 0, 0.45, 0, r); box(0.45, 0.45, 0.45, "#f1c9a5", 0, 1.08, 0, r); box(0.5, 0.15, 0.55, "#3a6ea8", 0, 1.36, 0.05, r); box(0.5, 0.06, 0.3, "#3a6ea8", 0, 1.3, 0.32, r);
    box(0.25, 0.42, 0.5, "#a0703f", 0.38, 0.35, -0.02, r); top = seat + 1.6;
  }
  return { g, body, legs, wings, head, tails, k, top, butterfly: L.plan === "butterfly", fly: !!s.fly, hop: !!L.hop, plan: L.plan };
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
function banner(txt, color) { const b = $("banner"); b.textContent = txt; b.style.color = color || "#fff"; b.classList.remove("go"); void b.offsetWidth; b.classList.add("go"); }


// ---- me ----
const me = { inst: 0, vy: 0, longJump: false, x: SPAWN.x + (Math.random() - 0.5) * 8, y: 0, z: SPAWN.z + Math.random() * 3, yaw: Math.PI, moving: false, airborne: false, boostUntil: 0, bag: [], stunUntil: 0, stars: 0 };
let mine = null, myBubble = null;
function mount() { if (mine) scene.remove(mine.g); mine = petModel(riding().sp, save.shirt); const sc = petScale(riding().lv); mine.g.scale.setScalar(sc); mine.top *= sc; mine.g.traverse((o) => (o.castShadow = true)); scene.add(mine.g); if (myBubble) { mine.g.add(myBubble.s); myBubble.s.position.y = mine.top + 2.4; } }
mount();
// a gold arrow over my pet pointing to the nearest house I have a parcel for (or the post office when the bag's empty)
// (owner, 2026-11-08: the 3D arrow could look like a circle) a long glowing arrow drawn on the screen around my pet,
// always pointing toward where to go, and a glowing marker over the place itself when it's in view
const guideEl = $("guide"), pinEl = $("pin"), gv = new THREE.Vector3(), gp = new THREE.Vector3(), gt = new THREE.Vector3();
function drawGuide(tx, ty, tz, on) {
  if (!on) { guideEl.style.display = pinEl.style.display = "none"; return; }
  const W = innerWidth, H = innerHeight;
  gp.set(me.x, me.y + mine.top * 0.55, me.z).project(camera); const px = ((gp.x + 1) / 2) * W, py = ((1 - gp.y) / 2) * H;
  gt.set(tx, ty + 2.5, tz); gv.copy(gt).applyMatrix4(camera.matrixWorldInverse);
  let ang;
  if (gv.z < -0.5) { gt.project(camera); const qx = ((gt.x + 1) / 2) * W, qy = ((1 - gt.y) / 2) * H; ang = Math.atan2(qy - py, qx - px); const vis = gt.x > -0.94 && gt.x < 0.94 && gt.y > -0.9 && gt.y < 0.86; pinEl.style.display = vis ? "block" : "none"; if (vis) pinEl.style.transform = `translate(${qx}px, ${qy}px)`; }
  else { pinEl.style.display = "none"; ang = Math.atan2(1, gv.x / Math.max(1, Math.abs(gv.z))); }   // behind the camera: point down and to its side
  guideEl.style.display = "block"; guideEl.style.transform = `translate(${px + Math.cos(ang) * 46}px, ${py + Math.sin(ang) * 46}px) rotate(${ang}rad)`;
}
const arrow = new THREE.Group(); arrow.visible = false;
// dizzy stars when animal control catches me
const dizzy = new THREE.Group(); for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshBasicMaterial({ color: "#ffd84a" })); s.position.set(Math.cos((k * TAU) / 4) * 0.8, 0, Math.sin((k * TAU) / 4) * 0.8); dizzy.add(s); } dizzy.visible = false; scene.add(dizzy);
// a beam over each house I have a parcel for (pink over the islands: double pay)
const BEAMG = new THREE.CylinderGeometry(1.1, 1.1, 30, 16, 1, true), beamM = new THREE.MeshBasicMaterial({ color: "#ffd35a", transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }), skyBeamM = new THREE.MeshBasicMaterial({ color: "#ff8ad8", transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide });
const beams = new Map();
function syncBeams() {
  const want = new Set(me.bag);
  for (const [i, b] of beams) if (!want.has(i)) { scene.remove(b); beams.delete(i); }
  for (const i of want) if (!beams.has(i)) { const h = houses[i], g = new THREE.Group(); const m = new THREE.Mesh(BEAMG, h.sky ? skyBeamM : beamM); m.position.y = 15; g.add(m); const p = box(0.9, 0.7, 0.9, "#c98b4f", 0, 3, 0, g, false); g.userData.parcel = p; g.position.set(h.mx, h.my, h.mz); scene.add(g); beams.set(i, g); }
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
    out.x = b.x + (b.x - p.x) * k; out.y = b.y + (b.y - p.y) * k; out.z = b.z + (b.z - p.z) * k; out.yaw = b.yaw; return true;
  }
  const k = a === b ? 1 : clamp((t - a.t) / (b.t - a.t), 0, 1);
  out.x = a.x + (b.x - a.x) * k; out.y = a.y + (b.y - a.y) * k; out.z = a.z + (b.z - a.z) * k; out.yaw = lerpYaw(a.yaw, b.yaw, k); return true;
}

// ---- animal control (owner, 2026-11-08): vans on the roads and helicopters over town (pets-world.js); online the
// server runs them for the whole room, offline this page does ----
const lightR = new THREE.MeshBasicMaterial({ color: "#ff3a3a" }), lightB = new THREE.MeshBasicMaterial({ color: "#3a7aff" });
function vanModel() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  box(2.4, 1.8, 3.2, "#f4f4f0", 0, 1.5, -0.6, body); box(2.34, 1.4, 1.6, "#f4f4f0", 0, 1.3, 1.72, body); box(2.1, 0.7, 0.1, "#3a5a7a", 0, 1.6, 2.58, body);
  box(2.46, 0.35, 3.24, "#e08a00", 0, 1.2, -0.6, body); box(2.5, 0.3, 4.9, "#3d4650", 0, 0.55, 0.2, body);
  for (const [x, z] of [[-1.1, 1.5], [1.1, 1.5], [-1.1, -1.4], [1.1, -1.4]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12), mat("#1d232a")); w.rotation.z = Math.PI / 2; w.position.set(x, 0.45, z); body.add(w); }
  for (let k = 0; k < 4; k++) { box(0.06, 1.1, 0.06, "#1d232a", -1.21, 1.5, -1.9 + k * 0.7, body); box(0.06, 1.1, 0.06, "#1d232a", 1.21, 1.5, -1.9 + k * 0.7, body); }
  const red = new THREE.Mesh(BOX, lightR.clone()); red.scale.set(0.8, 0.25, 0.35); red.position.set(-0.45, 2.15, 1.6); body.add(red);
  const blue = new THREE.Mesh(BOX, lightB.clone()); blue.scale.set(0.8, 0.25, 0.35); blue.position.set(0.45, 2.15, 1.6); body.add(blue);
  g.traverse((o) => (o.castShadow = true));
  return { g, body, red, blue };
}
function heliModel() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  box(2.4, 2, 4, "#f4f4f0", 0, 0, 0, body); box(2.2, 1.2, 1.4, "#3a5a7a", 0, 0.2, 1.9, body); box(2.46, 0.4, 4.05, "#e08a00", 0, -0.3, 0, body);
  box(0.5, 0.5, 4.5, "#f4f4f0", 0, 0.4, -4, body); box(0.15, 1.5, 0.9, "#e08a00", 0, 0.9, -6.1, body);
  for (const x of [-1, 1]) { box(0.15, 0.15, 4, "#3d4650", x * 1.2, -1.5, 0, body); box(0.12, 0.6, 0.12, "#3d4650", x * 1.1, -1.2, 1, body); box(0.12, 0.6, 0.12, "#3d4650", x * 1.1, -1.2, -1, body); }
  const rotor = new THREE.Group(); rotor.position.y = 1.25; body.add(rotor); box(0.3, 0.4, 0.3, "#3d4650", 0, -0.1, 0, rotor); box(11, 0.08, 0.5, "#2b3440", 0, 0.1, 0, rotor); box(0.5, 0.08, 11, "#2b3440", 0, 0.1, 0, rotor);
  const tail = new THREE.Group(); tail.position.set(0.3, 0.9, -6.1); body.add(tail); box(0.05, 2, 0.25, "#2b3440", 0, 0, 0, tail);
  const red = new THREE.Mesh(BOX, lightR.clone()); red.scale.set(0.5, 0.2, 0.5); red.position.set(-0.5, 1.05, 0.6); body.add(red);
  const blue = new THREE.Mesh(BOX, lightB.clone()); blue.scale.set(0.5, 0.2, 0.5); blue.position.set(0.5, 1.05, 0.6); body.add(blue);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 14, 20, 1, true), new THREE.MeshBasicMaterial({ color: "#fff6c0", transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide })); beam.position.y = -8; body.add(beam);
  g.traverse((o) => { if (o !== beam) o.castShadow = true; });
  return { g, body, red, blue, rotor, tail, beam };
}
const localVs = World.makeVehicles();
const vehs = localVs.map((v) => { const m = v.kind ? heliModel() : vanModel(); scene.add(m.g); return Object.assign(m, { kind: v.kind, buf: [], x: v.x, y: v.y, z: v.z, yaw: v.yaw, mode: 0, target: 0, pitch: 0 }); });
const meP = { id: 0, x: 0, y: 0, z: 0, stars: 0, lastChased: 0, lastStar: 0, immuneUntil: 0 };   // me, for running them offline
const tmpS = {};
function vehiclesDraw(dt) {
  const online = netOk, rt = renderTime(), flash = Math.floor(performance.now() / 120) % 2 === 0;
  vehs.forEach((m, i) => {
    if (online) { if (sampleAt(m.buf, rt, tmpS)) { m.x = tmpS.x; m.y = tmpS.y; m.z = tmpS.z; m.yaw = tmpS.yaw; } }
    else { const v = localVs[i]; m.x = v.x; m.y = v.y; m.z = v.z; m.yaw = v.yaw; m.mode = v.mode; m.target = v.target; }
    const chasing = m.mode === 1;
    if (!m.kind) {   // (owner, 2026-11-08: rear clipping into the road) sit on the front and rear wheels, a little above the road
      const sx = Math.sin(m.yaw), sz = Math.cos(m.yaw), front = terrain(m.x + sx * 1.6, m.z + sz * 1.6), rear = terrain(m.x - sx * 1.5, m.z - sz * 1.5);
      m.y = Math.max((front + rear) / 2, terrain(m.x, m.z)) + 0.22; m.pitch += (-Math.atan2(front - rear, 3.1) - m.pitch) * Math.min(1, dt * 10); m.body.rotation.x = m.pitch;
    }
    else { m.rotor.rotation.y += dt * 28; m.tail.rotation.x += dt * 34; m.body.rotation.x = chasing ? 0.18 : 0.06; m.beam.visible = chasing; }
    m.g.position.set(m.x, m.y, m.z); m.g.rotation.y = m.yaw;
    m.red.material.color.set(chasing ? (flash ? "#ff3a3a" : "#5a1010") : "#7a2020"); m.blue.material.color.set(chasing ? (flash ? "#1a2a5a" : "#3a7aff") : "#203a7a");
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
      const t = clamp(((h.x - me.x) * sx + (h.z - me.z) * sz) / L2, 0, 1), d = hyp(me.x + sx * t - h.x, me.z + sz * t - h.z);
      if (d < 8) { const f = hiddenBy(h, cx, cy, cz); if (f > 0) want.set(i, f); }
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
  if (me.inst && house && !placing) { cam.pitch = Math.min(cam.pitch, 0.45); cam.goalDist = Math.min(cam.goalDist, 9); }
  cam.dist += (cam.goalDist - cam.dist) * Math.min(1, dt * 8); cam.y += (me.y - cam.y) * Math.min(1, dt * 10);
  let d = cam.dist, cx, cz, cy;
  for (let i = 0; i < 14; i++) {   // at home (not while building) the camera stays inside the walls and under the roof
    cx = me.x + Math.sin(cam.yaw) * d * Math.cos(cam.pitch); cz = me.z + Math.cos(cam.yaw) * d * Math.cos(cam.pitch); cy = cam.y + 1.5 + d * Math.sin(cam.pitch);
    if (!me.inst || !house || placing || (inHouse(cx, cz, 0.45) && cy < WALL_H - 0.25)) break; d *= 0.82;
  }
  if (house) house.ceiling.visible = cy < WALL_H - 0.1;
  if (inside(cx, cz)) cy = Math.max(cy, terrain(cx, cz) + 1.2);
  const isl = islandAt(cx, cz); if (isl && cy < isl.y + 1.2 && cy > isl.y - 3) cy = isl.y + 1.2;
  camera.position.set(cx, cy, cz); camera.lookAt(me.x, cam.y + 1.8, me.z);
  sun.position.set(me.x + skyNow.sun.x * 90, me.y + Math.max(20, skyNow.sun.y * 90), me.z + skyNow.sun.z * 90); sun.target.position.set(me.x, me.y, me.z);
  fadeHouses(dt, cx, cy, cz);
}
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
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
    if (before > 0) cam.goalDist = clamp((cam.goalDist * before) / after, 7, 45); return;
  }
  cam.yaw -= (e.clientX - d.x) * 0.006; cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * 0.004, pitchMin(), 1.25); d.x = e.clientX; d.y = e.clientY;
});
const up = (e) => {
  const tp = taps.get(e.pointerId); taps.delete(e.pointerId);
  if (tp && e.type === "pointerup" && hyp(e.clientX - tp.x, e.clientY - tp.y) < 10 && performance.now() - tp.t < 400) tapAt(e.clientX, e.clientY);
  if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; joyEl.style.display = "none"; } drags.delete(e.pointerId); };
canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
canvas.addEventListener("wheel", (e) => { e.preventDefault(); cam.goalDist = clamp(cam.goalDist * Math.exp(e.deltaY * 0.001), 7, 45); }, { passive: false });
const typing = () => { const a = document.activeElement; return !!a && a.tagName === "INPUT" && a.offsetParent !== null; };
addEventListener("keydown", (e) => {
  if (typing()) return; keys.add(e.code); if (e.code === "Escape") { if (placing) stopPlacing(); closePanels(); }
  if ((e.code === "Enter" || e.code === "Slash") && loggedIn) { e.preventDefault(); openChat(); }
  if (e.code === "Space") { e.preventDefault(); jumpQueued = performance.now() + 150; }
  if (e.code === "KeyF") runAct("F"); if (e.code === "KeyE") runAct("E"); if (e.code === "KeyG") runAct("G"); if (e.code === "KeyR") runAct("R");
});
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ---- the HUD and panels ----
const fmt = (n) => Math.floor(n).toLocaleString();
function toast(txt, color) { const d = document.createElement("div"); d.textContent = txt; if (color) d.style.color = color; $("toast").appendChild(d); setTimeout(() => d.remove(), 1700); }
const CANDY = `<svg class="ico" viewBox="0 0 24 24"><path d="M2 8l4 4-4 4zM22 8l-4 4 4 4z" fill="#ff9ccf" stroke="#a3226a" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="12" r="6" fill="#ff5aa0" stroke="#a3226a" stroke-width="1.5"/><path d="M9 9.5c2 1 4 3 6 5" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>`;
let hudKey = "";
function hud() {
  const p = riding(), cap = petBag(p), c = contract, left = c ? Math.max(0, Math.ceil((c.ends - performance.now()) / 1000)) : 0;
  const key = [Math.floor(save.coins), me.bag.length, cap, online, netOk, save.items.snack, save.items.ribbon, save.items.ticket, me.boostUntil > performance.now(), me.stars, c && [c.done, c.goal, c.mine, left, c.kind]].join("|");
  if (key === hudKey) return; hudKey = key;
  $("coins").textContent = fmt(save.coins); $("bagn").textContent = me.bag.length + "/" + cap; $("who").textContent = save.name;
  $("onlinen").textContent = online; $("net").classList.toggle("on", netOk); $("btn-chat").disabled = !netOk;
  $("wanted").style.display = me.stars ? "inline-flex" : "none"; $("wanted").textContent = "★".repeat(me.stars) + "☆".repeat(World.WANTED_MAX - me.stars);
  $("contract").style.display = c ? "flex" : "none";
  if (c) { $("cname").textContent = (CONTRACTS.find((k) => k.id === c.kind) || CONTRACTS[2]).name; $("ctime").textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0"); $("cbar").style.width = Math.min(100, (c.done / c.goal) * 100) + "%"; $("cdone").textContent = c.done + " / " + c.goal; $("cmine").textContent = "You: " + c.mine; }
  const items = $("items"); items.innerHTML = "";
  if (save.items.snack > 0) { const b = document.createElement("button"); b.className = "btn gold"; b.type = "button"; b.innerHTML = `${CANDY}<span class="n">${save.items.snack}</span>`; b.title = ITEMS.snack.name; b.disabled = me.boostUntil > performance.now(); b.onclick = useSnack; items.appendChild(b); }
}
const panels = ["p-pets", "p-shop", "p-train", "p-board", "p-player", "p-trade", "p-build", "p-home", "p-admin"];
let openPanel = null;
function show(id) { for (const p of panels) $(p).style.display = p === id ? "block" : "none"; openPanel = id; if (id === "p-pets") renderPets(); if (id === "p-shop") renderShop(); if (id === "p-train") renderTrain(); if (id === "p-board") renderBoard(); if (id === "p-player") renderPlayer(); if (id === "p-trade") renderTrade(); if (id === "p-build") renderBuild(); if (id === "p-home") renderHomeBuy(); if (id === "p-admin") renderAdmin(); }
function closePanels() { if (openPanel === "p-trade" && trading) netSend({ t: "trade_cancel" }); for (const p of panels) $(p).style.display = "none"; openPanel = null; picking = -1; }
for (const p of panels) $(p).querySelector(".x").onclick = closePanels;
$("btn-pets").onclick = () => (openPanel === "p-pets" ? closePanels() : show("p-pets"));
const WING = `<svg class="ico" viewBox="0 0 14 12" style="width:14px;height:12px;vertical-align:-1px"><path d="M1 10C3 3 8 1 13 1c-1 5-5 9-12 9z" fill="#3a8ee6"/></svg>`;
function card(sp, lines, on, onclick) {
  const s = SPECIES[sp], d = document.createElement("div"); d.className = "card" + (on ? " on" : "");
  d.innerHTML = `<img alt="" src="${portrait(sp)}" width="84" height="84"><span class="nm">${s.name}${s.fly ? " " + WING : ""}</span><span class="rar" style="color:${RARITY[s.r].c}">${RARITY[s.r].name}</span>${lines}`;
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
function renderShop() {
  const el = $("eggs"); el.innerHTML = "";
  for (const egg of EGGS) {
    const d = document.createElement("div"); d.className = "card";
    d.innerHTML = `<svg width="84" height="84" viewBox="0 0 84 84"><ellipse cx="42" cy="46" rx="24" ry="31" fill="${egg.c}" stroke="${egg.s}" stroke-width="4"/><circle cx="34" cy="38" r="4" fill="${egg.s}"/><circle cx="50" cy="52" r="5" fill="${egg.s}"/></svg><span class="nm">${egg.name}</span>`
      + `<span class="stats">${egg.odds.map((o, r) => (o ? `<span style="color:${RARITY[r].c}">${o}%</span>` : "")).join("")}</span>`;
    const b = document.createElement("button"); b.className = "btn gold"; b.type = "button"; b.innerHTML = `<span class="coin" style="display:inline-block;vertical-align:-3px"></span> ${fmt(egg.price)}`; b.disabled = save.coins < egg.price; b.onclick = (ev) => { ev.stopPropagation(); buyEgg(egg, false); }; d.appendChild(b);
    if (save.pets.length >= World.petCap(save)) { b.disabled = true; b.textContent = "Full"; }
    if (egg.id === "basic" && save.items.ticket > 0) { const t = document.createElement("button"); t.className = "btn"; t.type = "button"; t.textContent = ITEMS.ticket.name + " ×" + save.items.ticket; t.onclick = (ev) => { ev.stopPropagation(); buyEgg(egg, true); }; d.appendChild(t); }
    el.appendChild(d);
  }
}
function buyEgg(egg, ticket) {
  if (ticket ? save.items.ticket <= 0 : save.coins < egg.price) return;
  if (save.pets.length >= World.petCap(save)) return;   // (owner, 2026-11-08) beds hold more pets
  if (ticket) save.items.ticket--; else save.coins -= egg.price;
  let roll = Math.random() * 100, r = 0; while (r < 3 && roll >= egg.odds[r]) { roll -= egg.odds[r]; r++; }
  const sp = pick(Object.keys(SPECIES).filter((k) => SPECIES[k].r === r)), p = { id: save.nextId++, sp, lv: 1 };
  save.pets.push(p); persist(); hatch(p, egg);
}
// (owner, 2026-11-08) hatching: the egg shakes harder and cracks, then bursts in a flash of fireworks to the pet, rays
// behind it in its rarity's color
function hatch(p, egg) {
  const s = SPECIES[p.sp], rc = RARITY[s.r].c; $("hatchn").textContent = s.name; $("hatchr").textContent = RARITY[s.r].name; $("hatchr").style.color = rc;
  const c = $("hatchc"), g = c.getContext("2d"), img = new Image(); img.src = portrait(p.sp);
  $("hatch").style.display = "flex"; $("hatchok").style.visibility = "hidden"; $("hatchn").style.visibility = "hidden"; $("hatchr").style.visibility = "hidden";
  const t0 = performance.now(), parts = []; let burst = 0, lastT = 0;
  const pop = (x, y, n, sp, cols) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (0.3 + Math.random() * 0.7); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1 + Math.random() * 0.6, c: pick(cols), r: 3 + Math.random() * 5, star: Math.random() < 0.3 }); } };
  const cols = s.r === 3 ? ["#ffd35a", "#ffb020", "#fff4c0", "#ff7ac8"] : s.r === 2 ? ["#c58bff", "#a352e0", "#fff", "#ff7ac8"] : s.r === 1 ? ["#7fc0ff", "#3a8ee6", "#fff", "#3fb36b"] : PARTY;
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
    if (burst === 2 && t > 2.3 && s.r >= 2) { burst = 3; pop(220, 90, 90, 420, cols); pop(80, 300, 50, 300, cols); pop(360, 320, 50, 300, cols); }
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
    if (t > 1.7) { $("hatchn").style.visibility = "visible"; $("hatchr").style.visibility = "visible"; $("hatchok").style.visibility = "visible"; }
    if (t < 5 || parts.length) requestAnimationFrame(anim);
  };
  anim();
  $("hatchok").onclick = () => {
    $("hatch").style.display = "none"; ride(p.id); if (openPanel === "p-shop") renderShop();
    emitConfetti(me.x, me.y + 3, me.z, 90, 6, 9); firework(me.x - 4, me.y + 2, me.z); if (s.r >= 2) { firework(me.x + 4, me.y + 2, me.z, 0.3); firework(me.x, me.y + 2, me.z - 4, 0.6, [rc, "#ffffff"]); }
  };
}
function renderTrain() {
  const p = riding(), el = $("train"), cost = trainCost(p), max = p.lv >= MAXLV;
  el.innerHTML = ""; el.appendChild(card(p.sp, statLine(p), true));
  const row = document.createElement("div"); row.className = "row2";
  const b = document.createElement("button"); b.className = "btn green"; b.type = "button"; b.style.flex = "1";
  b.innerHTML = max ? "Lv " + MAXLV : `Train <span class="coin" style="display:inline-block;vertical-align:-3px"></span> ${fmt(cost)}`; b.disabled = max || save.coins < cost; b.onclick = () => train("coins"); row.appendChild(b);
  const t = save.treats[p.sp] || 0;
  if (t > 0 && !max) { const r = document.createElement("button"); r.className = "btn gold"; r.type = "button"; r.innerHTML = `${TREAT} ${treatCost(p)} <span class="n">${t}</span>`; r.title = SPECIES[p.sp].name + " Treats"; r.disabled = t < treatCost(p); r.onclick = () => train("treat"); row.appendChild(r); }
  if (save.items.ribbon > 0 && !max) { const r = document.createElement("button"); r.className = "btn"; r.type = "button"; r.textContent = ITEMS.ribbon.name + " ×" + save.items.ribbon; r.onclick = () => train("ribbon"); row.appendChild(r); }
  el.appendChild(row);
}
function train(how) {
  const p = riding(); if (p.lv >= MAXLV) return;
  if (how === "ribbon" || how === true) { if (save.items.ribbon <= 0) return; save.items.ribbon--; }
  else if (how === "treat") { const c = treatCost(p); if ((save.treats[p.sp] || 0) < c) return; save.treats[p.sp] -= c; }
  else { const c = trainCost(p); if (save.coins < c) return; save.coins -= c; }
  p.lv++; persist(); mount(); netSend({ t: "pet", sp: p.sp, lv: p.lv }); toast(SPECIES[p.sp].name + " Lv " + p.lv, "#3fb36b"); if (openPanel === "p-train") renderTrain();
  emitSparks(me.x, me.y + 1.5, me.z, 50, 6, ["#3fb36b", "#ffd35a", "#ffffff"], 1.1, -3); emitConfetti(me.x, me.y + 2, me.z, 30, 3, 6);
}
function useSnack() { if (save.items.snack <= 0 || me.boostUntil > performance.now()) return; save.items.snack--; persist(); me.boostUntil = performance.now() + SNACK_TIME * 1000; toast(ITEMS.snack.name, ITEMS.snack.c); emitSparks(me.x, me.y + 1, me.z, 30, 5, ["#ff5aa0", "#ffffff"], 0.8, 0); hudKey = ""; }

// ---- contracts (co-op): an order the whole room works on: deliver the goal in parcels before the time's up; the
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
  const n = netOk ? online : 1;
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
  const cap = petBag(riding()), before = me.bag.length; if (before >= cap) return;
  // (owner, 2026-11-08) how far parcels go: a new courier's stay near the post office; the faster your best pet of the
  // kind you're riding (land pets, or fliers and gliders), the further out they go. Riding a flier or glider some go to
  // islands in reach (any on a flapping flier, only the low ones off the edge on a glider).
  const kind = moveKind(), air = kind !== "land", taken = new Set(me.bag), far = reach(air);
  let town = houses.map((h, i) => i).filter((i) => !houses[i].sky && houses[i].d <= far);
  const isl = air ? houses.map((h, i) => i).filter((i) => houses[i].sky && houses[i].d <= far && (kind === "fly" || houses[i].base < 20)) : [];
  if (town.length < cap + 6) town = houses.map((h, i) => i).filter((i) => !houses[i].sky).sort((a, b) => houses[a].d - houses[b].d).slice(0, cap + 6);
  for (let tries = 0; me.bag.length < cap && tries < 500; tries++) { const i = isl.length && Math.random() < 0.3 ? pick(isl) : pick(town); if (!taken.has(i)) { taken.add(i); me.bag.push(i); } }
  toast("+" + (cap - before)); syncBeams(); hudKey = "";
  emitSparks(me.x, me.y + 2, me.z, 20, 4, ["#ffd35a", "#ffffff"], 0.7, -1, 0.8);
}
function reach(air) {
  const best = Math.max(0, ...save.pets.filter((p) => !!SPECIES[p.sp].fly === air).map(petSpeed));
  return air ? 90 + Math.max(0, best - 9) * 40 : 75 + Math.max(0, best - 7) * 32;
}
function deliver(i) {
  const h = houses[i]; me.bag.splice(me.bag.indexOf(i), 1); syncBeams();
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
  me.stars = 0;
  if (me.bag.length) { me.bag = []; syncBeams(); }
  me.x = RELEASE.x + (Math.random() - 0.5) * 10; me.z = RELEASE.z + (Math.random() - 0.5) * 3; me.y = terrain(me.x, me.z); cam.y = me.y; cam.yaw = Math.PI;
  toast("Caught!", "#e5534b"); emitSparks(me.x, me.y + 2, me.z, 24, 4, ["#ffd84a", "#ffffff"], 0.8, 1); hudKey = "";
  sendPos(true);
}

// ---- chat (owner, 2026-11-08): say something to the room; it shows in the list at the bottom and over your head ----
const chatBar = $("chatbar"), chatIn = $("chatin");
// (owner, 2026-11-08) the chat's history since you logged in shows while the chat's open
const chatHist = [];
function openChat() { chatBar.style.display = "flex"; renderHist(); $("chathist").style.display = chatHist.length ? "flex" : "none"; chatIn.focus(); }
function closeChat() { chatBar.style.display = "none"; $("chathist").style.display = "none"; chatIn.blur(); }
function renderHist() {
  const el = $("chathist"); el.innerHTML = "";
  for (const h of chatHist) { const d = document.createElement("div"), b = document.createElement("b"); b.textContent = h.name + ": "; if (h.mine) b.style.color = "#3a8ee6"; d.append(b, document.createTextNode(h.text)); el.appendChild(d); }
  el.scrollTop = el.scrollHeight;
}
$("btn-chat").onclick = () => (chatBar.style.display === "flex" ? closeChat() : openChat());
chatBar.addEventListener("submit", (e) => {
  e.preventDefault(); const text = chatIn.value.replace(/\s+/g, " ").trim().slice(0, 120); chatIn.value = "";
  if (text) { netSend({ t: "chat", text }); chatLine(save.name, text, true); myBubble = bubble(text, myBubble, mine.g, mine.top); }
  closeChat();
});
chatIn.addEventListener("keydown", (e) => { if (e.key === "Escape") closeChat(); e.stopPropagation(); });
function chatLine(name, text, mineToo) {
  chatHist.push({ name, text, mine: !!mineToo }); if (chatHist.length > 300) chatHist.shift(); if (chatBar.style.display === "flex") { $("chathist").style.display = "flex"; renderHist(); }
  const d = document.createElement("div"), b = document.createElement("b"); b.textContent = name + ": "; if (mineToo) b.style.color = "#3a8ee6"; d.appendChild(b); d.appendChild(document.createTextNode(text));
  const log = $("chatlog"); log.appendChild(d); while (log.children.length > 6) log.firstChild.remove();
  setTimeout(() => d.classList.add("old"), 12000); setTimeout(() => d.remove(), 13000);
}
// a speech bubble over a rider for a few seconds
function bubble(text, old, parent, top) {
  if (old) { parent.remove(old.s); clearTimeout(old.timer); }
  const c = document.createElement("canvas"); c.width = 512; c.height = 128; const g = c.getContext("2d");
  g.font = "700 30px system-ui, sans-serif"; const words = text.split(" "), lines = [""];
  for (const w of words) { const t = (lines[lines.length - 1] + " " + w).trim(); if (g.measureText(t).width > 460 && lines[lines.length - 1]) { if (lines.length === 2) { lines[1] += "…"; break; } lines.push(w); } else lines[lines.length - 1] = t; }
  const w = Math.min(500, Math.max(...lines.map((l) => g.measureText(l).width)) + 36), h = lines.length * 36 + 22;
  g.fillStyle = "rgba(255,255,255,.95)"; g.beginPath(); g.roundRect((512 - w) / 2, 116 - h, w, h - 10, 20); g.fill(); g.beginPath(); g.moveTo(244, 106); g.lineTo(256, 122); g.lineTo(268, 106); g.fill();
  g.fillStyle = "#23303b"; g.textAlign = "center"; g.textBaseline = "middle"; lines.forEach((l, i) => g.fillText(l, 256, 116 - h + 22 + i * 36));
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); s.scale.set(6, 1.5, 1); s.renderOrder = 6; s.position.y = top + 2.4; parent.add(s);
  const o = { s }; o.timer = setTimeout(() => { parent.remove(s); if (myBubble === o) myBubble = null; }, 6000); return o;
}

// ---- co-op: everyone in a room sees the others riding; the server keeps your account and shares where everyone is,
// runs animal control, contracts, chat, parties and trades. A tab that's put away disconnects (and reconnects when it's
// back), and logging in again replaces the old connection, so nobody's left standing in town after they've gone. ----
const WS_URL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? `ws://${location.host}/pets` : "wss://play.atamus.io/pets";
let lastActual = 0;
let ws = null, netOk = false, myId = null, online = 1, retry = 1000, lastSent = 0, lastPos = "", hidden = document.hidden;
const others = new Map();   // id -> { name, sp, lv, shirt, stars, inst, buf, x, y, z, yaw, moving, m, tag, bub }
function netSend(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function connect() {
  if (hidden || ws || kicked) return;
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
    const was = netOk; netOk = false; myId = null; clockOff = null; saving = false; for (const id of [...others.keys()]) dropOther(id); online = 1; if (contract && !contract.local) contract = null; hudKey = "";
    party = []; renderParty(); if (trading) { trading = null; if (openPanel === "p-trade") closePanels(); }
    $("lgo").disabled = $("lnew").disabled = true;
    if (was && !hidden) toast("Offline");
    if (!hidden && !kicked) { setTimeout(connect, retry); retry = Math.min(15000, retry * 2); }
  };
  ws.onerror = () => {};
}
document.addEventListener("visibilitychange", () => {
  hidden = document.hidden;
  if (hidden) { flushSave(true); if (ws) ws.close(); } else { retry = 1000; last = performance.now(); connect(); }
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
  if (house && house.mine) buildHouse(houseMsgMine());
}

function nameTag(name, stars) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 96; const g = c.getContext("2d");
  g.font = "800 30px system-ui, sans-serif"; const w = Math.min(250, g.measureText(name).width + 28);
  g.fillStyle = "rgba(255,255,255,.92)"; g.beginPath(); g.roundRect((256 - w) / 2, 42, w, 44, 22); g.fill(); g.fillStyle = "#23303b"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(name, 128, 65);
  if (stars) { g.font = "800 30px system-ui, sans-serif"; g.fillStyle = "#e5534b"; g.strokeStyle = "#fff"; g.lineWidth = 6; const st = "★".repeat(stars); g.strokeText(st, 128, 20); g.fillText(st, 128, 20); }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); s.scale.set(4, 1.5, 1); s.renderOrder = 5; return s;
}
function addOther(p) {
  if (p.id === myId) return; const old = others.get(p.id); dropOther(p.id);
  const sp = SPECIES[p.sp] ? p.sp : "pup", m = petModel(sp, p.shirt || "#3a8ee6"), lv = clamp(p.lv | 0, 1, MAXLV), sc = petScale(lv); m.g.scale.setScalar(sc); m.top *= sc; const stars = p.stars || 0, tag = nameTag(String(p.name || "Courier").slice(0, 18), stars);
  tag.position.y = m.top + 1.2; m.g.add(tag); const y = Number.isFinite(p.y) ? p.y : terrain(p.x, p.z); m.g.position.set(p.x, y, p.z); scene.add(m.g);
  others.set(p.id, { name: p.name, sp, lv, shirt: p.shirt, stars, inst: p.inst || 0, buf: old ? old.buf : [], x: p.x, y, z: p.z, yaw: p.yaw || 0, moving: false, m, tag, bub: null });
}
function dropOther(id) { const o = others.get(id); if (!o) return; scene.remove(o.m.g); if (o.bub) clearTimeout(o.bub.timer); others.delete(id); }
function setContract(c) {
  const before = contract;
  contract = c ? { kind: c.kind || "big", goal: c.goal, done: c.done, mine: c.mine || 0, ends: performance.now() + c.left * 1000, pool: c.pool } : null;
  if (!before && contract) banner((CONTRACTS.find((k) => k.id === contract.kind) || CONTRACTS[2]).name + "!", "#ffd35a");
  hudKey = ""; if (openPanel === "p-board") renderBoard();
}
function onNet(m) {
  switch (m.t) {
    case "welcome": {
      if (stale(m.web)) return;
      setTok(m.token); if (registering) { try { localStorage.setItem("petdelivery.claimed", "1"); } catch (e) { /* private mode */ } registering = false; }
      const again = loggedIn && myName === m.name; myName = m.name; myId = m.id; netOk = true; loggedIn = true; $("login").style.display = "none"; if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (again && saveDirty && m.rev === rev) { save.name = myName; flushSave(true); } else adopt(m.data, m.rev);   // back after a drop: my unsaved progress goes up
      if (!again) { chatHist.length = 0; $("chatlog").innerHTML = ""; }   // a fresh login starts a fresh chat history
      myRole = m.role || "player";
      if (me.inst) leaveHouseLocal();
      for (const p of m.players) addOther(p); online = m.players.length + 1; setContract(m.contract); me.stars = m.stars || 0; hudKey = ""; uiKey = "";
      break;
    }
    case "auth_err": if (m.why === "expired") { setTok(null); showLogin(); } else showLogin(m.why === "banned" ? banText(m.until) : ERR[m.why] || ERR.server); break;
    case "kicked": kicked = true; loggedIn = false; showLogin(m.why === "kick" ? "Kicked" : m.why === "banned" ? banText(m.until) : ERR.kicked); break;
    case "muted": if (m.until) toast(m.until === -1 ? "Muted" : "Muted " + untilText(m.until), "#e5534b"); break;
    case "role": myRole = m.role; uiKey = ""; break;
    case "admin_list": adminList = m.list; renderAdmin(); break;
    case "admin_msg": toast(m.msg); break;
    case "saved": rev = m.rev; saving = false; break;
    case "data": saving = false; adopt(m.data, m.rev); break;
    case "join": addOther(m.p); online = others.size + 1; hudKey = ""; break;
    case "leave": dropOther(m.id); online = others.size + 1; hudKey = ""; break;
    case "snap":
      serverTime(m.ts);
      for (const [id, x, z, yaw, mv, y, st, inst, ct] of m.ps) {
        const o = others.get(id); if (!o) continue;
        if ((inst || 0) !== o.inst) { o.inst = inst || 0; o.buf.length = 0; o.snap = true; }
        // stamped with the sender's own clock: how far it is from mine, from the quickest-arriving updates
        const t = ct || m.ts, est = performance.now() - t;
        if (o.off === undefined || est < o.off || o.ctMode !== !!ct) { o.off = est; o.ctMode = !!ct; } else o.off += (est - o.off) * 0.005;
        pushSample(o.buf, t, { x, y: Number.isFinite(y) ? y : terrain(x, z), z, yaw, mv: !!mv }); o.moving = !!mv;
        if ((st || 0) !== o.stars) { o.stars = st || 0; o.m.g.remove(o.tag); o.tag = nameTag(String(o.name || "Courier").slice(0, 18), o.stars); o.tag.position.y = o.m.top + 1.2; o.m.g.add(o.tag); }
      }
      break;
    case "veh": serverTime(m.ts); m.v.forEach((r, i) => { const h = vehs[i]; if (!h) return; pushSample(h.buf, m.ts, { x: r[0], y: r[1], z: r[2], yaw: r[3] }); h.mode = r[4]; h.target = r[5]; }); break;
    case "pet": { const o = others.get(m.id); if (o) addOther({ id: m.id, name: o.name, sp: m.sp, lv: m.lv, shirt: o.shirt, stars: o.stars, inst: o.inst, x: o.x, y: o.y, z: o.z, yaw: o.yaw }); break; }
    case "fx": { const o = others.get(m.id); if (o && o.inst === me.inst) emitConfetti(o.x, o.y + 2.5, o.z, 35, 4, 7); break; }
    case "chat": { const o = others.get(m.id); chatLine(o ? o.name : m.name, m.text); if (o) o.bub = bubble(m.text, o.bub, o.m.g, o.m.top); break; }
    case "chase": case "caught": case "escaped": case "stars": onVehEvent(m.t, m.stars || 0); break;
    case "reload": stale(m.web, true); break;
    case "contract": setContract(m.c); break;
    case "done": contractOver(m.won, m.pay || 0, m.progress || 0, !!m.helped); break;
    case "invited": invites.push({ from: m.from, name: m.name, kind: m.kind, until: performance.now() + 28000 }); renderInvite(); break;
    case "declined": toast(m.name + " ✕"); break;
    case "party": party = m.members || []; renderParty(); uiKey = ""; break;
    case "trade": { const first = !trading; trading = m; if (first) { offer = { pets: new Set(), coins: 0 }; show("p-trade"); } else if (openPanel === "p-trade") renderTrade(); break; }
    case "trade_end": trading = null; if (openPanel === "p-trade") closePanels(); toast(m.done ? "Traded!" : "Trade cancelled", m.done ? "#3fb36b" : undefined); if (m.done) emitConfetti(me.x, me.y + 3, me.z, 60, 4, 7); break;
    case "home": enterHome(m); break;
    case "home_left": leaveHouseLocal(); break;
  }
}
// (owner, 2026-11-08) updates: when a new build of the page is live, everyone reloads onto it (progress is saved on the
// server); this page's own build is read from version.json when it loads
let myBuild = null;
fetch("version.json?t=" + Date.now(), { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((j) => { if (j && j.v) myBuild = j.v; }).catch(() => {});
function stale(web, told) {
  if (!told && (!web || !myBuild || web === myBuild)) return false;
  let lastR = 0; try { lastR = +sessionStorage.getItem("petdelivery.reload") || 0; } catch (e) { /* none */ }
  if (Date.now() - lastR < 60000) return false;   // never loop
  try { sessionStorage.setItem("petdelivery.reload", String(Date.now())); } catch (e) { /* private mode */ }
  flushSave(true); banner("Updating!", "#ffd35a"); setTimeout(() => location.reload(), 1500); return true;
}
function sendPos(force) {
  const s = [me.x.toFixed(2), me.y.toFixed(1), me.z.toFixed(2), me.yaw.toFixed(2), me.moving ? 1 : 0, me.bag.length].join();
  if (!force && s === lastPos) return;
  netSend({ t: "pos", x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(2), mv: me.moving ? 1 : 0, ct: Math.round(performance.now()), bag: me.bag.length }); lastPos = s; lastActual = performance.now();
}

// ---- players (owner, 2026-11-08): F next to someone opens a menu to trade with them or invite them to your party;
// invites pop up to accept or turn down. A party can visit each other's homes. ----
let party = [], invites = [], target = null;
function nearPlayer() { let best = null, bd = 5; for (const [id, o] of others) { if (o.inst !== me.inst) continue; const d = hyp(o.x - me.x, o.z - me.z, o.y - me.y); if (d < bd) { bd = d; best = id; } } return best; }
function renderPlayer() {
  const o = others.get(target), el = $("player"); if (!o) { closePanels(); return; }
  $("pname").textContent = o.name; el.innerHTML = "";
  const inParty = party.some((q) => q.id === target);
  const t = document.createElement("button"); t.className = "btn gold"; t.type = "button"; t.textContent = "Trade"; t.disabled = !!trading; t.onclick = () => { netSend({ t: "invite", id: target, kind: "trade" }); toast("→ " + o.name); closePanels(); };
  const p = document.createElement("button"); p.className = "btn green"; p.type = "button"; p.textContent = inParty ? "Party ✓" : "Party"; p.disabled = inParty; p.onclick = () => { netSend({ t: "invite", id: target, kind: "party" }); toast("→ " + o.name); closePanels(); };
  el.append(t, p);
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

// ---- homes (owner, 2026-11-08): buy a house in town; its door (E) takes you into your own copy of it, far off in the
// sky where nobody else is: walled rooms under a roof. Freebuild: rooms on any free square next to one you have, beds
// (each holds 2 more pets), playpens (a pet in one earns coins while you're away, collected when you come home) and
// windows anywhere they fit; anything can be taken away again for half its price. Tap a playpen to choose its pet.
// Invite your party in. ----
const HOME = World.HOME, RS = HOME.roomSize, IN = { x: 5000, z: 5000 }, WALL_H = 3.6;
const cellsOf = (home) => home.cells || Array.from({ length: home.rooms }, (_, k) => [k % 3, Math.floor(k / 3)]);
const roomAt = (k, home = house ? house.msg.home : save.home) => { const c = cellsOf(home)[k] || [0, 0]; return { x: IN.x + c[0] * RS, z: IN.z + c[1] * RS }; };
const hasCell = (home, x, z) => cellsOf(home).some(([a, b]) => a === x && b === z);
const SIZE = { bed: [2.4, 3.2], pen: [5.6, 5.6] };
const footprint = (t) => { const [w, d] = SIZE[t.k], sw = t.r % 2 ? d : w, sd = t.r % 2 ? w : d; return [IN.x + t.x - sw / 2, IN.x + t.x + sw / 2, IN.z + t.z - sd / 2, IN.z + t.z + sd / 2]; };
let house = null;   // { msg, mine, g, rects, pens, picks (meshes to tap), ceiling }
const doorOf = (i) => { const h = houses[i]; return { x: h.x + Math.sin(h.yaw) * 5.4, z: h.z + Math.cos(h.yaw) * 5.4, y: h.base }; };
const houseMsgMine = () => ({ host: myId, hostName: myName, home: save.home, pens: save.home ? save.home.items.map((t) => { const p = t.k === "pen" && t.pet && save.pets.find((q) => q.id === t.pet); return p ? { sp: p.sp, lv: p.lv } : null; }) : [], inst: -1, mine: true });
const myRing = new THREE.Mesh(RINGG(1.6), ringM("#3fb36b")); myRing.visible = false; scene.add(myRing);
const glassM = new THREE.MeshBasicMaterial({ color: "#bfe6ff", transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
// a wall along one side of a room, in thirds: plain, a window, or (the front of the first room) the door
function wallSide(g, cx, cz, side, wins, door) {
  const o = { x: IN.x + cx * RS, z: IN.z + cz * RS }, third = RS / 3, C = "#f4ead8", T = 0.3;
  for (let p = 0; p < 3; p++) {
    // centre of this third along the wall, and which way the wall runs
    const along = (p + 0.5) * third, alongX = side >= 2;
    const at = (a, y, w, h) => { const x = alongX ? o.x + a : o.x + (side === 1 ? RS : 0), z = alongX ? o.z + (side === 3 ? RS : 0) : o.z + a; return box(alongX ? w : T, h, alongX ? T : w, C, x, y, z, g); };
    if (door && p === 1) { at(along - third / 2 + 0.6, WALL_H / 2, 1.2, WALL_H); at(along + third / 2 - 0.6, WALL_H / 2, 1.2, WALL_H); at(along, 2.6 + (WALL_H - 2.6) / 2, third - 2.4, WALL_H - 2.6); continue; }
    if (wins.has(p)) {
      at(along, 0.55, third, 1.1); at(along, 2.9 + (WALL_H - 2.9) / 2, third, WALL_H - 2.9);
      at(along - third / 2 + 0.4, 2.0, 0.8, 1.8); at(along + third / 2 - 0.4, 2.0, 0.8, 1.8);
      const gl = new THREE.Mesh(BOX, glassM); gl.scale.set(alongX ? third - 1.6 : 0.06, 1.8, alongX ? 0.06 : third - 1.6); gl.position.set(alongX ? o.x + along : o.x + (side === 1 ? RS : 0), 2.0, alongX ? o.z + (side === 3 ? RS : 0) : o.z + along); g.add(gl);
      const sill = at(along, 1.12, third - 1.4, 0.08); sill.material = mat("#c98b4f");
      continue;
    }
    at(along, WALL_H / 2, third, WALL_H);
  }
}
function buildHouse(msg) {
  if (house) scene.remove(house.g);
  const g = new THREE.Group(), home = msg.home, rects = [], pens = [], picks = [], cells = cellsOf(home), ceiling = new THREE.Group();
  cells.forEach(([cx, cz], k) => {
    const o = roomAt(k, home), has = (dx, dz) => hasCell(home, cx + dx, cz + dz);
    const floor = box(RS, 0.3, RS, (cx + cz) % 2 ? "#e7cfa4" : "#dcc093", o.x + RS / 2, -0.15, o.z + RS / 2, g, false); floor.userData.cell = [cx, cz]; picks.push(floor);
    box(RS + 0.3, 0.3, RS + 0.3, "#efe6d4", o.x + RS / 2, WALL_H + 0.15, o.z + RS / 2, ceiling, false);   // the roof (a light ceiling from inside)
    [[-1, 0, 0], [1, 0, 1], [0, -1, 2], [0, 1, 3]].forEach(([dx, dz, side]) => {
      if (has(dx, dz)) return;
      const wins = new Set(home.items.filter((t) => t.k === "window" && t.c[0] === cx && t.c[1] === cz && t.s === side).map((t) => t.p));
      wallSide(g, cx, cz, side, wins, k === 0 && side === 2);
    });
  });
  g.add(ceiling);
  box(3.6, 0.06, 1.6, "#c8553d", IN.x + RS / 2, 0.03, IN.z + 1, g, false);   // the doormat: E here to go back out
  home.items.forEach((t, i) => {
    if (t.k === "window") {   // something to tap when taking it away
      const side = t.s, alongX = side >= 2, a = (t.p + 0.5) * (RS / 3), o = { x: IN.x + t.c[0] * RS, z: IN.z + t.c[1] * RS };
      const m = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ visible: false })); m.scale.set(alongX ? 3 : 0.6, 1.9, alongX ? 0.6 : 3); m.position.set(alongX ? o.x + a : o.x + (side === 1 ? RS : 0), 2, alongX ? o.z + (side === 3 ? RS : 0) : o.z + a); m.userData.item = i; g.add(m); picks.push(m);
      return;
    }
    const it = new THREE.Group(); it.position.set(IN.x + t.x, 0, IN.z + t.z); it.rotation.y = (t.r * Math.PI) / 2; g.add(it);
    if (t.k === "bed") { box(2.4, 0.5, 3.2, "#8a5a3a", 0, 0.25, 0, it); box(2.2, 0.35, 3, "#9ad0ff", 0, 0.65, 0, it); box(1.6, 0.3, 0.7, "#ffffff", 0, 0.95, -1.05, it); box(2.4, 1.1, 0.2, "#8a5a3a", 0, 0.55, -1.6, it); }
    else {
      for (let n = 0; n < 12; n++) { const a = (n / 12) * TAU; box(0.15, 1, 0.15, "#c98b4f", Math.cos(a) * 2.6, 0.5, Math.sin(a) * 2.6, it); }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.07, 6, 32).rotateX(Math.PI / 2), mat("#c98b4f")); ring.position.y = 0.85; it.add(ring);
      const grass = new THREE.Mesh(new THREE.CircleGeometry(2.5, 24).rotateX(-Math.PI / 2), mat("#9bd66f")); grass.position.y = 0.02; it.add(grass);
      const pp = msg.pens && msg.pens[i];
      if (pp && SPECIES[pp.sp]) { const m = petModel(pp.sp); m.g.scale.setScalar(0.8 * petScale(pp.lv)); g.add(m.g); pens.push({ m, cx: IN.x + t.x, cz: IN.z + t.z, x: IN.x + t.x, z: IN.z + t.z, yaw: 0, tx: IN.x + t.x, tz: IN.z + t.z, wait: 0 }); }
    }
    const hit = new THREE.Mesh(BOX, new THREE.MeshBasicMaterial({ visible: false })); const [w, d] = SIZE[t.k]; hit.scale.set(w, 1.4, d); hit.position.y = 0.7; hit.userData.item = i; it.add(hit); picks.push(hit);
    rects.push(footprint(t));
  });
  scene.add(g); house = { msg, mine: !!msg.mine || msg.host === myId, g, rects, pens, picks, ceiling };
}
// (owner, 2026-11-08: couldn't walk into new rooms) inside any room, kept off its outside walls only
function inHouse(x, z, m = 0.7) {
  if (!house) return false;
  return inRooms(house.msg.home, x, z, m);
}
function inRooms(home, x, z, m) {
  const cx = Math.floor((x - IN.x) / RS), cz = Math.floor((z - IN.z) / RS);
  if (!hasCell(home, cx, cz)) return false;
  const lx = x - IN.x - cx * RS, lz = z - IN.z - cz * RS;
  if (lx < m && !hasCell(home, cx - 1, cz)) return false; if (lx > RS - m && !hasCell(home, cx + 1, cz)) return false;
  if (lz < m && !hasCell(home, cx, cz - 1)) return false; if (lz > RS - m && !hasCell(home, cx, cz + 1)) return false;
  return true;
}
const houseBlocked = (x, z) => house.rects.some((r) => x > r[0] - 0.6 && x < r[1] + 0.6 && z > r[2] - 0.6 && z < r[3] + 0.6);
function enterHome(msg) {
  const mineToo = msg.host === myId; if (mineToo) msg.mine = true;
  closePanels(); buildHouse(msg); me.inst = msg.inst || -1; me.bagBefore = me.bag.slice();
  me.x = IN.x + RS / 2; me.z = IN.z + 2.6; me.y = 0; me.vy = 0; me.yaw = 0; cam.yaw = Math.PI; cam.pitch = 0.3; cam.goalDist = 7; cam.y = 0;
  if (mineToo) collectPens();
  else toast(msg.hostName);
  uiKey = ""; sendPos(true);
}
function leaveHouseLocal() {
  if (!house) { me.inst = 0; return; }
  const i = house.msg.home.house, d = doorOf(i), h = houses[i];
  stopPlacing(); scene.remove(house.g); house = null; me.inst = 0;
  me.x = d.x + Math.sin(h.yaw) * 2; me.z = d.z + Math.cos(h.yaw) * 2; me.y = floorAt(me.x, me.z, d.y + 1); me.vy = 0; me.yaw = h.yaw; cam.yaw = h.yaw + Math.PI; cam.y = me.y; cam.goalDist = 14; cam.pitch = 0.5;
  if (openPanel === "p-build") closePanels(); uiKey = ""; sendPos(true);
}
function exitHome() { netSend({ t: "home_exit" }); leaveHouseLocal(); }
// coins the playpens have made since they were last collected
function collectPens() {
  if (!save.home) return 0;
  let total = 0; const now = Date.now();
  for (const t of save.home.items) if (t.k === "pen" && t.pet) {
    const p = save.pets.find((q) => q.id === t.pet); if (!p) { delete t.pet; continue; }
    const min = Math.min((now - (t.since || now)) / 60000, World.PEN_MAX_H * 60);
    total += min * World.PEN_RATE[SPECIES[p.sp].r] * (1 + 0.05 * (p.lv - 1)); t.since = now;
  }
  total = Math.floor(total);
  if (total > 0) { save.coins += total; toast("+" + fmt(total), "#e08a00"); emitConfetti(me.x, me.y + 3, me.z, 40, 4, 7); hudKey = ""; }
  persist(); return total;
}
function buyHouse(i) {
  const price = World.housePrice(i); if (save.home || save.coins < price) return;
  save.coins -= price; save.home = { house: i, rooms: 1, cells: [[0, 0]], items: [] }; persist(); flushSave(true);
  closePanels(); banner("Home!", "#3fb36b"); firework(me.x, me.y + 2, me.z); emitConfetti(me.x, me.y + 3, me.z, 80, 5, 8); uiKey = ""; hudKey = "";
}
function renderHomeBuy() {
  const el = $("homebuy"), i = homeTarget, price = World.housePrice(i); el.innerHTML = "";
  const b = document.createElement("button"); b.className = "btn gold"; b.type = "button"; b.style.width = "100%";
  b.innerHTML = `Buy <span class="coin" style="display:inline-block;vertical-align:-3px"></span> ${fmt(price)}`; b.disabled = save.coins < price || !netOk; b.onclick = () => buyHouse(i);
  el.appendChild(b);
}
let homeTarget = -1, picking = -1;
// ---- building ----
function freeCells() {
  const h = save.home, out = [];
  for (const [x, z] of cellsOf(h)) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = z + dz; if (Math.abs(a) > 4 || Math.abs(b) > 4 || (a === 0 && b === -1) || hasCell(h, a, b) || out.some((c) => c[0] === a && c[1] === b)) continue; out.push([a, b]); }
  return out;
}
function freeWindows() {
  const h = save.home, cells = cellsOf(h), out = [];
  for (const c of cells) for (let side = 0; side < 4; side++) {
    if (!World.outerSide(cells, c, side)) continue;
    for (let p = 0; p < 3; p++) { if (c[0] === 0 && c[1] === 0 && side === 2 && p === 1) continue; if (h.items.some((t) => t.k === "window" && t.c[0] === c[0] && t.c[1] === c[1] && t.s === side && t.p === p)) continue; out.push({ c: [c[0], c[1]], s: side, p }); }
  }
  return out;
}
// can furniture go here? on the floor, clear of walls, the doormat and other furniture
function fits(t, skip) {
  const r = footprint(t), home = save.home;
  for (const [x, z] of [[r[0], r[2]], [r[1], r[2]], [r[0], r[3]], [r[1], r[3]], [(r[0] + r[1]) / 2, (r[2] + r[3]) / 2], [(r[0] + r[1]) / 2, r[2]], [(r[0] + r[1]) / 2, r[3]], [r[0], (r[2] + r[3]) / 2], [r[1], (r[2] + r[3]) / 2]]) if (!inRooms(home, x, z, 0.3)) return false;
  if (r[0] < IN.x + RS / 2 + 2.3 && r[1] > IN.x + RS / 2 - 2.3 && r[2] < IN.z + 2.8) return false;   // the doormat and the way in
  return home.items.every((o, i) => i === skip || o.k === "window" || (() => { const q = footprint(o); return r[1] <= q[0] + 0.1 || r[0] >= q[1] - 0.1 || r[3] <= q[2] + 0.1 || r[2] >= q[3] - 0.1; })());
}
function priceOf(t) { return t.k === "room" ? World.roomPrice(cellsOf(save.home).length - 1) : HOME[t.k]; }
function build(kind, where) {
  const h = save.home; if (!h) return false;
  const price = kind === "room" ? World.roomPrice(h.rooms) : HOME[kind];
  if (save.coins < price) return false;
  if (kind === "room") {
    if (h.rooms >= HOME.maxRooms || !where || !freeCells().some((q) => q[0] === where[0] && q[1] === where[1])) return false;
    h.cells = cellsOf(h).concat([[where[0], where[1]]]); h.rooms = h.cells.length;
  } else if (kind === "window") {
    if (!where || !freeWindows().some((q) => q.c[0] === where.c[0] && q.c[1] === where.c[1] && q.s === where.s && q.p === where.p)) return false;
    h.items.push({ k: "window", c: where.c, s: where.s, p: where.p });
  } else {
    if (h.items.length >= HOME.maxItems) return false;
    const t = { k: kind, x: where.x, z: where.z, r: where.r || 0 }; if (!fits(t, -1)) return false; h.items.push(t);
  }
  save.coins -= price; persist(); flushSave(true); buildHouse(houseMsgMine()); hudKey = "";
  emitConfetti(me.x, me.y + 2.5, me.z, 30, 3, 6); return true;
}
// take something away: half its price back; a room only when it's empty, isn't the first and the rest stay joined up
function demolish(target) {
  const h = save.home; if (!h) return false;
  if (target.cell) {
    const [x, z] = target.cell, cells = cellsOf(h); if ((!x && !z) || cells.length < 2) return false;
    const rest = cells.filter(([a, b]) => a !== x || b !== z);
    if (h.items.some((t) => t.k !== "window" && (() => { const r = footprint(t); return r[1] > IN.x + x * RS && r[0] < IN.x + (x + 1) * RS && r[3] > IN.z + z * RS && r[2] < IN.z + (z + 1) * RS; })())) { toast("✕"); return false; }
    const seen = new Set(["0,0"]), q = [[0, 0]]; while (q.length) { const [a, b] = q.pop(); for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = a + dx + "," + (b + dz); if (!seen.has(k) && rest.some(([c, d]) => c === a + dx && d === b + dz)) { seen.add(k); q.push([a + dx, b + dz]); } } }
    if (seen.size !== rest.length) { toast("✕"); return false; }
    h.cells = rest; h.rooms = rest.length; save.coins += Math.floor(World.roomPrice(rest.length) / 2);
    h.items = h.items.filter((t) => t.k !== "window" || (rest.some(([a, b]) => a === t.c[0] && b === t.c[1]) && World.outerSide(rest, t.c, t.s)));
  } else {
    const t = h.items[target.item]; if (!t) return false;
    if (t.k === "pen") collectPens();
    h.items.splice(target.item, 1); save.coins += Math.floor(HOME[t.k] / 2);
  }
  persist(); flushSave(true); buildHouse(houseMsgMine()); hudKey = ""; emitSparks(me.x, me.y + 1.5, me.z, 20, 4, ["#ffffff", "#ffd35a"], 0.7, 1); return true;
}
// placing: furniture follows the pointer (green where it fits, red where not; R or ⟳ turns it) and a tap puts it down;
// rooms and windows show green markers to tap; removing: tap what to take away
let placing = null;   // { kind, g, picks?, ghost?, r, at }
const pickM = new THREE.MeshBasicMaterial({ color: "#3fb36b", transparent: true, opacity: 0.45, depthWrite: false });
const badM = new THREE.MeshBasicMaterial({ color: "#e5534b", transparent: true, opacity: 0.45, depthWrite: false });
let camBefore = null;
function startPlacing(kind) {
  stopPlacing(); closePanels();
  const g = new THREE.Group(), picks = [];
  if (kind === "room") for (const c of freeCells()) { const m = new THREE.Mesh(new THREE.BoxGeometry(RS - 1, 0.2, RS - 1), pickM); m.position.set(IN.x + c[0] * RS + RS / 2, 0.1, IN.z + c[1] * RS + RS / 2); g.add(m); picks.push({ mesh: m, where: c }); }
  else if (kind === "window") for (const w of freeWindows()) { const alongX = w.s >= 2, a = (w.p + 0.5) * (RS / 3), o = { x: IN.x + w.c[0] * RS, z: IN.z + w.c[1] * RS }; const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 3 : 0.7, 1.8, alongX ? 0.7 : 3), pickM); m.position.set(alongX ? o.x + a : o.x + (w.s === 1 ? RS : 0), 2, alongX ? o.z + (w.s === 3 ? RS : 0) : o.z + a); g.add(m); picks.push({ mesh: m, where: w }); }
  else if (kind !== "remove") { const [w, d] = SIZE[kind]; const ghostM = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), pickM); ghostM.position.set(me.x, 0.45, me.z + 4); g.add(ghostM); placing = { kind, g, ghost: ghostM, r: 0, at: null }; }
  if ((kind === "room" || kind === "window") && !picks.length) return;
  scene.add(g); if (!placing) placing = { kind, g, picks };
  camBefore = camBefore || { d: cam.goalDist, p: cam.pitch }; cam.goalDist = Math.max(cam.goalDist, kind === "room" ? 36 : 26); cam.pitch = Math.max(cam.pitch, 1.0); uiKey = "";
}
function stopPlacing() { if (placing) { scene.remove(placing.g); placing = null; uiKey = ""; } if (camBefore) { cam.goalDist = camBefore.d; cam.pitch = camBefore.p; camBefore = null; } }
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitV = new THREE.Vector3();
function aim(px, py) { ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); }
function moveGhost(px, py) {   // furniture under the pointer, on a half-metre grid
  if (!placing || !placing.ghost) return null;
  aim(px, py); if (!ray.ray.intersectPlane(floorPlane, hitV)) return null;
  const at = { x: Math.round((hitV.x - IN.x) * 2) / 2, z: Math.round((hitV.z - IN.z) * 2) / 2, r: placing.r };
  placing.at = at; placing.ghost.position.set(IN.x + at.x, 0.45, IN.z + at.z); placing.ghost.rotation.y = (at.r * Math.PI) / 2;
  placing.ghost.material = fits({ k: placing.kind, ...at }, -1) ? pickM : badM; return at;
}
function turnGhost() { if (placing && placing.ghost) { placing.r = (placing.r + 1) % 4; if (placing.at) { placing.at.r = placing.r; placing.ghost.rotation.y = (placing.r * Math.PI) / 2; placing.ghost.material = fits({ k: placing.kind, ...placing.at }, -1) ? pickM : badM; } } }
function tapAt(px, py) {
  if (!house) return false;
  aim(px, py);
  if (placing) {
    if (placing.ghost) { const at = moveGhost(px, py); if (at && build(placing.kind, at)) { const k = placing.kind, r = placing.r; stopPlacing(); if (save.coins >= HOME[k]) { startPlacing(k); placing.r = r; } } return true; }
    if (placing.kind === "remove") {
      const hit = ray.intersectObjects(house.picks)[0]; if (!hit) return true;
      if (hit.object.userData.item !== undefined) { demolish({ item: hit.object.userData.item }); return true; }
      const c = hit.object.userData.cell, key = c.join();   // a whole room: tap it twice
      if (placing.armed === key) { placing.armed = null; demolish({ cell: c }); } else { placing.armed = key; toast("Sure?", "#e5534b"); }
      return true;
    }
    const hit = ray.intersectObjects(placing.picks.map((p) => p.mesh))[0]; if (!hit) return false;
    const p = placing.picks.find((q) => q.mesh === hit.object), kind = placing.kind; stopPlacing(); build(kind, p.where); return true;
  }
  if (house.mine) {   // (owner, 2026-11-08) tap a playpen to choose which pet lives in it
    const hit = ray.intersectObjects(house.picks)[0], i = hit && hit.object.userData.item;
    if (i !== undefined && save.home.items[i] && save.home.items[i].k === "pen") { picking = i; show("p-build"); return true; }
  }
  return false;
}
canvas.addEventListener("pointermove", (e) => { if (placing && placing.ghost && e.pointerType === "mouse") moveGhost(e.clientX, e.clientY); });
function renderBuild() {
  const el = $("build"), h = save.home; el.innerHTML = ""; if (!h) return;
  if (picking >= 0 && h.items[picking]) {   // choosing a pet for a playpen
    const pens = World.penPets(save), grid = document.createElement("div"); grid.className = "grid";
    const none = document.createElement("div"); none.className = "card"; none.innerHTML = `<span class="nm">—</span>`; none.onclick = () => setPen(picking, null); grid.appendChild(none);
    for (const p of save.pets) if (p.id !== save.ride && (!pens.has(p.id) || h.items[picking].pet === p.id)) grid.appendChild(card(p.sp, statLine(p), h.items[picking].pet === p.id, () => setPen(picking, p.id)));
    el.appendChild(grid); return;
  }
  picking = -1;
  const row = document.createElement("div"); row.className = "buildrow";
  const opt = (label, kind, price, ok) => { const b = document.createElement("button"); b.className = "btn gold"; b.type = "button"; b.innerHTML = `${label}<br><span class="coin" style="display:inline-block;width:12px;height:12px;vertical-align:-2px"></span> ${fmt(price)}`; b.disabled = !ok || save.coins < price; b.onclick = () => startPlacing(kind); row.appendChild(b); };
  opt("Room", "room", World.roomPrice(h.rooms), h.rooms < HOME.maxRooms && freeCells().length > 0); opt("Bed", "bed", HOME.bed, h.items.length < HOME.maxItems); opt("Playpen", "pen", HOME.pen, h.items.length < HOME.maxItems); opt("Window", "window", HOME.window, freeWindows().length > 0);
  const rm = document.createElement("button"); rm.className = "btn"; rm.type = "button"; rm.textContent = "Remove"; rm.style.background = "var(--red)"; rm.onclick = () => startPlacing("remove"); row.appendChild(rm);
  el.appendChild(row);
  const cap = document.createElement("div"); cap.className = "stats"; cap.style.margin = "10px 0"; cap.innerHTML = `<span>${save.pets.length} / ${World.petCap(save)}</span>`; el.appendChild(cap);
}
function setPen(i, id) {
  collectPens(); const t = save.home.items[i]; if (!t) return;
  if (id) { t.pet = id; t.since = Date.now(); } else { delete t.pet; delete t.since; }
  picking = -1; persist(); flushSave(true); buildHouse(houseMsgMine()); closePanels();
}
$("btn-build").onclick = () => { picking = -1; stopPlacing(); if (openPanel === "p-build") closePanels(); else show("p-build"); };

// ---- what I can do where I am: talk to someone (F), a door or the doormat (E); buttons for them on a phone ----
let uiKey = "", acts = [];
function nearDoor() {
  if (me.inst) return -1;
  for (let i = 0; i < houses.length; i++) { const d = doorOf(i); if (Math.abs(me.y - d.y) < 3 && hyp(me.x - d.x, me.z - d.z) < 2.6) return i; }
  return -1;
}
function context() {
  const a = [], pl = netOk ? nearPlayer() : null;
  if (pl !== null) { const o = others.get(pl); a.push({ key: "F", label: o.name, fn: () => { target = pl; show("p-player"); } }); }
  if (me.inst && house) {
    if (hyp(me.x - (IN.x + RS / 2), me.z - (IN.z + 1)) < 2.4) a.push({ key: "E", label: "Exit", fn: exitHome });
    if (house.mine && party.length > 1) a.push({ key: "G", label: "Invite", fn: () => { netSend({ t: "home_invite" }); toast("→ Party"); } });
    if (placing && placing.ghost) a.push({ key: "R", label: "⟳", fn: turnGhost });
    if (placing) a.push({ key: "Escape", label: "✕", fn: stopPlacing });
  } else if (loggedIn) {
    const i = nearDoor();
    if (i >= 0 && save.home && save.home.house === i) a.push({ key: "E", label: "Enter", fn: () => (netOk ? netSend({ t: "home_enter" }) : null) });
    else if (i >= 0 && !save.home) a.push({ key: "E", label: "Home", fn: () => { homeTarget = i; show("p-home"); } });
  }
  return a;
}
function runAct(key) { const a = acts.find((q) => q.key === key); if (a) a.fn(); }
function ui() {
  acts = context();
  const kind = me.inst ? "land" : moveKind();
  const key = acts.map((a) => a.key + a.label).join("|") + "|" + kind + "|" + !!(house && house.mine) + "|" + party.length + "|" + myRole;
  if (key === uiKey) return; uiKey = key;
  const el = $("acts"); el.innerHTML = "";
  for (const a of acts) { const b = document.createElement("button"); b.className = "btn ghost"; b.type = "button"; b.innerHTML = touchy || a.key.length > 1 ? a.label : `<kbd>${a.key}</kbd> ${a.label}`; b.onclick = () => runAct(a.key); el.appendChild(b); }
  $("btn-jump").style.display = kind === "fly" ? "none" : "";
  $("btn-build").style.display = house && house.mine ? "" : "none";
  $("btn-admin").style.display = isStaff() ? "" : "none";
  myRing.visible = !!save.home; if (save.home) { const d = doorOf(save.home.house); myRing.position.set(d.x, d.y + 0.12, d.z); }
}

// ---- staff (owner, 2026-11-08): Nyssary is admin and makes admins; admins make moderators and give items; moderators
// mute, kick and ban. The Admin button opens the panel: everyone online, and any account by name. ----
let myRole = "player", adminList = [], adminQ = "", giveTo = null, giveWhat = null;
const untilText = (u) => { const m = Math.round((u - Date.now()) / 60000); return m < 60 ? m + "m" : m < 2880 ? Math.round(m / 60) + "h" : Math.round(m / 1440) + "d"; };
const banText = (u) => (u === -1 ? "Banned" : "Banned " + untilText(u));
const isStaff = () => myRole === "moderator" || myRole === "admin";
const GIVES = () => [{ id: "coins", name: "Coins" }, ...Object.entries(ITEMS).map(([id, it]) => ({ id, name: it.name })), ...Object.entries(SPECIES).map(([id, sp]) => ({ id: "pet:" + id, name: sp.name, pet: true })), ...Object.entries(SPECIES).map(([id, sp]) => ({ id: "treat:" + id, name: sp.name + " Treats" }))];
let adminTimer = 0;
function adminSend(o) { netSend(Object.assign({ t: "admin", q: adminQ }, o)); }
function renderAdmin() {
  const el = $("admin"); if (!el) return;
  if (giveTo) return renderGive();
  el.innerHTML = "";
  const q = document.createElement("input"); q.className = "field"; q.placeholder = "Search"; q.value = adminQ; q.maxLength = 16;
  q.oninput = () => { adminQ = q.value.trim(); clearTimeout(adminTimer); adminTimer = setTimeout(() => adminSend({ op: "list" }), 250); };
  el.appendChild(q);
  const owner = myName.toLowerCase() === "nyssary";
  const sel = (opts, val, on) => { const s = document.createElement("select"); s.className = "field small"; for (const [v, t] of opts) { const o = document.createElement("option"); o.value = v; o.textContent = t; if (v === val) o.selected = true; s.appendChild(o); } s.onchange = () => on(s.value); return s; };
  const TIMES = [["", "—"], ["10", "10m"], ["60", "1h"], ["1440", "1d"], ["10080", "7d"], ["43200", "30d"], ["perma", "Perma"], ["off", "Off"]];
  const rows = document.createElement("div"); rows.className = "arows";
  for (const p of adminList.filter((r) => !adminQ || r.name.toLowerCase().startsWith(adminQ.toLowerCase()))) {
    const r = document.createElement("div"); r.className = "arow";
    const nm = document.createElement("div"); nm.className = "aname";
    nm.innerHTML = `<span class="dot${p.online ? " on" : ""}"></span><b></b><span class="role ${p.role}">${p.role}</span>${p.muted ? `<span class="tag">Muted ${p.muted === -1 ? "" : untilText(p.muted)}</span>` : ""}${p.banned ? `<span class="tag">Banned ${p.banned === -1 ? "" : untilText(p.banned)}</span>` : ""}`;
    nm.querySelector("b").textContent = p.name; r.appendChild(nm);
    const acts = document.createElement("div"); acts.className = "aacts";
    const canRole = owner ? p.role !== "owner" : myRole === "admin" && (p.role === "player" || p.role === "moderator");
    if (canRole && p.name !== myName) acts.appendChild(sel(owner ? [["player", "Player"], ["moderator", "Moderator"], ["admin", "Admin"]] : [["player", "Player"], ["moderator", "Moderator"]], p.role, (v) => adminSend({ op: "role", id: p.id, role: v })));
    const mute = sel(TIMES.map(([v, t]) => [v, v ? "Mute " + t : "Mute"]), "", (v) => v && adminSend({ op: "mute", id: p.id, mins: v })); acts.appendChild(mute);
    const ban = sel(TIMES.map(([v, t]) => [v, v ? "Ban " + t : "Ban"]), "", (v) => v && adminSend({ op: "ban", id: p.id, mins: v })); acts.appendChild(ban);
    if (p.online) { const k = document.createElement("button"); k.className = "btn small"; k.type = "button"; k.textContent = "Kick"; k.onclick = () => adminSend({ op: "kick", id: p.id }); acts.appendChild(k); }
    if (myRole === "admin") { const g = document.createElement("button"); g.className = "btn gold small"; g.type = "button"; g.textContent = "Give"; g.onclick = () => { giveTo = p; giveWhat = null; renderAdmin(); }; acts.appendChild(g); }
    r.appendChild(acts); rows.appendChild(r);
  }
  el.appendChild(rows);
}
// give someone an item, coins, Treats or a pet: type to narrow the list, pick one
function renderGive() {
  const el = $("admin"); el.innerHTML = "";
  const head = document.createElement("div"); head.className = "row2"; head.style.marginTop = "0";
  const back = document.createElement("button"); back.className = "btn ghost small"; back.type = "button"; back.textContent = "←"; back.onclick = () => { giveTo = null; renderAdmin(); };
  const who = document.createElement("b"); who.textContent = giveTo.name; who.style.flex = "1"; head.append(back, who); el.appendChild(head);
  const q = document.createElement("input"); q.className = "field"; q.placeholder = "Item or pet"; q.value = giveWhat ? giveWhat.name : "";
  const list = document.createElement("div"); list.className = "picklist";
  const fill = () => { list.innerHTML = ""; const t = q.value.trim().toLowerCase(); for (const o of GIVES().filter((o) => !t || o.name.toLowerCase().includes(t)).slice(0, 40)) { const b = document.createElement("button"); b.type = "button"; b.className = "pick" + (giveWhat && giveWhat.id === o.id ? " on" : ""); b.innerHTML = o.pet ? `<img alt="" src="${portrait(o.id.slice(4))}">` : ""; b.append(document.createTextNode(o.name)); b.onclick = () => { giveWhat = o; q.value = o.name; fill(); lv.style.display = o.pet ? "" : "none"; }; list.appendChild(b); } };
  q.oninput = () => { giveWhat = null; fill(); };
  const row = document.createElement("div"); row.className = "row2";
  const n = document.createElement("input"); n.className = "field small"; n.type = "number"; n.min = 1; n.value = 1; n.inputMode = "numeric"; n.title = "Amount";
  const lv = document.createElement("input"); lv.className = "field small"; lv.type = "number"; lv.min = 1; lv.max = MAXLV; lv.value = 1; lv.inputMode = "numeric"; lv.title = "Lv"; lv.style.display = giveWhat && giveWhat.pet ? "" : "none";
  const go = document.createElement("button"); go.className = "btn gold"; go.type = "button"; go.textContent = "Give"; go.style.flex = "1";
  go.onclick = () => { if (!giveWhat) return; adminSend({ op: "give", id: giveTo.id, what: giveWhat.id, n: +n.value || 1, lv: +lv.value || 1 }); };
  row.append(n, lv, go); el.append(q, list, row); fill();
}
$("btn-admin").onclick = () => { if (openPanel === "p-admin") closePanels(); else { giveTo = null; show("p-admin"); adminSend({ op: "list" }); } };

// ---- the loop ----
let last = performance.now(), clock = 0, zone = null, jumpQueued = 0;
const SLOPE = 0.8, FLY_TOP = 130, FLY_SPEED_UP = 0.85, GRAV = 26;
// (owner, 2026-11-08) how each pet gets around: land pets jump (high from standing, far on the run); flapping fliers go
// anywhere but fly and walk slower; gliders are fast but can't climb, sinking slowly as they glide, and walk well
const MOVE = { land: { ground: 1, air: 1 }, fly: { ground: 0.7, air: 0.75 }, glide: { ground: 0.95, air: 1.25 } };
function floorAt(x, z, y) {
  if (me.inst) return 0;
  const isl = islandAt(x, z); if (isl && y > isl.y - 3) return isl.y;
  return inside(x, z) ? terrain(x, z) + (World.roadDist(x, z) < ROAD_HALF + 0.3 ? ROAD_LIFT : 0) : -200;
}
function step(dt) {
  clock += dt;
  const now = performance.now();
  if (!loggedIn) { joy.x = joy.y = 0; }
  // where the joystick (or keys) point, turned by the camera
  let jx = joy.x, jy = joy.y;
  if (loggedIn && !typing()) {
    if (keys.has("KeyW") || keys.has("ArrowUp")) jy -= 1; if (keys.has("KeyS") || keys.has("ArrowDown")) jy += 1;
    if (keys.has("KeyA") || keys.has("ArrowLeft")) jx -= 1; if (keys.has("KeyD") || keys.has("ArrowRight")) jx += 1;
  }
  const l = hyp(jx, jy); if (l > 1) { jx /= l; jy /= l; }
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  const mx = fx * -jy + rx * jx, mz = fz * -jy + rz * jx, ml = hyp(mx, mz);
  const kind = me.inst ? "land" : moveKind(), M = MOVE[kind], p = riding(), stunned = me.stunUntil > now;
  const floor0 = floorAt(me.x, me.z, me.y), grounded = me.y - floor0 < 0.08;
  let sp = petSpeed(p) * (me.boostUntil > now ? SNACK_BOOST : 1) * (grounded ? M.ground : M.air);
  if (kind === "land" && !grounded && me.longJump) sp *= 1.6;
  me.moving = ml > 0.08 && !stunned;
  if (me.moving) {
    const v = sp * Math.min(1, ml) * dt, nx = me.x + (mx / ml) * v, nz = me.z + (mz / ml) * v;
    const ok = (x, z) => {
      if (me.inst) return inHouse(x, z) && !houseBlocked(x, z);
      if (hyp(x, z) > LIMIT || blocked(x, z, me.y)) return false;
      if (kind === "fly") return true;
      if (kind === "land" && !inside(x, z, 1.5) && !islandAt(x, z)) return false;   // the edge (gliders can step off)
      return floorAt(x, z, me.y) - me.y <= SLOPE * v + 0.05;   // too steep to climb (a jump gets you up a ledge)
    };
    if (ok(nx, me.z)) me.x = nx; if (ok(me.x, nz)) me.z = nz;   // slide along walls
    me.yaw = lerpYaw(me.yaw, Math.atan2(mx, mz), Math.min(1, dt * 12));   // turn to where it's going (never tilting)
  }
  const floor = floorAt(me.x, me.z, me.y);
  if (kind === "fly") {   // climbs or dives as it flies forward, the way the camera looks; hovers when stopped
    const fwd = me.moving ? clamp(-jy, 0, 1) : 0, climb = clamp((0.42 - cam.pitch) * 1.8, -1, 1);
    me.y += climb * fwd * sp * FLY_SPEED_UP * dt; me.y = Math.min(me.y, FLY_TOP); if (me.y < floor) me.y = floor; me.vy = 0;
  } else {
    if (jumpQueued > now && grounded && !stunned) { me.vy = me.moving ? 7.5 : 11; me.longJump = me.moving; jumpQueued = 0; }
    me.vy = (me.vy || 0) - GRAV * dt;
    if (kind === "glide" && me.vy < 0 && me.y - floor > 1.2) me.vy = Math.max(me.vy, -(1.6 + Math.max(0, cam.pitch - 0.42) * 10));   // gliding down
    me.y += me.vy * dt;
    if (me.y <= floor || (grounded && me.vy <= 0 && me.y - floor < 0.6)) { me.y = floor; me.vy = 0; me.longJump = false; }   // landed (and keeping to the ground going downhill)
    if (me.y < -150) { me.x = SPAWN.x; me.z = SPAWN.z; me.y = terrain(me.x, me.z); me.vy = 0; toast("Whoosh!"); }   // fell off into the clouds: back to the plaza
  }
  me.airborne = me.y - floor > 1.2;
  const low = me.y - floor < 3.5;
  if (!me.inst) {
    // the post office fills my bag; a mailbox I have a parcel for takes it
    if (hyp(me.x - PICKUP.x, me.z - PICKUP.z) < PICKUP.r && low) fillBag();
    for (const i of me.bag) { const h = houses[i]; if (hyp(me.x - h.mx, me.z - h.mz) < 3.6 && Math.abs(me.y - h.my) < 4.5) { deliver(i); break; } }
  }
  // animal control: offline this page runs it
  if (!netOk) {
    Object.assign(meP, { x: me.inst ? 9999 : me.x, y: me.y, z: me.z, stars: me.stars, bag: me.bag.length });
    for (const e of World.stepVehicles(localVs, [meP], dt, now / 1000)) onVehEvent(e.k, e.stars || 0);
  }
  // the egg shop, the training yard and the board open their panel when I ride in
  const z = !low || me.inst ? null : hyp(me.x - SHOP.x, me.z - SHOP.z) < SHOP.r ? "p-shop" : hyp(me.x - TRAIN.x, me.z - TRAIN.z) < TRAIN.r ? "p-train" : hyp(me.x - BOARD.x, me.z - BOARD.z) < BOARD.r ? "p-board" : null;
  if (z !== zone) { if (zone && openPanel === zone) closePanels(); zone = z; if (z) show(z); }
  contractStep(); fxStep(dt);
  for (const c of clouds) { c.position.x += dt * 1.5; if (c.position.x > 400) c.position.x = -400; }
  // send where I am, 10 times a second (by the real clock) when it changes, and every 2 s regardless; save now and then
  if (netOk && now - lastSent > 50) { sendPos(now - lastActual > 1000); lastSent = now; }
  flushSave(false);
}
function draw(dt) {
  const now = performance.now();
  mine.g.position.set(me.x, me.y, me.z); mine.g.rotation.set(0, me.yaw, 0);
  animatePet(mine, clock, me.moving, petSpeed(riding()), me.airborne);
  dizzy.visible = me.stunUntil > now; if (dizzy.visible) { dizzy.position.set(me.x, me.y + mine.top + 0.5, me.z); dizzy.rotation.y = clock * 6; }
  for (const o of others.values()) {
    const vis = o.inst === me.inst; o.m.g.visible = vis; if (!vis) continue;
    // replayed a little in the past on its own clock; a correction after a guess ahead is eased in, never snapped
    if (o.off !== undefined && sampleAt(o.buf, performance.now() - o.off - OTHER_DELAY, tmpS)) {
      if (o.snap || hyp(tmpS.x - o.x, tmpS.z - o.z) > 25) { o.x = tmpS.x; o.y = tmpS.y; o.z = tmpS.z; o.snap = false; }
      const k = Math.min(1, dt * 18); o.x += (tmpS.x - o.x) * k; o.y += (tmpS.y - o.y) * k; o.z += (tmpS.z - o.z) * k; o.yaw = lerpYaw(o.yaw, tmpS.yaw, k);
    }
    o.m.g.position.set(o.x, o.y, o.z); o.m.g.rotation.y = o.yaw;
    animatePet(o.m, clock + o.x * 0.1, o.moving, 10, o.m.fly && o.y - (inside(o.x, o.z) ? terrain(o.x, o.z) : -60) > 1.2);
  }
  vehiclesDraw(dt);
  if (house) for (const q of house.pens) {   // pets in playpens wander about
    if (q.wait > 0) q.wait -= dt; else { const dx = q.tx - q.x, dz = q.tz - q.z, d = hyp(dx, dz); if (d < 0.1) { const a = Math.random() * TAU, r = Math.random() * 1.6; q.tx = q.cx + Math.cos(a) * r; q.tz = q.cz + Math.sin(a) * r; q.wait = 1 + Math.random() * 2; } else { const s = Math.min(d, dt * 1.5); q.x += (dx / d) * s; q.z += (dz / d) * s; q.yaw = lerpYaw(q.yaw, Math.atan2(dx, dz), Math.min(1, dt * 6)); } }
    q.m.g.position.set(q.x, 0, q.z); q.m.g.rotation.y = q.yaw; animatePet(q.m, clock + q.cx, q.wait <= 0, 3, false);
  }
  // the arrow: to the nearest house in my bag, else back to the post office
  let tx = PICKUP.x, tz = PICKUP.z, best = 1e9;
  for (const i of me.bag) { const h = houses[i], d = hyp(h.mx - me.x, h.mz - me.z); if (d < best) { best = d; tx = h.mx; tz = h.mz; } }
  const ti = me.bag.find((i) => houses[i].mx === tx && houses[i].mz === tz), ty = ti !== undefined ? houses[ti].my : 0;
  for (const b of beams.values()) { b.userData.parcel.rotation.y = clock * 2; b.userData.parcel.position.y = 3 + Math.sin(clock * 3) * 0.3; }
  pickRing.material.opacity = 0.55 + Math.sin(clock * 4) * 0.3; bigEgg.rotation.y = clock * 0.6;
  placeCamera(dt); camera.updateMatrixWorld(); drawGuide(tx, ty, tz, loggedIn && !me.inst && hyp(tx - me.x, tz - me.z) > 6); skyStep(dt, camera.position.x, camera.position.y, camera.position.z);
  renderer.render(scene, camera);
}
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.1); last = now;
  if (dt > 0.05) { step(dt / 2); step(dt / 2); } else step(dt);
  draw(dt); hud(); ui(); if (invites.length && invites[0].until < now) renderInvite();
  requestAnimationFrame(frame);
}
$("btn-jump").addEventListener("pointerdown", (e) => { e.preventDefault(); jumpQueued = performance.now() + 150; });
me.y = terrain(me.x, me.z); cam.y = me.y;
syncBeams(); hud(); requestAnimationFrame(frame); connect();
$("lgo").disabled = $("lnew").disabled = true;

// for tests
window.Pets = { get save() { return save; }, me, houses, get contract() { return contract; }, get online() { return online; }, get netOk() { return netOk; }, get loggedIn() { return loggedIn; }, get others() { return others; }, get house() { return house; }, get party() { return party; }, get trading() { return trading; }, step, deliver, fillBag, buyEgg, train, startContract, ride, buyHouse, build, setPen, collectPens, runAct, netSend, EGGS, SPECIES, PICKUP, SHOP, TRAIN, BOARD, ISLANDS, World, vehs, localVs, cam, terrain, doorOf, contractOver, emitConfetti, firework, caught, trade, persist, flushSave, set skyOffset(v) { skyOffset = v; }, reach, camera, placingPicks: () => (placing ? placing.picks : []), inHouseTest: (x, z) => inHouse(x, z) && !houseBlocked(x, z), startPlacingTest: startPlacing, stopPlacingTest: stopPlacing, demolishTest: demolish, V3: THREE.Vector3, teleport: (x, z, y) => { me.x = x; me.z = z; me.y = y === undefined ? terrain(x, z) : y; me.vy = 0; } };
