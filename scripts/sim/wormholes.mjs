// Wormhole / nomad-space population simulator for docs/DESIGN.md (World structure › Nomad space).
// It doesn't touch the game: it models players logging in and out over a day, groups of different sizes, and every
// connection rule in the design, then reports where players end up.
//   node scripts/sim/wormholes.mjs                  # all scenarios
//   node scripts/sim/wormholes.mjs peak1000 blob    # some of them
// Player behavior here is a guess (dwell times, how often people head out or home); the rules are the design's.

const SC = {
  launch100:    { peak: 100,  worlds: 12, hours: 48 },
  peak1000:     { peak: 1000, worlds: 90, hours: 48 },
  few1000:      { peak: 1000, worlds: 40, hours: 48, note: "too few world systems" },
  blob:         { peak: 1000, worlds: 90, hours: 48, blob: 80, note: "plus one 80-player group that never splits and keeps hopping" },
  launch8:      { peak: 100,  worlds: 8,  hours: 48, note: "fewer systems at launch" },
  // owner's hole sizes: XS–XL (5–25 crossings, 30–150 min), whole groups always get through, 1 min friend window, no separate jump limit
  sized1000:    { peak: 1000, worlds: 90, hours: 48, sizes: true, lowCapAll: false, jumpLimit: Infinity, follow: 1, note: "hole sizes" },
  sizedBlob:    { peak: 1000, worlds: 90, hours: 48, sizes: true, lowCapAll: false, jumpLimit: Infinity, follow: 1, blob: 80, note: "hole sizes, plus the 80-group" },
  sizedSmallLow:{ peak: 1000, worlds: 90, hours: 48, sizes: true, lowCapAll: false, jumpLimit: Infinity, follow: 1, smallIntoLow: true, note: "hole sizes, holes into low systems only XS or S" },
  sizedRefuse:  { peak: 1000, worlds: 90, hours: 48, sizes: true, lowCapAll: false, jumpLimit: Infinity, follow: 1, smallIntoLow: true, refuseOversize: true, note: "hole sizes, XS/S into low, and a group bigger than what's left of a hole can't start through it" },
  sizedRefuseBlob:{ peak: 1000, worlds: 90, hours: 48, sizes: true, lowCapAll: false, jumpLimit: Infinity, follow: 1, smallIntoLow: true, refuseOversize: true, blob: 80, note: "the refuse variant, plus the 80-group" },
  gates6:       { peak: 1000, worlds: 90, hours: 48, expGates: 6, note: "the Expanse's 6 stargates (one link each)" },
  gates6x2:     { peak: 1000, worlds: 90, hours: 48, expGates: 6, gateLinks: 2, note: "6 stargates holding 2 links each" },
  gates6x3:     { peak: 1000, worlds: 90, hours: 48, expGates: 6, gateLinks: 3, note: "6 stargates holding 3 links each" },
  gates6at100:  { peak: 100,  worlds: 12, hours: 48, expGates: 6, note: "6 stargates at launch" },
  sized100:     { peak: 100,  worlds: 12, hours: 48, sizes: true, lowCapAll: false, jumpLimit: Infinity, follow: 1, note: "hole sizes at launch" },
  // the original rules, for comparison: the settling delay works both ways and only overcrowded-to-low holes are limited
  blobOld:      { peak: 1000, worlds: 90, hours: 48, blob: 80, settleUpOnly: false, lowCapAll: false, note: "the 80-group under the original rules" },
  peakOld:      { peak: 1000, worlds: 90, hours: 48, settleUpOnly: false, lowCapAll: false, note: "the original rules" },
};
const BASE = {
  jumpLimit: Infinity,  // (superseded by hole sizes) a hard per-hole player limit
  settle: 3,            // minutes a system must sit in a new tier before it counts
  settleUpOnly: true,   // getting busier counts at once; only calming down waits (sim finding, adopted)
  lowCapAll: false,     // (superseded by hole sizes) every hole into a low system has a hard jump limit
  follow: 1,            // minutes the friend window stays open (owner) (closing holes, holes into instanced empties)
  holeLife: [30, 90],   // minutes a hole lasts (without sizes)
  sizes: true,          // owner: holes come in sizes XS–XL; each takes 5 more crossings and lives 30 min longer
  sizeW: [30, 30, 20, 12, 8], // how often each size spawns (XS, S, M, L, XL): picked by sim comparison
  holesPerSystem: 2,    // an occupied nomad system keeps at least this many holes
  maxHoles: 4,          // and at most this many
  goNomad: 0.006,        // per minute, chance a group in the Expanse heads out (if a hole exists)
  goHome: 0.5,         // when a nomad group moves on, chance it takes an Expanse hole if its system has one
  homed: 0.4,           // share of players with a home nomad system
  homeJumpCdMin: 360,   // home jump cooldown
  homeJumpChance: 0.05, // when moving on, chance a homed group uses its home jump (if ready)
  joinGroup: 0.05,      // per minute, chance a solo player joins a group in the same system
  joinCap: 8,           // strangers only join groups smaller than this (friend parties can be bigger)
  expPer: 60,           // the Expanse keeps one hole per this many players online
};

// ---- deterministic randomness ----
let seed = 1;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const between = (a, b) => a + rnd() * (b - a);

const TIERS = ["empty", "low", "mid", "high", "over", "past50"];
const tierOf = (n) => (n === 0 ? "empty" : n <= 5 ? "low" : n <= 15 ? "mid" : n <= 25 ? "high" : n <= 50 ? "over" : "past50");
// who a system's new holes prefer, in order ("instanced" = spawn a new empty instanced system)
const PREFS = {
  empty: [["mid"], ["low"]],                                 // an empty world system that only just got someone
  low: [["mid"], ["high"]],
  mid: [["mid", "low", "high", "emptyWorld"]],
  high: [["low"], ["mid"]],
  over: [["emptyWorld"], ["low"], ["instanced"]],
  past50: [["instanced"]],
};
// which partner tiers a hole is still valid for, from its creator's side (any listed preference is fine)
const allowed = (creatorTier, partner) => {
  if (creatorTier === "past50") return partner.kind === "instanced";
  const ok = PREFS[creatorTier].flat();
  const pt = partner.kind === "instanced" && partner.pop === 0 ? "instanced" : partner.pop === 0 ? "emptyWorld" : partner.tier;
  return ok.includes(pt) || ok.includes("instanced") && partner.kind === "instanced";
};

function run(name, sc) {
  const P = { ...BASE, ...sc }; seed = 12345;
  const MIN = P.hours * 60, WARM = 6 * 60;
  const systems = new Map(), holes = new Map(); let nextSys = 0, nextHole = 0;
  const mkSys = (kind) => { const s = { id: kind[0] + nextSys++, kind, pop: 0, tier: "empty", pend: null, pendAt: 0, holes: new Set(), lastPartners: new Map() }; systems.set(s.id, s); return s; };
  const expanse = mkSys("expanse"); expanse.tier = "expanse";
  const worlds = Array.from({ length: P.worlds }, () => mkSys("world"));

  // accounts and groups: 60% solo, 25% 2–5, 12% 6–20, 3% 21–40 (by group count)
  const accounts = Math.round(P.peak * 1.3), players = [], groups = new Map(); let nextGroup = 0;
  const newGroup = (members) => { const g = { id: nextGroup++, members: new Set(members), dwellUntil: 0, blob: false }; for (const p of members) p.group = g.id; groups.set(g.id, g); return g; };
  while (players.length < accounts) {
    const r = rnd(), size = r < 0.6 ? 1 : r < 0.85 ? 2 + Math.floor(rnd() * 4) : r < 0.97 ? 6 + Math.floor(rnd() * 15) : 21 + Math.floor(rnd() * 20);
    const party = nextGroup++;                                      // friends who play together (only the online ones form a group)
    for (let i = 0; i < size && players.length < accounts; i++) players.push({ id: players.length, online: false, loc: expanse.id, group: -1, party, home: rnd() < P.homed ? pick(worlds).id : null, homeJumpAt: -1e9 });
  }
  if (P.blob) { const ms = []; for (let i = 0; i < P.blob; i++) { const p = { id: players.length, online: true, loc: expanse.id, group: -1, home: null, homeJumpAt: -1e9, blobber: true }; players.push(p); ms.push(p); } newGroup(ms).blob = true; expanse.pop += P.blob; }

  const stats = { samples: 0, tierPlayerMin: Object.fromEntries(TIERS.map((t) => [t, 0])), instPlayerMin: 0, nomadPlayerMin: 0, expansePlayerMin: 0, onlineMin: 0,
    sizeSpawn: [0, 0, 0, 0, 0], collapsedByUse: 0, overshoot: 0,
    stranded: 0, crushFrom: {}, strandCause: {}, crush: 0, crushNoLimit: 0, instSpawned: 0, instMax: 0, maxPop: 0, lonelyMin: 0, soloMin: 0, reconnects: 0, holesMade: 0, blobSplits: 0, expanseHolesCut: 0, homeJumps: 0, homeOver: 0 };

  const groupOf = (p) => groups.get(p.group);
  const holeOpen = (h, now) => h && (h.closeAt == null || now < h.closeAt) && h.cap > 0;
  const other = (h, sid) => (h.a === sid ? h.b : h.a);
  const closeHole = (h) => { holes.delete(h.id); systems.get(h.a)?.holes.delete(h.id); systems.get(h.b)?.holes.delete(h.id); };
  const mkHole = (a, b, now, creator, opts = {}) => {
    const h = { id: nextHole++, a: a.id, b: b.id, creator: creator.id, created: now, expires: now + between(...P.holeLife), closeAt: null, cap: opts.cap ?? Infinity, entry: !!opts.entry };
    if (P.sizes) {                                                 // sized hole: 5 crossings and 30 min per size, from the moment it spawns
      let r = rnd() * P.sizeW.reduce((x, y) => x + y, 0), size = 1; for (let i = 0; i < 5; i++) { r -= P.sizeW[i]; if (r <= 0) { size = i + 1; break; } }
      if (P.smallIntoLow && (a.tier === "low" || b.tier === "low") && a.pop > 0 && b.pop > 0) size = Math.min(size, 2);   // into a low system: XS or S only
      h.size = size; h.size0 = size; h.used = 0; h.expires = now + size * 30; h.cap = Infinity; stats.sizeSpawn[size - 1]++;
    }
    holes.set(h.id, h); a.holes.add(h.id); b.holes.add(h.id); stats.holesMade++;
    const key = a.id < b.id ? a.id + "|" + b.id : b.id + "|" + a.id, last = creator.lastPartners.get(key);
    if (last != null && now - last < 30) stats.reconnects++;
    creator.lastPartners.set(key, now); return h;
  };
  const spawnInstanced = (now) => { const s = mkSys("instanced"); stats.instSpawned++; s.born = now; return s; };
  const effTier = (s) => s.tier;

  // a system picks a partner by its preferences (fallbacks in order, then a new instanced empty)
  function partnerFor(s, now) {
    const t = s.kind === "expanse" ? "expanse" : effTier(s);
    const prefs = t === "expanse" ? [["low", "mid"], ["emptyWorld"]] : PREFS[t];
    const linked = new Set([...s.holes].map((id) => other(holes.get(id), s.id)));
    for (const tier of prefs) {
      if (tier.includes("instanced")) return { sys: spawnInstanced(now), entry: true };
      const c = [...systems.values()].filter((o) => o !== s && o.kind !== "expanse" && !linked.has(o.id) && o.holes.size < P.maxHoles &&
        ((o.kind === "world" && o.pop === 0 && tier.includes("emptyWorld")) || (o.pop > 0 && tier.includes(o.tier))));
      if (c.length) return { sys: pick(c) };
    }
    return t === "expanse" ? null : { sys: spawnInstanced(now), entry: true };   // last resort: nobody is ever stuck
  }
  const isValid = (h) => {
    const a = systems.get(h.a), b = systems.get(h.b); if (!a || !b) return false;
    const creator = h.creator === h.a ? a : b, partner = creator === a ? b : a;
    if (creator.kind === "expanse") return partner.pop === 0 || ["low", "mid", "high"].includes(partner.tier);   // high only because it was connected before
    if (partner.kind === "expanse") return true;
    if (h.entry) return true;                                     // holes into instanced empties close on the follow window instead
    return allowed(effTier(creator), partner);
  };
  // checked when someone arrives: holes that now break the rules close after the friend window
  function checkOnArrival(s, now) { for (const id of s.holes) { const h = holes.get(id); if (h.closeAt == null && !isValid(h)) { h.closeAt = now + P.follow; if (systems.get(h.creator)?.kind === "expanse") stats.expanseHolesCut++; } } }

  function move(g, to, via, now) {
    const from = systems.get([...g.members][0].loc), before = to.pop;
    let ms = [...g.members];
    if (via && via.cap !== Infinity) {                           // a jump-limited hole: only some of the group fits
      if (ms.length > via.cap) { const stay = ms.slice(via.cap); ms = ms.slice(0, via.cap); for (const p of stay) g.members.delete(p); newGroup(stay).blob = g.blob; if (g.blob) stats.blobSplits++; }
      via.cap -= ms.length;
    }
    for (const p of ms) { p.loc = to.id; } from.pop -= ms.length; to.pop += ms.length;
    if (ms.length >= 15 && before > 0 && before <= 5) { stats.crush++; const src = from.kind === "expanse" ? "Expanse" : from.kind === "instanced" ? "instanced " + tierOf(from.pop + ms.length) : tierOf(from.pop + ms.length); stats.crushFrom[src] = (stats.crushFrom[src] || 0) + 1; }
    if (via && via.entry && via.closeAt == null) via.closeAt = now + P.follow;   // into an instanced empty: closes behind them
    if (via && P.sizes) {                                          // every 5 crossings (either way) drop it a size; a group already going through all makes it
      via.used += ms.length; const left = via.size0 - Math.floor(via.used / 5);
      if (left < via.size) via.size = Math.max(0, left);           // crossings shrink the size only, never the time (owner: an XS can have 149 min left)
      if (via.size <= 0 && via.closeAt == null) { via.closeAt = now + P.follow; stats.collapsedByUse++; if (ms.length > via.size0 * 5) stats.overshoot++; }
    }
    if (P.settleUpOnly && TIERS.indexOf(tierOf(to.pop)) > TIERS.indexOf(to.tier)) { to.tier = tierOf(to.pop); to.pend = null; }
    checkOnArrival(to, now); checkOnArrival(from, now);
    const tier = tierOf(to.pop);
    g.dwellUntil = now + (g.blob ? 5 : to.kind === "expanse" ? 0 : to.kind === "instanced" ? between(3, 8) : tier === "low" && to.pop <= 2 ? between(5, 15) : { low: 20, mid: 60, high: 40, over: 20, past50: 10 }[tier] * between(0.6, 1.4));
  }

  const online = () => players.filter((p) => p.online).length;
  for (let now = 0; now < MIN; now++) {
    // logins and logouts follow a daily curve (30% at night, 100% at the evening peak)
    const hour = (now / 60) % 24, target = Math.round(P.peak * (0.65 + 0.35 * Math.cos((hour - 20) / 24 * 2 * Math.PI)) ) + (P.blob || 0);
    let on = online();
    while (on > target) {                                          // logging out: the player leaves their group and the world
      const p = pick(players.filter((q) => q.online && !q.blobber)); p.online = false; on--;
      const s = systems.get(p.loc); s.pop--; const g = groupOf(p); g.members.delete(p); if (!g.members.size) groups.delete(g.id); p.group = -1;
      checkOnArrival(s, now);
    }
    while (on < target) {
      const p = pick(players.filter((q) => !q.online)); p.online = true; on++;
      let s = systems.get(p.loc);
      if (!s || s.kind === "instanced") {                          // logged out in an empty instanced system: a fresh one, with a hole out to low or mid
        s = spawnInstanced(now); const out = [...systems.values()].filter((o) => o.kind === "world" && ["low", "mid"].includes(o.tier));
        mkHole(s, out.length ? pick(out) : expanse, now, s);
      }
      p.loc = s.id; s.pop++;
      const mates = [...groups.values()].find((g) => !g.blob && [...g.members].some((q) => q.party === p.party && q.loc === s.id));   // back with friends who are on, if they're here
      if (mates) { mates.members.add(p); p.group = mates.id; } else newGroup([p]);
      checkOnArrival(s, now);
    }
    // tiers settle
    for (const s of systems.values()) { if (s.kind === "expanse") continue; const t = tierOf(s.pop); if (t === s.tier) { s.pend = null; continue; } if (s.pend !== t) { s.pend = t; s.pendAt = now; } const up = TIERS.indexOf(t) > TIERS.indexOf(s.tier); if ((P.settleUpOnly && up) || now - s.pendAt >= P.settle) { s.tier = t; s.pend = null; checkOnArrival(s, now); } }
    // holes expire / finish closing; instanced empties nobody is in go away
    for (const h of [...holes.values()]) if (now >= h.expires || (h.closeAt != null && now >= h.closeAt) || h.cap <= 0) closeHole(h);
    for (const s of [...systems.values()]) if (s.kind === "instanced" && s.pop === 0 && now - s.born > 2) { for (const id of s.holes) closeHole(holes.get(id)); systems.delete(s.id); }
    // the Expanse keeps holes in proportion to who's online; occupied nomad systems keep a few
    const expTarget = P.expGates ? P.expGates * (P.gateLinks || 1) : Math.max(2, Math.ceil(on / P.expPer));   // expGates: the Expanse's fixed stargates (each re-points when its link closes)
    while ([...expanse.holes].filter((id) => holeOpen(holes.get(id), now)).length < expTarget) { const pt = partnerFor(expanse, now); if (!pt) break; mkHole(expanse, pt.sys, now, expanse, { cap: P.lowCapAll && pt.sys.tier === "low" ? P.jumpLimit : Infinity }); }
    for (const s of [...systems.values()]) {
      if (s.kind === "expanse" || s.pop === 0) continue;
      let guard = 0; while ([...s.holes].filter((id) => holeOpen(holes.get(id), now)).length < P.holesPerSystem && s.holes.size < P.maxHoles && guard++ < 4) {
        const pt = partnerFor(s, now); if (!pt) break;
        const cap = (P.lowCapAll || effTier(s) === "over" || effTier(s) === "past50") && pt.sys.tier === "low" && pt.sys.pop > 0 ? P.jumpLimit : Infinity;
        mkHole(s, pt.sys, now, s, { cap, entry: pt.entry });
      }
    }
    // lone players join a group where they are
    const bySys = new Map(); for (const g of groups.values()) { const p = [...g.members][0]; if (!p) continue; (bySys.get(p.loc) || bySys.set(p.loc, []).get(p.loc)).push(g); }
    for (const gs of bySys.values()) if (gs.length > 1) { const big = gs.reduce((a, b) => (b.members.size > a.members.size ? b : a)); for (const g of gs) if (g !== big && g.members.size === 1 && !g.blob && !big.blob && big.members.size < P.joinCap && rnd() < P.joinGroup) { const p = [...g.members][0]; groups.delete(g.id); big.members.add(p); p.group = big.id; } }
    // groups act
    for (const g of [...groups.values()]) {
      if (!g.members.size) { groups.delete(g.id); continue; }
      const p0 = [...g.members][0], s = systems.get(p0.loc);
      if (s.kind === "expanse") {
        if (rnd() < (g.blob ? 0.5 : P.goNomad)) { const hs = [...s.holes].map((id) => holes.get(id)).filter((h) => holeOpen(h, now)); if (hs.length) { const h = pick(hs); move(g, systems.get(other(h, s.id)), h, now); } }
        continue;
      }
      if (now < g.dwellUntil) continue;
      if (!g.blob && p0.home && now - p0.homeJumpAt > P.homeJumpCdMin && p0.loc !== p0.home && rnd() < P.homeJumpChance) { // home jump
        const home = systems.get(p0.home); for (const p of g.members) p.homeJumpAt = now; stats.homeJumps++; if (tierOf(home.pop) === "over" || tierOf(home.pop) === "past50") stats.homeOver++; move(g, home, null, now); continue;
      }
      const hs = [...s.holes].map((id) => holes.get(id)).filter((h) => holeOpen(h, now) && (!P.refuseOversize || !h.size0 || g.members.size <= h.size0 * 5 - h.used)); if (!hs.length) continue;   // refuseOversize: a group bigger than what's left can't start through
      const exp = hs.filter((h) => other(h, s.id) === expanse.id), away = hs.filter((h) => other(h, s.id) !== expanse.id);
      const h = !g.blob && exp.length && rnd() < P.goHome ? pick(exp) : pick(g.blob && away.length ? away : hs);   // the never-splitting group stays out in nomad space
      move(g, systems.get(other(h, s.id)), h, now);
    }
    // measurements
    if (now >= WARM) {
      stats.samples++;
      for (const s of systems.values()) {
        if (s.kind === "expanse") { stats.expansePlayerMin += s.pop; continue; }
        if (!s.pop) continue;
        stats.nomadPlayerMin += s.pop; stats.tierPlayerMin[tierOf(s.pop)] += s.pop; if (s.kind === "instanced") stats.instPlayerMin += s.pop;
        if (![...s.holes].some((id) => holeOpen(holes.get(id), now))) { stats.stranded++; const why = s.holes.size >= P.maxHoles ? "all its holes were closing" : "no hole yet"; stats.strandCause[why] = (stats.strandCause[why] || 0) + 1; }
        stats.maxPop = Math.max(stats.maxPop, s.pop);
      }
      stats.instMax = Math.max(stats.instMax, [...systems.values()].filter((s) => s.kind === "instanced").length);
      for (const g of groups.values()) if (g.members.size === 1) { const p = [...g.members][0], s = systems.get(p.loc); if (s.kind !== "expanse") { stats.soloMin++; if (s.pop === 1) stats.lonelyMin++; } }
      stats.onlineMin += on;
    }
  }
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "-"), hrs = (MIN - WARM) / 60;
  console.log(`\n== ${name}${P.note ? " (" + P.note + ")" : ""}: peak ${P.peak} online, ${P.worlds} world nomad systems, ${P.hours} h`);
  console.log(`  where players are: Expanse ${pct(stats.expansePlayerMin, stats.onlineMin)}, nomad ${pct(stats.nomadPlayerMin, stats.onlineMin)} (of those, ${pct(stats.instPlayerMin, stats.nomadPlayerMin)} in instanced empties)`);
  console.log(`  nomad players by their system's tier: ` + TIERS.slice(1).map((t) => `${t} ${pct(stats.tierPlayerMin[t], stats.nomadPlayerMin)}`).join(", "));
  console.log(`  solo nomad players alone in their system: ${pct(stats.lonelyMin, stats.soloMin)} of solo-time`);
  console.log(`  biggest system seen: ${stats.maxPop} players · instanced empties: ${(stats.instSpawned / (P.hours)).toFixed(1)} spawned/h, ${stats.instMax} alive at most`);
  console.log(`  stranded (occupied, no open exit): ${stats.stranded} system-minutes · big arrivals (15+) into a low system: ${stats.crush} · same-pair reconnects within 30 min: ${(stats.reconnects / hrs).toFixed(1)}/h`);
  console.log(`  big arrivals came from: ${JSON.stringify(stats.crushFrom)} · stranded because: ${JSON.stringify(stats.strandCause)}`);
  if (P.sizes) console.log(`  hole sizes spawned (XS–XL): ${stats.sizeSpawn.join(" / ")} · collapsed from use: ${(stats.collapsedByUse / P.hours).toFixed(1)}/h · a group went through bigger than the whole hole: ${stats.overshoot}`);
  console.log(`  holes made: ${(stats.holesMade / P.hours).toFixed(0)}/h · Expanse holes cut by the rules: ${(stats.expanseHolesCut / P.hours).toFixed(1)}/h · home jumps: ${(stats.homeJumps / P.hours).toFixed(1)}/h (${pct(stats.homeOver, stats.homeJumps)} into an overcrowded home)` + (P.blob ? ` · the 80-group was split by jump limits ${stats.blobSplits} times` : ""));
}

const want = process.argv.slice(2);
for (const [name, sc] of Object.entries(SC)) if (!want.length || want.includes(name)) run(name, sc);
