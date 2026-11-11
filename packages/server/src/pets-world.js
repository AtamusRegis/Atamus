// Critter Courier (owner, 2026-11-11: the game remade from the design document): the fixed town and the game's rules,
// shared by the page and the server (packages/server/src/pets-world.js is an identical copy; scripts/check.sh compares
// them). 1 unit = 1 m. Nothing here touches the page or the network.
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const hyp = Math.hypot;
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------------------------------------------------
export const RARITY = ["Common", "Uncommon", "Rare", "Epic", "Legendary"], RARITY_C = ["#ffffff", "#4cc76a", "#3a8ee6", "#a45be0", "#f2b01e"];
// parcel tiers: where they go, what they pay, how lucky their roll is, how often they come (with every district open)
export const TIERS = [
  { k: "bronze", name: "Bronze", c: "#b9763c", mult: 1, luck: 0, w: 40 },
  { k: "silver", name: "Silver", c: "#b8c2cc", mult: 2, luck: 0.1, w: 28 },
  { k: "gold", name: "Gold", c: "#f2b01e", mult: 4, luck: 0.25, w: 18 },
  { k: "diamond", name: "Diamond", c: "#6fd6ee", mult: 8, luck: 0.5, w: 10 },
  { k: "sky", name: "Sky", c: "#9aa8ff", mult: 15, luck: 1, w: 4 },
];
export const DISTRICTS = ["Main Street", "Maple Suburbs", "Goose Marsh", "Cliffside", "Floating Islands"];
// modifiers: one parcel in five rolls one. Golden is 2% of those.
export const MODS = { fragile: { name: "Fragile", bonus: 1 }, heavy: { name: "Heavy", bonus: 0.5 }, express: { name: "Express", bonus: 1.5 }, golden: { name: "Golden", bonus: 2 } };
export const MOD_CHANCE = 0.2, GOLDEN_OF_MODS = 0.02, BASE_DUR = 3, BASE_COINS = 10, HIT_CUT = 0.2, HEAVY_SLOW = 0.85, MUD_SLOW = 0.75;
// reward rolls: chance, coins, Training XP, Level Coupons (and the chance of one), eggs (chance, and which)
export const ROLLS = [
  { chance: 0.6, coins: [4, 10], xp: 6, coupons: 0, couponChance: 0, egg: 0, eggs: [] },
  { chance: 0.25, coins: [15, 30], xp: 14, coupons: 0, couponChance: 0, egg: 0, eggs: [] },
  { chance: 0.1, coins: [50, 100], xp: 0, coupons: 0, couponChance: 0.3, egg: 0.1, eggs: ["basic"] },
  { chance: 0.04, coins: [220, 420], xp: 0, coupons: 1, couponChance: 0, egg: 0.35, eggs: ["basic", "rare"] },
  { chance: 0.01, coins: [1500, 2600], xp: 0, coupons: 2, couponChance: 0, egg: 0.75, eggs: ["rare", "rare", "legendary"] },
];
// luck moves the odds toward the rarer tiers: tier n's chance is weighted by (1 + luck)^n
export function rollOdds(luck) { const w = ROLLS.map((r, n) => r.chance * Math.pow(1 + luck, n)), s = w.reduce((a, b) => a + b, 0); return w.map((v) => v / s); }
export const PITY_RARE = 25, PITY_EPIC = 100;
// courier upgrades: 10 levels each; a level costs base x 1.8^(level - 1)
export const UPGRADES = {
  routes: { name: "Route Permits", base: 250 }, payout: { name: "Payout", base: 300 }, stamps: { name: "Lucky Stamps", base: 500 },
  press: { name: "Coupon Press", base: 400 }, boxes: { name: "Sturdy Boxes", base: 350 },
};
export const UP_MAX = 10, upgradeCost = (k, lv) => Math.round(UPGRADES[k].base * Math.pow(1.8, lv));   // the cost of going from lv to lv + 1
export const districtsOpen = (routes) => 1 + (routes >= 2) + (routes >= 4) + (routes >= 6) + (routes >= 8);
export function spawnWeights(routes) {   // which tiers a courier's conveyor gives: only open districts; permits lift the higher tiers (Sky to 8%)
  const open = districtsOpen(routes), w = TIERS.map((t, n) => (n < open ? t.w * (1 + (n * routes) / 10) : 0)), s = w.reduce((a, b) => a + b, 0);
  return w.map((v) => v / s);
}
export const stampLuck = (lv) => 0.0405 * lv, payoutMult = (lv) => 1 + 0.1 * lv, pressChance = (lv) => 0.01 * lv, boxDur = (lv) => BASE_DUR + (lv >= 5) + (lv >= 10);
export const upTotal = (up) => Object.keys(UPGRADES).reduce((a, k) => a + (up[k] || 0), 0);
export const RANKS = ["", "Bronze", "Silver", "Gold", "Platinum"], RANK_C = ["", "#b9763c", "#b8c2cc", "#f2b01e", "#bfe9ff"];
export const rankOf = (total) => (total >= 38 ? 4 : total >= 25 ? 3 : total >= 13 ? 2 : total >= 1 ? 1 : 0);
// mounts: a rarity (0-4), an ability (from level 5; stronger at 10 and 20), colors and a size
export const MOUNTS = {
  pup: { name: "Pup", r: 0, ab: "bark", c: "#c98a4b", a: "#f3dcc0", size: 1 },
  piglet: { name: "Piglet", r: 0, ab: "dash", c: "#f4a7b5", a: "#ffd3da", size: 0.95 },
  bunny: { name: "Bunny", r: 0, ab: "jump2", c: "#e9e4dc", a: "#ffc7d0", size: 0.9 },
  cat: { name: "Cat", r: 1, ab: "dash", c: "#f0a04b", a: "#fff1dc", size: 0.95 },
  fox: { name: "Fox", r: 1, ab: "dash", c: "#e06a2a", a: "#fff4e6", size: 1 },
  deer: { name: "Deer", r: 1, ab: "jump2", c: "#b9824f", a: "#f3e3cc", size: 1 },
  raptor: { name: "Raptor", r: 2, ab: "dash", c: "#6f9a3a", a: "#d9d27a", size: 1 },
  stego: { name: "Stegosaurus", r: 2, ab: "bark", c: "#5f9a8a", a: "#e08a3a", size: 0.95 },
  pony: { name: "Pony", r: 2, ab: "jump2", c: "#a9713f", a: "#3b2a1c", size: 1.05 },
  trex: { name: "T-Rex", r: 3, ab: "bark", c: "#5f8f3a", a: "#cfd98a", size: 1 },
  trike: { name: "Triceratops", r: 3, ab: "dash", c: "#b98a5a", a: "#f0d9a8", size: 0.95 },
  unicorn: { name: "Unicorn", r: 4, ab: "jump2", c: "#fbf7ff", a: "#ffd1f0", size: 1.05 },
};
// (owner, 2026-11-11) no flying pets: the Parrot, Owl and Dragon (and gliding) went; anyone who had one has the mount that took its place
export const MOUNT_MOVED = { parrot: "deer", owl: "stego", dragon: "unicorn" };
export const ABILITY = { bark: "Bark", dash: "Dash", jump2: "Double Jump" };
export const MAX_LV = 20, VARIANTS = ["", "Shiny", "Golden"], SHINY = 0.01, GOLDEN = 0.001;
export const levelCost = (lv) => Math.round(100 * Math.pow(1.6, lv - 1));   // coins to go from lv to lv + 1
export const xpNeed = (lv) => Math.round(30 * Math.pow(1.42, lv - 1));     // Training XP to go from lv to lv + 1
export const mountScale = (lv) => 1 + 0.079 * (lv - 1);                     // 1x at level 1, 2.5x at 20
export const abilityTier = (lv) => (lv >= 20 ? 3 : lv >= 10 ? 2 : lv >= 5 ? 1 : 0);
export function mountStats(sp, lv) {
  const r = MOUNTS[sp].r, n = lv - 1;
  return { speed: 10 + 0.6 * r + (0.1 + 0.02 * r) * n, jump: 8 + 0.25 * r + (0.08 + 0.01 * r) * n, grip: Math.min(0.6, 0.05 * r + 0.02 * n) };
}
export const ABILITY_CD = { bark: [0, 12, 9, 6], dash: [0, 8, 6, 4], jump2: [0, 0, 0, 0] };
// eggs: what hatches from each (by rarity), then a mount of that rarity at random
export const EGGS = { basic: { name: "Basic Egg", c: "#f4ead8", odds: [0.7, 0.25, 0.05, 0, 0] }, rare: { name: "Rare Egg", c: "#7fb4f0", odds: [0, 0.5, 0.38, 0.1, 0.02] }, legendary: { name: "Legendary Egg", c: "#f2c84a", odds: [0, 0, 0.5, 0.38, 0.12] } };
export const MOUNT_CAP = 60;
// kicks, dogs, geese (m and seconds)
export const KICK = { range: 3.6, half: 1.0, cd: 4, stun: 1, grace: 5, farm: 30 };
export const DOG = { trigger: 10, telegraph: 0.5, chase: 6, speed: 11.5, bite: 1.3, stun: 1.5, cool: 8, leash: 38, roam: 3.2, range: 45 };
export const GOOSE = { see: 7, telegraph: 1, lunge: 13, lungeFor: 2.2, touch: 1.4, carry: 7.2, dunk: 3, wander: 2.6, roam: 34, bonus: 15, cool: 6 };
export const GRAB_R = 3.4, DELIVER_R = 3, PICKUP_R = 2.2, SAFE_R = 20, EXPRESS_PER_M = 0.16, EXPRESS_MIN = 14;

// what a courier's saved data must look like (anything else is put right); a new courier gets a Pup
export function cleanData(d) {
  d = d && typeof d === "object" ? d : {};
  const int = (v, lo, hi, def) => (Number.isFinite(+v) ? clamp(Math.floor(+v), lo, hi) : def);
  const out = { v: 1, coins: int(d.coins, 0, 1e12, 0), coupons: int(d.coupons, 0, 1e6, 0), stamp: int(d.stamp, 0, PITY_EPIC, 0), nextId: int(d.nextId, 1, 1e9, 1), mounts: [], ride: 0, eggs: {}, up: {}, stats: {}, set: {}, fails: int(d.fails, 0, 99, 0) };
  for (const m of Array.isArray(d.mounts) ? d.mounts.slice(0, MOUNT_CAP) : []) if (m && MOUNTS[MOUNT_MOVED[m.sp] || m.sp]) out.mounts.push({ id: int(m.id, 1, 1e9, 0) || out.nextId++, sp: MOUNT_MOVED[m.sp] || m.sp, va: int(m.va, 0, 2, 0), lv: int(m.lv, 1, MAX_LV, 1), xp: int(m.xp, 0, 1e9, 0) });
  if (!out.mounts.length) out.mounts.push({ id: out.nextId++, sp: "pup", va: 0, lv: 1, xp: 0 });
  out.nextId = Math.max(out.nextId, ...out.mounts.map((m) => m.id + 1));
  out.ride = out.mounts.some((m) => m.id === d.ride) ? d.ride : out.mounts[0].id;
  for (const k of Object.keys(EGGS)) out.eggs[k] = int(d.eggs && d.eggs[k], 0, 9999, 0);
  for (const k of Object.keys(UPGRADES)) out.up[k] = int(d.up && d.up[k], 0, UP_MAX, 0);
  for (const k of ["del", "golden", "geese", "kicks"]) out.stats[k] = int(d.stats && d.stats[k], 0, 1e9, 0);
  out.set = { friendly: !!(d.set && d.set.friendly), music: int(d.set && d.set.music, 0, 10, 5), sfx: int(d.set && d.set.sfx, 0, 10, 7), shirt: /^#[0-9a-f]{6}$/i.test(d.set && d.set.shirt) ? d.set.shirt : "#f2a33a" };
  return out;
}
// a new parcel for the conveyor: its tier by the courier's permits, maybe a modifier
export function rollParcel(up, rnd = Math.random) {
  const w = spawnWeights(up.routes); let r = rnd(), tier = 0; for (let n = 0; n < w.length; n++) { if (r < w[n]) { tier = n; break; } r -= w[n]; }
  let mod = ""; if (rnd() < MOD_CHANCE) mod = rnd() < GOLDEN_OF_MODS ? "golden" : ["fragile", "heavy", "express"][Math.floor(rnd() * 3)];
  return { tier, mod };
}
// coins for a delivery: base 10 x tier x (1 + modifier bonus) x payout upgrade x (1 - 0.2 per hit taken). late: an Express parcel past its time
export function deliveryCoins(tier, mod, payoutLv, hits, late) {
  const bonus = mod && !(mod === "express" && late) ? MODS[mod].bonus : 0;
  return Math.max(1, Math.round(BASE_COINS * TIERS[tier].mult * (1 + bonus) * payoutMult(payoutLv) * Math.max(0, 1 - HIT_CUT * hits)));
}
// the reward roll. Returns { tier, coins, xp, coupons, egg, stamp (the meter after), near (it just missed Legendary) }
export function rewardRoll(tier, mod, up, stamp, rnd = Math.random) {
  const odds = rollOdds(TIERS[tier].luck + stampLuck(up.stamps)); let r = rnd(), t = 0; for (let n = 0; n < odds.length; n++) { if (r < odds[n]) { t = n; break; } r -= odds[n]; t = n; }
  const near = t < 4 && r < 0.012 && t >= 3;
  if (t < 2) stamp++;
  let floor = 0; if (stamp >= PITY_EPIC) floor = 3; else if (t < 2 && stamp % PITY_RARE === 0) floor = 2;
  if (mod === "golden") floor = Math.max(floor, 2);
  t = Math.max(t, floor); if (t >= 3) stamp = 0;
  const R = ROLLS[t], coins = Math.round((R.coins[0] + rnd() * (R.coins[1] - R.coins[0])) * Math.sqrt(TIERS[tier].mult));
  let coupons = R.coupons + (rnd() < R.couponChance ? 1 : 0) + (rnd() < pressChance(up.press) ? 1 : 0), egg = "";
  if (rnd() < R.egg) egg = R.eggs[Math.floor(rnd() * R.eggs.length)];
  return { tier: t, coins, xp: R.xp, coupons, egg, stamp, near };
}
export function hatchEgg(kind, rnd = Math.random) {
  const odds = EGGS[kind].odds; let r = rnd(), rar = 0; for (let n = 0; n < odds.length; n++) { if (r < odds[n]) { rar = n; break; } r -= odds[n]; rar = n; }
  const pool = Object.keys(MOUNTS).filter((k) => MOUNTS[k].r === rar), v = rnd();
  return { sp: pool[Math.floor(rnd() * pool.length)], va: v < GOLDEN ? 2 : v < GOLDEN + SHINY ? 1 : 0 };
}
// Training XP: added to a mount; it levels up as far as the XP takes it. Returns the levels gained.
export function addXp(m, xp) { let up = 0; m.xp += xp; while (m.lv < MAX_LV && m.xp >= xpNeed(m.lv)) { m.xp -= xpNeed(m.lv); m.lv++; up++; } if (m.lv >= MAX_LV) m.xp = 0; return up; }

// ---------------------------------------------------------------------------------------------------------------------
// The town (owner, 2026-11-11: one long line, harder the farther out): the post office at the west end, then one road east
// through Main Street and Maple Suburbs, over the bridge into Goose Marsh, up Cliffside's mountain, and the Floating
// Islands off its far side. The farther out, the more (and quicker) dogs, geese and dangers.
// Ground is made of slabs (flat rectangles and discs, and ramps); solids are boxes that stop you.
// ---------------------------------------------------------------------------------------------------------------------
export const sprinklers = [], goats = [], zips = [];
export const slabs = [], solids = [], houses = [], dogs = [], ponds = [], geese = [], trees = [], roads = [], pads = [], boosts = [], balloons = [], fences = [];
export const PO = { x: 0, z: 0, counter: 5, roof: 13 };   // the counter: a square 10 m across with the conveyor round it; the roof stands on four posts
const D = 450;   // how far east the marsh, mountain and islands start from where they first were
export const SPAWN = { x: 0, z: 17 }, SUBURBS_X = 250, TOWN = { x0: -45, x1: 600, z0: -80, z1: 80 }, MARSH = { x0: 600, x1: 780, z0: -112, z1: 112 }, CLIFF = { x0: 780, x1: 926, z0: -112, z1: 112 };
export const TERRACE = (n) => ({ x0: 346 + D + 16 * (n - 1), x1: 470 + D, z0: -90 + 14 * (n - 1), z1: 90 - 14 * (n - 1), y: 10 * n });   // n = 1..5
export const ISLES = [{ x: 545, z: 0, y: 70, r: 22 }, { x: 605, z: -52, y: 78, r: 18 }, { x: 665, z: 0, y: 86, r: 20 }, { x: 605, z: 58, y: 94, r: 18 }, { x: 728, z: -42, y: 100, r: 18 }, { x: 748, z: 44, y: 108, r: 20 }].map((s) => ({ ...s, x: s.x + D }));
export const ISLE_X = 950;   // past here, and high up: the Floating Islands
const MARSH_BR = [192 + D, 242 + D, 292 + D];
// shortcuts: the sewer pipe (Main Street to the foot of Cliffside; a goose sits in it part of the time), ziplines
export const PIPE = { a: { x: 150, z: -46, y: 0 }, b: { x: 338 + D, z: -60, y: 0 }, r: 2, time: 6, every: 24, goose: 8 };
export const pipeGoose = (t) => t % PIPE.every < PIPE.goose;   // t: seconds (the server's clock)
export const ZIP_SPEED = 24, STEP_H = 2;
// district hazards (the page runs sprinklers and wind off the server's clock; the server runs the rest)
export const SPRINKLER = { r: 5, push: 9, every: 6, on: 3 }, sprinklerOn = (s, t) => (t + s.ph) % SPRINKLER.every < SPRINKLER.on;
export const WIND = { every: 11, on: 3.5, push: 4.5 };
export function windAt(t) { const n = Math.floor(t / WIND.every), on = t - n * WIND.every < WIND.on, a = ((n * 2654435761) >>> 0) / 4294967296 * TAU; return { on, x: Math.cos(a), z: Math.sin(a) }; }
export const ROCK = { delay: 1, r: 2.3, stun: 1.5, every: [3, 6] }, GOAT = { see: 9, telegraph: 0.8, speed: 13, run: 1.3, touch: 1.6, knock: 15, cool: 6, roam: 2.4 }, SKYGOOSE = { delay: 1.4, r: 2.2, every: [8, 14] };
export const CANNON = { x: 456 + D, z: 0, y: 50, r: 2.6, to: 0 }, SKY_Y = 40;
const ISLE_LINKS = [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4], [4, 5], [5, 2]];
export function districtAt(x, z, y = 0) { return x > ISLE_X && y > SKY_Y ? 4 : x >= CLIFF.x0 ? 3 : x >= MARSH.x0 ? 2 : x >= SUBURBS_X ? 1 : 0; }

function rect(x0, x1, z0, z1, y, kind, b = y - 40) { slabs.push({ k: 0, x0, x1, z0, z1, y, b, kind }); }
function disc(x, z, r, y, kind, b = y - 6) { slabs.push({ k: 1, x, z, r, x0: x - r, x1: x + r, z0: z - r, z1: z + r, y, b, kind }); }
function ramp(x0, x1, z0, z1, y0, y1, kind) { slabs.push({ k: 2, x0, x1, z0, z1, y: Math.max(y0, y1), ya: y0, yb: y1, b: Math.min(y0, y1) - 40, kind }); }   // rises along z from ya (at z0) to yb (at z1)
function solid(x, z, hw, hd, y0, y1, yaw = 0) { solids.push({ x, z, hw, hd, c: Math.cos(yaw), s: Math.sin(yaw), y0, y1, rad: hyp(hw, hd) }); }
const STREET = ["Main Street", "Maple Lane", "Goose Way", "Cliff Road", "Cloud Isle"];
function house(x, z, y, yaw, d, size = 8) {   // it faces yaw (its door and mailbox that way); the mailbox stands 7 m in front
  const fx = Math.sin(yaw), fz = Math.cos(yaw), n = houses.filter((h) => h.d === d).length + 1;
  houses.push({ id: houses.length, x, z, y, yaw, d, size, mx: x + fx * (size / 2 + 3), mz: z + fz * (size / 2 + 3), my: y, name: n + " " + STREET[d] });
  solid(x, z, size / 2, size / 2, y - 1, y + 5, yaw);
}
function yard(h, side) {   // a fenced yard beside a house, open toward the road
  const fx = Math.sin(h.yaw), fz = Math.cos(h.yaw), rx = fz * side, rz = -fx * side, cx = h.x + rx * 9 + fx * 1, cz = h.z + rz * 9 + fz * 1, Y = 4;
  const P = (a, b) => [cx + rx * a + fx * b, cz + rz * a + fz * b];
  for (const [a0, b0, a1, b1] of [[-Y, -Y, Y, -Y], [Y, -Y, Y, Y], [-Y, -Y, -Y, Y]]) {   // back, far side, near side; the front is open
    const [x0, z0] = P(a0, b0), [x1, z1] = P(a1, b1), yaw = Math.atan2(x1 - x0, z1 - z0);
    solid((x0 + x1) / 2, (z0 + z1) / 2, 0.15, hyp(x1 - x0, z1 - z0) / 2, h.y - 1, h.y + 1.0, yaw); fences.push({ x0, z0, x1, z1, y: h.y });
  }
}
function pond(x, z, r, y, n, d) { const id = ponds.length; ponds.push({ id, x, z, r, y, d }); for (let k = 0; k < n; k++) { const a = (k / n) * TAU; geese.push({ id: geese.length, pond: id, x: x + Math.cos(a) * (r + 3), z: z + Math.sin(a) * (r + 3), y, d }); } }
const road = (x0, z0, x1, z1, w, alley) => roads.push({ k: "seg", x0, z0, x1, z1, w, alley: alley ? 1 : 0 });

function buildTown() {
  const rnd = rng(20261111);
  // ---- the ground ----
  rect(TOWN.x0, TOWN.x1, TOWN.z0, TOWN.z1, 0, "grass");
  rect(MARSH.x0, MARSH.x1, MARSH.z0, MARSH.z1, -0.45, "mud");
  rect(CLIFF.x0, CLIFF.x1, CLIFF.z0, CLIFF.z1, 0, "rock");
  // the marsh's boardwalks: a spine from the bridge to the mountain road, and three branches across it
  rect(MARSH.x0 - 2, MARSH.x1 + 2, -3.5, 3.5, 0.12, "plank", -0.6);
  for (const bx of MARSH_BR) rect(bx - 2.6, bx + 2.6, -100, 100, 0.12, "plank", -0.6);
  // the mountain: five terraces, each 10 m higher, and a ramp up to each along its west face (switchbacks)
  for (let n = 1; n <= 5; n++) { const t = TERRACE(n); rect(t.x0, t.x1, t.z0, t.z1, t.y, "rock", -40); const up = n % 2 === 1, za = up ? -26 : 14, zb = up ? 14 : -26; ramp(t.x0 - 8, t.x0, Math.min(za, zb), Math.max(za, zb), up ? t.y - 10 : t.y, up ? t.y : t.y - 10, "road"); }
  ISLES.forEach((s) => disc(s.x, s.z, s.r, s.y, "isle"));
  // ---- walls round the edges (a hedge round town, reeds round the marsh, rock round the mountain's foot); the road passes through ----
  const wall = (x0, x1, z0, z1, h) => solid((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2 + 0.5, Math.abs(z1 - z0) / 2 + 0.5, -5, h);
  wall(TOWN.x0, TOWN.x1, TOWN.z0, TOWN.z0, 6); wall(TOWN.x0, TOWN.x1, TOWN.z1, TOWN.z1, 6); wall(TOWN.x0, TOWN.x0, TOWN.z0, TOWN.z1, 6);
  wall(TOWN.x1, TOWN.x1, TOWN.z0, -6, 6); wall(TOWN.x1, TOWN.x1, 6, TOWN.z1, 6);
  wall(MARSH.x0, MARSH.x1, MARSH.z0, MARSH.z0, 6); wall(MARSH.x0, MARSH.x1, MARSH.z1, MARSH.z1, 6);
  wall(MARSH.x0, MARSH.x0, MARSH.z0, TOWN.z0, 6); wall(MARSH.x0, MARSH.x0, TOWN.z1, MARSH.z1, 6);
  wall(CLIFF.x0, CLIFF.x1, CLIFF.z0, CLIFF.z0, 6); wall(CLIFF.x0, CLIFF.x1, CLIFF.z1, CLIFF.z1, 6); wall(CLIFF.x1, CLIFF.x1, CLIFF.z0, CLIFF.z1, 70);
  wall(CLIFF.x0, CLIFF.x0, CLIFF.z0, -6, 6); wall(CLIFF.x0, CLIFF.x0, 6, CLIFF.z1, 6);
  // ---- the post office: the counter, and four posts for its roof ----
  solid(PO.x, PO.z, PO.counter, PO.counter, -1, 1.3);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) solid(PO.x + sx * PO.roof, PO.z + sz * PO.roof, 0.5, 0.5, -1, 7);
  // ---- the road: the post office's square, then one road east to the marsh bridge; a back alley each side ----
  road(-24, 0, 24, 0, 48); road(24, 0, TOWN.x1 + 2, 0, 8);
  for (const z of [-33, 33]) { road(30, z, 545, z, 3.5, true); for (const x of [90, 200, 330, 470]) boosts.push({ x, z, y: 0, yaw: Math.PI / 2 }); }
  for (const x of [60, 160, 290, 420, 540]) boosts.push({ x, z: 0, y: 0, yaw: Math.PI / 2 });
  // ---- Main Street: 20 houses facing the road, both sides ----
  for (let k = 0; k < 10; k++) for (const sd of [1, -1]) house(42 + k * 21, sd * 17, 0, sd > 0 ? Math.PI : 0, 0);
  for (const k of [9, 12, 17]) yard(houses[k], k % 2 ? 1 : -1);
  pond(150, 50, 6, 0, 3, 0);
  // ---- Maple Suburbs: 30 houses facing the road, fenced yards at two in three ----
  for (let k = 0; k < 15; k++) for (const sd of [1, -1]) house(266 + k * 22, sd * 18, 0, sd > 0 ? Math.PI : 0, 1);
  houses.filter((h) => h.d === 1).forEach((h, n) => { if (n % 3 !== 2 && h.x < 560) yard(h, Math.floor(n / 2) % 2 ? 1 : -1); });
  pond(320, -56, 8, 0, 5, 1); pond(440, 56, 8, 0, 5, 1); pond(530, -56, 7, 0, 5, 1);
  for (let k = 0; k < 8; k++) sprinklers.push({ x: 285 + k * 40, z: k % 2 ? 7 : -7, y: 0, ph: k * 1.7 });
  // ---- Goose Marsh: 20 houses on platforms beside the boardwalks; four ponds with a flock each ----
  let mh = 0;
  for (const bx of MARSH_BR) for (const bz of [-84, -52, -24, 24, 52, 84]) { if (mh >= 20) break; const side = (mh++ % 2 ? 1 : -1), x = bx + side * 11.6; rect(x - 5.5, x + 5.5, bz - 5.5, bz + 5.5, 0.12, "plank", -0.6); rect(Math.min(bx, x), Math.max(bx, x), bz - 2, bz + 2, 0.12, "plank", -0.6); house(x + side * 1, bz, 0.12, side > 0 ? -Math.PI / 2 : Math.PI / 2, 2, 7); }
  for (const [x, z] of [[318 + D, -16], [318 + D, 16]]) { rect(x - 5.5, x + 5.5, z - 5.5 + Math.sign(z) * 2, z + 5.5 + Math.sign(z) * 2, 0.12, "plank", -0.6); house(x, z + Math.sign(z) * 3, 0.12, z > 0 ? Math.PI : 0, 2, 7); }
  for (const [x, z] of [[217, -40], [267, 40], [217, 68], [267, -70], [312, 60]]) pond(x + D, z, 12, -0.45, 5, 2);
  // ---- Cliffside: three houses on each of the first four terraces' side ledges, three on top; the Sky Cannon on top ----
  for (let n = 1; n <= 4; n++) { const t = TERRACE(n), nx = TERRACE(n + 1), south = n % 2 === 0, z = south ? (t.z1 + nx.z1) / 2 + 2 : (t.z0 + nx.z0) / 2 - 2, xa = nx.x0 + 12; for (let k = 0; k < 3; k++) house(xa + (k * (458 + D - xa)) / 2, z + (south ? -3.4 : 3.4), t.y, south ? 0 : Math.PI, 3, 6); }
  { const t = TERRACE(5); house(t.x0 + 16, -20, t.y, 0, 3, 6); house(t.x0 + 16, 20, t.y, Math.PI, 3, 6); house(t.x0 + 38, -22, t.y, 0, 3, 6); }
  // ---- the Floating Islands: jump pads between them; a balloon home from the first and the last ----
  for (const [a, b] of ISLE_LINKS) for (const [f, t] of [[a, b], [b, a]]) { const A = ISLES[f], B = ISLES[t], d = hyp(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / d, uz = (B.z - A.z) / d; pads.push({ x: A.x + ux * (A.r - 3), z: A.z + uz * (A.r - 3), y: A.y, tx: B.x - ux * (B.r - 7), tz: B.z - uz * (B.r - 7), ty: B.y, from: f, to: t }); }
  balloons.push({ x: ISLES[0].x - 12, z: ISLES[0].z + 8, y: ISLES[0].y }, { x: ISLES[5].x + 6, z: ISLES[5].z + 10, y: ISLES[5].y });
  // each island's two houses stand where they're farthest from its pads, landing spots, balloon and middle (owner, 2026-11-11: couriers landed inside them)
  ISLES.forEach((s, n) => {
    const keep = [{ x: s.x, z: s.z }, ...pads.filter((p) => p.from === n), ...pads.filter((p) => p.to === n).map((p) => ({ x: p.tx, z: p.tz })), ...balloons.filter((b) => hyp(b.x - s.x, b.z - s.z) < s.r)]; if (n === CANNON.to) keep.push({ x: s.x - 9, z: s.z });
    for (let k = 0; k < 2; k++) { let best = null, bs = -1;
      for (let q = 0; q < 72; q++) { const a = (q / 72) * TAU, x = s.x + Math.cos(a) * s.r * 0.62, z = s.z + Math.sin(a) * s.r * 0.62, yaw = Math.atan2(s.x - x, s.z - z), mx = x + Math.sin(yaw) * 5.5, mz = z + Math.cos(yaw) * 5.5;
        const sc = Math.min(...keep.map((o) => Math.min(hyp(o.x - x, o.z - z) - 3.6, hyp(o.x - mx, o.z - mz)))); if (sc > bs) { bs = sc; best = { x, z, yaw }; } }
      house(best.x, best.z, s.y, best.yaw, 4, 5); keep.push({ x: best.x, z: best.z }, { x: best.x + Math.sin(best.yaw) * 5.5, z: best.z + Math.cos(best.yaw) * 5.5 }); }
  });
  boosts.push({ x: 175 + D, z: 0, y: 0.12, yaw: Math.PI / 2 }, { x: 265 + D, z: 0, y: 0.12, yaw: Math.PI / 2 });
  // ---- the zipline tower at the end of the suburbs (down into the marsh; and the one from the mountain top back to it) ----
  rect(586, 594, 26, 38, 12, "stone"); ramp(586, 594, 38, 68, 12, 0, "stone");
  zips.push({ x: 590, z: 28.5, y: 12, tx: 267 + D, tz: 0, ty: 0.12 }, { x: TERRACE(5).x0 + 4, z: 28, y: 50, tx: 590, tz: 31.5, ty: 12 });
  for (let n = 1; n <= 4; n++) { const t = TERRACE(n), nx = TERRACE(n + 1), south = n % 2 === 1;                      // rooftop hops: four roofs up each terrace's face, on the ledge across from its houses
    for (let k = 0; k < 4; k++) { const x = nx.x0 + 26 + 3.2 * k; rect(x, x + 3.2, south ? nx.z1 : nx.z0 - 4, south ? nx.z1 + 4 : nx.z0, t.y + STEP_H * (k + 1), "roof", t.y); } }
  // ---- goats: two on each of the first four terraces ----
  for (let n = 1; n <= 4; n++) for (const sd of [1, -1]) { const t = TERRACE(n); goats.push({ id: goats.length, hx: t.x0 + 4, hz: sd * 44, y: t.y }); }
  // ---- trees where there's room ----
  for (let n = 0, tries = 0; n < 150 && tries < 6000; tries++) {
    const x = TOWN.x0 + 6 + rnd() * (TOWN.x1 - TOWN.x0 - 12), z = TOWN.z0 + 6 + rnd() * (TOWN.z1 - TOWN.z0 - 12);
    if (hyp(x, z) < 32 || Math.abs(z) < 8 || Math.abs(Math.abs(z) - 33) < 4.5 || (x > 578 && z > 18) || hyp(x - PIPE.a.x, z - PIPE.a.z) < 6 || sprinklers.some((q) => hyp(q.x - x, q.z - z) < 4)) continue;
    if (houses.some((h) => hyp(h.x - x, h.z - z) < 12 || hyp(h.mx - x, h.mz - z) < 5) || fences.some((f) => hyp((f.x0 + f.x1) / 2 - x, (f.z0 + f.z1) / 2 - z) < 6) || ponds.some((p) => hyp(p.x - x, p.z - z) < p.r + 4) || trees.some((t) => hyp(t.x - x, t.z - z) < 5)) continue;
    trees.push({ x, z, y: 0, s: 0.8 + rnd() * 0.6 }); solid(x, z, 0.45, 0.45, -1, 8); n++;
  }
}
buildTown();

// the ground's top under (x, z): the highest slab top at most a step (0.6 m) above y; -Infinity where there's nothing
function topOf(s, x, z) { return s.k === 2 ? s.ya + ((s.yb - s.ya) * (z - s.z0)) / (s.z1 - s.z0) : s.y; }
const inSlab = (s, x, z) => x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && (s.k !== 1 || hyp(x - s.x, z - s.z) <= s.r);
export function surfaceAt(x, z, y) { let best = -Infinity; for (const s of slabs) if (inSlab(s, x, z)) { const t = topOf(s, x, z); if (t <= y + 0.6 && t > best) best = t; } return best; }
export function groundKind(x, z, y) { let best = -Infinity, kind = ""; for (const s of slabs) if (inSlab(s, x, z)) { const t = topOf(s, x, z); if (t <= y + 0.6 && t > best) { best = t; kind = s.kind; } } return kind; }
export function inPond(x, z, y) { for (const p of ponds) if (Math.abs(y - p.y) < 1.5 && hyp(x - p.x, z - p.z) < p.r) return p; return null; }
// is (x, z) at height y inside something solid: a slab's side (its top more than a step above) or a solid box?
export function wallAt(x, z, y) {
  for (const s of slabs) if (inSlab(s, x, z)) { const t = topOf(s, x, z); if (t > y + 0.6 && s.b < y + 1.4) return true; }
  for (const o of solids) { if (y + 1.4 < o.y0 || y + 0.25 > o.y1) continue; const dx = x - o.x, dz = z - o.z; if (Math.abs(dx) > o.rad || Math.abs(dz) > o.rad) continue; if (Math.abs(dx * o.c - dz * o.s) < o.hw && Math.abs(dx * o.s + dz * o.c) < o.hd) return true; }
  return false;
}
export function blocked(x, z, y, r = 0.55) { return wallAt(x, z, y) || wallAt(x + r, z, y) || wallAt(x - r, z, y) || wallAt(x, z + r, y) || wallAt(x, z - r, y); }
// how far (x, z) is from the conveyor (the counter's edge)
export const counterDist = (x, z) => { const dx = Math.max(Math.abs(x - PO.x) - PO.counter, 0), dz = Math.max(Math.abs(z - PO.z) - PO.counter, 0); return hyp(dx, dz); };
export const inSafeZone = (x, z, y = 0) => y < 8 && hyp(x - PO.x, z - PO.z) < SAFE_R;
export const housesIn = (d) => houses.filter((h) => h.d === d);
// which island (x, z) is over (or -1)
export function isleAt(x, z) { for (let n = 0; n < ISLES.length; n++) if (hyp(x - ISLES[n].x, z - ISLES[n].z) <= ISLES[n].r + 0.5) return n; return -1; }

// dogs roam their district (owner, 2026-11-11: not waiting in yards you can ride round): where each starts
// each district's dogs are quicker to notice you and faster than the last (owner, 2026-11-11: harder the farther out)
export const DOG_D = [{ trigger: 8, speed: 10.5 }, { trigger: 10, speed: 11.5 }, { trigger: 11, speed: 12.5 }, { trigger: 12, speed: 13.5 }, { trigger: 12, speed: 14 }];
export function roamOk(x, z, y, d) { return Math.abs(surfaceAt(x, z, y + 0.5) - y) < 0.55 && !blocked(x, z, y, 0.6) && !inSafeZone(x, z, y) && hyp(x - PO.x, z - PO.z) > SAFE_R + 4 && districtAt(x, z, y) === d && !inPond(x, z, y); }
(function populate() {   // dogs, more of them the farther out (and within a district, thicker toward its far end)
  const rnd = rng(77123), far = () => Math.sqrt(rnd()), put = (n, d, pt) => { for (let k = 0, tries = 0; k < n && tries < 6000; tries++) { const [x, z, y] = pt(); if (!roamOk(x, z, y, d) || dogs.some((q) => hyp(q.hx - x, q.hz - z) < 12)) continue; dogs.push({ id: dogs.length, hx: x, hz: z, y, d, look: Math.floor(rnd() * 3) }); k++; } };
  put(5, 0, () => [70 + far() * 170, (rnd() - 0.5) * 140, 0]);
  put(16, 1, () => [255 + far() * 335, (rnd() - 0.5) * 150, 0]);
  put(13, 2, () => { const b = MARSH_BR[Math.floor(far() * 2.999)], spine = rnd() < 0.3; return spine ? [MARSH.x0 + 8 + far() * 160, (rnd() - 0.5) * 5, 0.12] : [b + (rnd() - 0.5) * 3.5, (rnd() - 0.5) * 190, 0.12]; });
  put(11, 3, () => { const t = TERRACE(1 + Math.floor(far() * 4.999)); return [t.x0 + 2 + rnd() * (t.x1 - t.x0 - 4), t.z0 + 2 + rnd() * (t.z1 - t.z0 - 4), t.y]; });
  put(4, 4, () => { const n = 1 + Math.floor(rnd() * 5), I = ISLES[n], a = rnd() * TAU, r = rnd() * I.r * 0.7; return [I.x + Math.cos(a) * r, I.z + Math.sin(a) * r, I.y]; });
})();
