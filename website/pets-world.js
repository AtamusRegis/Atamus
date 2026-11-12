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
  // (owner, 2026-11-12) the five zones past the Floating Islands
  { k: "frost", name: "Frost", c: "#9fe0ff", mult: 22, luck: 1.2, w: 3 },
  { k: "dune", name: "Dune", c: "#e8b96a", mult: 32, luck: 1.4, w: 2.5 },
  { k: "jungle", name: "Jungle", c: "#4fae5a", mult: 45, luck: 1.6, w: 2 },
  { k: "magma", name: "Magma", c: "#ff6a1f", mult: 62, luck: 1.8, w: 1.5 },
  { k: "star", name: "Star", c: "#c9a6ff", mult: 85, luck: 2, w: 1 },
];
export const DISTRICTS = ["Main Street", "Maple Suburbs", "Goose Marsh", "Cliffside", "Floating Islands", "Frostbite Fields", "Sunscorch Dunes", "Jungle Ruins", "Lava Flats", "Moon Garden"];
// modifiers: one parcel in five is timed (Express). (owner, 2026-11-11) only the rarer tiers and timed parcels stay:
// Fragile, Heavy and Golden went
export const MODS = { express: { name: "Express", bonus: 1.5 } };
export const MOD_CHANCE = 0.2, EMPTY_FAST = 2, BASE_DUR = 3, BASE_COINS = 10, HIT_CUT = 0.2, MUD_SLOW = 0.75;   // (owner, 2026-11-11) empty, a mount goes twice as fast
// reward rolls: chance, coins, and the chance of a mount (owner, 2026-11-11: no mount levels, so no Training XP or
// Level Coupons any more): (owner,
// 2026-11-11) the parcel's area's animal, at the parcel's rarity or lower (a Rare parcel from the Marsh: a Common,
// Uncommon or Rare Gator; see PET_CHANCE)
export const ROLLS = [
  { chance: 0.6, coins: [4, 10] },
  { chance: 0.25, coins: [15, 30] },
  { chance: 0.1, coins: [50, 100] },
  { chance: 0.04, coins: [220, 420] },
  { chance: 0.01, coins: [1500, 2600] },
];
// (owner, 2026-11-12) the chance of each rarity of mount from a parcel that can give it: a parcel tries its own rarity
// first, then each one below (a Legendary parcel: 1% Legendary, else 5% Epic, else 10% Rare, else 20% Uncommon, else
// 40% Common); one mount at most
export const PET_CHANCE = [0.4, 0.2, 0.1, 0.05, 0.01];   // (owner, 2026-11-12)
// luck moves the odds toward the rarer tiers: tier n's chance is weighted by (1 + luck)^n
export function rollOdds(luck) { const w = ROLLS.map((r, n) => r.chance * Math.pow(1 + luck, n)), s = w.reduce((a, b) => a + b, 0); return w.map((v) => v / s); }
// courier upgrades: 10 levels each; a level costs base x 1.8^(level - 1). (owner, 2026-11-11) Route Permits went: the
// districts open by themselves as your mounts level up (and what was spent on permits came back as coins)
export const UPGRADES = {
  payout: { name: "Payout", base: 300 }, stamps: { name: "Lucky Stamps", base: 500 },
  boxes: { name: "Sturdy Boxes", base: 350 },
};
export const UP_MAX = 10, upgradeCost = (k, lv) => Math.round(UPGRADES[k].base * Math.pow(1.8, lv));   // the cost of going from lv to lv + 1
// the districts open: one more as your best mount reaches each of these levels
// (owner, 2026-11-11) the next area opens once you have an Uncommon (or better) animal from the one before: an
// Uncommon Dog opens Maple Suburbs, an Uncommon Cat Goose Marsh, and so on
export const OPEN_R = 1;
export function openFor(d) { const ms = (d && d.mounts) || []; let open = 1; while (open < ZONE_KIND.length && ms.some((m) => m.sp === ZONE_KIND[open - 1] && m.r >= OPEN_R)) open++; return open; }
// which tiers a courier's conveyor gives: only open districts; the more are open, the more of the higher tiers, and the
// ridden mount's level lifts them too (owner, 2026-11-11: the higher level, the pricier the parcels and the farther the trips)
export function spawnWeights(open, r = 0) {   // r: the ridden mount's rarity
  open = clamp(open | 0, 1, TIERS.length); const w = TIERS.map((t, n) => (n < open ? t.w * (1 + (n * (open - 1)) / 5) * (1 + (n * r) / 2) : 0)), s = w.reduce((a, b) => a + b, 0), p = w.map((v) => v / s);
  // (owner, 2026-11-11) at least 30% go to the farthest area you've opened; the rest spread over the ones in between
  const top = open - 1; if (top > 0 && p[top] < TOP_SHARE) { const rest = 1 - p[top]; for (let n = 0; n < top; n++) p[n] *= (1 - TOP_SHARE) / rest; p[top] = TOP_SHARE; }
  return p;
}
export const TOP_SHARE = 0.3;
export const stampLuck = (lv) => 0.0405 * lv, payoutMult = (lv) => 1 + 0.1 * lv, boxDur = (lv) => BASE_DUR + (lv >= 5) + (lv >= 10);
export const upTotal = (up) => Object.keys(UPGRADES).reduce((a, k) => a + (up[k] || 0), 0);
export const RANKS = ["", "Bronze", "Silver", "Gold", "Platinum"], RANK_C = ["", "#b9763c", "#b8c2cc", "#f2b01e", "#bfe9ff"];
export const rankOf = (total) => (total >= 23 ? 4 : total >= 15 ? 3 : total >= 8 ? 2 : total >= 1 ? 1 : 0);   // of 30 upgrade levels
// (owner, 2026-11-11) the mounts are the areas' animals: each area has one kind (Main Street dogs, Maple Suburbs cats,
// Goose Marsh gators, Cliffside bears, the Floating Islands wolves), and each comes Common to Legendary. A mount is a kind
// and a rarity (m.r): the rarity sets its coat, its stats and how it shows; the kind sets its ability. An area's parcels
// drop its kind, at the parcel's rarity. The town's animals wear the same coats.
// (owner, 2026-11-11) each animal has its own five coats, one per rarity (Common to Legendary), each suiting it: a mount
// is named by its coat, e.g. "Black Gator", "Shiny Spirit Wolf". Each also comes Shiny (the same coat, sparkling)
export const MOUNTS = {
  dog: { name: "Dog", ab: "bark", look: "pup", size: 1, coats: [["Tan", "#c98a4b", "#f3dcc0"], ["Chocolate", "#5a3a24", "#d9a77a"], ["Blue Merle", "#5a6f8a", "#c9d6e8"], ["Ember", "#b8361c", "#ffb347"], ["Starlight", "#22305a", "#f2c94c"]] },
  cat: { name: "Cat", ab: "jump2", look: "cat", size: 0.95, coats: [["Tabby", "#b98a5a", "#f3e0c8"], ["Ginger", "#e8862e", "#ffe1bf"], ["Siamese", "#efe2cc", "#4a3426"], ["Lilac", "#b9a2d9", "#f5ecff"], ["Cosmic", "#3a1d6e", "#7fd0ff"]] },
  gator: { name: "Gator", ab: "dash", look: "gator", size: 1, coats: [["Green", "#4f7a3a", "#c9d48a"], ["Albino", "#efe6d8", "#ff9aa8"], ["Sapphire", "#2a5fb8", "#9fe0ff"], ["Black", "#1f2329", "#4fe08a"], ["Magma", "#2a1a14", "#ff6a1f"]] },
  bear: { name: "Bear", ab: "hide", look: "bear", size: 1.05, coats: [["Brown", "#7a5236", "#c9a27e"], ["Black", "#2b2523", "#8a6a4e"], ["Polar", "#f4f8fb", "#bfe0f0"], ["Honey", "#d99a2b", "#fff0c2"], ["Aurora", "#2c4a7a", "#7ef0c8"]] },
  wolf: { name: "Wolf", ab: "howl", look: "wolf", size: 1, coats: [["Gray", "#8a96a2", "#e9eef2"], ["Timber", "#7a5a3a", "#d9c3a2"], ["Arctic", "#eef3f8", "#a9c9e8"], ["Shadow", "#1b1d24", "#e33a4a"], ["Spirit", "#6fc8ff", "#ffffff"]] },
  // (owner, 2026-11-12) zones 6 to 10: Frostbite Fields foxes, Sunscorch Dunes raptors, Jungle Ruins trikes, Lava Flats
  // T-Rexes, Moon Garden unicorns
  fox: { name: "Fox", ab: "vanish", look: "fox", size: 1, coats: [["Snow", "#f4f6f8", "#c9d6e2"], ["Silver", "#9aa6b4", "#f4f6f8"], ["Red", "#d9541f", "#fff1dc"], ["Frost", "#7fd0ff", "#ffffff"], ["Aurora", "#1d2a4a", "#7ef0c8"]] },
  raptor: { name: "Raptor", ab: "pounce", look: "raptor", size: 1, coats: [["Sand", "#d9b47a", "#8a6a3e"], ["Rust", "#a8582a", "#f0c48a"], ["Scarab", "#2f7a6a", "#e8c84a"], ["Sunset", "#e8662e", "#7a2a6a"], ["Pharaoh", "#1d1d2a", "#f2c94c"]] },
  trike: { name: "Trike", ab: "charge", look: "trike", size: 1, coats: [["Moss", "#6a8a4a", "#d9c99a"], ["Clay", "#b9744a", "#f0d9b8"], ["Jade", "#2a9a7a", "#d9fff0"], ["Orchid", "#b05ad9", "#ffd1f3"], ["Temple Gold", "#d9a52a", "#2a5a3a"]] },
  trex: { name: "T-Rex", ab: "roar", look: "trex", size: 0.9, coats: [["Ash", "#6a6a6a", "#b9b9b9"], ["Obsidian", "#1d1d22", "#8a8a9a"], ["Ember", "#c8401e", "#ffb347"], ["Molten", "#2a1a14", "#ff6a1f"], ["Inferno", "#ffd84a", "#ff3a1f"]] },
  unicorn: { name: "Unicorn", ab: "blink", look: "unicorn", size: 1, coats: [["Moonbeam", "#e9e6f4", "#b9b2d9"], ["Lavender", "#b9a2e8", "#ffffff"], ["Nebula", "#4a2a8a", "#ff8fd9"], ["Comet", "#2a4a8a", "#9fe0ff"], ["Celestial", "#1a1030", "#ffd84a"]] },
};
export const ZONE_KIND = ["dog", "cat", "gator", "bear", "wolf", "fox", "raptor", "trike", "trex", "unicorn"];   // each area's animal, in order (the same as CHASERS)
export const coat = (sp, r) => (MOUNTS[sp] || MOUNTS.dog).coats[clamp(r | 0, 0, 4)].slice(1);   // [body, trim]
export const coatName = (sp, r) => (MOUNTS[sp] || MOUNTS.dog).coats[clamp(r | 0, 0, 4)][0];
// the mounts from before (and their rarity): (owner, 2026-11-11) each became a Dog of that rarity, keeping level and skin
export const MOUNT_MOVED = { pup: ["dog", 0], piglet: ["dog", 0], bunny: ["dog", 0], fox: ["cat", 1], deer: ["cat", 1], parrot: ["cat", 1], raptor: ["gator", 2], stego: ["gator", 2], pony: ["gator", 2], owl: ["gator", 2], trex: ["bear", 3], trike: ["bear", 3], unicorn: ["wolf", 4], dragon: ["wolf", 4] };
// (owner, 2026-11-12) every animal its own ability: Dog Bark (animals near run home), Cat Double Jump, Gator Dash (a
// burst), Bear Tough Hide (nothing hits or stuns you), Wolf Howl (a sprint), Fox Vanish (animals can't see you), Raptor
// Pounce (a long leap), Trike Charge (a ram that knocks animals aside), T-Rex Roar (animals near freeze), Unicorn Blink
// (a short teleport ahead)
export const ABILITY = { bark: "Bark", jump2: "Double Jump", dash: "Dash", hide: "Tough Hide", howl: "Howl", vanish: "Vanish", pounce: "Pounce", charge: "Charge", roar: "Roar", blink: "Blink" };
export const abilityTime = (ab, tier) => ({ hide: 2.5 + 0.75 * tier, howl: 3 + tier, vanish: 2.5 + 0.75 * tier, charge: 1.2 + 0.3 * tier, roar: 2 + 0.5 * tier }[ab] || 0);   // s
export const ROAR_R = (tier) => 12 + 3 * tier, BLINK_D = (tier) => 10 + 3 * tier, CHARGE_R = 3, HOWL_X = 1.5, CHARGE_X = 1.6;
export const VARIANTS = ["", "Shiny"], SHINY = 0.0001;   // (owner, 2026-11-11) 1 in 10,000; no Golden or Rainbow
// (owner, 2026-11-11) the same mounts (kind, coat and skin) merge into one of the next coat up, keeping the skin; a
// Legendary is the last. (owner, 2026-11-12) how many: 2 Commons make an Uncommon, 4 Uncommons a Rare, 8 Rares an Epic,
// 16 Epics a Legendary
export const fuseN = (r) => Math.pow(2, clamp(r | 0, 0, 3) + 1);
export function fuseSet(mounts, id) {   // the ones a merge would take (the chosen one and the lowest-level other), or null
  const m = mounts.find((k) => k.id === id); if (!m || m.r >= 4) return null;
  const same = mounts.filter((k) => k.sp === m.sp && k.r === m.r && k.va === m.va && k.id !== id).sort((a, b) => a.id - b.id);
  const n = fuseN(m.r); return same.length >= n - 1 ? [m, ...same.slice(0, n - 1)] : null;
}
// (owner, 2026-11-12) Merge all: every merge there is, Commons first, so what they make can merge again. In each group the
// one kept is the ridden one if it's there, else the one with the most Aura levels; it keeps the best levels of the group.
// Changes mounts in place; returns the mounts made
export function fuseAll(mounts, ride) {
  const made = [];
  for (let r = 0; r < 4; r++) for (let again = true; again; ) { again = false;
    const groups = new Map(); for (const m of mounts) if (m.r === r) { const k = m.sp + "/" + m.va; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
    for (const g of groups.values()) while (g.length >= fuseN(r)) {
      g.sort((a, b) => (b.id === ride) - (a.id === ride) || ((b.cap | 0) + (b.spd | 0)) - ((a.cap | 0) + (a.spd | 0)) || a.id - b.id);
      const set = g.splice(0, fuseN(r)), best = set[0]; best.r++; for (const k of set) { best.cap = Math.max(best.cap | 0, k.cap | 0); best.spd = Math.max(best.spd | 0, k.spd | 0); }
      for (const k of set.slice(1)) mounts.splice(mounts.indexOf(k), 1); made.push(best); again = true;
    }
  }
  return made.filter((m, n, a) => a.lastIndexOf(m) === n);
}
// (owner, 2026-11-12) a mount sells for Aura by its rarity (x5 Shiny); not the one you ride, nor your last
export const SELL = [15, 60, 250, 1000, 4000], sellPrice = (m) => SELL[clamp(m.r | 0, 0, 4)] * (m.va ? 5 : 1);
// (owner, 2026-11-11) no mount levels: a mount's rarity (and its area) decides how fast, big and able it is
// (owner, 2026-11-12) every mount starts carrying 1 parcel; Aura raises it a level at a time (m.cap, 0 to 4: up to 5)
export const CAP_MAX = 4, SPD_MAX = 10;
export const bagSize = (m) => 1 + clamp(m.cap | 0, 0, CAP_MAX);
// (owner, 2026-11-12) Aura upgrades on one mount, exponential, dearer for rarer and farther animals: carrying (cap) and
// speed (spd, +5% a level)
const petScale = (m) => (1 + 0.5 * clamp(m.r | 0, 0, 4)) * (1 + 0.5 * Math.max(0, ZONE_KIND.indexOf(m.sp)));
export const petUpCost = (m, k) => (k === "cap" ? Math.round(150 * Math.pow(4, m.cap | 0) * petScale(m)) : Math.round(100 * Math.pow(1.7, m.spd | 0) * petScale(m)));
export const homeZone = (sp) => Math.max(0, ZONE_KIND.indexOf(sp));
export const mountScale = (m) => 1 + 0.25 * clamp(m.r | 0, 0, 4);             // Common 1x to Legendary 2x
export const abilityTier = (m) => [1, 1, 2, 2, 3][clamp(m.r | 0, 0, 4)];      // (owner, 2026-11-11) every rarity has its animal's ability: stronger at Rare and Legendary
// (owner, 2026-11-12) around the post office every mount goes the same speed; the purple Aura pad across the way out
// (x AURA_PAD.x, all the way across) switches on its own speed for the run
export const AURA_PAD = { x: 25, w: 3 }, startArea = (x, z, y) => x < AURA_PAD.x && districtAt(x, z, y) === 0;
// (owner, 2026-11-12) a bonk (the old kick) that lands pays Aura: each animal bonked, more for each courier, more in the
// farther zones (by the square root of the zone's tier pay). An animal pays once in BONK.again s, a courier once in
// KICK.farm s from the same bonker
export const BONK = { animal: 3, courier: 12, again: 8 }, bonkAura = (zone, who) => Math.round((who === "courier" ? BONK.courier : BONK.animal) * Math.sqrt(TIERS[clamp(zone | 0, 0, TIERS.length - 1)].mult));
export const BASE_SPEED = 12, RARITY_UP = 0.2, ZONE_UP = 0.05, SPD_UP = 0.05;
// (owner, 2026-11-12) speed: 20% more per rarity step; 5% more for each zone an animal is short of its own zone, 5% less
// for each zone past it (a Wolf, from the fifth, goes 120% on Main Street, a Dog 80% on the Floating Islands); 5% more
// per Aura speed level
export const zoneSpeed = (sp, zone) => Math.max(0.2, 1 + ZONE_UP * (homeZone(sp) - (zone | 0)));
export function mountStats(m, zone) {   // m: { sp, r (rarity), spd }; zone: where it is (districtAt), or its own zone
  const r = clamp(m.r | 0, 0, 4), z = homeZone(m.sp), here = zone === undefined ? z : zone;
  return { speed: BASE_SPEED * (1 + RARITY_UP * r) * zoneSpeed(m.sp, here) * (1 + SPD_UP * clamp(m.spd | 0, 0, SPD_MAX)), jump: 8 + 0.5 * r + 0.25 * z, grip: Math.min(0.6, 0.1 * r + 0.03 * z) };
}
// (owner, 2026-11-12) cooldowns are 20% shorter per rarity step too
export const abilityCd = (m) => { const ab = (MOUNTS[m.sp] || MOUNTS.dog).ab; return ab === "jump2" ? 0 : ABILITY_BASE_CD[ab] / (1 + RARITY_UP * clamp(m.r | 0, 0, 4)); };
export const ABILITY_BASE_CD = { bark: 12, dash: 8, hide: 16, howl: 14, vanish: 14, pounce: 6, charge: 10, roar: 18, blink: 6 };
// (owner, 2026-11-11) trails: one more to unlock every five areas opened (with five areas, the first at the Floating
// Islands); any mount can wear any trail you've unlocked
// (owner, 2026-11-12) and trails bought with Aura (d.trails)
export const TRAILS = [{ k: "cloud", name: "Cloud Trail", zones: 5 }, { k: "comet", name: "Comet Trail", zones: 10 }, { k: "spark", name: "Spark Trail", cost: 2500 }, { k: "bubble", name: "Bubble Trail", cost: 6000 }, { k: "heart", name: "Heart Trail", cost: 15000 }, { k: "flame", name: "Flame Trail", cost: 40000 }];
export const trailsFor = (d) => TRAILS.filter((t) => (t.zones ? openFor(d) >= t.zones : (d.trails || []).includes(t.k))).map((t) => t.k);
// (owner, 2026-11-12) podiums: the three best mounts of the couriers in a server stand on the three podiums by the post
// office (each courier's best three can stand); a rarer one takes a podium from a lesser one. Each pays its courier Aura
// every PODIUM.every s while it stands there, more for rarer, Shiny and farther animals
export const PODIUM = { every: 10, spots: [{ x: -16, z: 12, y: 1.6 }, { x: -24, z: 12, y: 1.1 }, { x: -32, z: 12, y: 0.7 }] };
export const podiumScore = (m) => clamp(m.r | 0, 0, 4) * 100 + (m.va ? 50 : 0) + homeZone(m.sp) * 10 + (m.spd | 0) + (m.cap | 0);
export const podiumPay = (m) => Math.round(2 * Math.pow(2, clamp(m.r | 0, 0, 4)) * (m.va ? 3 : 1) * (1 + 0.5 * homeZone(m.sp)));
// (owner, 2026-11-11) no eggs any more: parcels drop mounts. Eggs someone still had became a Dog each (a Basic Egg a
// Common one, a Rare Egg a Rare one, a Legendary Egg a Legendary one)
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
  const v = int(d.v, 1, 9, 1), out = { v: 3, coins: int(d.coins, 0, 1e12, 0), nextId: int(d.nextId, 1, 1e9, 1), mounts: [], ride: 0, up: {}, stats: {}, set: {}, fails: int(d.fails, 0, 99, 0) };
  for (const m of Array.isArray(d.mounts) ? d.mounts.slice(0, MOUNT_CAP) : []) {
    if (!m) continue; const now = MOUNTS[m.sp] && Number.isFinite(+m.r), old = MOUNT_MOVED[m.sp] || (m.sp === "cat" ? ["cat", 1] : null); if (!now && !old) continue;
    out.mounts.push({ id: int(m.id, 1, 1e9, 0) || out.nextId++, sp: v < 2 ? "dog" : now ? m.sp : old[0], /* (owner, 2026-11-11) once: every mount from before became a Dog of the same rarity, level and skin */ r: now ? int(m.r, 0, 4, 0) : old[1], va: int(m.va, 0, 3, 0) ? 1 : 0, cap: v < 3 ? (now ? int(m.r, 0, 4, 0) : old[1]) /* (owner, 2026-11-12) once: a mount from before keeps what it carried */ : int(m.cap, 0, CAP_MAX, 0), spd: int(m.spd, 0, SPD_MAX, 0), ...(TRAILS.some((t) => t.k === m.tr) ? { tr: m.tr } : {}) });
  }
  out.nextId = Math.max(out.nextId, ...out.mounts.map((m) => m.id + 1));
  for (const k of Object.keys(EGG_TO)) for (let n = int(d.eggs && d.eggs[k], 0, MOUNT_CAP, 0); n > 0 && out.mounts.length < MOUNT_CAP; n--) out.mounts.push({ id: out.nextId++, sp: "dog", r: EGG_TO[k][1], va: 0, cap: EGG_TO[k][1], spd: 0 });
  if (!out.mounts.length) out.mounts.push({ id: out.nextId++, sp: "dog", r: 0, va: 0, cap: 0, spd: 0 });
  out.nextId = Math.max(out.nextId, ...out.mounts.map((m) => m.id + 1));
  out.ride = out.mounts.some((m) => m.id === d.ride) ? d.ride : out.mounts[0].id;
  for (const k of Object.keys(UPGRADES)) out.up[k] = int(d.up && d.up[k], 0, UP_MAX, 0);
  const permits = int(d.up && d.up.routes, 0, UP_MAX, 0); for (let l = 0; l < permits; l++) out.coins += Math.round(250 * Math.pow(1.8, l));
  const press = int(d.up && d.up.press, 0, UP_MAX, 0); for (let l = 0; l < press; l++) out.coins += Math.round(400 * Math.pow(1.8, l));   // (owner, 2026-11-11) the Coupon Press went with the levels: its coins back, once   // (owner, 2026-11-11) Route Permits went: their coins back, once (they're not saved again)
  out.trails = (Array.isArray(d.trails) ? d.trails : []).filter((k, n, a) => TRAILS.some((t) => t.k === k && t.cost) && a.indexOf(k) === n);
  out.gifts = (Array.isArray(d.gifts) ? d.gifts : []).slice(0, GIFT_CAP).filter((g) => g && Number.isFinite(+g.gid)).map((g) => ({ gid: int(g.gid, 1, 1e9, 1), r: int(g.r, 0, 4, 0), pt: int(g.pt, 0, TIERS.length - 1, 0), ...(Number.isFinite(+g.m) ? { m: int(g.m, 1, 1e9, 1) } : {}) }));
  out.nextGid = Math.max(int(d.nextGid, 1, 1e9, 1), ...out.gifts.map((g) => g.gid + 1));
  for (const k of ["del", "golden", "geese", "kicks"]) out.stats[k] = int(d.stats && d.stats[k], 0, 1e9, 0);
  out.set = { friendly: !!(d.set && d.set.friendly), music: int(d.set && d.set.music, 0, 10, 5), sfx: int(d.set && d.set.sfx, 0, 10, 7), shirt: /^#[0-9a-f]{6}$/i.test(d.set && d.set.shirt) ? d.set.shirt : "#f2a33a", tut: !!(d.set && d.set.tut) };   // tut: the new-courier tutorial is done
  return out;
}
// a new parcel for the conveyor: its tier by the districts open (and the ridden mount's level), maybe timed
export function rollParcel(open, mr = 0, rnd = Math.random) {   // mr: the ridden mount's rarity
  const w = spawnWeights(open, mr); let r = rnd(), tier = 0; for (let n = 0; n < w.length; n++) { if (r < w[n]) { tier = n; break; } r -= w[n]; }
  const mod = rnd() < MOD_CHANCE ? "express" : "";
  return { tier, mod };
}
// coins for a delivery: base 10 x tier x (1 + modifier bonus) x payout upgrade x (1 - 0.2 per hit taken). late: an Express parcel past its time
export function deliveryCoins(tier, mod, payoutLv, hits, late) {
  const bonus = MODS[mod] && !(mod === "express" && late) ? MODS[mod].bonus : 0;
  return Math.max(1, Math.round(BASE_COINS * TIERS[tier].mult * (1 + bonus) * payoutMult(payoutLv) * Math.max(0, 1 - HIT_CUT * hits)));
}
// the reward roll. Returns { tier, coins, pet, near (it just missed Legendary) }. (owner, 2026-11-11) no
// Stamp Meter (pity) any more: every roll is its own
export function rewardRoll(tier, up, rnd = Math.random) {
  const odds = rollOdds(TIERS[tier].luck + stampLuck(up.stamps)); let r = rnd(), t = 0; for (let n = 0; n < odds.length; n++) { if (r < odds[n]) { t = n; break; } r -= odds[n]; t = n; }
  const near = t < 4 && r < 0.012 && t >= 3;
  return { tier: t, near, ...giftContents(t, tier, up, rnd) };
}
// what's inside a gift of rarity t from a parcel of tier pt (decided when it's opened, owner 2026-11-11)
export function giftContents(t, pt, up, rnd = Math.random) {
  const R = ROLLS[t], coins = Math.round((R.coins[0] + rnd() * (R.coins[1] - R.coins[0])) * Math.sqrt(TIERS[pt].mult));
  let pet = null; for (let r = t; r >= 0 && !pet; r--) if (rnd() < PET_CHANCE[r]) pet = { sp: ZONE_KIND[pt], r, va: skinRoll(rnd) };   // that rarity or lower
  return { coins, pet };
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
export const skinRoll = (rnd = Math.random) => (rnd() < SHINY ? 1 : 0);   // 1 in 10,000 Shiny

// ---------------------------------------------------------------------------------------------------------------------
// The town (owner, 2026-11-11: one long line, harder the farther out): the post office at the west end, then one road east
// through Main Street and Maple Suburbs, over the bridge into Goose Marsh, up Cliffside's mountain, and the Floating
// Islands off its far side. The farther out, the more (and quicker) dogs, geese and dangers.
// Ground is made of slabs (flat rectangles and discs, and ramps); solids are boxes that stop you.
// ---------------------------------------------------------------------------------------------------------------------
export const sprinklers = [], goats = [], zips = [];
// (owner, 2026-11-12) the far zones' own scenery (drawn by the page; the solid ones stop you): ice spikes, snowmen and
// snowy pines; cacti, palms and pyramids; ruined pillars and a temple; rock spires and a volcano; crystals and glowing
// mushrooms. k: the kind, s: its size
export const props = [];
export const slabs = [], solids = [], houses = [], dogs = [], ponds = [], geese = [], trees = [], roads = [], pads = [], boosts = [], balloons = [], fences = [];
// (owner, 2026-11-11) the post office is a building with a conveyor belt coming out of its door, pushing your parcel to
// the end, where you grab it. (x, z: the middle of its square; b: the building; belt: the conveyor; end: where your parcel waits)
export const PO = { x: 0, z: 0, b: { x: 0, z: -9, hw: 8, hd: 5, h: 6.5 }, belt: { z0: -4, z1: 5.2, hw: 1.3, top: 1.1 }, end: { x: 0, z: 3.9 } };
// (owner, 2026-11-11: neighborhoods three houses long) every district is short: three houses down each side of the road
export const SPAWN = { x: 0, z: 17 }, SUBURBS_X = 110, TOWN = { x0: -45, x1: 190, z0: -30, z1: 30 }, MARSH = { x0: 190, x1: 290, z0: -30, z1: 30 }, CLIFF = { x0: 290, x1: 415, z0: -30, z1: 30 };   // (owner, 2026-11-11) narrow: the road down the middle, houses both sides
export const TERRACE = (n) => ({ x0: 300 + 38 * (n - 1), x1: n === 3 ? 414 : 300 + 38 * n, z0: -27, z1: 27, y: 6 * n });   // n = 1..3: Cliffside's three steps, each with a ramp up the road onto it
export const ISLES = [{ x: 462, z: 0, y: 32, r: 18 }, { x: 512, z: -16, y: 38, r: 16 }, { x: 562, z: 6, y: 44, r: 17 }];
export const ISLE_X = 425, FALL_Y = 22, EDGE_Y = -20;   // EDGE_Y: (owner, 2026-11-12) below it anywhere but the islands, you rode off the edge;   // past ISLE_X and high up: the Floating Islands; below FALL_Y there, you've fallen off
const MARSH_X = [212, 240, 268];
// shortcuts: the sewer pipe (Main Street to the foot of Cliffside; a goose sits in it part of the time), ziplines
export const PIPE = { a: { x: 54.5, z: -25, y: 0 }, b: { x: 294, z: -24, y: 0 }, r: 2, time: 4, every: 24, goose: 8, off: true };   // (owner, 2026-11-12) no more shortcuts: the pipe and the zipline tower went
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
// (owner, 2026-11-12) past the Floating Islands, down on the ground: five zones of FAR.len m each (Frostbite Fields first),
// reached by the zipline from the last island
export const FAR = { x0: 600, len: 100, n: 5, z0: -30, z1: 30 }, farX = (d) => FAR.x0 + (d - 5) * FAR.len;
export function districtAt(x, z, y = 0) { return x >= FAR.x0 && y < SKY_Y ? 5 + clamp(Math.floor((x - FAR.x0) / FAR.len), 0, FAR.n - 1) : x > ISLE_X && y > SKY_Y ? 4 : x >= CLIFF.x0 ? 3 : x >= MARSH.x0 ? 2 : x >= SUBURBS_X ? 1 : 0; }

function rect(x0, x1, z0, z1, y, kind, b = y - 40) { slabs.push({ k: 0, x0, x1, z0, z1, y, b, kind }); }
function disc(x, z, r, y, kind, b = y - 6) { slabs.push({ k: 1, x, z, r, x0: x - r, x1: x + r, z0: z - r, z1: z + r, y, b, kind }); }
function ramp(x0, x1, z0, z1, y0, y1, kind) { slabs.push({ k: 2, x0, x1, z0, z1, y: Math.max(y0, y1), ya: y0, yb: y1, b: Math.min(y0, y1) - 40, kind }); }   // rises along z from ya (at z0) to yb (at z1)
function rampX(x0, x1, z0, z1, y0, y1, kind) { slabs.push({ k: 3, x0, x1, z0, z1, y: Math.max(y0, y1), ya: y0, yb: y1, b: Math.min(y0, y1) - 40, kind }); }   // rises along x from ya (at x0) to yb (at x1)
function solid(x, z, hw, hd, y0, y1, yaw = 0) { solids.push({ x, z, hw, hd, c: Math.cos(yaw), s: Math.sin(yaw), y0, y1, rad: hyp(hw, hd) }); }
const STREET = ["Main Street", "Maple Lane", "Goose Way", "Cliff Road", "Cloud Isle", "Frost Lane", "Dune Road", "Vine Street", "Ember Way", "Star Lane"];
// (owner, 2026-11-12) each far zone's tough going: ice (slippery), sand (slow, and sandstorms), rivers across the jungle
// (slow, and thick trees), lava pools (a burn and a bounce), and the moon's low gravity
export const lavas = [], ICE_GRIP = 0.12, SAND_SLOW = 0.8, WATER_SLOW = 0.5, MOON_GRAV = 0.45, LAVA = { stun: 0.6, every: 2 };
export const lavaAt = (x, z, y) => y < 1.2 && lavas.some((l) => hyp(x - l.x, z - l.z) < l.r);
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
  // (owner, 2026-11-12) no walls round the outside: ride off the edge and you're back at the post office (the run starts over)
  wall(TOWN.x1, TOWN.x1, TOWN.z0, -6, 6); wall(TOWN.x1, TOWN.x1, 6, TOWN.z1, 6);
  wall(MARSH.x1, MARSH.x1, MARSH.z0, -6, 6); wall(MARSH.x1, MARSH.x1, 6, MARSH.z1, 6); wall(MARSH.x0, MARSH.x0, MARSH.z0, -6, 6); wall(MARSH.x0, MARSH.x0, 6, MARSH.z1, 6);
  // ---- the post office: the building, and the conveyor out of its door ----
  solid(PO.b.x, PO.b.z, PO.b.hw, PO.b.hd, -1, PO.b.h + 3);
  for (const q of PODIUM.spots) rect(q.x - 2.2, q.x + 2.2, q.z - 2.2, q.z + 2.2, q.y, "pod" + PODIUM.spots.indexOf(q), 0);   // (owner, 2026-11-12) the three podiums
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
  zips.push({ x: ISLES[2].x + 13, z: ISLES[2].z - 6, y: ISLES[2].y, tx: FAR.x0 + 8, tz: -6, ty: 0, far: 1 });   // (owner, 2026-11-12) from the last island down to Frostbite Fields
  // each island's two houses stand where they're farthest from its pads, landing spots, balloon and middle (owner, 2026-11-11: couriers landed inside them)
  ISLES.forEach((s, n) => {
    const keep = [{ x: s.x, z: s.z }, ...pads.filter((p) => p.from === n), ...pads.filter((p) => p.to === n).map((p) => ({ x: p.tx, z: p.tz })), ...balloons.filter((b) => hyp(b.x - s.x, b.z - s.z) < s.r), ...zips.filter((q) => hyp(q.x - s.x, q.z - s.z) < s.r)];   /* (owner, 2026-11-12) and clear of the zipline */ if (n === CANNON.to) for (let dx = -20; dx <= -4; dx += 2) keep.push({ x: s.x + dx, z: s.z });   // (owner, 2026-11-12) clear of where the cannon lands you, and the way in
    for (let k = 0; k < 2; k++) { let best = null, bs = -1;
      for (let q = 0; q < 72; q++) { const a = (q / 72) * TAU, x = s.x + Math.cos(a) * s.r * 0.62, z = s.z + Math.sin(a) * s.r * 0.62, yaw = Math.atan2(s.x - x, s.z - z), mx = x + Math.sin(yaw) * 5.5, mz = z + Math.cos(yaw) * 5.5;
        const sc = Math.min(...keep.map((o) => Math.min(hyp(o.x - x, o.z - z) - 3.6, hyp(o.x - mx, o.z - mz)))); if (sc > bs) { bs = sc; best = { x, z, yaw }; } }
      house(best.x, best.z, s.y, best.yaw, 4, 5); keep.push({ x: best.x, z: best.z }, { x: best.x + Math.sin(best.yaw) * 5.5, z: best.z + Math.cos(best.yaw) * 5.5 }); }
  });
  // ---- goats: one on each step, and one more on the top ----
  for (let n = 1; n <= 3; n++) { const t = TERRACE(n); goats.push({ id: goats.length, hx: t.x0 + 6, hz: n % 2 ? 22 : -22, y: t.y }); }
  goats.push({ id: goats.length, hx: TERRACE(3).x0 + 26, hz: -10, y: TERRACE(3).y });
  // ---- (owner, 2026-11-12) zones 6 to 10, on the ground past the islands: the road down the middle, three houses each side ----
  const FK = ["ice", "sand", "jungle", "basalt", "moon"];
  for (let k = 0; k < FAR.n; k++) { const x0 = farX(5 + k); rect(x0, x0 + FAR.len, FAR.z0, FAR.z1, 0, FK[k]); row(x0 + 18, 5 + k, 17, 0, 8, false); }
  const F1 = FAR.x0 + FAR.n * FAR.len; road(FAR.x0, 0, F1, 0, 8);
  balloons.push({ x: FAR.x0 + FAR.n * FAR.len - 9, z: 14, y: 0 });   // (owner, 2026-11-12) the one balloon home: at the very end of the last zone
  { const x0 = farX(7); for (const dx of [22, 50, 78]) rect(x0 + dx - 3, x0 + dx + 3, FAR.z0, FAR.z1, 0.02, "water", -0.5); }   // the jungle's rivers
  { const x0 = farX(8); for (const [dx, z, r] of [[14, 12, 4], [30, -3, 3], [46, -16, 5], [62, 4, 3.5], [80, -12, 4], [88, 20, 3.5]]) { lavas.push({ x: x0 + dx, z, r }); disc(x0 + dx, z, r, 0.03, "lava", -0.5); } }
  // (owner, 2026-11-12) each far zone its own shape and things in it, not five flat lots
  { const prnd = rng(20261112), clear = (x, z, r) => Math.abs(z) > 5.5 + r && !houses.some((h) => hyp(h.x - x, h.z - z) < h.size / 2 + 2 + r || hyp(h.mx - x, h.mz - z) < 3.5 + r) && !lavas.some((l) => hyp(l.x - x, l.z - z) < l.r + 1 + r) && !props.some((q) => hyp(q.x - x, q.z - z) < 3 + r);
    const scatter = (d, n, k, r, sMin, sMax, solidR, h) => { const x0 = farX(d); for (let i = 0, t = 0; i < n && t < 3000; t++) { const x = x0 + 3 + prnd() * (FAR.len - 6), z = FAR.z0 + 3 + prnd() * (FAR.z1 - FAR.z0 - 6), sc = sMin + prnd() * (sMax - sMin); if (!clear(x, z, r * sc)) continue; props.push({ k, x, z, y: 0, s: sc }); if (solidR) solid(x, z, solidR * sc, solidR * sc, -1, h * sc); i++; } };
    // Frostbite Fields: snow drifts across the road to ride over, ice spikes, snowmen, snowy pines
    { const x0 = farX(5); for (const dx of [7, 29, 50, 80, 92]) { rampX(x0 + dx - 2.5, x0 + dx, -9, 9, 0, 1, "snow"); rampX(x0 + dx, x0 + dx + 2.5, -9, 9, 1, 0, "snow"); } }
    scatter(5, 12, "spike", 1, 0.8, 1.6, 0.6, 3); scatter(5, 5, "snowman", 1, 0.9, 1.2, 0.7, 2.6); scatter(5, 14, "pine", 1.2, 0.9, 1.4, 0.45, 8);
    // Sunscorch Dunes: big dunes the road climbs over, cacti, palms, and pyramids beyond the edge
    { const x0 = farX(6); for (const dx of [9, 31, 52, 78, 92]) { rampX(x0 + dx - 4.5, x0 + dx, -12, 12, 0, 2, "sand"); rampX(x0 + dx, x0 + dx + 4.5, -12, 12, 2, 0, "sand"); } }
    scatter(6, 14, "cactus", 0.8, 0.8, 1.4, 0.45, 3.5); scatter(6, 7, "palm", 1, 0.9, 1.3, 0.4, 6);
    props.push({ k: "pyramid", x: farX(6) + 30, z: -78, y: 0, s: 30 }, { k: "pyramid", x: farX(6) + 72, z: -95, y: 0, s: 40 }, { k: "pyramid", x: farX(6) + 55, z: 82, y: 0, s: 26 });
    // Jungle Ruins: log bridges over the rivers (the fast line), broken pillars, a stepped temple to climb
    { const x0 = farX(7); for (const dx of [22, 50, 78]) rect(x0 + dx - 3.4, x0 + dx + 3.4, -1.7, 1.7, 0.35, "log", -0.4);
      for (let k = 0; k < 3; k++) rect(x0 + 84 + k * 2, x0 + 97 - k * 2, -28 + k * 2, -15 - k * 2, 1.4 * (k + 1), "stone", 0);   // the temple: three steps up
      props.push({ k: "temple", x: x0 + 90.5, z: -21.5, y: 0, s: 1 }); solid(x0 + 90.5, -21.5, 2, 2, 4.2, 7); }
    scatter(7, 12, "pillar", 0.8, 0.6, 1.3, 0.55, 5);
    // Lava Flats: rock spires, and a volcano smoking beyond the edge
    scatter(8, 16, "spire", 1, 0.8, 1.8, 0.7, 5); props.push({ k: "volcano", x: farX(8) + 50, z: -85, y: 0, s: 45 });
    // Moon Garden: craters to bounce through, crystals, glowing mushrooms
    { const x0 = farX(9); for (const [dx, z, r] of [[12, -2, 5], [34, 3, 4], [56, -1, 6], [84, 2, 4.5]]) { disc(x0 + dx, z, r, -0.5, "crater", -2); props.push({ k: "crater", x: x0 + dx, z, y: -0.5, s: r }); } }
    scatter(9, 12, "crystal", 1, 0.8, 1.8, 0.5, 3.5); scatter(9, 14, "shroom", 0.8, 0.7, 1.4, 0.35, 2.5); }
  // ---- trees where there's room ----
  for (let n = 0, tries = 0; n < 24 && tries < 4000; tries++) {
    const x = TOWN.x0 + 6 + rnd() * (TOWN.x1 - TOWN.x0 - 12), z = TOWN.z0 + 6 + rnd() * (TOWN.z1 - TOWN.z0 - 12);
    if (hyp(x, z) < 26 || Math.abs(z) < 23 || (x > 172 && z > 16) || hyp(x - PIPE.a.x, z - PIPE.a.z) < 6 || sprinklers.some((q) => hyp(q.x - x, q.z - z) < 4)) continue;
    if (houses.some((h) => hyp(h.x - x, h.z - z) < 12 || hyp(h.mx - x, h.mz - z) < 5) || fences.some((f) => hyp((f.x0 + f.x1) / 2 - x, (f.z0 + f.z1) / 2 - z) < 6) || ponds.some((p) => hyp(p.x - x, p.z - z) < p.r + 4) || trees.some((t) => hyp(t.x - x, t.z - z) < 5)) continue;
    trees.push({ x, z, y: 0, s: 0.8 + rnd() * 0.6 }); solid(x, z, 0.45, 0.45, -1, 8); n++;
  }
  // the jungle's thick trees (owner, 2026-11-12)
  for (let n = 0, tries = 0; n < 26 && tries < 4000; tries++) {
    const x0 = farX(7), x = x0 + 4 + rnd() * (FAR.len - 8), z = FAR.z0 + 4 + rnd() * (FAR.z1 - FAR.z0 - 8);
    if (Math.abs(z) < 5 || houses.some((h) => hyp(h.x - x, h.z - z) < 9 || hyp(h.mx - x, h.mz - z) < 5) || trees.some((t) => hyp(t.x - x, t.z - z) < 4.5) || [22, 50, 78].some((dx) => Math.abs(x - x0 - dx) < 4.5)) continue;
    trees.push({ x, z, y: 0, s: 1 + rnd() * 0.5, jungle: 1 }); solid(x, z, 0.5, 0.5, -1, 9); n++;
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
export const DOG_D = [{ trigger: 8, speed: 10.5, telegraph: 0.7, chase: 4 }, { trigger: 10, speed: 11.5, telegraph: 0.55, chase: 5 }, { trigger: 11, speed: 12.5, telegraph: 0.45, chase: 6 }, { trigger: 12, speed: 13.5, telegraph: 0.35, chase: 7 }, { trigger: 12, speed: 14.5, telegraph: 0.3, chase: 7 },
  { trigger: 12, speed: 15, telegraph: 0.3, chase: 7 }, { trigger: 13, speed: 15.5, telegraph: 0.28, chase: 7.5 }, { trigger: 13, speed: 16, telegraph: 0.26, chase: 7.5 }, { trigger: 14, speed: 16.5, telegraph: 0.24, chase: 8 }, { trigger: 14, speed: 17, telegraph: 0.22, chase: 8 }];
// geese farther out see you sooner, honk for less time and lunge faster
export const GOOSE_D = [{ see: 6, telegraph: 1.2, lunge: 11.5 }, { see: 7, telegraph: 1, lunge: 13 }, { see: 8, telegraph: 0.8, lunge: 14.5 }, { see: 9, telegraph: 0.65, lunge: 15.5 }, { see: 9, telegraph: 0.6, lunge: 16 }];
// (owner, 2026-11-11) a mount outgrows the easier areas' animals: its chance to shake off a bite or a goose's grab
// (no stun, no hit, the parcel kept): 8% for every point its power is past 4 x the area's number, up to 85%. Its power
// (owner, 2026-11-11: no levels): 4 x (its rarity + half its area's number); r: the animal's rarity (2 points a rank)
export const shakeOff = (m, d, r = 0) => clamp((4 * ((m.r | 0) + 0.5 * Math.max(0, ZONE_KIND.indexOf(m.sp))) - 4 * d - 2 * r) * 0.08, 0, 0.85);
// (owner, 2026-11-11) each area has its own chasers, each one Common to Legendary: Main Street dogs, Maple Suburbs cats,
// Goose Marsh gators, Cliffside bears, the Floating Islands wolves. (They're all in `dogs`; geese and goats get rarities too.)
export const CHASERS = ZONE_KIND, CHASER_NAME = Object.fromEntries(ZONE_KIND.map((k) => [k, MOUNTS[k].name]));
export const ANIMAL_RW = [50, 25, 14, 8, 3];   // how often each rarity turns up
// a rarer animal is quicker, notices you sooner, wastes less time and keeps after you longer
export function chaserStats(q) { const D = DOG_D[q.d], r = q.r || 0; return { trigger: D.trigger + 0.8 * r, speed: D.speed * (1 + 0.06 * r), telegraph: D.telegraph * (1 - 0.1 * r), chase: D.chase + 0.5 * r }; }
export function gooseStats(g) { const D = GOOSE_D[g.d], r = g.r || 0; return { see: D.see + 0.6 * r, telegraph: D.telegraph * (1 - 0.1 * r), lunge: D.lunge * (1 + 0.06 * r) }; }
export const goatSpeed = (g) => GOAT.speed * (1 + 0.05 * (g.r || 0));
// (owner, 2026-11-11) areas you haven't opened are there to see but closed off: the road's gate at each one's start (the
// Floating Islands: the Sky Cannon). A courier can always head back west.
// (owner, 2026-11-12) Frostbite Fields: the zipline down from the last island; past it, a gate at each zone's start
export const GATES = [{ x: SUBURBS_X, d: 1, top: 9 }, { x: MARSH.x0, d: 2, top: 9 }, { x: CLIFF.x0, d: 3, top: 14 }, ...[6, 7, 8, 9].map((d) => ({ x: farX(d), d, top: 9 }))];
export const gateX = (open) => { const g = GATES.find((q) => q.d === open); return g ? g.x : Infinity; };   // the first closed gate's x (the cannon and the zipline close themselves)
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
  for (let d = 5; d < 5 + FAR.n; d++) put(5, d, () => [farX(d) + 4 + rnd() * (FAR.len - 8), (rnd() - 0.5) * 50, 0]);   // (owner, 2026-11-12) the far zones' animals
  // every animal's rarity: fixed for the town (the same for everyone), rarer ones farther out a little more often
  const roll = (d) => { const w = ANIMAL_RW.map((v, n) => v * Math.pow(1 + 0.12 * d, n)), s = w.reduce((a, b) => a + b, 0); let x = rnd() * s; for (let n = 0; n < w.length; n++) { if (x < w[n]) return n; x -= w[n]; } return 0; };
  for (const q of dogs) q.r = roll(q.d);
  for (const g of geese) g.r = roll(g.d);
  for (const g of goats) { g.d = 3; g.r = roll(3); }
})();
