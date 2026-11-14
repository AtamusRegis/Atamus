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
export function openFor(d) { const ms = (d && d.mounts) || []; let open = 1; while (open < TIERS.length && ms.some((m) => m.sp === zoneSp(open - 1) && m.r >= OPEN_R)) open++; return open; }   // (owner, 2026-11-13) each neighborhood's own animal
// which tiers a courier's conveyor gives: only open districts; the more are open, the more of the higher tiers, and the
// ridden mount's level lifts them too (owner, 2026-11-11: the higher level, the pricier the parcels and the farther the trips)
export function spawnWeights(open, r = 0) {   // r: the ridden mount's rarity
  // (owner, 2026-11-13) only zones with mailboxes in them; none anywhere: no parcels
  open = clamp(open | 0, 1, TIERS.length); const has = TIERS.map((t, n) => houses.some((h) => h.d === n)); while (open > 1 && !has[open - 1]) open--;
  const w = TIERS.map((t, n) => (n < open && has[n] ? t.w * (1 + (n * (open - 1)) / 5) * (1 + (n * r) / 2) : 0)), s = w.reduce((a, b) => a + b, 0); if (!s) return w;
  const p = w.map((v) => v / s);
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
// and a rarity (m.r): the rarity sets its coat, its stats and how it shows; the kind is its look. An area's parcels
// drop its kind, at the parcel's rarity. The town's animals wear the same coats.
// (owner, 2026-11-11) each animal has its own five coats, one per rarity (Common to Legendary), each suiting it: a mount
// is named by its coat, e.g. "Black Gator", "Shiny Spirit Wolf". Each also comes Shiny (the same coat, sparkling)
export const MOUNTS = {
  dog: { name: "Dog", look: "pup", size: 1, coats: [["Tan", "#c98a4b", "#f3dcc0"], ["Chocolate", "#5a3a24", "#d9a77a"], ["Blue Merle", "#5a6f8a", "#c9d6e8"], ["Ember", "#b8361c", "#ffb347"], ["Starlight", "#22305a", "#f2c94c"]] },
  cat: { name: "Cat", look: "cat", size: 0.95, coats: [["Tabby", "#b98a5a", "#f3e0c8"], ["Ginger", "#e8862e", "#ffe1bf"], ["Siamese", "#efe2cc", "#4a3426"], ["Lilac", "#b9a2d9", "#f5ecff"], ["Cosmic", "#3a1d6e", "#7fd0ff"]] },
  gator: { name: "Gator", look: "gator", size: 1, coats: [["Green", "#4f7a3a", "#c9d48a"], ["Albino", "#efe6d8", "#ff9aa8"], ["Sapphire", "#2a5fb8", "#9fe0ff"], ["Black", "#1f2329", "#4fe08a"], ["Magma", "#2a1a14", "#ff6a1f"]] },
  bear: { name: "Bear", look: "bear", size: 1.05, coats: [["Brown", "#7a5236", "#c9a27e"], ["Black", "#2b2523", "#8a6a4e"], ["Polar", "#f4f8fb", "#bfe0f0"], ["Honey", "#d99a2b", "#fff0c2"], ["Aurora", "#2c4a7a", "#7ef0c8"]] },
  wolf: { name: "Wolf", look: "wolf", size: 1, coats: [["Gray", "#8a96a2", "#e9eef2"], ["Timber", "#7a5a3a", "#d9c3a2"], ["Arctic", "#eef3f8", "#a9c9e8"], ["Shadow", "#1b1d24", "#e33a4a"], ["Spirit", "#6fc8ff", "#ffffff"]] },
  // (owner, 2026-11-12) zones 6 to 10: Frostbite Fields foxes, Sunscorch Dunes raptors, Jungle Ruins trikes, Lava Flats
  // T-Rexes, Moon Garden unicorns
  fox: { name: "Fox", look: "fox", size: 1, coats: [["Snow", "#f4f6f8", "#c9d6e2"], ["Silver", "#9aa6b4", "#f4f6f8"], ["Red", "#d9541f", "#fff1dc"], ["Frost", "#7fd0ff", "#ffffff"], ["Aurora", "#1d2a4a", "#7ef0c8"]] },
  raptor: { name: "Raptor", look: "raptor", size: 1, coats: [["Sand", "#d9b47a", "#8a6a3e"], ["Rust", "#a8582a", "#f0c48a"], ["Scarab", "#2f7a6a", "#e8c84a"], ["Sunset", "#e8662e", "#7a2a6a"], ["Pharaoh", "#1d1d2a", "#f2c94c"]] },
  trike: { name: "Trike", look: "trike", size: 1, coats: [["Moss", "#6a8a4a", "#d9c99a"], ["Clay", "#b9744a", "#f0d9b8"], ["Jade", "#2a9a7a", "#d9fff0"], ["Orchid", "#b05ad9", "#ffd1f3"], ["Temple Gold", "#d9a52a", "#2a5a3a"]] },
  trex: { name: "T-Rex", look: "trex", size: 0.9, coats: [["Ash", "#6a6a6a", "#b9b9b9"], ["Obsidian", "#1d1d22", "#8a8a9a"], ["Ember", "#c8401e", "#ffb347"], ["Molten", "#2a1a14", "#ff6a1f"], ["Inferno", "#ffd84a", "#ff3a1f"]] },
  unicorn: { name: "Unicorn", look: "unicorn", size: 1, coats: [["Moonbeam", "#e9e6f4", "#b9b2d9"], ["Lavender", "#b9a2e8", "#ffffff"], ["Nebula", "#4a2a8a", "#ff8fd9"], ["Comet", "#2a4a8a", "#9fe0ff"], ["Celestial", "#1a1030", "#ffd84a"]] },
};
export const ZONE_KIND = ["dog", "cat", "gator", "bear", "wolf", "fox", "raptor", "trike", "trex", "unicorn"];   // each area's animal, in order (the same as CHASERS)
export const coat = (sp, r) => (MOUNTS[sp] || MOUNTS.dog).coats[clamp(r | 0, 0, 4)].slice(1);   // [body, trim]
export const coatName = (sp, r) => (MOUNTS[sp] || MOUNTS.dog).coats[clamp(r | 0, 0, 4)][0];
// the mounts from before (and their rarity): (owner, 2026-11-11) each became a Dog of that rarity, keeping level and skin
export const MOUNT_MOVED = { pup: ["dog", 0], piglet: ["dog", 0], bunny: ["dog", 0], fox: ["cat", 1], deer: ["cat", 1], parrot: ["cat", 1], raptor: ["gator", 2], stego: ["gator", 2], pony: ["gator", 2], owl: ["gator", 2], trex: ["bear", 3], trike: ["bear", 3], unicorn: ["wolf", 4], dragon: ["wolf", 4] };
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
export const homeZone = (sp) => { const n = zones.findIndex((z) => z.sp === sp); return n >= 0 ? n : Math.max(0, ZONE_KIND.indexOf(sp)); };   // the first neighborhood whose animal it is
export const mountScale = (m) => 1 + 0.25 * clamp(m.r | 0, 0, 4);             // Common 1x to Legendary 2x
// (owner, 2026-11-12) around the post office every mount goes the same speed; the purple Aura pad across the way out
// (x AURA_PAD.x, all the way across) switches on its own speed for the run
export const BASE_SPEED = 12, RARITY_UP = 0.2, ZONE_UP = 0.05, SPD_UP = 0.05;
// (owner, 2026-11-12) speed: 20% more per rarity step; 5% more per Aura speed level. (owner, 2026-11-14) each zone's
// animal goes 5% faster than the one before (Dog 100%, Cat 105%, Gator 110%...), the same in every zone
export const zoneSpeed = (sp) => Math.pow(1 + ZONE_UP, homeZone(sp));
export function mountStats(m, zone) {   // m: { sp, r (rarity), spd }; zone: where it is (districtAt), or its own zone
  const r = clamp(m.r | 0, 0, 4); void zone;
  return { speed: BASE_SPEED * (1 + RARITY_UP * r) * zoneSpeed(m.sp), jump: 8, grip: 0 };   // (owner, 2026-11-14) no Aura speed (Boost) levels, and every mount jumps and grips the same
}
// (owner, 2026-11-11) trails: one more to unlock every five areas opened (with five areas, the first at the Floating
// Islands); any mount can wear any trail you've unlocked
// (owner, 2026-11-12) and trails bought with Aura (d.trails)
export const TRAILS = [{ k: "cloud", name: "Cloud Trail", zones: 5 }, { k: "comet", name: "Comet Trail", zones: 10 }, { k: "spark", name: "Spark Trail", cost: 2500 }, { k: "bubble", name: "Bubble Trail", cost: 6000 }, { k: "heart", name: "Heart Trail", cost: 15000 }, { k: "flame", name: "Flame Trail", cost: 40000 }];
export const trailsFor = (d) => TRAILS.filter((t) => (t.zones ? openFor(d) >= t.zones : (d.trails || []).includes(t.k))).map((t) => t.k);
// (owner, 2026-11-12) podiums: the three best mounts of the couriers in a server stand on the three podiums by the post
// office (each courier's best three can stand); a rarer one takes a podium from a lesser one. Each pays its courier Aura
// every PODIUM.every s while it stands there, more for rarer, Shiny and farther animals
export const PODIUM = { every: 10, spots: [] };   // (owner, 2026-11-13) the spots are placed with the zone builder (gold, silver, bronze in that order)
export const podiumScore = (m) => clamp(m.r | 0, 0, 4) * 100 + (m.va ? 50 : 0) + homeZone(m.sp) * 10 + (m.spd | 0) + (m.cap | 0);
export const podiumPay = (m) => Math.round(2 * Math.pow(2, clamp(m.r | 0, 0, 4)) * (m.va ? 3 : 1) * (1 + 0.5 * homeZone(m.sp)));
// (owner, 2026-11-11) no eggs any more: parcels drop mounts. Eggs someone still had became a Dog each (a Basic Egg a
// Common one, a Rare Egg a Rare one, a Legendary Egg a Legendary one)
const EGG_TO = { basic: ["dog", 0], rare: ["gator", 2], legendary: ["wolf", 4] };
export const MOUNT_CAP = 60;
// (owner, 2026-11-14) kicking another courier (m, s, m/s): in reach and in front; it throws them off their mount and
// tumbling (down s), then a moment safe from kicks (grace s); one kick every cd s; never a party member or at the post office
export const KICK = { range: 3.6, cd: 4, fling: 14, up: 9, down: 1.4, grace: 4 };
// dogs, geese (m and seconds)
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
  const w = spawnWeights(open, mr); if (!w.some((v) => v > 0)) return null; let r = rnd(), tier = 0; for (let n = 0; n < w.length; n++) { if (r < w[n]) { tier = n; break; } r -= w[n]; }
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
export function rewardRoll(tier, up, rnd = Math.random, open = tier + 1) {
  const odds = rollOdds(TIERS[tier].luck + stampLuck(up.stamps)); let r = rnd(), t = 0; for (let n = 0; n < odds.length; n++) { if (r < odds[n]) { t = n; break; } r -= odds[n]; t = n; }
  const near = t < 4 && r < 0.012 && t >= 3;
  return { tier: t, near, ...giftContents(t, tier, up, rnd, open) };
}
// (owner, 2026-11-14) a gift's coins from zone pt's parcel: the rarity's range, its top 5% higher for each zone further
// out, and its bottom 5% higher (up to the top) for each zone the courier has opened past that one
export function giftRange(t, pt, open = pt + 1) {
  const R = ROLLS[t], g = Math.pow(1.05, pt | 0), hi = R.coins[1] * g, lo = Math.min(hi, R.coins[0] * g * Math.pow(1.05, Math.max(0, (open | 0) - 1 - (pt | 0))));
  return [lo, hi];
}
// what's inside a gift of rarity t from a parcel of tier pt (decided when it's opened, owner 2026-11-11); open: how many zones the courier has open
export function giftContents(t, pt, up, rnd = Math.random, open = pt + 1) {
  const [lo, hi] = giftRange(t, pt, open), coins = Math.round(lo + rnd() * (hi - lo));
  const Z = zoneCfg(pt); let pet = null; for (let r = t; r >= 0 && !pet; r--) if (rnd() < Z.chance[r]) pet = { sp: Z.sp, r, va: skinRoll(rnd, Z.shiny) };   // that rarity or lower; (owner, 2026-11-13) the neighborhood's own animal and chances
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
export const skinRoll = (rnd = Math.random, p = SHINY) => (rnd() < p ? 1 : 0);   // 1 in 10,000 Shiny

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
// (owner, 2026-11-13) placed with the zone builder (none until then: no conveyor, no safe zone); setBuild moves it
// PO_LOCAL: its parts as if it stood at (0, 0) facing +z; (owner, 2026-11-13) it can be turned (yaw)
export const PO_LOCAL = { x: 0, z: 0, b: { x: 0, z: -9, hw: 8, hd: 5, h: 6.5 }, belt: { z0: -4, z1: 5.2, hw: 1.3, top: 1.1 }, end: { x: 0, z: 3.9 } };
export const PO = { on: false, x: 0, z: 0, y: 0, yaw: 0, b: { ...PO_LOCAL.b }, belt: { ...PO_LOCAL.belt }, end: { ...PO_LOCAL.end } };
export const turn = (lx, lz, yaw) => [lx * Math.cos(yaw) + lz * Math.sin(yaw), -lx * Math.sin(yaw) + lz * Math.cos(yaw)];   // a local offset turned as a model turned yaw
// (owner, 2026-11-11: neighborhoods three houses long) every district is short: three houses down each side of the road
export const SPAWN = { x: 0.5, z: 0.5, y: 0, yaw: 0 },   /* (owner, 2026-11-13) the respawn point, placed with the zone builder */ SUBURBS_X = 110, TOWN = { x0: -45, x1: 190, z0: -30, z1: 30 }, MARSH = { x0: 190, x1: 290, z0: -30, z1: 30 }, CLIFF = { x0: 290, x1: 415, z0: -30, z1: 30 };   // (owner, 2026-11-11) narrow: the road down the middle, houses both sides
export const TERRACE = (n) => ({ x0: 300 + 38 * (n - 1), x1: n === 3 ? 414 : 300 + 38 * n, z0: -27, z1: 27, y: 6 * n });   // n = 1..3: Cliffside's three steps, each with a ramp up the road onto it
export const ISLES = [];   // (owner, 2026-11-13) gone with the hand-built town
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
// (owner, 2026-11-13) the zone a spot is in: the nearest mailbox's (the post office square is the first)
export function districtAt(x, z, y = 0) { for (const a of areas) if (x >= a.x0 && x < a.x1 && z >= a.z0 && z < a.z1) return a.d; return 0; }   // (owner, 2026-11-13) the bounds it's in

function rect(x0, x1, z0, z1, y, kind, b = y - 40, m = 0) { slabs.push({ k: 0, x0, x1, z0, z1, y, b, kind, m, mx: (m * (x1 - x0)) / 2, mz: (m * (z1 - z0)) / 2 }); }
function disc(x, z, r, y, kind, b = y - 6) { slabs.push({ k: 1, x, z, r, x0: x - r, x1: x + r, z0: z - r, z1: z + r, y, b, kind }); }
function ramp(x0, x1, z0, z1, y0, y1, kind) { slabs.push({ k: 2, x0, x1, z0, z1, y: Math.max(y0, y1), ya: y0, yb: y1, b: Math.min(y0, y1) - 40, kind }); }   // rises along z from ya (at z0) to yb (at z1)
function rampX(x0, x1, z0, z1, y0, y1, kind) { slabs.push({ k: 3, x0, x1, z0, z1, y: Math.max(y0, y1), ya: y0, yb: y1, b: Math.min(y0, y1) - 40, kind }); }   // rises along x from ya (at x0) to yb (at x1)
function solid(x, z, hw, hd, y0, y1, yaw = 0) { solids.push({ x, z, hw, hd, c: Math.cos(yaw), s: Math.sin(yaw), y0, y1, rad: hyp(hw, hd) }); }
const STREET = ["Main Street", "Maple Lane", "Goose Way", "Cliff Road", "Cloud Isle", "Frost Lane", "Dune Road", "Vine Street", "Ember Way", "Star Lane"];
// (owner, 2026-11-12) each far zone's tough going: ice (slippery), sand (slow, and sandstorms), rivers across the jungle
// (slow, and thick trees), lava pools (a burn and a bounce), and the moon's low gravity
export const lavas = [], ICE_GRIP = 0.12, SAND_SLOW = 0.8, WATER_SLOW = 0.5, MOON_GRAV = 0.45, LAVA = { stun: 0.6, every: 2 };
export const lavaAt = (x, z, y) => y < 1.2 && lavas.some((l) => hyp(x - l.x, z - l.z) < l.r);

// (owner, 2026-11-13) the town is built by an admin in the game now (the zone builder below): what's fixed is only the
// ground (a big flat field), the post office square with its building, conveyor and podiums
// (owner, 2026-11-13) the world is in the sky, and nothing is fixed: everything (the post office, the respawn point,
// the podiums...) is placed with the zone builder; a world with nothing in it is one 1 m block to stand on
export const GROUND = { r: 1000 }, SEED = [{ id: 1, k: "block", x: 0, z: 0, y: -1, w: 1, h: 1, d: 1, m: "grass" }];
const BASE_N = { slabs: slabs.length, solids: solids.length };

// ---- (owner, 2026-11-13) the zone builder: an admin places blocks, houses, mailboxes and gates in the game, on a 1 m
// grid with quarter turns; the server keeps them and everyone has the same. A block: its corner (x, z) and bottom y,
// w x h x d metres and a material. A house: centered on (x, z), 8 x 8 m, turned r quarter turns, in zone d (its
// colors). A mailbox: an address in zone d (parcels of that zone's tier go to its mailboxes). A gate: 8 m wide, closed
// to anyone who hasn't opened zone d yet (the zone it leads into) ----
export const BUILD_MAX = 6000, BLOCK_MAX = 60, HOUSE_S = 8, HOUSE_H = 5, GATE_W = 8, GATE_H = 7, GATE_T = 1;
export const MATS = ["grass", "dirt", "stone", "brick", "wood", "road", "sand", "snow", "ice", "water", "mud", "turbine"];   // (owner, 2026-11-13) mud slows, ice slides, water is a see-through wall, a turbine blows you up into the air
export const PIECES = ["block", "house", "mailbox", "gate", "wall", "tree", "boost", "start", "podium", "spawn", "office", "area", "pipe", "gust", "mover"];
export const AREA_MAX = 1000;
export const ONE_ONLY = ["spawn", "office"];   // the last one placed counts
export const buildings = [], gates = [], starts = [], areas = [], pipes = [];
// ---- (owner, 2026-11-13) neighborhoods: each one's name, its animal (the mount its parcels bring, the one that opens the
// next), the chance of each rarity and of a Shiny; an admin sets them in the builder. Where a spot belongs: the bounds
// (areas) drawn for each; the smallest one a spot is in wins; outside every bound, the first neighborhood ----
export const zones = [];
export const SHOTS_MAX = 5;   // (owner, 2026-11-13) a neighborhood's cinematic shots, each { name, x, y, z }
export function cleanZone(z, n) {
  z = z || {}; const ch = Array.isArray(z.chance) ? z.chance : PET_CHANCE;
  return { name: (typeof z.name === "string" && z.name.trim() ? z.name.trim() : DISTRICTS[n]).slice(0, 24), sp: MOUNTS[z.sp] ? z.sp : ZONE_KIND[n], chance: PET_CHANCE.map((v, r) => clamp(Number.isFinite(+ch[r]) ? +ch[r] : v, 0, 1)), shiny: clamp(Number.isFinite(+z.shiny) ? +z.shiny : SHINY, 0, 0.5),
    shots: (Array.isArray(z.shots) ? z.shots : []).filter((q) => q && typeof q === "object").slice(0, SHOTS_MAX).map((q) => ({ name: (typeof q.name === "string" ? q.name.trim() : "").slice(0, 24), x: clamp(Math.round(+q.x || 0), -GROUND.r, GROUND.r), y: clamp(Math.round(+q.y || 0), -40, 300), z: clamp(Math.round(+q.z || 0), -GROUND.r, GROUND.r) })) };
}
export const zoneCfg = (d) => zones[clamp(d | 0, 0, TIERS.length - 1)] || cleanZone(null, clamp(d | 0, 0, TIERS.length - 1));
export const zoneName = (d) => zoneCfg(d).name, zoneSp = (d) => zoneCfg(d).sp;
export const START_W = 8, START_D = 2;   // a start line: 8 m across, 2 m deep
export const onStart = (x, z, y) => starts.some((g) => Math.abs(y - g.y) < 2 && Math.abs((x - g.x) * g.c - (z - g.z) * g.s) < START_W / 2 && Math.abs((x - g.x) * g.s + (z - g.z) * g.c) < START_D / 2 + 0.5);
export let build = [];
export function cleanPiece(q) {
  if (!q || !PIECES.includes(q.k)) return null;
  const n = (v, a, b) => clamp(Math.round(+v || 0), a, b), o = { id: n(q.id, 1, 1e9), k: q.k, x: n(q.x, -GROUND.r, GROUND.r), z: n(q.z, -GROUND.r, GROUND.r), y: n(q.y, -40, 300) };
  if (q.k === "block") { o.w = n(q.w, 1, BLOCK_MAX); o.h = n(q.h, 1, BLOCK_MAX); o.d = n(q.d, 1, BLOCK_MAX); o.m = MATS.includes(q.m) ? q.m : "grass"; }
  else if (q.k === "gust") { o.w = n(q.w, 1, BLOCK_MAX); o.h = n(q.h, 1, BLOCK_MAX); o.d = n(q.d, 1, BLOCK_MAX); o.a = n(q.a, 0, 359); o.iv = clamp(Math.round((+q.iv || GUST.iv) * 10) / 10, 0.5, 30); o.pw = n(q.pw === undefined ? GUST.pw : q.pw, 1, 60); }
  else if (q.k === "mover") { o.w = n(q.w, 1, BLOCK_MAX); o.h = n(q.h, 1, BLOCK_MAX); o.d = n(q.d, 1, BLOCK_MAX); o.m = MATS.includes(q.m) && q.m !== "turbine" ? q.m : "wood"; o.bx = n(q.bx, -200, 200); o.by = n(q.by, -100, 100); o.bz = n(q.bz, -200, 200); o.sp = n(q.sp === undefined ? MOVER.sp : q.sp, 1, 30); }
  else if (q.k === "area") { o.w = n(q.w, 1, AREA_MAX); o.d = n(q.d, 1, AREA_MAX); o.zone = n(q.zone, 0, TIERS.length - 1); }   // (owner, 2026-11-13) a neighborhood's bounds
  else { o.r = n(q.r, 0, 3); if (q.k === "gate" || q.k === "wall") o.zone = n(q.zone, 1, TIERS.length - 1); if (q.k === "wall") o.w = n(q.w, 1, BLOCK_MAX); if (q.k === "pipe") o.to = n(q.to, 0, 1e9); if (q.k === "spawn") o.a = n(q.a === undefined ? o.r * 90 : q.a, 0, 359); }   // a: (owner, 2026-11-13) the respawn point turns all the way round, in degrees
  return o;
}
export function setBuild(data) {   // data: { pieces, zones } (or, from before, just the pieces)
  const list = Array.isArray(data) ? data : (data && data.pieces) || [], zs = (!Array.isArray(data) && data && data.zones) || [];
  zones.length = 0; for (let n = 0; n < TIERS.length; n++) zones.push(cleanZone(zs[n], n));
  build = list.map(cleanPiece).filter(Boolean).slice(0, BUILD_MAX); if (!build.length) build = SEED.map((q) => ({ ...q }));
  areas.length = 0; for (const q of build) if (q.k === "area") areas.push({ id: q.id, x0: q.x, z0: q.z, x1: q.x + q.w, z1: q.z + q.d, d: q.zone, size: q.w * q.d });
  areas.sort((a, b) => a.size - b.size);
  slabs.length = BASE_N.slabs; solids.length = BASE_N.solids; houses.length = 0; buildings.length = 0; gates.length = 0; starts.length = 0; boosts.length = 0; trees.length = 0; pipes.length = 0; gusts.length = 0; movers.length = 0; updrafts.length = 0; PODIUM.spots.length = 0; PO.on = false;
  Object.assign(SPAWN, { x: 0.5, z: 0.5, y: 0, yaw: 0 });
  const count = TIERS.map(() => 0);
  for (const q of build) {
    const yaw = q.k === "spawn" && q.a !== undefined ? (q.a * Math.PI) / 180 : (q.r | 0) * (Math.PI / 2);
    if (q.k === "block") { rect(q.x, q.x + q.w, q.z, q.z + q.d, q.y + q.h, q.m, q.y, STAND_X); if (q.m === "turbine") updrafts.push({ id: q.id, x0: q.x, x1: q.x + q.w, z0: q.z, z1: q.z + q.d, y0: q.y + q.h, y1: q.y + q.h + TURBINE.h }); }
    else if (q.k === "gust") { const a = (q.a * Math.PI) / 180; gusts.push({ id: q.id, x0: q.x, x1: q.x + q.w, z0: q.z, z1: q.z + q.d, y0: q.y, y1: q.y + q.h, dx: Math.sin(a), dz: Math.cos(a), iv: q.iv, pw: q.pw }); }
    else if (q.k === "mover") movers.push({ ...q });
    else if (q.k === "house") { buildings.push({ id: q.id, x: q.x, z: q.z, y: q.y, yaw, d: districtAt(q.x, q.z, q.y) }); solid(q.x, q.z, HOUSE_S / 2, HOUSE_S / 2, q.y - 1, q.y + HOUSE_H, yaw); }
    else if (q.k === "mailbox") { const d = districtAt(q.x, q.z, q.y); houses.push({ id: q.id, x: q.x, z: q.z, y: q.y, yaw, d, mx: q.x, mz: q.z, my: q.y, name: ++count[d] + " " + zoneName(d) }); solid(q.x, q.z, 0.2, 0.2, q.y - 1, q.y + 1.3); }   // in whichever neighborhood's bounds it stands
    else if (q.k === "wall") gates.push({ id: q.id, x: q.x, z: q.z, y: q.y, yaw, d: q.zone, c: Math.cos(yaw), s: Math.sin(yaw), w: q.w, wall: 1 });   // a bound wall: closed like a gate
    else if (q.k === "gate") gates.push({ id: q.id, x: q.x, z: q.z, y: q.y, yaw, d: q.zone, c: Math.cos(yaw), s: Math.sin(yaw), w: GATE_W });
    else if (q.k === "pipe") { pipes.push({ id: q.id, x: q.x, z: q.z, y: q.y, yaw, to: q.to }); solid(q.x, q.z, TUBE.r, TUBE.l / 2, q.y - 1, q.y + TUBE.r * 2, yaw); }
    else if (q.k === "tree") { trees.push({ id: q.id, x: q.x, z: q.z, y: q.y, s: 1, yaw }); solid(q.x, q.z, 0.45, 0.45, q.y - 1, q.y + 8); }
    else if (q.k === "boost") boosts.push({ id: q.id, x: q.x, z: q.z, y: q.y, yaw });   // x1.6 speed for a moment, the way it points
    else if (q.k === "start") starts.push({ id: q.id, x: q.x, z: q.z, y: q.y, yaw, c: Math.cos(yaw), s: Math.sin(yaw) });
    else if (q.k === "podium") { if (PODIUM.spots.length < 3) { const h = [1.6, 1.1, 0.7][PODIUM.spots.length]; PODIUM.spots.push({ id: q.id, x: q.x, z: q.z, y: q.y + h }); rect(q.x - 2.2, q.x + 2.2, q.z - 2.2, q.z + 2.2, q.y + h, "pod" + (PODIUM.spots.length - 1), q.y, STAND_X); } }
    else if (q.k === "spawn") Object.assign(SPAWN, { x: q.x, z: q.z, y: q.y, yaw });   // couriers face the way it's turned
    else if (q.k === "office") { const L = PO_LOCAL, [bx, bz] = turn(L.b.x, L.b.z, yaw), [ex, ez] = turn(L.end.x, L.end.z, yaw); Object.assign(PO, { on: true, x: q.x, z: q.z, y: q.y, yaw, b: { ...L.b, x: q.x + bx, z: q.z + bz }, end: { x: q.x + ex, z: q.z + ez } }); }
  }
  if (PO.on) {   // the post office: the building and the conveyor out of its door, turned as it stands
    const L = PO_LOCAL, [cx, cz] = turn(0, (L.belt.z0 + L.belt.z1) / 2, PO.yaw);
    solid(PO.b.x, PO.b.z, PO.b.hw, PO.b.hd, PO.y - 1, PO.y + PO.b.h + 3, PO.yaw);
    solid(PO.x + cx, PO.z + cz, L.belt.hw, (L.belt.z1 - L.belt.z0) / 2, PO.y - 1, PO.y + L.belt.top + 0.05, PO.yaw);
  }
}
// (owner, 2026-11-13) pipe shortcuts: a pipe lies on its side, its mouth the way it's turned; two linked pipes (shift-click
// both in the builder, then Link) take a rider who rides into one's mouth out of the other's, facing out of it
export const TUBE = { r: 1.6, l: 4, cd: 1 };
const tubeOf = (id) => pipes.find((p) => p.id === id);
export const tubePartner = (p) => { const o = p && p.to ? tubeOf(p.to) : null; return o && o.to === p.id ? o : null; };
export function pipeAt(x, z, y) {   // the linked pipe whose mouth (x, z, y) is riding into, if any
  for (const p of pipes) {
    if (y < p.y - 0.6 || y > p.y + TUBE.r * 2 || !tubePartner(p)) continue; const dx = x - p.x, dz = z - p.z, c = Math.cos(p.yaw), s = Math.sin(p.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < TUBE.r && lz > TUBE.l / 2 - 0.2 && lz < TUBE.l / 2 + 1.6) return p;
  }
  return null;
}
export function pipeExit(p) { const [ox, oz] = turn(0, TUBE.l / 2 + 2, p.yaw); return { x: p.x + ox, z: p.z + oz, y: p.y, yaw: p.yaw }; }
// (owner, 2026-11-13) hazards the builder places. A gust: a box of wind that blows the way it's turned for GUST.on s out of
// every iv s, pushing riders inside with pw; the same moment for everyone (server time). A turbine block: an updraft
// TURBINE.h m high over its top lifts riders into the air. A mover: a platform going back and forth between where it was
// placed (A) and A + (bx, by, bz) (B) at sp m/s, resting MOVER.rest s at each end; riders on it go along.
export const gusts = [], movers = [], updrafts = [];
export const GUST = { iv: 4, pw: 18, on: 1.6 }, TURBINE = { h: 12, lift: 34, max: 15 }, MOVER = { sp: 4, rest: 0.6 };
export const gustOn = (g, tSec) => (((tSec % g.iv) + g.iv) % g.iv) < Math.min(GUST.on, g.iv * 0.6);
export function gustAt(x, z, y, tSec) { for (const g of gusts) if (x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1 && y >= g.y0 - 0.5 && y <= g.y1 && gustOn(g, tSec)) return g; return null; }
export function updraftAt(x, z, y) { for (const u of updrafts) if (x >= u.x0 && x <= u.x1 && z >= u.z0 && z <= u.z1 && y >= u.y0 - 0.3 && y <= u.y1) return u; return null; }
export function moverPos(q, tSec) {   // the platform's corner (x, y, z) at tSec
  const L = Math.hypot(q.bx, q.by, q.bz); if (L < 0.01) return { x: q.x, y: q.y, z: q.z };
  const go = L / q.sp, T = 2 * (go + MOVER.rest), p = ((tSec % T) + T) % T;
  let u = p < go ? p / go : p < go + MOVER.rest ? 1 : p < 2 * go + MOVER.rest ? 1 - (p - go - MOVER.rest) / go : 0; u = u * u * (3 - 2 * u);
  return { x: q.x + q.bx * u, y: q.y + q.by * u, z: q.z + q.bz * u };
}
export function moverUnder(x, z, y, tSec) {   // the highest moving platform top under (x, z) at most a step above y, with where it is
  let best = null;
  for (const q of movers) { const p = moverPos(q, tSec), m = STAND_X / 2, top = p.y + q.h; if (x >= p.x - q.w * m && x <= p.x + q.w * (1 + m) && z >= p.z - q.d * m && z <= p.z + q.d * (1 + m) && top <= y + 0.6 && (!best || top > best.top)) best = { q, p, top }; }
  return best;
}
export const addr = (id) => houses.find((h) => h.id === id) || null;   // a mailbox by its id
// a closed gate in the way at (x, z, y), for someone with `open` zones open
export function gateBlocked(x, z, y, open, r = 0.55) {
  for (const g of gates) { if (g.d < open || y + 1.4 < g.y || y > g.y + GATE_H) continue; const dx = x - g.x, dz = z - g.z; if (Math.abs(dx * g.c - dz * g.s) < g.w / 2 + r && Math.abs(dx * g.s + dz * g.c) < GATE_T / 2 + r) return true; }
  return false;
}

// the ground's top under (x, z): the highest slab top at most a step (0.6 m) above y; -Infinity where there's nothing
function topOf(s, x, z) { return s.k === 2 ? s.ya + ((s.yb - s.ya) * (z - s.z0)) / (s.z1 - s.z0) : s.k === 3 ? s.ya + ((s.yb - s.ya) * (x - s.x0)) / (s.x1 - s.x0) : s.y; }
const inSlab = (s, x, z) => x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && (s.k !== 1 || hyp(x - s.x, z - s.z) <= s.r);
// (owner, 2026-11-13) standing on a block or a podium: its top reaches 5% past its sides (a touch of forgiveness for a
// near-miss landing); bumping into its sides still uses the real block
export const STAND_X = 0.05, COYOTE = 0.15;   // COYOTE: s a jump still works after running off an edge
const onSlab = (s, x, z) => (s.m ? x >= s.x0 - s.mx && x <= s.x1 + s.mx && z >= s.z0 - s.mz && z <= s.z1 + s.mz : inSlab(s, x, z));
export function surfaceAt(x, z, y) { let best = -Infinity; for (const s of slabs) if (onSlab(s, x, z)) { const t = topOf(s, x, z); if (t <= y + 0.6 && t > best) best = t; } return best; }
export function groundKind(x, z, y) { let best = -Infinity, kind = ""; for (const s of slabs) if (onSlab(s, x, z)) { const t = topOf(s, x, z); if (t <= y + 0.6 && t > best) { best = t; kind = s.kind; } } return kind; }
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
export const counterDist = (x, z) => (PO.on ? Math.max(0, hyp(x - PO.end.x, z - PO.end.z) - 1.8) : Infinity);
export const inSafeZone = (x, z, y = 0) => PO.on && Math.abs(y - PO.y) < 8 && hyp(x - PO.x, z - PO.z) < SAFE_R;
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
