// (owner, 2026-10-15, "rebuild a bit") Every number of the game, fixed here (the Ship Editor is gone): one ship for
// everyone, the five weapons a player picks two of (primary, secondary), the seven charged abilities, the upgrade levels
// bought with credits, the capture-point buffs, the team stations, asteroids and credit rewards. Sent to every client in
// the hello. Units: m, m/s, m/s^2, degrees, seconds, percent unless said.
export const TEAMS = ["blue", "red"];              // "red" is shown as Yellow (the key saved in player data)

// the ship, at level 1 of every upgrade
export const SHIP = {
  hp: 150, hpRegen: 1, hpDelay: 5, respawn: 6,
  speed: 55, accel: 60, brake: 100, turn: 32, turnAccel: 155, strafe: 60, reverse: 60,
  armor: 10, cap: 100, capRegen: 8,
};

// the weapons: left click fires the primary, F the secondary (both held). Each has its own magazine and reload.
export const WEAPON_KINDS = ["bullets", "beam", "railgun", "missiles", "drones"];
export const WEAPONS = {
  bullets: { name: "Bullets", dmg: 9, rate: 6, mag: 40, reload: 2, optimal: 450, falloff: 200, dmgEnd: 40, dmgCurve: 1,
    bspeed: 1300, spdEnd: 10, spdCurve: 1, spread0: 0, spreadMax: 8, spreadAdd: 0.8, spreadBack: 6, capUse: 0 },
  beam: { name: "Beam", dmg: 40, rate: 12, mag: 100, reload: 3, optimal: 600, falloff: 250, dmgEnd: 35, dmgCurve: 1, rot: 110, capUse: 4 },   // dmg / rate / capUse: a second
  railgun: { name: "Railgun", dmg: 65, rate: 0.8, mag: 4, reload: 3, optimal: 1000, falloff: 250, dmgEnd: 60, dmgCurve: 1, capUse: 12 },   // hits at once
  // a missile zigzags out, homing on the enemy nearest its nose, and bursts (area damage, less toward the edge); it can be shot down
  missiles: { name: "Missiles", dmg: 45, radius: 70, rate: 1.2, mag: 4, reload: 4, speed: 260, life: 4, turn: 150, seek: 700, hp: 15, capUse: 0 },
  // a drone flies to the enemy nearest the aim, circles it shooting, and wears out; at most `max` out at once
  drones: { name: "Drones", dmg: 7, every: 0.5, reach: 170, orbit: 80, rate: 2, mag: 3, reload: 6, speed: 170, hp: 25, decay: 2.5, max: 3, seek: 700, capUse: 0 },
};
export const AIM_ROT = 540;                        // degrees a second the aim line turns toward the pointer

// the abilities (Shift): each charges up over `charge` s, then lasts `dur` s
export const ABILITY_KINDS = ["shield", "armor", "speed", "damage", "blink", "cloak", "chain"];
export const ABILITIES = {
  shield: { name: "Shield", charge: 18, dur: 6, hp: 120 },
  armor: { name: "Damage Reduction", charge: 18, dur: 5, cut: 50 },       // % of the damage still taken off after armor
  speed: { name: "Speed Boost", charge: 12, dur: 4, mul: 60 },            // % more speed and acceleration
  damage: { name: "Damage Boost", charge: 20, dur: 5, mul: 40 },          // % more damage
  blink: { name: "Teleport", charge: 10, dur: 0, dist: 250 },             // straight ahead along the nose
  cloak: { name: "Invisibility", charge: 22, dur: 6 },                    // firing ends it
  chain: { name: "Chain", charge: 18, dur: 4, reach: 450, arc: 35, pull: 90, slack: 110 },   // the enemy nearest the aim (within arc degrees), pulled in past slack m
};

// upgrades: levels 1-10 bought with credits; going from level L to L + 1 costs upCost(L)
export const UPGRADES = [["hp", "Health"], ["speed", "Speed"], ["armor", "Armor"], ["dmg", "Damage"], ["regen", "Health Regen"], ["energy", "Energy Regen"]];
export const LV_MAX = 10;
export const upCost = (lv) => 40 * lv;
export const UP_STEP = { hp: 10, speed: 4, armor: 4, dmg: 6, regen: 1.5, energy: 12 };   // per level above 1: % health, % speed, armor points, % damage, health a second, % energy regen

// a capture point's buff (the Build menu sets it): the team holding it gets it while it holds it
export const BUFFS = ["Health", "Speed", "Range", "Damage", "Armor", "Regen"];
export const BUFF = { hp: 20, speed: 15, range: 20, dmg: 15, armor: 10, regen: 3, energy: 25 };
export const CAPTURE_TIME = 8;                     // s for one team alone in it to take it from neutral

export const CREDITS = { kill: 100, rock: 0.8 };   // a kill; an asteroid: per m of its radius
// each team's station: being near it repairs; destroying the enemy's wins the match (a new one starts MATCH_WAIT s later)
export const STATION = { hp: 6000, r: 90, x: 950, reach: 350, heal: 20, healCap: 10 };
export const MATCH_WAIT = 10;
export const ASTEROIDS = { n: 28, rMin: 18, rMax: 42, hpPerR: 4, respawn: 10 };

// the shape damage and bullet speed follow past optimal: 1 out to it, falling to end% at optimal + falloff
export function curveAt(s, S, end, shape) {
  if (s <= S.optimal) return 1;
  const u = S.falloff > 0 ? Math.min(1, (s - S.optimal) / S.falloff) : 1;
  return 1 - (1 - end / 100) * Math.pow(u, shape);
}
export const maxRange = (S) => S.optimal + S.falloff;
