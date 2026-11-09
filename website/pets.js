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
// speed in m/s, bag in parcels, fly: flies over everything (owner, 2026-11-08); body: how it's built; ears: what's on
// its head; c / a: its colors
const SPECIES = {
  pup: { name: "Pup", r: 0, speed: 7, bag: 2, c: "#c98b4f", a: "#7a4f28", body: "quad", ears: "flop", size: 1 },
  kitten: { name: "Kitten", r: 0, speed: 7.5, bag: 2, c: "#f2a65a", a: "#fff1e0", body: "quad", ears: "point", size: 0.9 },
  bunny: { name: "Bunny", r: 0, speed: 8, bag: 2, c: "#f4f1ee", a: "#f3a7b5", body: "quad", ears: "long", size: 0.9 },
  duck: { name: "Duck", r: 0, speed: 6.5, bag: 3, c: "#ffd84a", a: "#f08a24", body: "bird", size: 0.9 },
  fox: { name: "Fox", r: 1, speed: 9.5, bag: 3, c: "#e8722c", a: "#fff4ea", body: "quad", ears: "point", size: 1 },
  penguin: { name: "Penguin", r: 1, speed: 8.5, bag: 4, c: "#2b3440", a: "#f4f4f4", body: "bird", size: 1 },
  goat: { name: "Goat", r: 1, speed: 9, bag: 4, c: "#e6e1d6", a: "#9b8f7a", body: "quad", ears: "horns", size: 1.05 },
  butterfly: { name: "Butterfly", r: 1, speed: 9, bag: 2, fly: true, c: "#3a8ee6", a: "#ffd84a", c2: "#e5534b", body: "butterfly", size: 1.1 },
  parrot: { name: "Parrot", r: 1, speed: 9.5, bag: 3, fly: true, c: "#3fb36b", a: "#e5534b", body: "bird", wings: true, size: 1 },
  stego: { name: "Stegosaurus", r: 1, speed: 8.5, bag: 5, c: "#7fae5a", a: "#e08a3a", body: "quad", plates: true, tail: "long", size: 1.25 },
  deer: { name: "Deer", r: 2, speed: 11.5, bag: 3, c: "#b9824e", a: "#f3e3cc", body: "quad", ears: "antlers", size: 1.15 },
  bear: { name: "Bear", r: 2, speed: 10, bag: 6, c: "#6b4a32", a: "#c9a27e", body: "quad", ears: "round", size: 1.3 },
  horse: { name: "Horse", r: 2, speed: 12.5, bag: 4, c: "#8a5a3a", a: "#2b1d14", body: "quad", ears: "point", legs: 1.4, size: 1.2 },
  owl: { name: "Owl", r: 2, speed: 11, bag: 4, fly: true, c: "#9b7a55", a: "#f3e3cc", body: "bird", wings: true, ears: "tufts", size: 1.15 },
  trike: { name: "Triceratops", r: 2, speed: 11, bag: 6, c: "#5a8fb0", a: "#f3e3cc", body: "quad", frill: true, tail: "long", size: 1.3 },
  raptor: { name: "Raptor", r: 2, speed: 13, bag: 3, c: "#8aa04a", a: "#5a6a2a", body: "biped", tail: "long", size: 1.05 },
  dragon: { name: "Dragon", r: 3, speed: 15, bag: 5, fly: true, c: "#3fb36b", a: "#ffd84a", body: "quad", wings: "big", ears: "horns", tail: "long", size: 1.35 },
  unicorn: { name: "Unicorn", r: 3, speed: 16, bag: 4, c: "#fbf7ff", a: "#ff7ac8", body: "quad", ears: "horn", legs: 1.4, size: 1.25 },
  pegasus: { name: "Pegasus", r: 3, speed: 15.5, bag: 4, fly: true, c: "#f4f6ff", a: "#9ad0ff", body: "quad", wings: "big", ears: "point", legs: 1.4, size: 1.25 },
  phoenix: { name: "Phoenix", r: 3, speed: 17, bag: 3, fly: true, c: "#ff6a2a", a: "#ffd84a", body: "bird", wings: "big", tail: "fire", size: 1.25 },
  trex: { name: "T-Rex", r: 3, speed: 14.5, bag: 7, c: "#4f7a3a", a: "#e5d9a8", body: "biped", tail: "long", big: true, size: 1.4 },
  ptero: { name: "Pterodactyl", r: 3, speed: 15, bag: 5, fly: true, c: "#b07a5a", a: "#e8c9a0", body: "bird", wings: "big", ears: "crest", size: 1.25 },
  icedragon: { name: "Ice Dragon", r: 3, speed: 16, bag: 5, fly: true, c: "#bfe6ff", a: "#3a8ee6", body: "quad", wings: "big", ears: "horns", tail: "long", size: 1.35 },
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
const SNACK_TIME = 30, SNACK_BOOST = 1.5;

// ---- the save (this browser) ----
const SAVE = "petdelivery.v1";
const N1 = ["Swift", "Sunny", "Brave", "Zippy", "Lucky", "Happy", "Mighty", "Cozy", "Speedy", "Jolly", "Rapid", "Breezy"];
const N2 = ["Otter", "Robin", "Badger", "Panda", "Comet", "Pebble", "Maple", "Biscuit", "Rocket", "Clover", "Sparrow", "Mochi"];
function fresh() { return { coins: 0, pets: [{ id: 1, sp: "pup", lv: 1 }], ride: 1, items: { snack: 0, ribbon: 0, ticket: 0 }, name: pick(N1) + " " + pick(N2), delivered: 0, nextId: 2, shirt: pick(["#3a8ee6", "#e5534b", "#3fb36b", "#a352e0", "#f2b01e", "#2bb3c0"]) }; }
function load() { try { const s = JSON.parse(localStorage.getItem(SAVE)); if (s && Array.isArray(s.pets) && s.pets.length) { const f = Object.assign(fresh(), s); f.pets = f.pets.filter((p) => SPECIES[p.sp]); if (!f.pets.length) f.pets = fresh().pets; return f; } } catch (e) { /* none yet */ } return fresh(); }
let save = load();
const persist = () => { try { localStorage.setItem(SAVE, JSON.stringify(save)); } catch (e) { /* private mode */ } };
const riding = () => save.pets.find((p) => p.id === save.ride) || save.pets[0];
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
const camera = new THREE.PerspectiveCamera(55, 1, 0.3, 1000);
scene.add(new THREE.HemisphereLight("#ffffff", "#7aa35a", 1.1));
const sun = new THREE.DirectionalLight("#fff6e0", 1.6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 }); scene.add(sun, sun.target);
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
  const n = g.attributes.normal, cols = new Float32Array(n.count * 3), grass = new THREE.Color("#86c95f"), high = new THREE.Color("#a6d46a"), rock = new THREE.Color("#9a8a76"), c = new THREE.Color();
  for (let i = 0; i < n.count; i++) { const y = pos[i * 3 + 1], ny = n.getY(i); c.copy(grass).lerp(high, clamp(y / 40, 0, 1)); if (ny < 0.8) c.lerp(rock, clamp((0.8 - ny) / 0.15, 0, 1)); cols.set([c.r, c.g, c.b], i * 3); }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })); m.receiveShadow = true; scene.add(m);
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
const roadM = new THREE.MeshLambertMaterial({ map: roadTex, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
ROADS.forEach((R, k) => {
  const P = R.loop ? [...R.pts, R.pts[0]] : R.pts, S = R.loop ? [...R.S, R.len] : R.S, pos = [], uv = [], idx = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], fx = b[0] - a[0], fz = b[1] - a[1], fl = hyp(fx, fz) || 1, rx = -fz / fl, rz = fx / fl;
    for (const sd of [-1, 1]) { const x = P[i][0] + rx * ROAD_HALF * sd, z = P[i][1] + rz * ROAD_HALF * sd; pos.push(x, Math.max(terrain(x, z), terrain(P[i][0], P[i][1])) + 0.18 + k * 0.01, z); uv.push(sd < 0 ? 0 : 1, S[i] / 8); }
    if (i) { const q = (i - 1) * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, roadM); m.receiveShadow = true; scene.add(m);
});
// houses as instances: walls (reaching down into the slope), roofs, doors, mailboxes; each faces its road
const dummy = new THREE.Object3D();
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
const clouds = [];
for (let k = 0; k < 26; k++) { const g = new THREE.Group(); for (let j = 0; j < 4; j++) { const s = new THREE.Mesh(new THREE.SphereGeometry(4 + srnd() * 4, 8, 6), mat("#ffffff")); s.position.set(j * 5 - 8, srnd() * 2, srnd() * 4); g.add(s); } const below = k % 2; g.position.set(-380 + srnd() * 760, below ? -40 - srnd() * 60 : 60 + srnd() * 25, -380 + srnd() * 760); scene.add(g); clouds.push(g); }
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

// ---- a pet (built from boxes; it faces +z) with its rider ----
function petModel(sp, rider) {
  const s = SPECIES[sp], k = s.size, g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const B = s.body;
  const legs = [], wings = [], tails = [];
  let legH, bh, bl, bw;
  if (B === "biped") { legH = 0.95 * k; bh = 0.95 * k; bl = 1.5 * k; bw = 0.85 * k; }
  else if (B === "bird") { legH = 0.45 * k; bh = 0.85 * k; bl = 1.15 * k; bw = 0.85 * k; }
  else if (B === "butterfly") { legH = 0.6 * k; bh = 0.38 * k; bl = 1.5 * k; bw = 0.4 * k; }
  else { legH = 0.6 * k * (s.legs || 1); bh = 0.7 * k; bl = 1.5 * k; bw = 0.9 * k; }
  const top = legH + bh;
  // legs
  if (B === "quad") for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = new THREE.Group(); l.position.set(lx * bw * 0.32, legH, lz * bl * 0.32); box(0.24 * k, legH, 0.24 * k, s.c, 0, -legH / 2, 0, l); body.add(l); legs.push(l); }
  if (B === "biped" || B === "bird") for (const lx of [-1, 1]) { const l = new THREE.Group(); l.position.set(lx * bw * 0.28, legH, B === "biped" ? -bl * 0.1 : 0); box((B === "biped" ? 0.34 : 0.14) * k, legH, (B === "biped" ? 0.4 : 0.14) * k, B === "bird" ? "#f08a24" : s.c, 0, -legH / 2, 0, l); box(0.3 * k, 0.1 * k, 0.4 * k, B === "bird" ? "#f08a24" : s.a, 0, -legH + 0.05, 0.1 * k, l); body.add(l); legs.push(l); }
  // body and belly
  box(bw, bh, bl, s.c, 0, legH + bh / 2, 0, body);
  if (B !== "butterfly") box(bw * 0.72, bh * 0.4, bl * 0.62, s.a, 0, legH + 0.08 * k, 0, body);
  // head
  const head = new THREE.Group(); body.add(head);
  let hs = 0.75 * k;
  if (B === "biped") { hs = (s.big ? 1.15 : 0.8) * k; head.position.set(0, top + hs * 0.35, bl / 2 + hs * 0.35); }
  else if (B === "bird") { hs = 0.7 * k; head.position.set(0, top + hs * 0.35, bl * 0.35); }
  else if (B === "butterfly") { hs = 0.45 * k; head.position.set(0, legH + bh / 2, bl / 2 + hs * 0.4); }
  else head.position.set(0, top + 0.1 * k, bl / 2 + 0.15 * k);
  box(hs, hs, B === "biped" ? hs * 1.3 : hs, s.c, 0, 0, 0, head);
  if (B === "bird") box(hs * 0.4, hs * 0.25, 0.4 * k, s.ears === "crest" ? s.a : "#f2a33a", 0, -hs * 0.1, hs / 2 + 0.15 * k, head);   // beak
  else if (B === "biped") { box(hs * 0.9, hs * 0.25, hs * 0.9, s.a, 0, -hs * 0.35, hs * 0.25, head); for (let t = -1; t <= 1; t += 0.5) box(0.06 * k, 0.12 * k, 0.06 * k, "#ffffff", t * hs * 0.35, -hs * 0.2, hs * 0.65, head); }
  else if (B !== "butterfly") box(hs * 0.5, hs * 0.35, 0.2 * k, s.a, 0, -hs * 0.15, hs / 2 + 0.05, head);   // snout
  const eyeR = s.ears === "tufts" ? 0.2 : 0.12;
  for (const ex of [-1, 1]) { if (s.ears === "tufts") box(eyeR * 1.6 * k, eyeR * 1.6 * k, 0.04, "#ffffff", ex * hs * 0.24, hs * 0.12, hs / 2 + 0.01, head); box(eyeR * k, eyeR * k, 0.05, "#1d232a", ex * hs * 0.24, hs * 0.12, hs / 2 + 0.03, head); }
  const e = s.ears, ear = (x, y, z, w, h, d, c) => box(w, h, d, c || s.c, x, y, z, head);
  if (e === "flop") { ear(-hs * 0.55, 0, 0, 0.15 * k, hs * 0.8, hs * 0.4, s.a); ear(hs * 0.55, 0, 0, 0.15 * k, hs * 0.8, hs * 0.4, s.a); }
  else if (e === "point") { ear(-hs * 0.3, hs * 0.6, 0, 0.22 * k, 0.35 * k, 0.12 * k); ear(hs * 0.3, hs * 0.6, 0, 0.22 * k, 0.35 * k, 0.12 * k); }
  else if (e === "long") { ear(-hs * 0.22, hs * 0.95, 0, 0.18 * k, 0.9 * k, 0.12 * k); ear(hs * 0.22, hs * 0.95, 0, 0.18 * k, 0.9 * k, 0.12 * k); }
  else if (e === "horns") { ear(-hs * 0.3, hs * 0.65, -0.1, 0.12 * k, 0.45 * k, 0.12 * k, s.a); ear(hs * 0.3, hs * 0.65, -0.1, 0.12 * k, 0.45 * k, 0.12 * k, s.a); }
  else if (e === "antlers") { for (const x of [-1, 1]) { ear(x * hs * 0.3, hs * 0.8, 0, 0.1 * k, 0.7 * k, 0.1 * k, s.a); ear(x * hs * 0.45, hs * 1.05, 0, 0.35 * k, 0.1 * k, 0.1 * k, s.a); } }
  else if (e === "round") { ear(-hs * 0.4, hs * 0.55, 0, 0.25 * k, 0.25 * k, 0.15 * k); ear(hs * 0.4, hs * 0.55, 0, 0.25 * k, 0.25 * k, 0.15 * k); }
  else if (e === "tufts") { ear(-hs * 0.35, hs * 0.6, 0, 0.16 * k, 0.3 * k, 0.12 * k); ear(hs * 0.35, hs * 0.6, 0, 0.16 * k, 0.3 * k, 0.12 * k); }
  else if (e === "crest") ear(0, hs * 0.35, -hs * 0.6, 0.12 * k, 0.3 * k, 0.9 * k, s.a);
  else if (e === "horn") { const h = new THREE.Mesh(new THREE.ConeGeometry(0.12 * k, 0.7 * k, 8), mat(s.a)); h.position.set(0, hs * 0.75, hs * 0.25); h.rotation.x = 0.4; head.add(h); }
  if (B === "butterfly") for (const x of [-1, 1]) { const a = box(0.04 * k, 0.6 * k, 0.04 * k, "#1d232a", x * hs * 0.2, hs * 0.6, hs * 0.1, head); a.rotation.z = -x * 0.4; }
  if (s.frill) { box(hs * 1.7, hs * 1.3, 0.12 * k, s.a, 0, hs * 0.45, -hs * 0.5, head); for (const [x, y] of [[-0.3, 0.55], [0.3, 0.55], [0, -0.05]]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.1 * k, 0.6 * k, 8), mat("#f4f1e6")); h.position.set(x * hs, y * hs, hs * 0.55); h.rotation.x = 1.2; head.add(h); } }
  // back plates (stegosaurus)
  if (s.plates) for (let n = 0; n < 5; n++) { const p = box(0.08 * k, 0.5 * k, 0.45 * k, s.a, 0, top + 0.15 * k, (n - 2) * bl * 0.2, body); p.rotation.x = 0.3; }
  // little arms (T-rex, raptor)
  if (B === "biped") for (const x of [-1, 1]) box(0.14 * k, 0.4 * k, 0.14 * k, s.c, x * bw * 0.45, legH + bh * 0.4, bl * 0.4, body);
  // wings: feathered (birds), big (dragons, pegasus, phoenix, pterodactyl), a butterfly's four
  if (B === "butterfly") for (const x of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(x * bw / 2, legH + bh / 2, 0); body.add(w);
    box(1.7 * k, 0.05, 1.3 * k, s.c, x * 0.85 * k, 0, 0.35 * k, w); box(0.9 * k, 0.06, 0.6 * k, s.a, x * 1.05 * k, 0.01, 0.45 * k, w); box(1.2 * k, 0.05, 1.0 * k, s.c2, x * 0.6 * k, 0, -0.6 * k, w);
    wings.push(w);
  } else if (s.wings) for (const x of [-1, 1]) {
    const big = s.wings === "big", w = new THREE.Group(); w.position.set(x * bw / 2, top - 0.1, B === "bird" ? 0 : -0.1 * k); body.add(w);
    box((big ? 1.9 : 1.1) * k, 0.08, (big ? 1.2 : 0.7) * k, s.a, x * (big ? 0.95 : 0.55) * k, 0, 0, w); if (big) box(0.9 * k, 0.09, 0.5 * k, s.c, x * 1.5 * k, 0.01, -0.45 * k, w);
    wings.push(w);
  } else if (B === "bird") for (const x of [-1, 1]) { const w = new THREE.Group(); w.position.set(x * bw / 2, legH + bh * 0.6, 0); body.add(w); box(0.1 * k, bh * 0.6, bl * 0.6, s.c, x * 0.05, 0, 0, w); wings.push(w); }
  // tail
  if (s.tail === "long") { const t1 = new THREE.Group(); t1.position.set(0, legH + bh * 0.6, -bl / 2); body.add(t1); box(bw * 0.55, bh * 0.5, 0.9 * k, s.c, 0, 0, -0.4 * k, t1); const t2 = new THREE.Group(); t2.position.set(0, 0, -0.85 * k); t1.add(t2); box(bw * 0.3, bh * 0.3, 0.9 * k, s.c, 0, 0, -0.4 * k, t2); tails.push(t1, t2); }
  else if (s.tail === "fire") { for (const [x, c] of [[-0.2, "#ffd84a"], [0, "#e5534b"], [0.2, "#ffd84a"]]) { const t = new THREE.Group(); t.position.set(x * k, top - 0.2, -bl / 2); body.add(t); box(0.14 * k, 0.06, 1.3 * k, c, 0, 0, -0.6 * k, t); tails.push(t); } }
  else if (B !== "butterfly") { const t = new THREE.Group(); t.position.set(0, top - 0.15, -bl / 2); body.add(t); box(0.18 * k, 0.18 * k, 0.5 * k, s.a, 0, 0, -0.2 * k, t); tails.push(t); }
  let seat = top;
  if (rider) {   // the courier: a shirt, a cap and a mail bag
    const r = new THREE.Group(); r.position.set(0, B === "butterfly" ? legH + bh : top, -0.1 * k); body.add(r);
    box(0.55, 0.75, 0.35, rider, 0, 0.45, 0, r); box(0.45, 0.45, 0.45, "#f1c9a5", 0, 1.08, 0, r); box(0.5, 0.15, 0.55, "#3a6ea8", 0, 1.36, 0.05, r); box(0.5, 0.06, 0.3, "#3a6ea8", 0, 1.3, 0.32, r);
    box(0.25, 0.42, 0.5, "#a0703f", 0.38, 0.35, -0.02, r); seat = (B === "butterfly" ? legH + bh : top) + 1.6;
  }
  return { g, body, legs, wings, head, tails, k, top: seat, butterfly: B === "butterfly", fly: !!s.fly };
}
function animatePet(m, t, moving, speed, airborne) {
  const sw = moving && !airborne ? Math.sin(t * (6 + speed * 0.5)) * 0.6 : 0;
  m.legs.forEach((l, i) => (l.rotation.x = airborne ? 0.6 : (i === 0 || i === 3 ? sw : -sw)));
  m.body.position.y = airborne ? Math.sin(t * 3) * 0.25 : moving ? Math.abs(Math.sin(t * (6 + speed * 0.5))) * 0.12 * m.k : (m.butterfly ? 0.3 + Math.sin(t * 3) * 0.1 : Math.sin(t * 2) * 0.02);
  const flap = m.butterfly ? 0.25 + Math.sin(t * (airborne ? 14 : 5)) * 0.7 : m.fly ? 0.15 + Math.sin(t * (airborne ? 9 : 3)) * (airborne ? 0.6 : 0.25) : 0.1 + Math.sin(t * (moving ? 12 : 3)) * 0.2;
  for (const [i, w] of m.wings.entries()) w.rotation.z = (i ? -1 : 1) * flap;
  m.tails.forEach((tl, i) => (tl.rotation.y = Math.sin(t * 4 - i * 0.8) * 0.35));
}
// pet portraits for the menus, drawn once per species
const portraitR = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); portraitR.setSize(168, 168);
const pScene = new THREE.Scene(); pScene.add(new THREE.HemisphereLight("#ffffff", "#9a8f80", 1.3)); const pl = new THREE.DirectionalLight("#ffffff", 1); pl.position.set(3, 5, 4); pScene.add(pl);
const pCam = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
const PORTRAITS = {};
function portrait(sp) {
  if (PORTRAITS[sp]) return PORTRAITS[sp];
  const m = petModel(sp); m.g.rotation.y = 0.7; pScene.add(m.g);
  const k = SPECIES[sp].size, wide = SPECIES[sp].wings === "big" || SPECIES[sp].body === "butterfly" ? 1.35 : 1;
  pCam.position.set(0, 2.4 * k * wide, 5.6 * k * wide); pCam.lookAt(0, 1.0 * k, 0);
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
const me = { x: SPAWN.x + (Math.random() - 0.5) * 8, y: 0, z: SPAWN.z + Math.random() * 3, yaw: Math.PI, moving: false, airborne: false, boostUntil: 0, bag: [], stunUntil: 0, stars: 0 };
let mine = null, myBubble = null;
function mount() { if (mine) scene.remove(mine.g); mine = petModel(riding().sp, save.shirt); const sc = petScale(riding().lv); mine.g.scale.setScalar(sc); mine.top *= sc; mine.g.traverse((o) => (o.castShadow = true)); scene.add(mine.g); if (myBubble) { mine.g.add(myBubble.s); myBubble.s.position.y = mine.top + 2.4; } }
mount();
// a gold arrow over my pet pointing to the nearest house I have a parcel for (or the post office when the bag's empty)
const arrow = new THREE.Group(); { const c = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 10), mat("#f2b01e")); c.rotation.x = Math.PI / 2; c.position.z = 0.8; arrow.add(c); box(0.3, 0.3, 1.1, "#f2b01e", 0, 0, 0, arrow, false); } scene.add(arrow);
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
const DELAY = 140;
function serverTime(ts) { const est = performance.now() - ts; if (clockOff === null || est < clockOff) clockOff = est; else clockOff += (est - clockOff) * 0.01; }
const renderTime = () => performance.now() - (clockOff || 0) - DELAY;
function pushSample(buf, ts, s) { if (buf.length && ts <= buf[buf.length - 1].t) return; buf.push(Object.assign({ t: ts }, s)); while (buf.length > 30) buf.shift(); }
function lerpYaw(a, b, k) { let d = b - a; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return a + d * k; }
function sampleAt(buf, t, out) {
  if (!buf.length) return false;
  let i = buf.length - 1; while (i > 0 && buf[i - 1].t > t) i--;
  const b = buf[i], a = i > 0 ? buf[i - 1] : b;
  if (t >= b.t) {   // past the newest: guess ahead a little along its last motion
    const p = buf.length > 1 ? buf[buf.length - 2] : b, span = Math.max(1, b.t - p.t), k = Math.min(t - b.t, 200) / span;
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
  box(2.4, 1.8, 3.2, "#f4f4f0", 0, 1.5, -0.6, body); box(2.4, 1.4, 1.6, "#f4f4f0", 0, 1.3, 1.7, body); box(2.2, 0.7, 0.1, "#3a5a7a", 0, 1.6, 2.52, body);
  box(2.45, 0.35, 3.2, "#e08a00", 0, 1.2, -0.6, body); box(2.5, 0.3, 4.9, "#3d4650", 0, 0.55, 0.2, body);
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
    m.g.position.set(m.x, m.y, m.z); m.g.rotation.y = m.yaw;
    const chasing = m.mode === 1;
    if (!m.kind) { const ahead = terrain(m.x + Math.sin(m.yaw) * 2, m.z + Math.cos(m.yaw) * 2); m.pitch += (-Math.atan2(ahead - m.y, 2) * 0.9 - m.pitch) * Math.min(1, dt * 8); m.body.rotation.x = m.pitch; }
    else { m.rotor.rotation.y += dt * 28; m.tail.rotation.x += dt * 34; m.body.rotation.x = chasing ? 0.18 : 0.06; m.beam.visible = chasing; }
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
const pitchMin = () => (flies() ? -0.75 : 0.18);
// (owner, 2026-11-08) a house between the camera and me is hidden while it's in the way
const hiddenH = new Set();
function placeCamera(dt) {
  cam.dist += (cam.goalDist - cam.dist) * Math.min(1, dt * 8); cam.y += (me.y - cam.y) * Math.min(1, dt * 10);
  const cx = me.x + Math.sin(cam.yaw) * cam.dist * Math.cos(cam.pitch), cz = me.z + Math.cos(cam.yaw) * cam.dist * Math.cos(cam.pitch);
  let cy = cam.y + 1.5 + cam.dist * Math.sin(cam.pitch);
  if (inside(cx, cz)) cy = Math.max(cy, terrain(cx, cz) + 1.2);
  const isl = islandAt(cx, cz); if (isl && cy < isl.y + 1.2 && cy > isl.y - 3) cy = isl.y + 1.2;
  camera.position.set(cx, cy, cz); camera.lookAt(me.x, cam.y + 1.8, me.z);
  sun.position.set(me.x + 30, me.y + 60, me.z + 20); sun.target.position.set(me.x, me.y, me.z);
  const hide = new Set();
  for (let k = 1; k <= 20; k++) {
    const t = k / 20, x = me.x + (cx - me.x) * t, z = me.z + (cz - me.z) * t, y = cam.y + 1.5 + (cy - cam.y - 1.5) * t;
    houses.forEach((h, i) => { if (Math.abs(x - h.x) < 6.4 && Math.abs(z - h.z) < 6.4 && y < h.base + 8.5 && y > h.base - 4) hide.add(i); });
  }
  if (hide.size === hiddenH.size && [...hide].every((i) => hiddenH.has(i))) return;
  for (const i of new Set([...hide, ...hiddenH])) setHouse(i, !hide.has(i));
  hiddenH.clear(); for (const i of hide) hiddenH.add(i);
}
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();

// ---- controls: a thumb joystick on the left of the screen (where you put your thumb down), drag elsewhere to turn
// the camera, two fingers to zoom; keys WASD / arrows, mouse drag and the wheel on a computer. On a flier, moving
// forward climbs or dives the way the camera looks (owner, 2026-11-08). ----
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, drags = new Map(), keys = new Set();
const joyEl = $("joy"), knob = joyEl.firstElementChild;
canvas.addEventListener("pointerdown", (e) => {
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not a live pointer */ }
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
const up = (e) => { if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; joyEl.style.display = "none"; } drags.delete(e.pointerId); };
canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
canvas.addEventListener("wheel", (e) => { e.preventDefault(); cam.goalDist = clamp(cam.goalDist * Math.exp(e.deltaY * 0.001), 7, 45); }, { passive: false });
const typing = () => document.activeElement && document.activeElement.tagName === "INPUT";
addEventListener("keydown", (e) => { if (typing()) return; keys.add(e.code); if (e.code === "Escape") closePanels(); if (e.code === "Enter" || e.code === "Slash") { e.preventDefault(); openChat(); } });
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
const panels = ["p-pets", "p-shop", "p-train", "p-board"];
let openPanel = null;
function show(id) { for (const p of panels) $(p).style.display = p === id ? "block" : "none"; openPanel = id; if (id === "p-pets") renderPets(); if (id === "p-shop") renderShop(); if (id === "p-train") renderTrain(); if (id === "p-board") renderBoard(); }
function closePanels() { for (const p of panels) $(p).style.display = "none"; openPanel = null; }
for (const p of panels) $(p).querySelector(".x").onclick = closePanels;
$("btn-pets").onclick = () => (openPanel === "p-pets" ? closePanels() : show("p-pets"));
const WING = `<svg width="14" height="12" viewBox="0 0 14 12" style="vertical-align:-1px"><path d="M1 10C3 3 8 1 13 1c-1 5-5 9-12 9z" fill="#3a8ee6"/></svg>`;
function card(sp, lines, on, onclick) {
  const s = SPECIES[sp], d = document.createElement("div"); d.className = "card" + (on ? " on" : "");
  d.innerHTML = `<img alt="" src="${portrait(sp)}" width="84" height="84"><span class="nm">${s.name}${s.fly ? " " + WING : ""}</span><span class="rar" style="color:${RARITY[s.r].c}">${RARITY[s.r].name}</span>${lines}`;
  if (onclick) d.onclick = onclick; return d;
}
const statLine = (p) => `<span class="stats"><span>Lv ${p.lv}</span><span>${petSpeed(p).toFixed(1)} m/s</span><span>${petBag(p)} bag</span></span>`;
function renderPets() {
  const el = $("petlist"); el.innerHTML = "";
  for (const p of save.pets.slice().sort((a, b) => SPECIES[b.sp].r - SPECIES[a.sp].r || petSpeed(b) - petSpeed(a))) el.appendChild(card(p.sp, statLine(p), p.id === save.ride, () => ride(p.id)));
}
function ride(id) {
  if (save.ride === id) return; save.ride = id; persist(); mount(); netSend({ t: "pet", sp: riding().sp, lv: riding().lv });
  if (!flies()) {   // island parcels need wings: they go back; off the town island, back to the plaza
    me.bag = me.bag.filter((i) => !houses[i].sky); cam.pitch = Math.max(cam.pitch, 0.18);
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
  b.innerHTML = max ? "Lv " + MAXLV : `Train <span class="coin" style="display:inline-block;vertical-align:-3px"></span> ${fmt(cost)}`; b.disabled = max || save.coins < cost; b.onclick = () => train(false); row.appendChild(b);
  if (save.items.ribbon > 0 && !max) { const r = document.createElement("button"); r.className = "btn"; r.type = "button"; r.textContent = ITEMS.ribbon.name + " ×" + save.items.ribbon; r.onclick = () => train(true); row.appendChild(r); }
  el.appendChild(row);
}
function train(ribbon) {
  const p = riding(); if (p.lv >= MAXLV) return;
  if (ribbon) { if (save.items.ribbon <= 0) return; save.items.ribbon--; } else { const c = trainCost(p); if (save.coins < c) return; save.coins -= c; }
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
  { id: "rush", name: "Rush Order", time: 60, base: 3, per: 3, pay: 22 },
  { id: "quick", name: "Quick Contract", time: 90, base: 5, per: 4, pay: 26 },
  { id: "big", name: "Big Contract", time: 180, base: 10, per: 8, pay: 30 },
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
  const taken = new Set(me.bag), sky = flies(), town = houses.map((h, i) => i).filter((i) => !houses[i].sky), isl = houses.map((h, i) => i).filter((i) => houses[i].sky);
  while (me.bag.length < cap) { const i = sky && Math.random() < 0.3 ? pick(isl) : pick(town); if (!taken.has(i)) { taken.add(i); me.bag.push(i); } }
  toast("+" + (cap - before)); syncBeams(); hudKey = "";
  emitSparks(me.x, me.y + 2, me.z, 20, 4, ["#ffd35a", "#ffffff"], 0.7, -1, 0.8);
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
// caught by animal control (owner, 2026-11-08): taken to the pound, dizzy for a moment, parcels gone, wanted cleared
function caught() {
  me.stunUntil = performance.now() + 2200; me.stars = 0;
  if (me.bag.length) { me.bag = []; syncBeams(); }
  me.x = RELEASE.x + (Math.random() - 0.5) * 10; me.z = RELEASE.z + (Math.random() - 0.5) * 3; me.y = terrain(me.x, me.z); cam.y = me.y; cam.yaw = Math.PI;
  toast("Caught!", "#e5534b"); emitSparks(me.x, me.y + 2, me.z, 24, 4, ["#ffd84a", "#ffffff"], 0.8, 1); hudKey = "";
  sendPos(true);
}

// ---- chat (owner, 2026-11-08): say something to the room; it shows in the list at the bottom and over your head ----
const chatBar = $("chatbar"), chatIn = $("chatin");
function openChat() { chatBar.style.display = "flex"; chatIn.focus(); }
function closeChat() { chatBar.style.display = "none"; chatIn.blur(); }
$("btn-chat").onclick = () => (chatBar.style.display === "flex" ? closeChat() : openChat());
chatBar.addEventListener("submit", (e) => {
  e.preventDefault(); const text = chatIn.value.replace(/\s+/g, " ").trim().slice(0, 120); chatIn.value = "";
  if (text) { netSend({ t: "chat", text }); chatLine(save.name, text, true); myBubble = bubble(text, myBubble, mine.g, mine.top); }
  closeChat();
});
chatIn.addEventListener("keydown", (e) => { if (e.key === "Escape") closeChat(); e.stopPropagation(); });
function chatLine(name, text, mineToo) {
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

// ---- co-op: everyone in a room sees the others riding; the server shares where everyone is, runs animal control,
// contracts and chat. A tab that's put away disconnects (and reconnects when it's back), and a reload replaces its old
// connection, so nobody's left standing in town after they've gone (owner, 2026-11-08). ----
const WS_URL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? `ws://${location.host}/pets` : "wss://play.atamus.io/pets";
let ws = null, netOk = false, myId = null, online = 1, retry = 1000, lastSent = 0, lastPos = "", hidden = document.hidden;
const KEY = (() => { try { let k = sessionStorage.getItem("petdelivery.key"); if (!k) { k = Math.random().toString(36).slice(2) + Date.now().toString(36); sessionStorage.setItem("petdelivery.key", k); } return k; } catch (e) { return Math.random().toString(36).slice(2); } })();
const others = new Map();   // id -> { name, sp, shirt, stars, buf, x, y, z, yaw, moving, m, tag, bub }
function netSend(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }
function connect() {
  if (hidden || ws) return;
  try { ws = new WebSocket(WS_URL); } catch (e) { ws = null; setTimeout(connect, retry); return; }
  const sock = ws;
  ws.onopen = () => { retry = 1000; netSend({ t: "hi", key: KEY, name: save.name, sp: riding().sp, lv: riding().lv, shirt: save.shirt, x: me.x, y: me.y, z: me.z }); };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } onNet(m); };
  ws.onclose = () => {
    if (ws === sock) ws = null;
    const was = netOk; netOk = false; myId = null; clockOff = null; for (const id of [...others.keys()]) dropOther(id); online = 1; if (contract && !contract.local) contract = null; hudKey = "";
    if (was && !hidden) toast("Offline");
    if (!hidden) { setTimeout(connect, retry); retry = Math.min(15000, retry * 2); }
  };
  ws.onerror = () => {};
}
document.addEventListener("visibilitychange", () => {
  hidden = document.hidden;
  if (hidden) { if (ws) ws.close(); } else { retry = 1000; last = performance.now(); connect(); }
});
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
  others.set(p.id, { name: p.name, sp, lv, shirt: p.shirt, stars, buf: old ? old.buf : [], x: p.x, y, z: p.z, yaw: p.yaw || 0, moving: false, m, tag, bub: null });
}
function dropOther(id) { const o = others.get(id); if (!o) return; scene.remove(o.m.g); if (o.bub) clearTimeout(o.bub.timer); others.delete(id); }
function setContract(c) {
  const before = contract;
  contract = c ? { kind: c.kind || "big", goal: c.goal, done: c.done, mine: c.mine || 0, ends: performance.now() + c.left * 1000, pool: c.pool } : null;
  if (!before && contract) banner((CONTRACTS.find((k) => k.id === contract.kind) || CONTRACTS[2]).name + "!", "#ffd35a");
  hudKey = ""; if (openPanel === "p-board") renderBoard();
}
function onNet(m) {
  if (m.t === "welcome") { myId = m.id; netOk = true; for (const p of m.players) addOther(p); online = m.players.length + 1; setContract(m.contract); me.stars = m.stars || 0; hudKey = ""; }
  else if (m.t === "join") { addOther(m.p); online = others.size + 1; hudKey = ""; }
  else if (m.t === "leave") { dropOther(m.id); online = others.size + 1; hudKey = ""; }
  else if (m.t === "snap") {
    serverTime(m.ts);
    for (const [id, x, z, yaw, mv, y, st] of m.ps) {
      const o = others.get(id); if (!o) continue;
      pushSample(o.buf, m.ts, { x, y: Number.isFinite(y) ? y : terrain(x, z), z, yaw }); o.moving = !!mv;
      if ((st || 0) !== o.stars) { o.stars = st || 0; o.m.g.remove(o.tag); o.tag = nameTag(String(o.name || "Courier").slice(0, 18), o.stars); o.tag.position.y = o.m.top + 1.2; o.m.g.add(o.tag); }
    }
  }
  else if (m.t === "veh") { serverTime(m.ts); m.v.forEach((r, i) => { const h = vehs[i]; if (!h) return; pushSample(h.buf, m.ts, { x: r[0], y: r[1], z: r[2], yaw: r[3] }); h.mode = r[4]; h.target = r[5]; }); }
  else if (m.t === "pet") { const o = others.get(m.id); if (o) addOther({ id: m.id, name: o.name, sp: m.sp, lv: m.lv, shirt: o.shirt, stars: o.stars, x: o.x, y: o.y, z: o.z, yaw: o.yaw }); }
  else if (m.t === "fx") { const o = others.get(m.id); if (o) emitConfetti(o.x, o.y + 2.5, o.z, 35, 4, 7); }
  else if (m.t === "chat") { const o = others.get(m.id); chatLine(o ? o.name : m.name, m.text); if (o) o.bub = bubble(m.text, o.bub, o.m.g, o.m.top); }
  else if (m.t === "chase" || m.t === "caught" || m.t === "escaped" || m.t === "stars") onVehEvent(m.t, m.stars || 0);
  else if (m.t === "contract") setContract(m.c);
  else if (m.t === "done") contractOver(m.won, m.pay || 0, m.progress || 0, !!m.helped);
}
function sendPos(force) {
  const s = [me.x.toFixed(2), me.y.toFixed(1), me.z.toFixed(2), me.yaw.toFixed(2), me.moving ? 1 : 0].join();
  if (!force && s === lastPos) return;
  netSend({ t: "pos", x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(2), mv: me.moving ? 1 : 0 }); lastPos = s;
}

// ---- the loop ----
let last = performance.now(), clock = 0, zone = null;
const SLOPE = 0.8, FLY_TOP = 95, FLY_SPEED_UP = 0.85;
function floorAt(x, z, y) {
  const isl = islandAt(x, z); if (isl && y > isl.y - 3) return isl.y;
  return inside(x, z) ? terrain(x, z) : -60;
}
function step(dt) {
  clock += dt;
  const now = performance.now();
  // where the joystick (or keys) point, turned by the camera
  let jx = joy.x, jy = joy.y;
  if (keys.has("KeyW") || keys.has("ArrowUp")) jy -= 1; if (keys.has("KeyS") || keys.has("ArrowDown")) jy += 1;
  if (keys.has("KeyA") || keys.has("ArrowLeft")) jx -= 1; if (keys.has("KeyD") || keys.has("ArrowRight")) jx += 1;
  const l = hyp(jx, jy); if (l > 1) { jx /= l; jy /= l; }
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  const mx = fx * -jy + rx * jx, mz = fz * -jy + rz * jx, ml = hyp(mx, mz);
  const p = riding(), sp = petSpeed(p) * (me.boostUntil > now ? SNACK_BOOST : 1), fly = flies(), stunned = me.stunUntil > now;
  me.moving = ml > 0.08 && !stunned;
  if (me.moving) {
    const v = sp * Math.min(1, ml) * dt;
    const nx = me.x + (mx / ml) * v, nz = me.z + (mz / ml) * v;
    const ok = (x, z) => {
      if (hyp(x, z) > LIMIT || blocked(x, z, me.y)) return false;
      if (fly) return true;
      if (!inside(x, z, 1.5)) return false;   // the edge of the island
      return terrain(x, z) - terrain(me.x, me.z) <= SLOPE * v + 0.03;   // cliffs are too steep to climb
    };
    if (ok(nx, me.z)) me.x = nx; if (ok(me.x, nz)) me.z = nz;   // slide along walls
    const want = Math.atan2(mx, mz); me.yaw = lerpYaw(me.yaw, want, Math.min(1, dt * 12));
  }
  // height: a ground pet keeps to the land (dropping off ledges); a flier climbs or dives as it flies forward, the way
  // the camera looks, and hovers when stopped
  const floor = floorAt(me.x, me.z, me.y);
  if (fly) {
    const fwd = me.moving ? clamp(-jy, 0, 1) : 0, climb = clamp((0.42 - cam.pitch) * 1.8, -1, 1);
    me.y += climb * fwd * sp * FLY_SPEED_UP * dt; me.y = Math.min(me.y, FLY_TOP); if (me.y < floor) me.y = floor;
  } else {
    if (!inside(me.x, me.z) && !islandAt(me.x, me.z)) { me.x = SPAWN.x; me.z = SPAWN.z; me.y = terrain(me.x, me.z); }
    const f = floorAt(me.x, me.z, me.y); me.y = me.y > f ? Math.max(f, me.y - dt * 22) : f;
  }
  me.airborne = me.y - floor > 1.2;
  const low = me.y - floor < 3.5;
  // the post office fills my bag; a mailbox I have a parcel for takes it
  if (hyp(me.x - PICKUP.x, me.z - PICKUP.z) < PICKUP.r && low) fillBag();
  for (const i of me.bag) { const h = houses[i]; if (hyp(me.x - h.mx, me.z - h.mz) < 3.6 && Math.abs(me.y - h.my) < 4.5) { deliver(i); break; } }
  // animal control: offline this page runs it
  if (!netOk) {
    Object.assign(meP, { x: me.x, y: me.y, z: me.z, stars: me.stars });
    for (const e of World.stepVehicles(localVs, [meP], dt, now / 1000)) onVehEvent(e.k, e.stars || 0);
  }
  // the egg shop, the training yard and the board open their panel when I ride in
  const z = !low ? null : hyp(me.x - SHOP.x, me.z - SHOP.z) < SHOP.r ? "p-shop" : hyp(me.x - TRAIN.x, me.z - TRAIN.z) < TRAIN.r ? "p-train" : hyp(me.x - BOARD.x, me.z - BOARD.z) < BOARD.r ? "p-board" : null;
  if (z !== zone) { if (zone && openPanel === zone) closePanels(); zone = z; if (z) show(z); }
  contractStep(); fxStep(dt);
  for (const c of clouds) { c.position.x += dt * 1.5; if (c.position.x > 400) c.position.x = -400; }
  // send where I am, 10 times a second (by the real clock) when it changes, and every 2 s regardless
  if (netOk && now - lastSent > 100) { sendPos(now - lastSent > 2000); lastSent = now; }
}
function draw(dt) {
  const now = performance.now();
  mine.g.position.set(me.x, me.y, me.z); mine.g.rotation.y = me.yaw; mine.g.rotation.z = me.airborne && me.moving ? Math.sin(clock * 1.3) * 0.05 : 0;
  mine.g.rotation.x = me.airborne && me.moving ? -clamp((0.42 - cam.pitch) * 0.6, -0.4, 0.4) * clamp(-joy.y + (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0), 0, 1) : 0;
  animatePet(mine, clock, me.moving, petSpeed(riding()), me.airborne);
  dizzy.visible = me.stunUntil > now; if (dizzy.visible) { dizzy.position.set(me.x, me.y + mine.top + 0.5, me.z); dizzy.rotation.y = clock * 6; }
  const rt = renderTime();
  for (const o of others.values()) {
    if (sampleAt(o.buf, rt, tmpS)) { o.x = tmpS.x; o.y = tmpS.y; o.z = tmpS.z; o.yaw = tmpS.yaw; }
    o.m.g.position.set(o.x, o.y, o.z); o.m.g.rotation.y = o.yaw;
    animatePet(o.m, clock + o.x * 0.1, o.moving, 10, o.m.fly && o.y - (inside(o.x, o.z) ? terrain(o.x, o.z) : -60) > 1.2);
  }
  vehiclesDraw(dt);
  // the arrow: to the nearest house in my bag, else back to the post office
  let tx = PICKUP.x, tz = PICKUP.z, best = 1e9;
  for (const i of me.bag) { const h = houses[i], d = hyp(h.mx - me.x, h.mz - me.z); if (d < best) { best = d; tx = h.mx; tz = h.mz; } }
  arrow.visible = hyp(tx - me.x, tz - me.z) > 6;
  arrow.position.set(me.x, me.y + mine.top + 1.4 + Math.sin(clock * 3) * 0.15, me.z); arrow.rotation.y = Math.atan2(tx - me.x, tz - me.z);
  for (const b of beams.values()) { b.userData.parcel.rotation.y = clock * 2; b.userData.parcel.position.y = 3 + Math.sin(clock * 3) * 0.3; }
  pickRing.material.opacity = 0.55 + Math.sin(clock * 4) * 0.3; bigEgg.rotation.y = clock * 0.6;
  placeCamera(dt);
  renderer.render(scene, camera);
}
function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.1); last = now;
  if (dt > 0.05) { step(dt / 2); step(dt / 2); } else step(dt);
  draw(dt); hud();
  requestAnimationFrame(frame);
}
me.y = terrain(me.x, me.z); cam.y = me.y;
syncBeams(); hud(); requestAnimationFrame(frame); connect();

// for tests
window.Pets = { get save() { return save; }, me, houses, get contract() { return contract; }, get online() { return online; }, get netOk() { return netOk; }, get others() { return others; }, step, deliver, fillBag, buyEgg, train, startContract, ride, EGGS, SPECIES, PICKUP, SHOP, TRAIN, BOARD, ISLANDS, World, vehs, localVs, cam, terrain, contractOver, emitConfetti, firework, caught, teleport: (x, z, y) => { me.x = x; me.z = z; me.y = y === undefined ? terrain(x, z) : y; } };
