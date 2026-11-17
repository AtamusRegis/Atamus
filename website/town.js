// (owner, 2026-11-17) the town kit: pines, houses, the cannon, the post office and the parcel, chunky toy pieces made in
// Blender (website/town/*.glb), made in studs (STUD meters each) and facing +Z, all coloured from one shared atlas. A
// variant atlas (same UVs) recolours a house's roof (roof_<c>.png) or a cannon's metal (cannon_<tier>.png).
import * as THREE from "./vendor/three.module.min.js";
import { GLTFLoader } from "./vendor/addons/GLTFLoader.js";
import * as SkeletonUtils from "./vendor/addons/SkeletonUtils.js";

export const STUD = 0.36;
const V = "1";
export const PINES = ["pine_cone", "pine_duo", "pine_trio", "pine_stubby", "pine_lean"];
export const HOUSES = ["house_cottage", "house_gable", "house_twostory", "house_porch", "house_cabin"];
export const ROOFS = ["red", "blue", "teal", "purple", "orange"];
export const METALS = ["bronze", "silver", "gold", "diamond", "rainbow"];
const SRC = {}, GEO = {}, MAT = {}, HOUSE = {};
let atlas = null, parcelImg = null, parcelGeo = null, beltMap = null;
const tex = (t) => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const lam = (map) => new THREE.MeshLambertMaterial({ map });
const isAtt = (o) => /_Att$/.test(o.name);

export async function loadTown() {
  const L = new GLTFLoader(), T = new THREE.TextureLoader();
  L.register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: "img_textures" }; });   // the embedded atlases as images (the page's policy lets blob: images in, not blob: fetches)
  const names = [...PINES, ...HOUSES, "cannon", "post_office", "parcel"];
  await Promise.all([
    ...names.map(async (n) => { try { SRC[n] = await L.loadAsync(`town/${n}.glb?v=${V}`); } catch (e) { console.warn("town", n, e && e.message); } }),
    ...ROOFS.slice(1).map(async (c) => { try { MAT["roof_" + c] = lam(tex(await T.loadAsync(`town/roof_${c}.png?v=${V}`))); } catch (e) { console.warn("town", c, e && e.message); } }),
    ...METALS.slice(1).map(async (c) => { try { MAT["metal_" + c] = lam(tex(await T.loadAsync(`town/cannon_${c}.png?v=${V}`))); } catch (e) { console.warn("town", c, e && e.message); } }),
  ]);
  for (const n of Object.keys(SRC)) SRC[n].scene.traverse((o) => { if (o.isMesh && !atlas && o.material.name === "TownAtlas") atlas = o.material.map; });
  if (atlas) { MAT.roof_red = MAT.metal_bronze = MAT.town = lam(atlas); }
  for (const n of PINES) if (SRC[n]) SRC[n].scene.traverse((o) => { if (o.isMesh && !isAtt(o)) GEO[n] = o.geometry; });
  for (const n of HOUSES) if (SRC[n]) cutHouse(n);
  if (SRC.parcel) SRC.parcel.scene.traverse((o) => { if (o.isMesh) { parcelGeo = o.geometry; parcelImg = o.material.map && o.material.map.image; } });
  if (SRC.post_office) SRC.post_office.scene.traverse((o) => { if (o.isMesh && o.name === "ConveyorBelt") { beltMap = o.material.map; beltMap.wrapS = beltMap.wrapT = THREE.RepeatWrapping; } });
}
export const hasTown = (n) => !!SRC[n] && !!atlas;

// (owner, 2026-11-17) a house without its own mailbox, path and delivery pad (the placed Mailbox pieces are the
// addresses), shrunk where needed to fit the game's 8 m house, its body centred on the spot
function cutHouse(n) {
  let mesh = null, ring = null; SRC[n].scene.traverse((o) => { if (o.isMesh && !isAtt(o)) mesh = o; if (/^DeliveryRing/.test(o.name)) ring = o.position; });
  const g = mesh.geometry, P = g.attributes.position, I = g.index.array; let front = -Infinity;
  for (let i = 0; i < P.count; i++) if (P.getY(i) > 7.5) front = Math.max(front, P.getZ(i));
  const keep = [], inBox = (i) => ring && Math.abs(P.getX(i) - ring.x) < 3.2 && P.getZ(i) > ring.z - 6.5;
  for (let t = 0; t < I.length; t += 3) { const a = I[t], b = I[t + 1], c = I[t + 2];
    if (P.getZ(a) > front + 1 && P.getZ(b) > front + 1 && P.getZ(c) > front + 1) continue; if (inBox(a) && inBox(b) && inBox(c)) continue; keep.push(a, b, c); }
  const geo = g.clone(); geo.setIndex(keep); const lo = new THREE.Vector3(Infinity, Infinity, Infinity), hi = lo.clone().negate();
  for (const i of keep) { lo.min(new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i))); hi.max(new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i))); }
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  const k = STUD * Math.min(1, 8.6 / (Math.max(hi.x - lo.x, hi.z - lo.z) * STUD));
  HOUSE[n] = { geo, k, cx: (lo.x + hi.x) / 2, cz: (lo.z + hi.z) / 2, h: hi.y * k };
}
const mesh = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; return o; };

export function pine(i) {   // one of the five pines, its base at the spot
  const n = PINES[((i % 5) + 5) % 5], g = new THREE.Group(), m = mesh(GEO[n], MAT.town); m.scale.setScalar(STUD); g.add(m); return g;
}
export function house(i, roof) {   // { g, h: its height }
  const H = HOUSE[HOUSES[((i % 5) + 5) % 5]], g = new THREE.Group(), m = mesh(H.geo, MAT["roof_" + ROOFS[((roof % 5) + 5) % 5]] || MAT.town);
  m.scale.setScalar(H.k); m.position.set(-H.cx * H.k, 0, -H.cz * H.k); g.add(m); return { g, h: H.h };
}

// (owner, 2026-11-17) the cannon: its turntable turret and barrel (up 45 degrees), its launch pad behind; the whole thing
// centred on the spot (shrunk a little to fit a house's lot). fire() plays its clip: the BOOM is 0.33 s in
export const CANNON_BOOM = 9 / 24;
export function cannon(metal, k = 0.9) {
  const src = SRC.cannon, inner = SkeletonUtils.clone(src.scene), g = new THREE.Group(), m = MAT["metal_" + METALS[Math.max(0, Math.min(4, metal | 0))]] || MAT.town;
  inner.traverse((o) => { if (o.isMesh) { o.material = m; o.castShadow = true; o.frustumCulled = false; } if (isAtt(o)) o.visible = false; });
  inner.scale.setScalar(STUD * k); inner.position.z = 4.25 * STUD * k; g.add(inner);
  const bones = {}; inner.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const mixer = new THREE.AnimationMixer(inner), act = src.animations[0] ? mixer.clipAction(src.animations[0]) : null; if (act) { act.setLoop(THREE.LoopOnce, 1); act.clampWhenFinished = false; }
  return { g, mixer, barrel: bones.Barrel, muzzle: bones.LaunchPoint || bones.Barrel, tip: bones.Barrel, fire() { if (act) { act.stop(); act.reset().play(); } }, len: act ? act.getClip().duration : 1.25 };
}

// (owner, 2026-11-17) the post office: the building, the conveyor frame and its belt (the belt's stripes scroll)
export function office() {
  const inner = SRC.post_office.scene.clone(true), belts = [];
  inner.traverse((o) => { if (isAtt(o)) o.visible = false; else if (o.isMesh) { o.castShadow = o.receiveShadow = true; if (o.name === "ConveyorBelt") { o.material = lam(beltMap); belts.push(o); } else o.material = MAT.town; } });
  inner.scale.setScalar(STUD); return { g: inner, belt: beltMap };
}

// (owner, 2026-11-17) the parcel: the kit's taped box, its cardboard in its tier's colour (one recoloured atlas per colour)
const PARCEL_M = {};
export function parcel(color) {
  if (!parcelGeo) return null;
  let m = PARCEL_M[color];
  if (!m) {
    const cv = document.createElement("canvas"), W = (cv.width = parcelImg.width), H = (cv.height = parcelImg.height), x = cv.getContext("2d"); x.drawImage(parcelImg, 0, 0);
    const d = x.getImageData(0, 0, W, H), c = new THREE.Color(color), tr = Math.round(c.r * 255), tg = Math.round(c.g * 255), tb = Math.round(c.b * 255);
    for (let p = 0; p < d.data.length; p += 4) { const r = d.data[p], gg = d.data[p + 1], b = d.data[p + 2]; if (r - b > 60 && gg > 130 && r < 252) { const l = (r + gg + b) / 3 / 165; d.data[p] = Math.min(255, tr * l); d.data[p + 1] = Math.min(255, tg * l); d.data[p + 2] = Math.min(255, tb * l); } }   // the cardboard, its shading kept
    x.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(cv); tex(t); t.magFilter = THREE.NearestFilter; m = PARCEL_M[color] = lam(t);
  }
  return mesh(parcelGeo, m);
}
export const PARCEL = { w: 1.22, h: 0.91 };   // in studs: its width, and how far up the next one stacks (0.91; the kit says 0.92)
export { atlas };
