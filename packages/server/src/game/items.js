// (owner, 2026-10-14) Items: every account's hotbar and inventory, kept on the server (table world3d_inv), and the crates
// dropped items make in the world. Item keys: "test" (the placeholder), "it:<id>" (an Item Creator item). Every
// command is checked as hostile: known slots, items that exist, the crate within reach. Moving an item swaps two slots;
// staff copy an item in from the Item Creator; Drop takes an item out of a slot into a crate where the ship is
// (into a crate already within CRATE_MERGE m, if there is one); anyone within CRATE_REACH m takes items out of a crate.
// A crate goes CRATE_LIFE after it was made (or when it's emptied, or staff delete it). Crates aren't kept over a restart.
// (owner, 2026-10-15) Stacks: a slot (and a crate entry) holds { k: item key, n: how many }. An item made Stackable in the
// Item Editor stacks up to its Max Stack: moving a stack onto the same item tops that one up (the rest stays behind),
// a copy from the Item Creator adds one, a crate's stack taken into the same item merges. Anything else is one per slot.
import { pool } from "../db.js";

export const HOT = 3, INV = 10;
export const SLOT_KEYS = [...Array.from({ length: HOT }, (_, i) => "h" + i), ...Array.from({ length: INV }, (_, i) => "i" + i)];
export const CRATE_LIFE = 5 * 60_000, CRATE_MERGE = 75, CRATE_REACH = 250, CRATE_ITEMS = 50, CRATE_CAP = 500;
const isSlot = (k) => typeof k === "string" && SLOT_KEYS.includes(k);

export class Items {
  constructor(world) {
    this.world = world; this.invs = new Map(); this.crates = new Map(); this.seq = 1; this.dirty = new Set();
    this.ready = pool.query(`CREATE TABLE IF NOT EXISTS world3d_inv (user_id TEXT PRIMARY KEY, slots JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`).catch((e) => console.error("world3d_inv", e));
    setInterval(() => this.flush(), 2000).unref?.();
  }
  valid(key) {
    if (key === "test") return true;
    if (typeof key !== "string") return false;
    const m = /^it:([0-9]{1,9})$/.exec(key); return !!m && this.world.catalog.has(m[1]);
  }
  max(key) { const m = /^it:([0-9]{1,9})$/.exec(key || ""), o = m && this.world.catalog.get(m[1]); return o && o.stack ? o.max : 1; }   // how many fit in one slot
  // a stored slot: { k, n } (older saves: a bare key = one of it)
  stack(v) {
    if (typeof v === "string") v = { k: v, n: 1 };
    if (!v || !this.valid(v.k)) return null;
    const n = Math.floor(Number(v.n)); return { k: v.k, n: Number.isFinite(n) && n >= 1 ? Math.min(n, 99999) : 1 };
  }
  fresh() { const s = {}; for (const k of SLOT_KEYS) s[k] = null; s.i0 = { k: "test", n: 1 }; return s; }
  clean(v) { const s = {}; for (const k of SLOT_KEYS) s[k] = v ? this.stack(v[k]) : null; return s; }
  async load(uid) {
    uid = String(uid); if (this.invs.has(uid)) return this.get(uid);
    await this.ready;
    const { rows } = await pool.query(`SELECT slots FROM world3d_inv WHERE user_id = $1`, [uid]);
    if (!this.invs.has(uid)) { this.invs.set(uid, rows[0] ? this.clean(rows[0].slots) : this.fresh()); if (!rows[0]) this.dirty.add(uid); }
    return this.get(uid);
  }
  get(uid) {                                   // the slots (anything deleted from the catalog meanwhile drops out)
    const s = this.invs.get(String(uid)); if (!s) return null;
    for (const k of SLOT_KEYS) if (s[k] && !this.valid(s[k].k)) { s[k] = null; this.dirty.add(String(uid)); }
    return s;
  }
  async flush() {
    const ids = [...this.dirty]; this.dirty.clear();
    for (const uid of ids) { const s = this.invs.get(uid); if (!s) continue;
      await pool.query(`INSERT INTO world3d_inv (user_id, slots, updated_at) VALUES ($1, $2, now()) ON CONFLICT (user_id) DO UPDATE SET slots = $2, updated_at = now()`, [uid, JSON.stringify(s)]).catch((e) => console.error("inv save", e)); }
  }
  // pour stack a into b (the same stackable item): b fills up to the max, a keeps the rest (or is used up: null)
  pour(a, b) { const room = Math.max(0, this.max(b.k) - b.n), m = Math.min(room, a.n); b.n += m; a.n -= m; return a.n > 0 ? a : null; }
  move(uid, from, to) {
    const s = this.get(uid); if (!s || !isSlot(from) || !isSlot(to) || from === to || !s[from]) return false;
    if (s[to] && s[to].k === s[from].k && this.max(s[to].k) > 1) s[from] = this.pour(s[from], s[to]);   // onto the same item: topped up
    else [s[from], s[to]] = [s[to], s[from]];
    this.dirty.add(String(uid)); return true;
  }
  // (staff) n (1 to its Max Stack; owner, 2026-10-15: picked as it's dropped) of an Item Creator item: onto the same
  // stackable item it tops that one up, else it replaces what's there
  give(uid, item, to, n) {
    const s = this.get(uid); if (!s || !isSlot(to) || item === "test" || !this.valid(item)) return false;
    n = this.count(item, n);
    if (s[to] && s[to].k === item && this.max(item) > 1) s[to].n = Math.min(this.max(item), s[to].n + n); else s[to] = { k: item, n };
    this.dirty.add(String(uid)); return true;
  }
  count(item, n) { n = Math.floor(Number(n)); return Number.isFinite(n) ? Math.max(1, Math.min(this.max(item), n)) : 1; }
  // (staff, owner 2026-10-15) delete a slot's stack
  remove(uid, from) { const s = this.get(uid); if (!s || !isSlot(from) || !s[from]) return false; s[from] = null; this.dirty.add(String(uid)); return true; }
  // Drop: the slot's stack leaves for a crate at (x, y); returns the crate (new or grown) or null
  drop(uid, from, x, y) {
    const s = this.get(uid); if (!s || !isSlot(from) || !s[from]) return null;
    const c = this.toCrate({ ...s[from] }, x, y); if (!c) return null;
    s[from] = null; this.dirty.add(String(uid)); return c;
  }
  // (staff, owner 2026-10-15) an Item Creator item dragged onto the world: n of it into a crate at (x, y)
  spawn(item, n, x, y) { if (item === "test" || !this.valid(item)) return null; return this.toCrate({ k: item, n: this.count(item, n) }, x, y); }
  // a stack into the crate within CRATE_MERGE m of (x, y) (onto its stacks of the item first), or a new crate there
  toCrate(st, x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    let c = null, best = CRATE_MERGE;
    for (const o of this.crates.values()) { const d = Math.hypot(o.x - x, o.y - y); if (d <= best && o.items.length < CRATE_ITEMS) { best = d; c = o; } }
    if (!c) { if (this.crates.size >= CRATE_CAP) return null; c = { id: String(this.seq++), x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, items: [], until: Date.now() + CRATE_LIFE }; this.crates.set(c.id, c); }
    if (this.max(st.k) > 1) for (const e of c.items) { if (!st) break; if (e.k === st.k && e.n < this.max(e.k)) st = this.pour(st, e); }   // onto the crate's stacks of it first
    if (st) c.items.push(st);
    return c;
  }
  // (staff, owner 2026-10-15) delete stack i of a crate; returns { crate, gone } or null
  unstock(cid, i) {
    const c = this.crates.get(String(cid)); if (!c) return null; c.items = c.items.filter((e) => this.valid(e.k));
    if (!Number.isInteger(i) || i < 0 || i >= c.items.length) return null;
    c.items.splice(i, 1); const gone = !c.items.length; if (gone) this.crates.delete(c.id); return { crate: c, gone };
  }
  // Take: stack i of crate cid into slot `to` (empty, or the same stackable item: merged) or else the first free slot; the
  // ship at (x, y) must be within reach. Returns { crate, gone } or null.
  take(uid, cid, i, to, x, y) {
    const s = this.get(uid), c = this.crates.get(String(cid)); if (c) c.items = c.items.filter((e) => this.valid(e.k));
    if (!s || !c || !Number.isInteger(i) || i < 0 || i >= c.items.length) return null;
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(c.x - x, c.y - y) > CRATE_REACH) return null;
    const e = c.items[i];
    if (isSlot(to) && s[to] && s[to].k === e.k && this.max(e.k) > 1 && s[to].n < this.max(e.k)) { const left = this.pour(e, s[to]); if (left) c.items[i] = left; else c.items.splice(i, 1); }
    else {
      const slot = isSlot(to) && !s[to] ? to : SLOT_KEYS.find((k) => k[0] === "i" && !s[k]) || SLOT_KEYS.find((k) => !s[k]); if (!slot) return null;
      c.items.splice(i, 1); s[slot] = e;
    }
    this.dirty.add(String(uid));
    const gone = !c.items.length; if (gone) this.crates.delete(c.id);
    return { crate: c, gone };
  }
  del(cid) { return this.crates.delete(String(cid)); }
  expire(now = Date.now()) { const out = []; for (const c of this.crates.values()) if (now >= c.until) { this.crates.delete(c.id); out.push(c.id); } return out; }
  crateMsg(c) { c.items = c.items.filter((e) => this.valid(e.k)); return { id: c.id, x: c.x, y: c.y, items: c.items, left: Math.max(0, c.until - Date.now()) }; }   // (deleted items pruned first, so indices match)
  crateList() { return [...this.crates.values()].map((c) => this.crateMsg(c)); }
}
