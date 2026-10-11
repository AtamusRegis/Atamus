// (owner, 2026-10-11) Where a login comes from, for the account-sharing / compromise checks (security.js):
//   - IP geolocation: DB-IP's free "IP to City Lite" database (CC BY 4.0; credited on the website), downloaded by the
//     server itself into packages/server/data/ and refreshed monthly;
//   - known VPN and datacenter address ranges (the X4BNet lists_vpn project), refreshed daily, so a VPN user's jumps
//     aren't mistaken for impossible travel.
// Without the files (the PTR can't reach DB-IP) lookups return null and the travel checks simply don't run.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import os from "node:os";
import { createRequire } from "node:module";
import { PTR } from "./ptr.js";

const require = createRequire(import.meta.url);
const { Reader } = require("mmdb-lib");
const DIR = new URL("../data/", import.meta.url).pathname;
// city level when the server has the memory for it (the file is ~125 MB in memory), else country level
const MODE = os.totalmem() >= 3e9 ? "city" : "country";
const CITY = path.join(DIR, "dbip-" + MODE + "-lite.mmdb"), VPN = path.join(DIR, "vpn-ipv4.txt"), DC = path.join(DIR, "datacenter-ipv4.txt");
const VPN_URLS = [["https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt", VPN], ["https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/datacenter/ipv4.txt", DC]];
let reader = null, ranges = [];                              // ranges: sorted [start, end] (IPv4 as numbers)

const ip4 = (ip) => { const m = /^(?:::ffff:)?(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(String(ip || "")); return m ? ((+m[1] << 24) >>> 0) + (+m[2] << 16) + (+m[3] << 8) + +m[4] : null; };
const age = (f) => { try { return Date.now() - fs.statSync(f).mtimeMs; } catch { return Infinity; } };

function loadCity() { try { reader = new Reader(fs.readFileSync(CITY)); } catch { reader = null; } }
function loadRanges() {
  const out = [];
  for (const f of [VPN, DC]) {
    let text = ""; try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
    for (const line of text.split("\n")) {
      const m = /^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/.exec(line.trim()); if (!m) continue;
      const base = ip4(m[1]), bits = +m[2], size = 2 ** (32 - bits); out.push([base, base + size - 1]);
    }
  }
  out.sort((a, b) => a[0] - b[0]); ranges = out;
}
async function download(url, file, gunzip = false) {
  const r = await fetch(url); if (!r.ok) throw new Error(url + " " + r.status);
  let buf = Buffer.from(await r.arrayBuffer()); if (gunzip) buf = zlib.gunzipSync(buf);
  fs.mkdirSync(DIR, { recursive: true }); fs.writeFileSync(file + ".tmp", buf); fs.renameSync(file + ".tmp", file);
}
async function refresh() {
  if (age(CITY) > 32 * 86400_000) {                         // DB-IP publishes monthly: this month's file, else last month's
    for (const back of [0, 1]) {
      const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - back);
      const tag = d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0");
      try { await download("https://download.db-ip.com/free/dbip-" + MODE + "-lite-" + tag + ".mmdb.gz", CITY, true); break; } catch (e) { if (back) console.error("[geo] city db", e.message); }
    }
    loadCity();
  }
  if (VPN_URLS.some(([, f]) => age(f) > 86400_000)) {
    for (const [url, f] of VPN_URLS) { try { await download(url, f); } catch (e) { console.error("[geo] vpn list", e.message); } }
    loadRanges();
  }
}
export function startGeo() {
  loadCity(); loadRanges();
  refresh().catch((e) => console.error("[geo]", e));
  setInterval(() => refresh().catch((e) => console.error("[geo]", e)), 12 * 3600_000).unref();
}

/** An address's place: { lat, lon, city, country } or null. In the PTR a test may say where it is ("x-ptr-geo: lat,lon,city"). */
export function locate(ip, req = null) {
  if (PTR && req && req.headers && req.headers["x-ptr-geo"]) { const [lat, lon, city] = String(req.headers["x-ptr-geo"]).split(","); return { lat: +lat, lon: +lon, city: city || "", country: "" }; }
  if (!reader) return null;
  try {
    const r = reader.get(String(ip).replace(/^::ffff:/, "")); if (!r) return null;
    const country = (r.country && r.country.iso_code) || ""; if (!r.location && !country) return null;
    return { lat: r.location ? r.location.latitude : null, lon: r.location ? r.location.longitude : null, city: (r.city && r.city.names && r.city.names.en) || "", country };
  } catch { return null; }
}
/** Is the address in a known VPN or datacenter range? (In the PTR a test may say so: "x-ptr-vpn: 1".) */
export function isVpn(ip, req = null) {
  if (PTR && req && req.headers && req.headers["x-ptr-vpn"]) return true;
  const n = ip4(ip); if (n == null || !ranges.length) return false;
  let lo = 0, hi = ranges.length - 1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (ranges[mid][0] > n) hi = mid - 1; else if (ranges[mid][1] < n) lo = mid + 1; else return true; }
  return false;
}
/** Great-circle distance in km (null when either place has no coordinates: the country-level database). */
export function km(a, b) {
  if (a.lat == null || b.lat == null || a.lon == null || b.lon == null) return null;
  const R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
