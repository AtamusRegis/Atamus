// Pet Delivery Co. (owner, 2026-11-08): ride your pet around town delivering mail. Pick up parcels at the post office,
// ride up to the glowing houses to deliver them, earn coins (and sometimes an item), buy eggs to hatch faster pets,
// train them. Co-op: everyone in a room rides the same town, and big contracts are worked on together.
// The town and all rules run here; the server (packages/server/src/pets.js) only shares players and runs contracts.
import * as THREE from "./vendor/three.module.min.js";

const $ = (id) => document.getElementById(id);
const TAU = Math.PI * 2, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), hyp = Math.hypot;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const touchy = matchMedia("(pointer: coarse)").matches;

// ---- pets ----
const RARITY = [{ name: "Common", c: "#6f7d8a" }, { name: "Rare", c: "#3a8ee6" }, { name: "Epic", c: "#a352e0" }, { name: "Legendary", c: "#e08a00" }];
// speed in m/s, bag in parcels; ears: what's on its head
const SPECIES = {
  pup: { name: "Pup", r: 0, speed: 7, bag: 2, c: "#c98b4f", a: "#7a4f28", ears: "flop", size: 1 },
  kitten: { name: "Kitten", r: 0, speed: 7.5, bag: 2, c: "#f2a65a", a: "#fff1e0", ears: "point", size: 0.9 },
  bunny: { name: "Bunny", r: 0, speed: 8, bag: 2, c: "#f4f1ee", a: "#f3a7b5", ears: "long", size: 0.9 },
  duck: { name: "Duck", r: 0, speed: 6.5, bag: 3, c: "#ffd84a", a: "#f08a24", ears: "beak", size: 0.85 },
  fox: { name: "Fox", r: 1, speed: 9.5, bag: 3, c: "#e8722c", a: "#fff4ea", ears: "point", size: 1 },
  penguin: { name: "Penguin", r: 1, speed: 8.5, bag: 4, c: "#2b3440", a: "#f4f4f4", ears: "beak", size: 0.95 },
  goat: { name: "Goat", r: 1, speed: 9, bag: 4, c: "#e6e1d6", a: "#9b8f7a", ears: "horns", size: 1.05 },
  deer: { name: "Deer", r: 2, speed: 11.5, bag: 3, c: "#b9824e", a: "#f3e3cc", ears: "antlers", size: 1.15 },
  bear: { name: "Bear", r: 2, speed: 10, bag: 6, c: "#6b4a32", a: "#c9a27e", ears: "round", size: 1.3 },
  horse: { name: "Horse", r: 2, speed: 12.5, bag: 4, c: "#8a5a3a", a: "#2b1d14", ears: "point", size: 1.3 },
  dragon: { name: "Dragon", r: 3, speed: 15, bag: 5, c: "#3fb36b", a: "#ffd84a", ears: "wings", size: 1.35 },
  unicorn: { name: "Unicorn", r: 3, speed: 16, bag: 4, c: "#fbf7ff", a: "#ff7ac8", ears: "horn", size: 1.3 },
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
const trainCost = (p) => Math.round(40 * Math.pow(1.32, p.lv - 1) * [1, 1.6, 2.6, 4][SPECIES[p.sp].r]);
// items dropped by deliveries
const ITEMS = { snack: { name: "Speed Snack", c: "#ff8a3d" }, ribbon: { name: "Training Ribbon", c: "#e5534b" }, ticket: { name: "Egg Ticket", c: "#f2b01e" } };
const SNACK_TIME = 30, SNACK_BOOST = 1.5;

// ---- the save (this browser) ----
const SAVE = "petdelivery.v1";
const N1 = ["Swift", "Sunny", "Brave", "Zippy", "Lucky", "Happy", "Mighty", "Cozy", "Speedy", "Jolly", "Rapid", "Breezy"];
const N2 = ["Otter", "Robin", "Badger", "Panda", "Comet", "Pebble", "Maple", "Biscuit", "Rocket", "Clover", "Sparrow", "Mochi"];
function fresh() { return { coins: 0, pets: [{ id: 1, sp: "pup", lv: 1 }], ride: 1, items: { snack: 0, ribbon: 0, ticket: 0 }, name: pick(N1) + " " + pick(N2), delivered: 0, nextId: 2, shirt: pick(["#3a8ee6", "#e5534b", "#3fb36b", "#a352e0", "#f2b01e", "#2bb3c0"]) }; }
function load() { try { const s = JSON.parse(localStorage.getItem(SAVE)); if (s && Array.isArray(s.pets) && s.pets.length) return Object.assign(fresh(), s); } catch (e) { /* none yet */ } return fresh(); }
let save = load();
const persist = () => { try { localStorage.setItem(SAVE, JSON.stringify(save)); } catch (e) { /* private mode */ } };
const riding = () => save.pets.find((p) => p.id === save.ride) || save.pets[0];

// ---- the town: a 5 x 5 grid of blocks between roads; the middle one is the plaza (post office, contract board), the
// one east of it the egg shop, west the training yard; the rest are houses, 4 to a block, each with a mailbox ----
const BLOCKS = [-96, -48, 0, 48, 96], ROADS = [-120, -72, -24, 24, 72, 120], HALF = 124;
const POST = { x: 0, z: -8 }, PICKUP = { x: 0, z: 5, r: 4 }, BOARD = { x: 10, z: 5, r: 3 }, SHOP = { x: 48, z: 5, r: 5 }, TRAIN = { x: -48, z: 0, r: 9 };
const SPAWN = { x: 0, z: 13 };
const houses = [], solids = [], trees = [];
let seed = 20261108; const srnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const HOUSE_C = ["#f6d9b8", "#cfe6f7", "#f7cfd8", "#d8f0c8", "#fbe7a8", "#e3d4f5", "#f9f4ea"], ROOF_C = ["#c8553d", "#3b6ea8", "#5a8f3e", "#8a5a3a", "#6b5b95"];
for (const bx of BLOCKS) for (const bz of BLOCKS) {
  if ((bx === 0 || Math.abs(bx) === 48) && bz === 0) continue;
  for (const ox of [-10, 10]) for (const oz of [-10, 10]) {
    const x = bx + ox, z = bz + oz;
    houses.push({ x, z, mx: x + Math.sign(ox) * 2.5, mz: bz + Math.sign(oz) * 18.5, face: Math.sign(oz), c: pick2(HOUSE_C), roof: pick2(ROOF_C), d: hyp(x - POST.x, z - POST.z) });
    solids.push([x - 4.5, x + 4.5, z - 4.5, z + 4.5]);
  }
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) if (srnd() < 0.8) trees.push({ x: bx + cx * (2 + srnd() * 3), z: bz + cz * (2 + srnd() * 3), s: 0.8 + srnd() * 0.5 });
}
function pick2(a) { return a[Math.floor(srnd() * a.length)]; }
solids.push([POST.x - 9, POST.x + 9, POST.z - 5, POST.z + 5]);   // the post office
solids.push([42, 54, -12, -4]);   // the egg shop
const RIDER_R = 0.7;
const blocked = (x, z) => solids.some((s) => x > s[0] - RIDER_R && x < s[1] + RIDER_R && z > s[2] - RIDER_R && z < s[3] + RIDER_R);

// ---- 3D ----
const canvas = $("gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !touchy });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touchy ? 1.6 : 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#8fd3ff"); scene.fog = new THREE.Fog("#bfe6ff", 70, 190);
const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 400);
scene.add(new THREE.HemisphereLight("#ffffff", "#7aa35a", 1.1));
const sun = new THREE.DirectionalLight("#fff6e0", 1.6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 140 }); scene.add(sun, sun.target);
const MATS = new Map(), mat = (c) => { if (!MATS.has(c)) MATS.set(c, new THREE.MeshLambertMaterial({ color: c })); return MATS.get(c); };
const BOX = new THREE.BoxGeometry(1, 1, 1);
function box(w, h, d, c, x, y, z, parent, shadow = true) { const m = new THREE.Mesh(BOX, mat(c)); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; (parent || scene).add(m); return m; }
// ground, block lawns, roads with their center lines
const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), mat("#86c95f")); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
for (const bx of BLOCKS) for (const bz of BLOCKS) box(40, 0.1, 40, bx === 0 && bz === 0 ? "#e8dcc4" : "#9bd66f", bx, 0.05, bz, null, false);
for (const r of ROADS) { box(8, 0.12, 2 * HALF, "#5c6670", r, 0.06, 0, null, false); box(2 * HALF, 0.12, 8, "#5c6670", 0, 0.06, r, null, false); }
for (const r of ROADS) for (let k = -HALF + 4; k < HALF; k += 8) { box(0.3, 0.13, 3, "#f4f1e6", r, 0.07, k, null, false); box(3, 0.13, 0.3, "#f4f1e6", k, 0.07, r, null, false); }
// houses as instances: walls, roofs, doors, mailboxes
const dummy = new THREE.Object3D();
function instanced(geo, color, n, each) { const m = new THREE.InstancedMesh(geo, mat(color), n); m.castShadow = true; m.receiveShadow = true; for (let i = 0; i < n; i++) { each(i, dummy); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); } scene.add(m); return m; }
const walls = instanced(BOX, "#ffffff", houses.length, (i, d) => { d.position.set(houses[i].x, 2.2, houses[i].z); d.scale.set(9, 4.4, 9); d.rotation.set(0, 0, 0); });
houses.forEach((h, i) => walls.setColorAt(i, new THREE.Color(h.c)));
const ROOFG = new THREE.ConeGeometry(7.2, 3.4, 4); ROOFG.rotateY(Math.PI / 4);
const roofs = instanced(ROOFG, "#ffffff", houses.length, (i, d) => { d.position.set(houses[i].x, 6.1, houses[i].z); d.scale.set(1, 1, 1); });
houses.forEach((h, i) => roofs.setColorAt(i, new THREE.Color(h.roof)));
const doors = instanced(BOX, "#7a4f28", houses.length, (i, d) => { const h = houses[i]; d.position.set(h.x, 1.1, h.z + h.face * 4.55); d.scale.set(1.6, 2.2, 0.15); });
// showing or hiding a house (walls, roof, door)
const houseParts = [[walls, (h, d) => { d.position.set(h.x, 2.2, h.z); d.scale.set(9, 4.4, 9); }], [roofs, (h, d) => { d.position.set(h.x, 6.1, h.z); d.scale.set(1, 1, 1); }], [doors, (h, d) => { d.position.set(h.x, 1.1, h.z + h.face * 4.55); d.scale.set(1.6, 2.2, 0.15); }]];
function setHouse(i, on) {
  for (const [m, f] of houseParts) { f(houses[i], dummy); if (!on) dummy.scale.set(0.0001, 0.0001, 0.0001); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); m.instanceMatrix.needsUpdate = true; }
}
instanced(BOX, "#6b7680", houses.length, (i, d) => { const h = houses[i]; d.position.set(h.mx, 0.55, h.mz); d.scale.set(0.15, 1.1, 0.15); });
instanced(BOX, "#e5534b", houses.length, (i, d) => { const h = houses[i]; d.position.set(h.mx, 1.25, h.mz); d.scale.set(0.6, 0.45, 0.8); });
// trees
const TRUNK = new THREE.CylinderGeometry(0.25, 0.3, 2, 6), LEAF = new THREE.SphereGeometry(1.6, 8, 6);
instanced(TRUNK, "#7a4f28", trees.length, (i, d) => { const t = trees[i]; d.position.set(t.x, 1, t.z); d.scale.set(t.s, t.s, t.s); });
instanced(LEAF, "#4fae4a", trees.length, (i, d) => { const t = trees[i]; d.position.set(t.x, 2.6 * t.s, t.z); d.scale.set(t.s, t.s, t.s); });
// the post office, its pickup ring and the contract board
box(18, 7, 10, "#d9e4ee", POST.x, 3.5, POST.z); box(19, 0.8, 11, "#3a8ee6", POST.x, 7.4, POST.z); box(4, 3.6, 0.2, "#3a6ea8", POST.x, 1.8, POST.z + 5.05);
box(8, 1.6, 0.3, "#f2b01e", POST.x, 5.4, POST.z + 5.1); box(1.6, 1.1, 0.35, "#e5534b", POST.x, 5.4, POST.z + 5.2);
const RINGG = (r) => new THREE.RingGeometry(r - 0.35, r, 40).rotateX(-Math.PI / 2);
const ringM = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 });
const pickRing = new THREE.Mesh(RINGG(PICKUP.r), ringM("#f2b01e")); pickRing.position.set(PICKUP.x, 0.16, PICKUP.z); scene.add(pickRing);
box(2.6, 2, 0.25, "#8a5a3a", BOARD.x, 2.2, BOARD.z - 1.5); box(0.2, 1.4, 0.2, "#7a4f28", BOARD.x - 1, 0.7, BOARD.z - 1.5); box(0.2, 1.4, 0.2, "#7a4f28", BOARD.x + 1, 0.7, BOARD.z - 1.5); box(2.2, 1.5, 0.05, "#fbf3dc", BOARD.x, 2.25, BOARD.z - 1.35);
const boardRing = new THREE.Mesh(RINGG(BOARD.r), ringM("#e5534b")); boardRing.position.set(BOARD.x, 0.16, BOARD.z); scene.add(boardRing);
// the egg shop, with a giant egg on top
box(12, 5, 8, "#f7cfd8", 48, 2.5, -8); box(13, 0.6, 9, "#e5739d", 48, 5.3, -8); box(3, 3, 0.2, "#7a4f28", 48, 1.5, -3.95);
const bigEgg = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 12), mat("#fff3d6")); bigEgg.scale.set(1, 1.3, 1); bigEgg.position.set(48, 8.3, -8); bigEgg.castShadow = true; scene.add(bigEgg);
const shopRing = new THREE.Mesh(RINGG(SHOP.r), ringM("#e5739d")); shopRing.position.set(SHOP.x, 0.16, SHOP.z); scene.add(shopRing);
// the training yard: a track with hurdles
const track = new THREE.Mesh(new THREE.RingGeometry(9, 14, 48).rotateX(-Math.PI / 2), mat("#d98b5f")); track.position.set(TRAIN.x, 0.12, TRAIN.z); track.receiveShadow = true; scene.add(track);
for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU, x = TRAIN.x + Math.cos(a) * 11.5, z = TRAIN.z + Math.sin(a) * 11.5, g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = -a; box(0.15, 1, 0.15, "#ffffff", 0, 0.5, -1.8, g); box(0.15, 1, 0.15, "#ffffff", 0, 0.5, 1.8, g); box(0.2, 0.25, 3.8, "#e5534b", 0, 1, 0, g); scene.add(g); }
const trainRing = new THREE.Mesh(RINGG(TRAIN.r - 1), ringM("#3fb36b")); trainRing.position.set(TRAIN.x, 0.16, TRAIN.z); scene.add(trainRing);

// ---- a pet (built from boxes; it faces +z) with its rider ----
function petModel(sp, rider) {
  const s = SPECIES[sp], k = s.size, g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const legH = 0.6 * k, bh = 0.7 * k, bl = 1.5 * k, bw = 0.9 * k, top = legH + bh;
  const short = s.ears === "beak";
  const legs = [];
  for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = new THREE.Group(); l.position.set(lx * bw * 0.32, legH, lz * bl * 0.32); box(0.24 * k, legH, 0.24 * k, short ? s.a : s.c, 0, -legH / 2, 0, l); body.add(l); legs.push(l); }
  box(bw, bh, bl, s.c, 0, legH + bh / 2, 0, body); box(bw * 0.7, bh * 0.4, bl * 0.6, s.a, 0, legH + 0.08, 0, body);
  const head = new THREE.Group(); head.position.set(0, top + 0.1 * k, bl / 2 + 0.15 * k); body.add(head);
  const hs = 0.75 * k; box(hs, hs, hs, s.c, 0, 0, 0, head); box(hs * 0.5, hs * 0.35, 0.2 * k, s.a, 0, -hs * 0.15, hs / 2 + 0.05, head);
  for (const ex of [-1, 1]) box(0.12 * k, 0.12 * k, 0.05, "#1d232a", ex * hs * 0.22, hs * 0.12, hs / 2 + 0.01, head);
  const e = s.ears, ear = (x, y, z, w, h, d, c) => box(w, h, d, c || s.c, x, y, z, head);
  if (e === "flop") { ear(-hs * 0.55, 0, 0, 0.15 * k, hs * 0.8, hs * 0.4, s.a); ear(hs * 0.55, 0, 0, 0.15 * k, hs * 0.8, hs * 0.4, s.a); }
  else if (e === "point") { ear(-hs * 0.3, hs * 0.6, 0, 0.22 * k, 0.35 * k, 0.12 * k); ear(hs * 0.3, hs * 0.6, 0, 0.22 * k, 0.35 * k, 0.12 * k); }
  else if (e === "long") { ear(-hs * 0.22, hs * 0.95, 0, 0.18 * k, 0.9 * k, 0.12 * k); ear(hs * 0.22, hs * 0.95, 0, 0.18 * k, 0.9 * k, 0.12 * k); }
  else if (e === "beak") ear(0, -hs * 0.05, hs * 0.6, hs * 0.5, hs * 0.2, 0.35 * k, s.a);
  else if (e === "horns") { ear(-hs * 0.3, hs * 0.65, -0.1, 0.12 * k, 0.45 * k, 0.12 * k, s.a); ear(hs * 0.3, hs * 0.65, -0.1, 0.12 * k, 0.45 * k, 0.12 * k, s.a); }
  else if (e === "antlers") { for (const x of [-1, 1]) { ear(x * hs * 0.3, hs * 0.8, 0, 0.1 * k, 0.7 * k, 0.1 * k, s.a); ear(x * hs * 0.45, hs * 1.05, 0, 0.35 * k, 0.1 * k, 0.1 * k, s.a); } }
  else if (e === "round") { ear(-hs * 0.4, hs * 0.55, 0, 0.25 * k, 0.25 * k, 0.15 * k); ear(hs * 0.4, hs * 0.55, 0, 0.25 * k, 0.25 * k, 0.15 * k); }
  else if (e === "horn") { const h = new THREE.Mesh(new THREE.ConeGeometry(0.12 * k, 0.7 * k, 8), mat(s.a)); h.position.set(0, hs * 0.75, hs * 0.25); h.rotation.x = 0.4; head.add(h); }
  const wings = [];
  if (e === "wings") for (const x of [-1, 1]) { const w = new THREE.Group(); w.position.set(x * bw / 2, top - 0.1, 0); box(1.2 * k, 0.08, 0.9 * k, s.a, x * 0.6 * k, 0, 0, w); body.add(w); wings.push(w); }
  const tail = box(0.18 * k, 0.18 * k, 0.5 * k, s.a, 0, top - 0.15, -bl / 2 - 0.2 * k, body);
  let seat = top;
  if (rider) {   // the courier: a shirt, a cap and a mail bag
    const r = new THREE.Group(); r.position.set(0, top, -0.1 * k); body.add(r);
    box(0.55, 0.75, 0.35, rider, 0, 0.45, 0, r); box(0.45, 0.45, 0.45, "#f1c9a5", 0, 1.08, 0, r); box(0.5, 0.15, 0.55, "#3a6ea8", 0, 1.36, 0.05, r); box(0.5, 0.06, 0.3, "#3a6ea8", 0, 1.3, 0.32, r);
    box(0.25, 0.42, 0.5, "#a0703f", 0.38, 0.35, -0.02, r); seat = top + 1.6;
  }
  return { g, body, legs, wings, head, tail, k, top: seat };
}
function animatePet(m, t, moving, speed) {
  const sw = moving ? Math.sin(t * (6 + speed * 0.5)) * 0.6 : 0;
  m.legs.forEach((l, i) => (l.rotation.x = (i === 0 || i === 3 ? sw : -sw)));
  m.body.position.y = moving ? Math.abs(Math.sin(t * (6 + speed * 0.5))) * 0.12 * m.k : Math.sin(t * 2) * 0.02;
  for (const [i, w] of m.wings.entries()) w.rotation.z = (i ? -1 : 1) * (0.2 + Math.sin(t * (moving ? 12 : 3)) * 0.4);
  m.tail.rotation.y = Math.sin(t * 5) * 0.4;
}
// pet portraits for the menus, drawn once per species
const portraitR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); portraitR.setSize(168, 168);
const pScene = new THREE.Scene(); pScene.add(new THREE.HemisphereLight("#ffffff", "#9a8f80", 1.3)); const pl = new THREE.DirectionalLight("#ffffff", 1); pl.position.set(3, 5, 4); pScene.add(pl);
const pCam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
const PORTRAITS = {};
function portrait(sp) {
  if (PORTRAITS[sp]) return PORTRAITS[sp];
  const m = petModel(sp); m.g.rotation.y = 0.7; pScene.add(m.g);
  const k = SPECIES[sp].size; pCam.position.set(0, 2.2 * k, 5.4 * k); pCam.lookAt(0, 0.95 * k, 0);
  portraitR.render(pScene, pCam); pScene.remove(m.g);
  return (PORTRAITS[sp] = portraitR.domElement.toDataURL());
}

// ---- me ----
const me = { x: SPAWN.x + (Math.random() - 0.5) * 8, z: SPAWN.z + Math.random() * 3, yaw: Math.PI, moving: false, boostUntil: 0, bag: [] };
let mine = null;
function mount() { if (mine) scene.remove(mine.g); mine = petModel(riding().sp, save.shirt); mine.g.traverse((o) => (o.castShadow = true)); scene.add(mine.g); }
mount();
// a gold arrow over my pet pointing to the nearest house I have a parcel for (or the post office when the bag's empty)
const arrow = new THREE.Group(); { const c = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 10), mat("#f2b01e")); c.rotation.x = Math.PI / 2; c.position.z = 0.8; arrow.add(c); box(0.3, 0.3, 1.1, "#f2b01e", 0, 0, 0, arrow, false); } scene.add(arrow);
// a beam over each house I have a parcel for
const BEAMG = new THREE.CylinderGeometry(1.1, 1.1, 30, 16, 1, true), beamM = new THREE.MeshBasicMaterial({ color: "#ffd35a", transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide });
const beams = new Map();
function syncBeams() {
  const want = new Set(me.bag);
  for (const [i, b] of beams) if (!want.has(i)) { scene.remove(b); beams.delete(i); }
  for (const i of want) if (!beams.has(i)) { const h = houses[i], g = new THREE.Group(); const m = new THREE.Mesh(BEAMG, beamM); m.position.y = 15; g.add(m); const p = box(0.9, 0.7, 0.9, "#c98b4f", 0, 3, 0, g, false); g.userData.parcel = p; g.position.set(h.mx, 0, h.mz); scene.add(g); beams.set(i, g); }
}

// ---- the camera: behind and above me; drag to turn it, pinch (or the wheel) to zoom ----
const cam = { yaw: 0, pitch: 0.5, dist: 14, goalDist: 14 };
// (owner, 2026-11-08) a house between the camera and me is hidden while it's in the way
const hiddenH = new Set();
function placeCamera(dt) {
  cam.dist += (cam.goalDist - cam.dist) * Math.min(1, dt * 8);
  const cx = me.x + Math.sin(cam.yaw) * cam.dist * Math.cos(cam.pitch), cz = me.z + Math.cos(cam.yaw) * cam.dist * Math.cos(cam.pitch), cy = 1.5 + cam.dist * Math.sin(cam.pitch);
  camera.position.set(cx, cy, cz); camera.lookAt(me.x, 1.8, me.z);
  sun.position.set(me.x + 30, 50, me.z + 20); sun.target.position.set(me.x, 0, me.z);
  const hide = new Set();
  for (let k = 1; k <= 20; k++) {
    const t = k / 20, x = me.x + (cx - me.x) * t, z = me.z + (cz - me.z) * t, y = 1.5 + (cy - 1.5) * t;
    if (y > 9.5) break;
    houses.forEach((h, i) => { if (Math.abs(x - h.x) < 5.6 && Math.abs(z - h.z) < 5.6) hide.add(i); });
  }
  if (hide.size === hiddenH.size && [...hide].every((i) => hiddenH.has(i))) return;
  for (const i of new Set([...hide, ...hiddenH])) setHouse(i, !hide.has(i));
  hiddenH.clear(); for (const i of hide) hiddenH.add(i);
}
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();

// ---- controls: a thumb joystick on the left of the screen (where you put your thumb down), drag elsewhere to turn
// the camera, two fingers to zoom; keys WASD / arrows, mouse drag and the wheel on a computer ----
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, drags = new Map(), keys = new Set();
const joyEl = $("joy"), knob = joyEl.firstElementChild;
canvas.addEventListener("pointerdown", (e) => {
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not a live pointer */ }
  if (e.pointerType !== "mouse" && joy.id === null && e.clientX < innerWidth * 0.5 && drags.size === 0) { Object.assign(joy, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 }); joyEl.style.display = "block"; joyEl.style.left = e.clientX + "px"; joyEl.style.top = e.clientY + "px"; knob.style.transform = ""; return; }
  drags.set(e.pointerId, { x: e.clientX, y: e.clientY });
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerId === joy.id) { let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const l = hyp(dx, dy), m = 48; if (l > m) { dx *= m / l; dy *= m / l; } joy.x = dx / m; joy.y = dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`; return; }
  const d = drags.get(e.pointerId); if (!d) return;
  if (drags.size >= 2) {   // pinch
    const [a, b] = [...drags.values()], before = hyp(a.x - b.x, a.y - b.y); d.x = e.clientX; d.y = e.clientY; const after = hyp(a.x - b.x, a.y - b.y);
    if (before > 0) cam.goalDist = clamp(cam.goalDist * before / after, 7, 34); return;
  }
  cam.yaw -= (e.clientX - d.x) * 0.006; cam.pitch = clamp(cam.pitch + (e.clientY - d.y) * 0.004, 0.18, 1.2); d.x = e.clientX; d.y = e.clientY;
});
const up = (e) => { if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; joyEl.style.display = "none"; } drags.delete(e.pointerId); };
canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
canvas.addEventListener("wheel", (e) => { e.preventDefault(); cam.goalDist = clamp(cam.goalDist * Math.exp(e.deltaY * 0.001), 7, 34); }, { passive: false });
addEventListener("keydown", (e) => { keys.add(e.code); if (e.code === "Escape") closePanels(); });
addEventListener("keyup", (e) => keys.delete(e.code));
addEventListener("blur", () => keys.clear());
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// ---- the HUD and panels ----
const fmt = (n) => Math.floor(n).toLocaleString();
function toast(txt, color) { const d = document.createElement("div"); d.textContent = txt; if (color) d.style.color = color; $("toast").appendChild(d); setTimeout(() => d.remove(), 1700); }
let hudKey = "";
function hud() {
  const p = riding(), cap = petBag(p), c = contract, left = c ? Math.max(0, Math.ceil((c.ends - performance.now()) / 1000)) : 0;
  const key = [Math.floor(save.coins), me.bag.length, cap, online, netOk, save.items.snack, save.items.ribbon, save.items.ticket, me.boostUntil > performance.now(), c && [c.done, c.goal, c.mine, left]].join("|");
  if (key === hudKey) return; hudKey = key;
  $("coins").textContent = fmt(save.coins); $("bagn").textContent = me.bag.length + "/" + cap; $("who").textContent = save.name;
  $("onlinen").textContent = online; $("net").classList.toggle("on", netOk);
  $("contract").style.display = c ? "flex" : "none";
  if (c) { $("ctime").textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0"); $("cbar").style.width = Math.min(100, (c.done / c.goal) * 100) + "%"; $("cdone").textContent = c.done + " / " + c.goal; $("cmine").textContent = "You: " + c.mine; }
  const items = $("items"); items.innerHTML = "";
  if (save.items.snack > 0) { const b = document.createElement("button"); b.className = "btn gold"; b.type = "button"; b.innerHTML = `<svg class="ico" viewBox="0 0 24 24"><path d="M4 14c0-5 4-9 8-9s8 4 8 9c0 3-3 5-8 5s-8-2-8-5z" fill="#ff8a3d" stroke="#7a3a10" stroke-width="2"/><path d="M8 11h8" stroke="#7a3a10" stroke-width="2"/></svg><span class="n">${save.items.snack}</span>`; b.title = ITEMS.snack.name; b.disabled = me.boostUntil > performance.now(); b.onclick = useSnack; items.appendChild(b); }
}
const panels = ["p-pets", "p-shop", "p-train", "p-board"];
let openPanel = null, dismissed = null;
function show(id) { for (const p of panels) $(p).style.display = p === id ? "block" : "none"; openPanel = id; if (id === "p-pets") renderPets(); if (id === "p-shop") renderShop(); if (id === "p-train") renderTrain(); if (id === "p-board") renderBoard(); }
function closePanels() { if (openPanel && openPanel !== "p-pets") dismissed = openPanel; for (const p of panels) $(p).style.display = "none"; openPanel = null; }
for (const p of panels) $(p).querySelector(".x").onclick = closePanels;
$("btn-pets").onclick = () => (openPanel === "p-pets" ? closePanels() : show("p-pets"));
function card(sp, lines, on, onclick) {
  const s = SPECIES[sp], d = document.createElement("div"); d.className = "card" + (on ? " on" : "");
  d.innerHTML = `<img alt="" src="${portrait(sp)}" width="84" height="84"><span class="nm">${s.name}</span><span class="rar" style="color:${RARITY[s.r].c}">${RARITY[s.r].name}</span>${lines}`;
  if (onclick) d.onclick = onclick; return d;
}
const statLine = (p) => `<span class="stats"><span>Lv ${p.lv}</span><span>${petSpeed(p).toFixed(1)} m/s</span><span>${petBag(p)} bag</span></span>`;
function renderPets() {
  const el = $("petlist"); el.innerHTML = "";
  for (const p of save.pets.slice().sort((a, b) => SPECIES[b.sp].r - SPECIES[a.sp].r || petSpeed(b) - petSpeed(a))) el.appendChild(card(p.sp, statLine(p), p.id === save.ride, () => ride(p.id)));
}
function ride(id) { if (save.ride === id) return; save.ride = id; persist(); mount(); netSend({ t: "pet", sp: riding().sp }); renderPets(); hudKey = ""; }
function renderShop() {
  const el = $("eggs"); el.innerHTML = "";
  for (const egg of EGGS) {
    const d = document.createElement("div"); d.className = "card";
    d.innerHTML = `<svg width="84" height="84" viewBox="0 0 84 84"><ellipse cx="42" cy="46" rx="24" ry="31" fill="${egg.c}" stroke="${egg.s}" stroke-width="4"/><circle cx="34" cy="38" r="4" fill="${egg.s}"/><circle cx="50" cy="52" r="5" fill="${egg.s}"/></svg><span class="nm">${egg.name}</span>`
      + `<span class="stats">${egg.odds.map((o, r) => (o ? `<span style="color:${RARITY[r].c}">${o}%</span>` : "")).join("")}</span>`;
    const b = document.createElement("button"); b.className = "btn gold"; b.type = "button"; b.innerHTML = `<span class="coin" style="display:inline-block;vertical-align:-3px"></span> ${fmt(egg.price)}`; b.disabled = save.coins < egg.price; b.onclick = (ev) => { ev.stopPropagation(); buyEgg(egg, false); }; d.appendChild(b);
    if (egg.id === "basic" && save.items.ticket > 0) { const t = document.createElement("button"); t.className = "btn"; t.type = "button"; t.textContent = ITEMS.ticket.name + " ×" + save.items.ticket; t.onclick = (ev) => { ev.stopPropagation(); buyEgg(egg, true); }; d.appendChild(t); }
    el.appendChild(d);
  }
}
function buyEgg(egg, ticket) {
  if (ticket ? save.items.ticket <= 0 : save.coins < egg.price) return;
  if (ticket) save.items.ticket--; else save.coins -= egg.price;
  let roll = Math.random() * 100, r = 0; while (r < 3 && roll >= egg.odds[r]) { roll -= egg.odds[r]; r++; }
  const sp = pick(Object.keys(SPECIES).filter((k) => SPECIES[k].r === r)), p = { id: save.nextId++, sp, lv: 1 };
  save.pets.push(p); persist(); hatch(p, egg);
}
function hatch(p, egg) {
  const s = SPECIES[p.sp]; $("hatchn").textContent = s.name; $("hatchr").textContent = RARITY[s.r].name; $("hatchr").style.color = RARITY[s.r].c;
  const c = $("hatchc"), g = c.getContext("2d"), img = new Image(); img.src = portrait(p.sp);
  $("hatch").style.display = "flex"; let t0 = performance.now();
  const anim = () => {   // the egg wobbles, then cracks open to the pet
    const t = (performance.now() - t0) / 1000; g.clearRect(0, 0, 440, 440);
    if (t < 1.4) { g.save(); g.translate(220, 260); g.rotate(Math.sin(t * 22) * 0.18 * Math.min(1, t)); g.fillStyle = egg.c; g.strokeStyle = egg.s; g.lineWidth = 10; g.beginPath(); g.ellipse(0, 0, 110, 145, 0, 0, TAU); g.fill(); g.stroke(); g.restore(); $("hatchn").style.visibility = "hidden"; $("hatchr").style.visibility = "hidden"; requestAnimationFrame(anim); }
    else { const k = Math.min(1, (t - 1.4) * 3); g.globalAlpha = k; g.drawImage(img, 220 - 200 * k, 220 - 200 * k, 400 * k, 400 * k); g.globalAlpha = 1; $("hatchn").style.visibility = "visible"; $("hatchr").style.visibility = "visible"; if (k < 1) requestAnimationFrame(anim); }
  };
  anim();
  $("hatchok").onclick = () => { $("hatch").style.display = "none"; ride(p.id); if (openPanel === "p-shop") renderShop(); };
}
function renderTrain() {
  const p = riding(), el = $("train"), cost = trainCost(p), max = p.lv >= MAXLV;
  el.innerHTML = ""; el.appendChild(card(p.sp, statLine(p), true));
  const row = document.createElement("div"); row.className = "row2";
  const b = document.createElement("button"); b.className = "btn green"; b.type = "button"; b.style.flex = "1";
  b.innerHTML = max ? "Lv " + MAXLV : `Train <span class="coin" style="display:inline-block;vertical-align:-3px"></span> ${fmt(cost)}`; b.disabled = max || save.coins < cost; b.onclick = () => train(false); row.appendChild(b);
  if (save.items.ribbon > 0 && !max) { const r = document.createElement("button"); r.className = "btn"; r.type = "button"; r.textContent = ITEMS.ribbon.name + " ×" + save.items.ribbon; r.onclick = () => train(true); row.appendChild(r); }
  el.appendChild(row);
}
function train(ribbon) {
  const p = riding(); if (p.lv >= MAXLV) return;
  if (ribbon) { if (save.items.ribbon <= 0) return; save.items.ribbon--; } else { const c = trainCost(p); if (save.coins < c) return; save.coins -= c; }
  p.lv++; persist(); toast(SPECIES[p.sp].name + " Lv " + p.lv, "#3fb36b"); renderTrain();
}
function useSnack() { if (save.items.snack <= 0 || me.boostUntil > performance.now()) return; save.items.snack--; persist(); me.boostUntil = performance.now() + SNACK_TIME * 1000; toast(ITEMS.snack.name, ITEMS.snack.c); hudKey = ""; }

// ---- contracts (co-op): a big order the whole room works on: deliver the goal in parcels before the time's up; the
// reward is split by how many each player delivered. Online the server runs it; offline you run it alone. ----
let contract = null;   // { goal, done, mine, ends, pool }
const CONTRACT_TIME = 180, contractGoal = (n) => 10 + 8 * n, contractPool = (goal) => goal * 30;
function renderBoard() {
  const el = $("board"); el.innerHTML = "";
  const n = netOk ? online : 1, goal = contract ? contract.goal : contractGoal(n), pool = contract ? contract.pool : contractPool(goal);
  const d = document.createElement("div"); d.className = "card"; d.style.cursor = "default";
  d.innerHTML = `<svg width="84" height="84" viewBox="0 0 84 84"><rect x="14" y="22" width="56" height="44" rx="6" fill="#c98b4f" stroke="#8a5a2b" stroke-width="4"/><path d="M14 36h56M42 22v44" stroke="#8a5a2b" stroke-width="4"/></svg><span class="nm">Big Contract</span>`
    + `<span class="stats"><span>${contract ? contract.done + " / " : ""}${goal}</span><span>${Math.floor(CONTRACT_TIME / 60)}:00</span><span><span class="coin" style="display:inline-block;width:12px;height:12px;vertical-align:-2px"></span> ${fmt(pool)}</span></span>`;
  el.appendChild(d);
  if (!contract) { const b = document.createElement("button"); b.className = "btn gold"; b.type = "button"; b.style.width = "100%"; b.style.marginTop = "10px"; b.textContent = "Start"; b.onclick = startContract; el.appendChild(b); }
}
function startContract() {
  if (contract) return;
  if (netOk) netSend({ t: "start" });
  else { const goal = contractGoal(1); contract = { goal, done: 0, mine: 0, ends: performance.now() + CONTRACT_TIME * 1000, pool: contractPool(goal), local: true }; }
  renderBoard(); hudKey = "";
}
function contractStep() {
  if (!contract || !contract.local) return;
  if (contract.done >= contract.goal) { pay(contract.pool, true); contract = null; hudKey = ""; if (openPanel === "p-board") renderBoard(); }
  else if (performance.now() > contract.ends) { toast("Contract failed", "#e5534b"); contract = null; hudKey = ""; if (openPanel === "p-board") renderBoard(); }
}
function pay(n, won) { save.coins += n; persist(); toast((won ? "Contract done! +" : "+") + fmt(n), "#e08a00"); }

// ---- delivering: the post office fills my bag with parcels for houses around town; riding up to a house's mailbox
// delivers its parcel: coins (more the further from the post office) and sometimes an item ----
function fillBag() {
  const cap = petBag(riding()), before = me.bag.length; if (before >= cap) return;
  const taken = new Set(me.bag);
  while (me.bag.length < cap) { const i = Math.floor(Math.random() * houses.length); if (!taken.has(i)) { taken.add(i); me.bag.push(i); } }
  toast("+" + (cap - before)); syncBeams(); hudKey = "";
}
function deliver(i) {
  const h = houses[i]; me.bag.splice(me.bag.indexOf(i), 1); syncBeams();
  const coins = 8 + Math.round(h.d / 10); save.coins += coins; save.delivered++;
  toast("+" + coins, "#e08a00");
  const r = Math.random();
  const item = r < 0.01 ? "ticket" : r < 0.05 ? "ribbon" : r < 0.17 ? "snack" : null;
  if (item) { save.items[item]++; toast(ITEMS[item].name, ITEMS[item].c); }
  persist(); hudKey = "";
  if (contract) { if (contract.local) { contract.done++; contract.mine++; } else netSend({ t: "del" }); }
}

// ---- co-op: everyone in a room sees the others riding; the server shares where everyone is and runs contracts ----
const WS_URL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? `ws://${location.host}/pets` : "wss://play.atamus.io/pets";
let ws = null, netOk = false, myId = null, online = 1, retry = 1000, lastSent = 0, lastPos = "";
const others = new Map();   // id -> { name, sp, x, z, yaw, tx, tz, tyaw, moving, m, tag }
function netSend(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function connect() {
  try { ws = new WebSocket(WS_URL); } catch (e) { setTimeout(connect, retry); return; }
  ws.onopen = () => { retry = 1000; netSend({ t: "hi", name: save.name, sp: riding().sp, shirt: save.shirt, x: me.x, z: me.z }); };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } onNet(m); };
  ws.onclose = () => { const was = netOk; netOk = false; myId = null; for (const id of [...others.keys()]) dropOther(id); online = 1; if (contract && !contract.local) contract = null; hudKey = ""; if (was) toast("Offline"); setTimeout(connect, retry); retry = Math.min(15000, retry * 2); };
  ws.onerror = () => {};
}
function nameTag(name) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 64; const g = c.getContext("2d");
  g.font = "800 30px system-ui, sans-serif"; const w = Math.min(250, g.measureText(name).width + 28);
  g.fillStyle = "rgba(255,255,255,.92)"; g.beginPath(); g.roundRect((256 - w) / 2, 10, w, 44, 22); g.fill(); g.fillStyle = "#23303b"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(name, 128, 33);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); s.scale.set(4, 1, 1); s.renderOrder = 5; return s;
}
function addOther(p) {
  if (p.id === myId) return; dropOther(p.id);
  const m = petModel(SPECIES[p.sp] ? p.sp : "pup", p.shirt || "#3a8ee6"), tag = nameTag(String(p.name || "Courier").slice(0, 18));
  tag.position.y = m.top + 1.2; m.g.add(tag); m.g.position.set(p.x, 0, p.z); scene.add(m.g);
  others.set(p.id, { name: p.name, sp: p.sp, shirt: p.shirt, x: p.x, z: p.z, yaw: p.yaw || 0, tx: p.x, tz: p.z, tyaw: p.yaw || 0, moving: false, m, tag });
}
function dropOther(id) { const o = others.get(id); if (!o) return; scene.remove(o.m.g); others.delete(id); }
function setContract(c) {
  const before = contract;
  contract = c ? { goal: c.goal, done: c.done, mine: c.mine || 0, ends: performance.now() + c.left * 1000, pool: c.pool } : null;
  if (!before && contract) toast("Contract started!", "#e08a00");
  hudKey = ""; if (openPanel === "p-board") renderBoard();
}
function onNet(m) {
  if (m.t === "welcome") { myId = m.id; netOk = true; for (const p of m.players) addOther(p); online = m.players.length + 1; setContract(m.contract); }
  else if (m.t === "join") { addOther(m.p); online++; hudKey = ""; }
  else if (m.t === "leave") { if (others.has(m.id)) online--; dropOther(m.id); hudKey = ""; }
  else if (m.t === "snap") { for (const [id, x, z, yaw, mv] of m.ps) { const o = others.get(id); if (o) { o.tx = x; o.tz = z; o.tyaw = yaw; o.moving = !!mv; } } }
  else if (m.t === "pet") { const o = others.get(m.id); if (o) { const p = { id: m.id, name: o.name, sp: m.sp, shirt: o.shirt, x: o.x, z: o.z, yaw: o.yaw }; addOther(p); } }
  else if (m.t === "contract") setContract(m.c);
  else if (m.t === "done") { if (m.won) { if (m.pay > 0) pay(m.pay, true); else toast("Contract done!", "#e08a00"); } else toast("Contract failed", "#e5534b"); }
}

// ---- the loop ----
let last = performance.now(), clock = 0, zone = null;
function step(dt) {
  clock += dt;
  // where the joystick (or keys) point, turned by the camera
  let jx = joy.x, jy = joy.y;
  if (keys.has("KeyW") || keys.has("ArrowUp")) jy -= 1; if (keys.has("KeyS") || keys.has("ArrowDown")) jy += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) jx -= 1; if (keys.has("KeyD") || keys.has("ArrowRight")) jx += 1;
  const l = hyp(jx, jy); if (l > 1) { jx /= l; jy /= l; }
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  const mx = fx * -jy + rx * jx, mz = fz * -jy + rz * jx, ml = hyp(mx, mz);
  const p = riding(), sp = petSpeed(p) * (me.boostUntil > performance.now() ? SNACK_BOOST : 1);
  me.moving = ml > 0.08;
  if (me.moving) {
    const v = sp * Math.min(1, ml) * dt, nx = clamp(me.x + (mx / ml) * v, -HALF, HALF), nz = clamp(me.z + (mz / ml) * v, -HALF, HALF);
    if (!blocked(nx, me.z)) me.x = nx; if (!blocked(me.x, nz)) me.z = nz;   // slide along walls
    const want = Math.atan2(mx, mz); let d = want - me.yaw; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; me.yaw += d * Math.min(1, dt * 12);
  }
  // the post office fills my bag; a mailbox I have a parcel for takes it
  if (hyp(me.x - PICKUP.x, me.z - PICKUP.z) < PICKUP.r) fillBag();
  for (const i of me.bag) { const h = houses[i]; if (hyp(me.x - h.mx, me.z - h.mz) < 3.6) { deliver(i); break; } }
  // the egg shop, the training yard and the board open their panel when I ride in
  const z = hyp(me.x - SHOP.x, me.z - SHOP.z) < SHOP.r ? "p-shop" : hyp(me.x - TRAIN.x, me.z - TRAIN.z) < TRAIN.r ? "p-train" : hyp(me.x - BOARD.x, me.z - BOARD.z) < BOARD.r ? "p-board" : null;
  if (z !== zone) { if (zone && openPanel === zone) closePanels(); zone = z; dismissed = null; if (z) show(z); }
  contractStep();
  // send where I am, 10 times a second when it changes
  if (netOk && clock - lastSent > 0.1) { const s = [me.x.toFixed(2), me.z.toFixed(2), me.yaw.toFixed(2), me.moving ? 1 : 0].join(); if (s !== lastPos) { netSend({ t: "pos", x: +me.x.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(2), mv: me.moving ? 1 : 0 }); lastPos = s; } lastSent = clock; }
}
function draw(dt) {
  mine.g.position.set(me.x, 0, me.z); mine.g.rotation.y = me.yaw; animatePet(mine, clock, me.moving, petSpeed(riding()));
  for (const o of others.values()) {
    const k = Math.min(1, dt * 10); o.x += (o.tx - o.x) * k; o.z += (o.tz - o.z) * k;
    let d = o.tyaw - o.yaw; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; o.yaw += d * k;
    o.m.g.position.set(o.x, 0, o.z); o.m.g.rotation.y = o.yaw; animatePet(o.m, clock + o.x * 0.1, o.moving, 10);
  }
  // the arrow: to the nearest house in my bag, else back to the post office
  let tx = PICKUP.x, tz = PICKUP.z, best = 1e9;
  for (const i of me.bag) { const h = houses[i], d = hyp(h.mx - me.x, h.mz - me.z); if (d < best) { best = d; tx = h.mx; tz = h.mz; } }
  const far = hyp(tx - me.x, tz - me.z) > 6; arrow.visible = far;
  arrow.position.set(me.x, mine.top + 1.4 + Math.sin(clock * 3) * 0.15, me.z); arrow.rotation.y = Math.atan2(tx - me.x, tz - me.z);
  for (const b of beams.values()) { b.userData.parcel.rotation.y = clock * 2; b.userData.parcel.position.y = 3 + Math.sin(clock * 3) * 0.3; }
  pickRing.material.opacity = 0.55 + Math.sin(clock * 4) * 0.3; bigEgg.rotation.y = clock * 0.6;
  placeCamera(dt);
  renderer.render(scene, camera);
}
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05); last = now;
  step(dt); draw(dt); hud();
  requestAnimationFrame(frame);
}
syncBeams(); hud(); requestAnimationFrame(frame); connect();

// for tests
window.Pets = { get save() { return save; }, me, houses, get contract() { return contract; }, get online() { return online; }, get netOk() { return netOk; }, get others() { return others; }, step, deliver, fillBag, buyEgg, train, startContract, EGGS, SPECIES, PICKUP, SHOP, TRAIN, BOARD, cam, teleport: (x, z) => { me.x = x; me.z = z; } };
