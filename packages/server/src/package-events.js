// Room-wide prize-package events. The server owns the packages and rewards so every package can be claimed once.
import { houses } from "./pets-world.js";

export const PACKAGE_EVENT_EVERY_MS = 10 * 60_000;
export const PACKAGE_EVENT_MIN_MS = 60_000;
export const PACKAGE_EVENT_MAX_MS = 120_000;

const PETS = [
  ["pup", "kitten", "bunny", "duck"],
  ["otter", "fox", "penguin", "goat", "butterfly", "parrot", "stego"],
  ["turtle", "deer", "bear", "horse", "owl", "trike", "raptor"],
  ["dragon", "unicorn", "pegasus", "phoenix", "trex", "ptero", "icedragon"],
];

const whole = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const trainNeed = (level) => 20 + (level - 1) * 4;

export function makePackageEvent(now, players, rng = Math.random) {
  const town = houses.filter((h) => !h.sky), count = Math.min(town.length, 8 + Math.min(20, Math.max(1, players) * 3));
  const pool = town.slice(), boxes = new Map();
  for (let id = 1; id <= count; id++) {
    const at = Math.floor(rng() * pool.length), h = pool.splice(at, 1)[0];
    boxes.set(id, { id, x: h.mx, y: h.my, z: h.mz });
  }
  return { id: `${now.toString(36)}-${whole(rng, 0, 0xffff).toString(36)}`, ends: now + whole(rng, PACKAGE_EVENT_MIN_MS, PACKAGE_EVENT_MAX_MS), boxes };
}

export const packageEventView = (event, now = Date.now()) => event ? {
  id: event.id, left: Math.max(0, (event.ends - now) / 1000), boxes: [...event.boxes.values()],
} : null;

export function takePackage(event, id) {
  const box = event && event.boxes.get(id | 0);
  if (box) event.boxes.delete(id | 0);
  return box || null;
}

function addTraining(pet, points) {
  let left = points, levels = 0;
  while (left > 0 && pet.lv < 20) {
    const need = trainNeed(pet.lv), have = pet.tp || 0, add = Math.min(left, need - have);
    pet.tp = have + add; left -= add;
    if (pet.tp >= need) { pet.lv++; levels++; delete pet.tp; }
  }
  if (pet.lv >= 20) delete pet.tp;
  return levels;
}

export function packageReward(data, cap, rng = Math.random) {
  const roll = rng();
  if (roll < 0.12 && data.pets.length < cap) {
    const rarityRoll = rng(), rarity = rarityRoll < 0.5 ? 0 : rarityRoll < 0.82 ? 1 : rarityRoll < 0.96 ? 2 : 3;
    const choices = PETS[rarity], sp = choices[Math.floor(rng() * choices.length)], lv = whole(rng, 1, rarity + 1);
    data.pets.push({ id: data.nextId++, sp, lv });
    return { kind: "pet", sp, lv };
  }
  if (roll < 0.55) {
    const pet = data.pets.find((p) => p.id === data.ride) || data.pets[0];
    if (pet.lv < 20) { const n = whole(rng, 40, 100), levels = addTraining(pet, n); return { kind: "xp", sp: pet.sp, n, levels, lv: pet.lv, tp: pet.tp || 0 }; }
  }
  if (roll < 0.8) {
    const n = whole(rng, 1500, 6000); data.coins = Math.min(1e9, data.coins + n);
    return { kind: "coins", n };
  }
  const items = ["snack", "ribbon", "ticket"], item = items[Math.floor(rng() * items.length)], n = whole(rng, 3, 10);
  data.items[item] = Math.min(1e6, data.items[item] + n);
  return { kind: "item", item, n };
}
