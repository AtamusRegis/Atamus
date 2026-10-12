// Pulls the weapon numbers out of the owner's "The Reach" item database (an HTML page with a DATA object) into
// packages/server/src/game/weapons.json: for each weapon system, size and role, the Standard-ammo row (dps, range,
// tracking / missile explosion numbers), plus the roles' and ammo kinds' multipliers and each system's damage lean.
// Usage: node scripts/gen/weapons_from_reach.mjs The-Reach.html
import { readFileSync, writeFileSync } from "node:fs";
const html = readFileSync(process.argv[2], "utf8");
const line = html.split("\n").find((l) => l.startsWith("const DATA="));
const D = JSON.parse(line.slice("const DATA=".length).replace(/;\s*$/, ""));
const W = D.weap, SYS = { missile: "missile", beam: "laser", repeater: "bullet", coilgun: "hybrid" }, SZ = { 1: "s", 2: "m", 3: "l" };
const out = { source: "The Reach (owner, 2026-10-11)", systems: {}, roles: {}, subs: {}, targets: W.targets };
for (const r of W.roles) out.roles[r.k] = { n: r.n, dmg: r.dmg, sh: r.sh, ar: r.ar, range: r.range, app: r.app, pg: r.pg, cpu: r.cpu };
for (const s of W.subs) out.subs[s.k] = { n: s.n, dmg: s.dmg, range: s.range, app: s.app, cyc: s.cyc, vel: s.vel };
for (const [ours, theirs] of Object.entries(SYS)) {
  const sys = W.systems.find((x) => x.k === theirs);
  const o = out.systems[ours] = { reach: theirs, base: sys.base, charge: sys.charge, lean: sys.lean, role_n: sys.role_n, mech: sys.mech, rows: {} };
  for (const r of W.table) if (r.sys === theirs && r.sub === "std") ((o.rows[SZ[r.sz]] ||= {})[r.role] = { n: r.n, an: r.an, dps: r.dps, vs_shield: r.vs_shield, vs_armor: r.vs_armor, range: r.range, hit: r.hit });
}
writeFileSync(new URL("../../packages/server/src/game/weapons.json", import.meta.url), JSON.stringify(out, null, 1));
console.log("ok", Object.keys(out.systems).map((k) => k + ":" + Object.keys(out.systems[k].rows).length));
