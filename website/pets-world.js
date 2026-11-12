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
// modifiers: one parcel in five is timed (Express). (owner, 2026-11-11) only the rarer tiers and timed parcels stay:
// Fragile, Heavy and Golden went
export const MODS = { express: { name: "Express", bonus: 1.5 } };
export const MOD_CHANCE = 0.2, EMPTY_FAST = 2, BASE_DUR = 3, BASE_COINS = 10, HIT_CUT = 0.2, MUD_SLOW = 0.75;   // (owner, 2026-11-11) empty, a mount goes twice as fast
// reward rolls: chance, coins, Training XP, Level Coupons (and the chance of one), and the chance of a mount: (owner,
// 2026-11-11) the parcel's area's animal, at the parcel's rarity (a Rare parcel from the Marsh: a Rare Gator)
export const ROLLS = [
  { chance: 0.6, coins: [4, 10], xp: 6, coupons: 0, couponChance: 0, pet: 0.05 },
  { chance: 0.25, coins: [15, 30], xp: 14, coupons: 0, couponChance: 0, pet: 0.1 },
  { chance: 0.1, coins: [50, 100], xp: 0, coupons: 0, couponChance: 0.3, pet: 0.2 },
  { chance: 0.04, coins: [220, 420], xp: 0, coupons: 1, couponChance: 0, pet: 0.4 },
  { chance: 0.01, coins: [1500, 2600], xp: 0, coupons: 2, couponChance: 0, pet: 0.75 },
];
// luck moves the odds toward the rarer tiers: tier n's chance is weighted by (1 + luck)^n
export function rollOdds(luck) { const w = ROLLS.map((r, n) => r.chance * Math.pow(1 + luck, n)), s = w.reduce((a, b) => a + b, 0); return w.map((v) => v / s); }
// courier upgrades: 10 levels each; a level costs base x 1.8^(level - 1). (owner, 2026-11-11) Route Permits went: the
// districts open by themselves as your mounts level up (and what was spent on permits came back as coins)
export const UPGRADES = {
  payout: { name: "Payout", base: 300 }, stamps: { name: "Lucky Stamps", base: 500 },
  press: { name: "Coupon Press", base: 400 }, boxes: { name: "Sturdy Boxes", base: 350 },
};
export const UP_MAX = 10, upgradeCost = (k, lv) => Math.round(UPGRADES[k].base * Math.pow(1.8, lv));   // the cost of going from lv to lv + 1
// the districts open: one more as your best mount reaches each of these levels
export const OPEN_LV = [1, 3, 6, 9, 12];
export const districtsOpen = (lv) => OPEN_LV.filter((l) => lv >= l).length;
export const topLevel = (d) => Math.max(1, ...((d && d.mounts) || []).map((m) => m.lv));
export const openFor = (d) => districtsOpen(topLevel(d));
// which tiers a courier's conveyor gives: only open districts; the more are open, the more of the higher tiers, and the
// ridden mount's level lifts them too (owner, 2026-11-11: the higher level, the pricier the parcels and the farther the trips)
export function spawnWeights(open, lv = 1) {
  open = clamp(open | 0, 1, TIERS.length); const w = TIERS.map((t, n) => (n < open ? t.w * (1 + (n * (open - 1)) / 5) * (1 + (n * (lv - 1)) / 8) : 0)), s = w.reduce((a, b) => a + b, 0), p = w.map((v) => v / s);
  // (owner, 2026-11-11) at least 30% go to the farthest area you've opened; the rest spread over the ones in between
  const top = open - 1; if (top > 0 && p[top] < TOP_SHARE) { const rest = 1 - p[top]; for (let n = 0; n < top; n++) p[n] *= (1 - TOP_SHARE) / rest; p[top] = TOP_SHARE; }
  return p;
}
export const TOP_SHARE = 0.3;
export const stampLuck = (lv) => 0.0405 * lv, payoutMult = (lv) => 1 + 0.1 * lv, pressChance = (lv) => 0.01 * lv, boxDur = (lv) => BASE_DUR + (lv >= 5) + (lv >= 10);
export const upTotal = (up) => Object.keys(UPGRADES).reduce((a, k) => a + (up[k] || 0), 0);
export const RANKS = ["", "Bronze", "Silver", "Gold", "Platinum"], RANK_C = ["", "#b9763c", "#b8c2cc", "#f2b01e", "#bfe9ff"];
export const rankOf = (total) => (total >= 30 ? 4 : total >= 20 ? 3 : total >= 10 ? 2 : total >= 1 ? 1 : 0);   // of 40 levels
// (owner, 2026-11-11) the mounts are the areas' animals: each area has one kind (Main Street dogs, Maple Suburbs cats,
// Goose Marsh gators, Cliffside bears, the Floating Islands wolves), and each comes Common to Legendary. A mount is a kind
// and a rarity (m.r): the rarity sets its coat, its stats and how it shows; the kind sets its ability. An area's parcels
// drop its kind, at the parcel's rarity. The town's animals wear the same coats.
export const MOUNTS = {
  dog: { name: "Dog", ab: "bark", look: "pup", size: 1, coats: [["#c98a4b", "#f3dcc0"], ["#8a5a34", "#e9d6b8"], ["#3d4650", "#cfd6dd"], ["#e8e2d8", "#c9a27e"], ["#2b2f36", "#f2b01e"]] },
  cat: { name: "Cat", ab: "jump2", look: "cat", size: 0.95, coats: [["#f0a04b", "#fff1dc"], ["#b9b2a8", "#ffffff"], ["#3d4650", "#e9eef2"], ["#f4f1ea", "#9aa8ff"], ["#1d232a", "#a45be0"]] },
  gator: { name: "Gator", ab: "dash", look: "gator", size: 1, coats: [["#4f7a3a", "#c9d48a"], ["#3f6a4a", "#b9c98a"], ["#2f5f6a", "#9fd8c8"], ["#5a3f7a", "#d9b9f0"], ["#c9a23a", "#fff3b8"]] },
  bear: { name: "Bear", ab: "bark", look: "bear", size: 1.05, coats: [["#7a5236", "#c9a27e"], ["#3a2c22", "#8a6a4e"], ["#c9a27e", "#f3e3cc"], ["#f4f6f8", "#c9d6e2"], ["#2b2f36", "#f2b01e"]] },
  wolf: { name: "Wolf", ab: "dash", look: "wolf", size: 1, coats: [["#8a96a2", "#e9eef2"], ["#5a6470", "#cfd6dd"], ["#d9dde2", "#ffffff"], ["#3a4a6a", "#9ad8ff"], ["#f4f6f8", "#f2b01e"]] },
};
export const coat = (sp, r) => (MOUNTS[sp] || MOUNTS.dog).coats[clamp(r | 0, 0, 4)];
// the mounts from before (and their rarity): each became the area animal of that rarity, keeping its level and skin
export const MOUNT_MOVED = { pup: ["dog", 0], piglet: ["dog", 0], bunny: ["dog", 0], fox: ["cat", 1], deer: ["cat", 1], parrot: ["cat", 1], raptor: ["gator", 2], stego: ["gator", 2], pony: ["gator", 2], owl: ["gator", 2], trex: ["bear", 3], trike: ["bear", 3], unicorn: ["wolf", 4], dragon: ["wolf", 4] };
export const ABILITY = { bark: "Bark", dash: "Dash", jump2: "Double Jump" };
export const MAX_LV = 20, VARIANTS = ["", "Shiny", "Golden", "Rainbow"], SHINY = 0.01, GOLDEN = 0.001;
// (owner, 2026-11-11) two of the same mount (kind and rarity) with the same skin merge into the better of them (the higher level), which
// gets the next skin: normal, Shiny, Golden, Rainbow (Rainbow only by merging)
export const FUSE_N = 2;
export function fuseSet(mounts, id) {   // the ones a merge would take (the chosen one and the lowest-level other), or null
  const m = mounts.find((k) => k.id === id); if (!m || m.va >= VARIANTS.length - 1) return null;
  const same = mounts.filter((k) => k.sp === m.sp && k.r === m.r && k.va === m.va && k.id !== id).sort((a, b) => a.lv - b.lv || a.id - b.id);
  return same.length >= FUSE_N - 1 ? [m, ...same.slice(0, FUSE_N - 1)] : null;
}
export const levelCost = (lv) => Math.round(100 * Math.pow(1.6, lv - 1));   // coins to go from lv to lv + 1
export const xpNeed = (lv) => Math.round(30 * Math.pow(1.42, lv - 1));     // Training XP to go from lv to lv + 1
export const bagSize = (lv) => 1 + Math.floor(lv / 5);                      // parcels a mount carries at once (owner, 2026-11-11): 1, then +1 at levels 5, 10, 15 and 20
export const mountScale = (lv) => 1 + 0.079 * (lv - 1);                     // 1x at level 1, 2.5x at 20
export const abilityTier = (lv) => (lv >= 20 ? 3 : lv >= 10 ? 2 : lv >= 5 ? 1 : 0);
export function mountStats(m) {   // m: { r (rarity), lv }
  const r = clamp(m.r | 0, 0, 4), n = m.lv - 1;
  // (owner, 2026-11-11) faster as it levels: about 16 to 20 m/s at level 20
  return { speed: 10 + 0.6 * r + (0.3 + 0.03 * r) * n, jump: 8 + 0.25 * r + (0.08 + 0.01 * r) * n, grip: Math.min(0.6, 0.05 * r + 0.02 * n) };
}
// (owner, 2026-11-11) trails: one more to unlock every five areas opened (with five areas, the first at the Floating
// Islands); any mount can wear any trail you've unlocked
export const TRAILS = [{ k: "cloud", name: "Cloud Trail", zones: 5 }];
export const trailsFor = (d) => TRAILS.filter((t) => openFor(d) >= t.zones).map((t) => t.k);
export const ABILITY_CD = { bark: [0, 12, 9, 6], dash: [0, 8, 6, 4], jump2: [0, 0, 0, 0] };
// (owner, 2026-11-11) no eggs any more: parcels drop mounts. Eggs someone still had became a mount each (a Basic Egg a
// Common Dog, a Rare Egg a Rare Gator, a Legendary Egg a Legendary Wolf)
const EGG_TO = { basic: ["dog", 0], rare: ["gator", 2], legendary: ["wolf", 4] };
export const MOUNT_CAP = 60;
// kicks, dogs, geese (m and seconds)
export const KICK = { range: 3.6, half: 1.0, cd: 4, stun: 1, grace: 5, farm: 30, aoe: 4.5 };   // aoe: (owner, 2026-11-11) a kick hits every animal this near, whichever way you face
// (owner, 2026-11-11) the attack queue: a courier can be chased by at most `slots` animals at once (any kinds); after any
// animal attacks, none can for `calm` s, counted from when the parcel is back or lost (a stolen or dropped one holds it)
export const ATTACK = { slots: 2, calm: 3 };
// (owner, 2026-11-11) a dropped parcel has 15 s on the ground; picked up, its time stops; dropped again, it carries on
export const DROP_S = 15;
export const DOG = { trigger: 10, telegraph: 0.5, chase: 6, speed: 11.5, bite: 1.3, stun: 1.5, cool: 8, leash: 38, roam: 3.2, range: 45 };
export const GOOSE = { see: 7, telegraph: 1, lunge: 13, lungeFor: 2.2, touch: 1.4, carry: 7.2, dunk: 3, wander: 2.6, roam: 34, bonus: 15, cool: 6 };
export const GRAB_R = 3.4, DELIVER_R = 3, PICKUP_R = 2.2, SAFE_R = 20, EXPRESS_PER_M = 0.16, EXPRESS_MIN = 14;

// what a courier's saved data must look like (anything else is put right); a new courier gets a Pup
export function cleanData(d) {
  d = d && typeof d === "object" ? d : {};
  const int = (v, lo, hi, def) => (Number.isFinite(+v) ? clamp(Math.floor(+v), lo, hi) : def);
  const out = { v: 1, coins: int(d.coins, 0, 1e12, 0), coupons: int(d.coupons, 0, 1e6, 0), nextId: int(d.nextId, 1, 1e9, 1), mounts: [], ride: 0, up: {}, stats: {}, set: {}, fails: int(d.fails, 0, 99, 0) };
  for (const m of Array.isArray(d.mounts) ? d.mounts.slice(0, MOUNT_CAP) : []) {
    if (!m) continue; const now = MOUNTS[m.sp] && Number.isFinite(+m.r), old = MOUNT_MOVED[m.sp] || (m.sp === "cat" ? ["cat", 1] : null); if (!now && !old) continue;
    out.mounts.push({ id: int(m.id, 1, 1e9, 0) || out.nextId++, sp: now ? m.sp : old[0], r: now ? int(m.r, 0, 4, 0) : old[1], va: int(m.va, 0, 3, 0), lv: int(m.lv, 1, MAX_LV, 1), xp: int(m.xp, 0, 1e9, 0), ...(TRAILS.some((t) => t.k === m.tr) ? { tr: m.tr } : {}) });
  }
  out.nextId = Math.max(out.nextId, ...out.mounts.map((m) => m.id + 1));
  for (const k of Object.keys(EGG_TO)) for (let n = int(d.eggs && d.eggs[k], 0, MOUNT_CAP, 0); n > 0 && out.mounts.length < MOUNT_CAP; n--) out.mounts.push({ id: out.nextId++, sp: EGG_TO[k][0], r: EGG_TO[k][1], va: 0, lv: 1, xp: 0 });
  if (!out.mounts.length) out.mounts.push({ id: out.nextId++, sp: "dog", r: 0, va: 0, lv: 1, xp: 0 });
  out.nextId = Math.max(out.nextId, ...out.mounts.map((m) => m.id + 1));
  out.ride = out.mounts.some((m) => m.id === d.ride) ? d.ride : out.mounts[0].id;
  for (const k of Object.keys(UPGRADES)) out.up[k] = int(d.up && d.up[k], 0, UP_MAX, 0);
  const permits = int(d.up && d.up.routes, 0, UP_MAX, 0); for (let l = 0; l < permits; l++) out.coins += Math.round(250 * Math.pow(1.8, l));   // (owner, 2026-11-11) Route Permits went: their coins back, once (they're not saved again)
  out.gifts = (Array.isArray(d.gifts) ? d.gifts : []).slice(0, GIFT_CAP).filter((g) => g && Number.isFinite(+g.gid)).map((g) => ({ gid: int(g.gid, 1, 1e9, 1), r: int(g.r, 0, 4, 0), pt: int(g.pt, 0, 4, 0), ...(Number.isFinite(+g.m) ? { m: int(g.m, 1, 1e9, 1) } : {}) }));
  out.nextGid = Math.max(int(d.nextGid, 1, 1e9, 1), ...out.gifts.map((g) => g.gid + 1));
  for (const k of ["del", "golden", "geese", "kicks"]) out.stats[k] = int(d.stats && d.stats[k], 0, 1e9, 0);
  out.set = { friendly: !!(d.set && d.set.friendly), music: int(d.set && d.set.music, 0, 10, 5), sfx: int(d.set && d.set.sfx, 0, 10, 7), shirt: /^#[0-9a-f]{6}$/i.test(d.set && d.set.shirt) ? d.set.shirt : "#f2a33a", tut: !!(d.set && d.set.tut) };   // tut: the new-courier tutorial is done
  return out;
}
// a new parcel for the conveyor: its tier by the districts open (and the ridden mount's level), maybe timed
export function rollParcel(open, lv = 1, rnd = Math.random) {
  const w = spawnWeights(open, lv); let r = rnd(), tier = 0; for (let n = 0; n < w.length; n++) { if (r < w[n]) { tier = n; break; } r -= w[n]; }
  const mod = rnd() < MOD_CHANCE ? "express" : "";
  return { tier, mod };
}
// coins for a delivery: base 10 x tier x (1 + modifier bonus) x payout upgrade x (1 - 0.2 per hit taken). late: an Express parcel past its time
export function deliveryCoins(tier, mod, payoutLv, hits, late) {
  const bonus = MODS[mod] && !(mod === "express" && late) ? MODS[mod].bonus : 0;
  return Math.max(1, Math.round(BASE_COINS * TIERS[tier].mult * (1 + bonus) * payoutMult(payoutLv) * Math.max(0, 1 - HIT_CUT * hits)));
}
// the reward roll. Returns { tier, coins, xp, coupons, egg, near (it just missed Legendary) }. (owner, 2026-11-11) no
// Stamp Meter (pity) any more: every roll is its own
export function rewardRoll(tier, up, rnd = Math.random) {
  const odds = rollOdds(TIERS[tier].luck + stampLuck(up.stamps)); let r = rnd(), t = 0; for (let n = 0; n < odds.length; n++) { if (r < odds[n]) { t = n; break; } r -= odds[n]; t = n; }
  const near = t < 4 && r < 0.012 && t >= 3;
  return { tier: t, near, ...giftContents(t, tier, up, rnd) };
}
// what's inside a gift of rarity t from a parcel of tier pt (decided when it's opened, owner 2026-11-11)
export function giftContents(t, pt, up, rnd = Math.random) {
  const R = ROLLS[t], coins = Math.round((R.coins[0] + rnd() * (R.coins[1] - R.coins[0])) * Math.sqrt(TIERS[pt].mult));
  const coupons = R.coupons + (rnd() < R.couponChance ? 1 : 0) + (rnd() < pressChance(up.press) ? 1 : 0);
  const pet = rnd() < R.pet ? { sp: CHASERS[pt], r: t, va: skinRoll(rnd) } : null;
  return { coins, xp: R.xp, coupons, pet };
}
// (owner, 2026-11-11) four unopened gifts of one rarity merge into one of the next (its parcel tier: the best of the four)
export const MERGE_N = 4, GIFT_CAP = 60;
export function mergeGifts(gifts, nextGid) {   // merges in place; returns the merges made [{ from: [gid x4], to: gift }]
  const out = []; let again = true;
  while (again) { again = false;
    for (let r = 0; r < 4; r++) { const same = gifts.filter((g) => g.r === r); if (same.length < MERGE_N) continue;
      const four = same.slice(0, MERGE_N), to = { gid: nextGid(), r: r + 1, pt: Math.max(...four.map((g) => g.pt)) }; const m = four.find((g) => g.m); if (m) to.m = m.m;
      for (const g of four) gifts.splice(gifts.indexOf(g), 1); gifts.push(to); out.push({ from: four.map((g) => g.gid), to }); again = true; break; }
  }
  return out;
}
export const skinRoll = (rnd = Math.random) => { const v = rnd(); return v < GOLDEN ? 2 : v < GOLDEN + SHINY ? 1 : 0; };   // 1 in 100 Shiny, 1 in 1,000 Golden
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
// (owner, 2026-11-11) the post office is a building with a conveyor belt coming out of its door, pushing your parcel to
// the end, where you grab it. (x, z: the middle of its square; b: the building; belt: the conveyor; end: where your parcel waits)
export const PO = { x: 0, z: 0, b: { x: 0, z: -9, hw: 8, hd: 5, h: 6.5 }, belt: { z0: -4, z1: 5.2, hw: 1.3, top: 1.1 }, end: { x: 0, z: 3.9 } };
// (owner, 2026-11-11: neighborhoods three houses long) every district is short: three houses down each side of the road
export const SPAWN = { x: 0, z: 17 }, SUBURBS_X = 110, TOWN = { x0: -45, x1: 190, z0: -30, z1: 30 }, MARSH = { x0: 190, x1: 290, z0: -30, z1: 30 }, CLIFF = { x0: 290, x1: 415, z0: -30, z1: 30 };   // (owner, 2026-11-11) narrow: the road down the middle, houses both sides
export const TERRACE = (n) => ({ x0: 300 + 38 * (n - 1), x1: n === 3 ? 414 : 300 + 38 * n, z0: -27, z1: 27, y: 6 * n });   // n = 1..3: Cliffside's three steps, each with a ramp up the road onto it
export const ISLES = [{ x: 462, z: 0, y: 32, r: 18 }, { x: 512, z: -16, y: 38, r: 16 }, { x: 562, z: 6, y: 44, r: 17 }];
export const ISLE_X = 425, FALL_Y = 22;   // past ISLE_X and high up: the Floating Islands; below FALL_Y there, you've fallen off
const MARSH_X = [212, 240, 268];
// shortcuts: the sewer pipe (Main Street to the foot of Cliffside; a goose sits in it part of the time), ziplines
export const PIPE = { a: { x: 54.5, z: -25, y: 0 }, b: { x: 294, z: -24, y: 0 }, r: 2, time: 4, every: 24, goose: 8 };
export const pipeGoose = (t) => t % PIPE.every < PIPE.goose;   // t: seconds (the server's clock)
export const ZIP_SPEED = 24, STEP_H = 2;
// district hazards (the page runs sprinklers and wind off the server's clock; the server runs the rest)
export const SPRINKLER = { r: 5, push: 9, every: 6, on: 3 }, sprinklerOn = (s, t) => (t + s.ph) % SPRINKLER.every < SPRINKLER.on;
export const WIND = { every: 11, on: 3.5, push: 4.5 };
export function windAt(t) { const n = Math.floor(t / WIND.every), on = t - n * WIND.every < WIND.on, a = ((n * 2654435761) >>> 0) / 4294967296 * TAU; return { on, x: Math.cos(a), z: Math.sin(a) }; }
// (owner, 2026-11-11) goats charge faster
export const ROCK = { delay: 1, r: 2.3, stun: 1.5, every: [3, 6] }, GOAT = { see: 9, telegraph: 0.8, speed: 20, run: 0.95, touch: 1.6, knock: 15, cool: 6, roam: 2.4 }, SKYGOOSE = { delay: 1.4, r: 2.2, every: [8, 14] };
export const CANNON = { x: 408, z: 0, y: 18, r: 2.6, to: 0 }, SKY_Y = 24;
const ISLE_LINKS = [[0, 1], [1, 2]];
export function districtAt(x, z, y = 0) { return x > ISLE_X && y > SKY_Y ? 4 : x >= CLIFF.x0 ? 3 : x >= MARSH.x0 ? 2 : x >= SUBURBS_X ? 1 : 0; }

function rect(x0, x1, z0, z1, y, kind, b = y - 40) { slabs.push({ k: 0, x0, x1, z0, z1, y, b, kind }); }
function disc(x, z, r, y, kind, b = y - 6) { slabs.push({ k: 1, x, z, r, x0: x - r, x1: x + r, z0: z - r, z1: z + r, y, b, kind }); }
function ramp(x0, x1, z0, z1, y0, y1, kind) { slabs.push({ k: 2, x0, x1, z0, z1, y: Math.max(y0, y1), ya: y0, yb: y1, b: Math.min(y0, y1) - 40, kind }); }   // rises along z from ya (at z0) to yb (at z1)
function rampX(x0, x1, z0, z1, y0, y1, kind) { slabs.push({ k: 3, x0, x1, z0, z1, y: Math.max(y0, y1), ya: y0, yb: y1, b: Math.min(y0, y1) - 40, kind }); }   // rises along x from ya (at x0) to yb (at x1)
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
const row = (x0, d, z, y, size, yards) => { for (let k = 0; k < 3; k++) for (const sd of [1, -1]) { house(x0 + k * 21, sd * z, y, sd > 0 ? Math.PI : 0, d, size); if (yards && k === 0) yard(houses[houses.length - 1], -1); } };

function buildTown() {
  const rnd = rng(20261111);
  // ---- the ground ----
  rect(TOWN.x0, TOWN.x1, TOWN.z0, TOWN.z1, 0, "grass");
  rect(MARSH.x0, MARSH.x1, MARSH.z0, MARSH.z1, -0.45, "mud");
  rect(CLIFF.x0, CLIFF.x1, CLIFF.z0, CLIFF.z1, 0, "rock");
  ISLES.forEach((s) => disc(s.x, s.z, s.r, s.y, "isle"));
  // ---- walls round the edges; the road passes through ----
  const wall = (x0, x1, z0, z1, h) => solid((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0) / 2 + 0.5, Math.abs(z1 - z0) / 2 + 0.5, -5, h);
  wall(TOWN.x0, TOWN.x1, TOWN.z0, TOWN.z0, 6); wall(TOWN.x0, TOWN.x1, TOWN.z1, TOWN.z1, 6); wall(TOWN.x0, TOWN.x0, TOWN.z0, TOWN.z1, 6);
  wall(TOWN.x1, TOWN.x1, TOWN.z0, -6, 6); wall(TOWN.x1, TOWN.x1, 6, TOWN.z1, 6);
  wall(MARSH.x0, MARSH.x1, MARSH.z0, MARSH.z0, 6); wall(MARSH.x0, MARSH.x1, MARSH.z1, MARSH.z1, 6);
  wall(CLIFF.x0, CLIFF.x1, CLIFF.z0, CLIFF.z0, 6); wall(CLIFF.x0, CLIFF.x1, CLIFF.z1, CLIFF.z1, 6); wall(CLIFF.x1, CLIFF.x1, CLIFF.z0, CLIFF.z1, 40);
  wall(MARSH.x1, MARSH.x1, MARSH.z0, -6, 6); wall(MARSH.x1, MARSH.x1, 6, MARSH.z1, 6); wall(MARSH.x0, MARSH.x0, MARSH.z0, -6, 6); wall(MARSH.x0, MARSH.x0, 6, MARSH.z1, 6);
  // ---- the post office: the building, and the conveyor out of its door ----
  solid(PO.b.x, PO.b.z, PO.b.hw, PO.b.hd, -1, PO.b.h + 3);
  solid(PO.x, (PO.belt.z0 + PO.belt.z1) / 2, PO.belt.hw, (PO.belt.z1 - PO.belt.z0) / 2, -1, PO.belt.top + 0.05);
  // ---- the road: the post office's square, then one road east down the middle ----
  road(-24, 0, 24, 0, 44); road(24, 0, TOWN.x1 + 2, 0, 8);
  for (const x of [30, 100]) boosts.push({ x, z: 0, y: 0, yaw: Math.PI / 2 });
  // ---- Main Street: three houses each side ----
  row(44, 0, 17, 0, 8, false);
  // ---- Maple Suburbs: three each side, fenced yards, a pond, sprinklers ----
  row(126, 1, 18, 0, 8, true);
  pond(136.5, -22, 4.5, 0, 3, 1); pond(157.5, 22, 4.5, 0, 3, 1);   // ponds in the gaps between the houses
  // rougher going: low hedges across half the road, side to side (jump them or weave round)
  for (const [x, sd] of [[121, 1], [141, -1], [161, 1], [178, -1]]) { solid(x, sd * 2, 0.4, 2.1, -1, 0.9); fences.push({ x0: x, z0: sd * 0.2, x1: x, z1: sd * 3.9, y: 0, hedge: 1 }); }
  for (let k = 0; k < 4; k++) sprinklers.push({ x: 118 + k * 20, z: k % 2 ? 7 : -7, y: 0, ph: k * 1.7 });
  // ---- Goose Marsh: a broken boardwalk on (gaps of mud to jump), three houses each side on platforms, two ponds ----
  for (const [a, b] of [[MARSH.x0 - 2, 222], [226, 249], [253, 276], [280, MARSH.x1 + 2]]) rect(a, b, -3.5, 3.5, 0.12, "plank", -0.6);
  for (const x of MARSH_X) for (const sd of [1, -1]) { rect(x - 5.5, x + 5.5, Math.min(sd * 8, sd * 19), Math.max(sd * 8, sd * 19), 0.12, "plank", -0.6); house(x, sd * 15, 0.12, sd > 0 ? Math.PI : 0, 2, 7); }
  rect(MARSH_X[1] - 2.6, MARSH_X[1] + 2.6, -27, 27, 0.12, "plank", -0.6);   // a boardwalk across the middle
  pond(226, 23, 4.5, -0.45, 4, 2); pond(254, -23, 4.5, -0.45, 4, 2); pond(200, -14, 4, -0.45, 3, 2);
  boosts.push({ x: 226, z: 0, y: 0.12, yaw: Math.PI / 2 });
  // ---- Cliffside: three steps up the road, a house each side on each; goats; the Sky Cannon at the top ----
  for (let n = 1; n <= 3; n++) { const t = TERRACE(n); rect(t.x0, t.x1, t.z0, t.z1, t.y, "rock", -40); rampX(t.x0 - 14, t.x0, -4.5, 4.5, t.y - 6, t.y, "road"); house(t.x0 + 15, 17, t.y, Math.PI, 3, 6); house(t.x0 + 15, -17, t.y, 0, 3, 6);
    for (const [dx, z] of [[24, n % 2 ? 6 : -6], [30, n % 2 ? -7 : 7]]) solid(t.x0 + dx, z, 1.3, 1.3, t.y - 1, t.y + 2.2); }   // boulders on each step to ride round
  for (let n = 1; n <= 2; n++) { const t = TERRACE(n); for (let k = 0; k < 3; k++) { const x = t.x1 - 3.2 * (3 - k); rect(x, x + 3.2, 20, 26, t.y + STEP_H * (k + 1), "roof", t.y); } }   // rooftop hops: up the side of each step's face to the next
  // ---- the Floating Islands: jump pads between them; a balloon home from the last ----
  for (const [a, b] of ISLE_LINKS) for (const [f, t] of [[a, b], [b, a]]) { const A = ISLES[f], B = ISLES[t], d = hyp(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / d, uz = (B.z - A.z) / d; pads.push({ x: A.x + ux * (A.r - 3), z: A.z + uz * (A.r - 3), y: A.y, tx: B.x - ux * (B.r - 7), tz: B.z - uz * (B.r - 7), ty: B.y, from: f, to: t }); }
  balloons.push({ x: ISLES[2].x + 6, z: ISLES[2].z + 9, y: ISLES[2].y });
  // each island's two houses stand where they're farthest from its pads, landing spots, balloon and middle (owner, 2026-11-11: couriers landed inside them)
  ISLES.forEach((s, n) => {
    const keep = [{ x: s.x, z: s.z }, ...pads.filter((p) => p.from === n), ...pads.filter((p) => p.to === n).map((p) => ({ x: p.tx, z: p.tz })), ...balloons.filter((b) => hyp(b.x - s.x, b.z - s.z) < s.r)]; if (n === CANNON.to) keep.push({ x: s.x - 9, z: s.z });
    for (let k = 0; k < 2; k++) { let best = null, bs = -1;
      for (let q = 0; q < 72; q++) { const a = (q / 72) * TAU, x = s.x + Math.cos(a) * s.r * 0.62, z = s.z + Math.sin(a) * s.r * 0.62, yaw = Math.atan2(s.x - x, s.z - z), mx = x + Math.sin(yaw) * 5.5, mz = z + Math.cos(yaw) * 5.5;
        const sc = Math.min(...keep.map((o) => Math.min(hyp(o.x - x, o.z - z) - 3.6, hyp(o.x - mx, o.z - mz)))); if (sc > bs) { bs = sc; best = { x, z, yaw }; } }
      house(best.x, best.z, s.y, best.yaw, 4, 5); keep.push({ x: best.x, z: best.z }, { x: best.x + Math.sin(best.yaw) * 5.5, z: best.z + Math.cos(best.yaw) * 5.5 }); }
  });
  // ---- the zipline tower at the suburbs' end, down to the marsh's far side; and from the top step back to it ----
  rampX(176, 186, 19, 27, 0, 6, "stone"); rect(186, 189.4, 19, 27, 6, "stone");
  zips.push({ x: 187.7, z: 21, y: 6, tx: 284, tz: 0, ty: 0.12 }, { x: TERRACE(3).x0 + 30, z: 20, y: 18, tx: 187.7, tz: 25, ty: 6 });
  // ---- goats: one on each step, and one more on the top ----
  for (let n = 1; n <= 3; n++) { const t = TERRACE(n); goats.push({ id: goats.length, hx: t.x0 + 6, hz: n % 2 ? 22 : -22, y: t.y }); }
  goats.push({ id: goats.length, hx: TERRACE(3).x0 + 26, hz: -10, y: TERRACE(3).y });
  // ---- trees where there's room ----
  for (let n = 0, tries = 0; n < 24 && tries < 4000; tries++) {
    const x = TOWN.x0 + 6 + rnd() * (TOWN.x1 - TOWN.x0 - 12), z = TOWN.z0 + 6 + rnd() * (TOWN.z1 - TOWN.z0 - 12);
    if (hyp(x, z) < 26 || Math.abs(z) < 23 || (x > 172 && z > 16) || hyp(x - PIPE.a.x, z - PIPE.a.z) < 6 || sprinklers.some((q) => hyp(q.x - x, q.z - z) < 4)) continue;
    if (houses.some((h) => hyp(h.x - x, h.z - z) < 12 || hyp(h.mx - x, h.mz - z) < 5) || fences.some((f) => hyp((f.x0 + f.x1) / 2 - x, (f.z0 + f.z1) / 2 - z) < 6) || ponds.some((p) => hyp(p.x - x, p.z - z) < p.r + 4) || trees.some((t) => hyp(t.x - x, t.z - z) < 5)) continue;
    trees.push({ x, z, y: 0, s: 0.8 + rnd() * 0.6 }); solid(x, z, 0.45, 0.45, -1, 8); n++;
  }
}
buildTown();

// the ground's top under (x, z): the highest slab top at most a step (0.6 m) above y; -Infinity where there's nothing
function topOf(s, x, z) { return s.k === 2 ? s.ya + ((s.yb - s.ya) * (z - s.z0)) / (s.z1 - s.z0) : s.k === 3 ? s.ya + ((s.yb - s.ya) * (x - s.x0)) / (s.x1 - s.x0) : s.y; }
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
export function blocked(x, z, y, r = 0.55) {
  if (wallAt(x, z, y) || wallAt(x + r, z, y) || wallAt(x - r, z, y) || wallAt(x, z + r, y) || wallAt(x, z - r, y)) return true;
  const k = r * 0.7; return r > 0.6 && (wallAt(x + k, z + k, y) || wallAt(x - k, z + k, y) || wallAt(x + k, z - k, y) || wallAt(x - k, z - k, y));   // a wide body: its corners too, so a tree can't slip between
}
// how far (x, z) is from your parcel at the conveyor's end
export const counterDist = (x, z) => Math.max(0, hyp(x - PO.end.x, z - PO.end.z) - 1.8);
export const inSafeZone = (x, z, y = 0) => y < 8 && hyp(x - PO.x, z - PO.z) < SAFE_R;
export const housesIn = (d) => houses.filter((h) => h.d === d);
// which island (x, z) is over (or -1)
export function isleAt(x, z) { for (let n = 0; n < ISLES.length; n++) if (hyp(x - ISLES[n].x, z - ISLES[n].z) <= ISLES[n].r + 0.5) return n; return -1; }

// dogs roam their district (owner, 2026-11-11: not waiting in yards you can ride round): where each starts
// each district's dogs are quicker to notice you and faster than the last (owner, 2026-11-11: harder the farther out)
export const DOG_D = [{ trigger: 8, speed: 10.5, telegraph: 0.7, chase: 4 }, { trigger: 10, speed: 11.5, telegraph: 0.55, chase: 5 }, { trigger: 11, speed: 12.5, telegraph: 0.45, chase: 6 }, { trigger: 12, speed: 13.5, telegraph: 0.35, chase: 7 }, { trigger: 12, speed: 14.5, telegraph: 0.3, chase: 7 }];
// geese farther out see you sooner, honk for less time and lunge faster
export const GOOSE_D = [{ see: 6, telegraph: 1.2, lunge: 11.5 }, { see: 7, telegraph: 1, lunge: 13 }, { see: 8, telegraph: 0.8, lunge: 14.5 }, { see: 9, telegraph: 0.65, lunge: 15.5 }, { see: 9, telegraph: 0.6, lunge: 16 }];
// (owner, 2026-11-11) a mount outgrows the easier areas' animals: its chance to shake off a bite or a goose's grab
// (no stun, no hit, the parcel kept) grows with its level, 8% a level past 4 x the area's number, up to 85%
export const shakeOff = (lv, d, r = 0) => clamp((lv - 1 - 4 * d - 2 * r) * 0.08, 0, 0.85);   // r: the animal's rarity (each rank counts as half an area)
// (owner, 2026-11-11) each area has its own chasers, each one Common to Legendary: Main Street dogs, Maple Suburbs cats,
// Goose Marsh gators, Cliffside bears, the Floating Islands wolves. (They're all in `dogs`; geese and goats get rarities too.)
export const CHASERS = ["dog", "cat", "gator", "bear", "wolf"], CHASER_NAME = { dog: "Dog", cat: "Cat", gator: "Gator", bear: "Bear", wolf: "Wolf" };
export const ANIMAL_RW = [50, 25, 14, 8, 3];   // how often each rarity turns up
// a rarer animal is quicker, notices you sooner, wastes less time and keeps after you longer
export function chaserStats(q) { const D = DOG_D[q.d], r = q.r || 0; return { trigger: D.trigger + 0.8 * r, speed: D.speed * (1 + 0.06 * r), telegraph: D.telegraph * (1 - 0.1 * r), chase: D.chase + 0.5 * r }; }
export function gooseStats(g) { const D = GOOSE_D[g.d], r = g.r || 0; return { see: D.see + 0.6 * r, telegraph: D.telegraph * (1 - 0.1 * r), lunge: D.lunge * (1 + 0.06 * r) }; }
export const goatSpeed = (g) => GOAT.speed * (1 + 0.05 * (g.r || 0));
// (owner, 2026-11-11) areas you haven't opened are there to see but closed off: the road's gate at each one's start (the
// Floating Islands: the Sky Cannon). A courier can always head back west.
export const GATES = [SUBURBS_X, MARSH.x0, CLIFF.x0];
export const gateX = (open) => (open - 1 < GATES.length ? GATES[open - 1] : Infinity);   // the first closed gate's x
export const zoneOpen = (open, d) => d < open;
export function roamOk(x, z, y, d) { return Math.abs(surfaceAt(x, z, y + 0.5) - y) < 0.55 && !blocked(x, z, y, 0.6) && !inSafeZone(x, z, y) && hyp(x - PO.x, z - PO.z) > SAFE_R + 4 && districtAt(x, z, y) === d && !inPond(x, z, y); }
// (owner, 2026-11-11: geese are stopped by houses and trees too) a goose that would start inside something moves round its pond to a clear spot
for (const g of geese) if (blocked(g.x, g.z, g.y, 0.6)) { const P = ponds[g.pond], a0 = Math.atan2(g.z - P.z, g.x - P.x);
  for (let k = 1; k < 48; k++) { const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (TAU / 48), x = P.x + Math.cos(a) * (P.r + 3), z = P.z + Math.sin(a) * (P.r + 3); if (!blocked(x, z, g.y, 0.6) && surfaceAt(x, z, g.y + 0.5) > -1e9) { g.x = x; g.z = z; break; } } }
(function populate() {   // dogs, more of them the farther out
  const rnd = rng(77123), put = (n, d, pt) => { for (let k = 0, tries = 0; k < n && tries < 6000; tries++) { const [x, z, y] = pt(); if (!roamOk(x, z, y, d) || dogs.some((q) => hyp(q.hx - x, q.hz - z) < 10)) continue; dogs.push({ id: dogs.length, hx: x, hz: z, y, d, look: Math.floor(rnd() * 3), sp: CHASERS[d], r: 0 }); k++; } };
  put(2, 0, () => [40 + rnd() * 65, (rnd() - 0.5) * 50, 0]);
  put(4, 1, () => [112 + rnd() * 75, (rnd() - 0.5) * 50, 0]);
  put(5, 2, () => rnd() < 0.6 ? [MARSH.x0 + 4 + rnd() * 92, (rnd() - 0.5) * 5, 0.12] : [MARSH_X[1] + (rnd() - 0.5) * 3.5, (rnd() - 0.5) * 50, 0.12]);
  put(6, 3, () => { const t = TERRACE(1 + Math.floor(rnd() * 3)); return [t.x0 + 2 + rnd() * (t.x1 - t.x0 - 4), t.z0 + 2 + rnd() * (t.z1 - t.z0 - 4), t.y]; });
  put(3, 4, () => { const I = ISLES[1 + Math.floor(rnd() * 2)], a = rnd() * TAU, r = rnd() * I.r * 0.7; return [I.x + Math.cos(a) * r, I.z + Math.sin(a) * r, I.y]; });
  // every animal's rarity: fixed for the town (the same for everyone), rarer ones farther out a little more often
  const roll = (d) => { const w = ANIMAL_RW.map((v, n) => v * Math.pow(1 + 0.12 * d, n)), s = w.reduce((a, b) => a + b, 0); let x = rnd() * s; for (let n = 0; n < w.length; n++) { if (x < w[n]) return n; x -= w[n]; } return 0; };
  for (const q of dogs) q.r = roll(q.d);
  for (const g of geese) g.r = roll(g.d);
  for (const g of goats) { g.d = 3; g.r = roll(3); }
})();
