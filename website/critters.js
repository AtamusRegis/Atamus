// (owner, 2026-11-17) the critters: chunky block mounts and town chasers made in Blender (website/critters/*.glb, one
// skinned mesh under 1,300 triangles each, its colors from a small atlas; a second "_shiny" atlas on the same UVs). They
// were made in studs: STUD meters a stud. They face +Z, as the game does. Mounts have the
// RiderSeat and ParcelStack bones; clips: idle, run, jump, ability (mounts), attack (chasers).
import * as THREE from "./vendor/three.module.min.js";
import { GLTFLoader } from "./vendor/addons/GLTFLoader.js";
import * as SkeletonUtils from "./vendor/addons/SkeletonUtils.js";

export const STUD = 0.36;
// each mount kind's model (the kinds kept their names in saves), and the town's chasers
export const MODEL = { dog: "corgi_pup", cat: "kitten", gator: "axolotl", bear: "cheetah_cub", wolf: "griffin_chick", fox: "bunny", raptor: "baby_raptor", trike: "mini_trike", trex: "frog", unicorn: "cloud_pony", towndog: "town_dog", goose: "town_goose", goat: "town_goat" };
const V = "1";
const SRC = {}, SHINY = {};

export async function loadCritters() {
  const L = new GLTFLoader(), T = new THREE.TextureLoader();
  L.register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: "img_textures" }; });   // the embedded atlases as images (the page's policy lets blob: images in, not blob: fetches)
  await Promise.all(Object.values(MODEL).map(async (n) => {
    try {
      const g = await L.loadAsync(`critters/${n}.glb?v=${V}`); SRC[n] = g;
      g.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; const m = o.material; if (m.map) { m.map.magFilter = THREE.NearestFilter; m.map.colorSpace = THREE.SRGBColorSpace; } m.roughness = 1; m.metalness = 0; } });
      const t = await T.loadAsync(`critters/${n}_shiny.png?v=${V}`); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; SHINY[n] = t;
    } catch (e) { console.warn("critter", n, e && e.message); }
  }));
}
export const hasCritter = (key) => !!SRC[MODEL[key]];

// (owner, 2026-11-17) the rarity coats: each kind's five coats (pets-world MOUNTS[..].coats), Common the model as made;
// Uncommon to Legendary recolor its atlas. The atlas is 8-px gradient strips; each strip's two ends are recolored: its
// body colors (the first strip's, and anything of their hue) to the coat's body color, its pale cream parts to the
// coat's trim, keeping each one's lightness; eyes, blush and the saddle, straps, bag and rack keep theirs
const GEAR = new Set(["1d1b2e", "3b3566", "ffffff", "ff8fb0", "ff4f5e", "ff7a85", "c9304a", "8a5a3c", "a8754f", "ffbe2e", "ffd966", "ff7f2a", "ffd23a"]);
const COATS = {};
const hex = (r, g, b) => ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
function hsv(c) { const mx = Math.max(...c), mn = Math.min(...c), d = mx - mn; let h = 0; if (d) h = mx === c[0] ? ((c[1] - c[2]) / d) % 6 : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4; return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx / 255]; }
function hsl(c) { const [r, g, b] = c.map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn; if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1)), h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return [h / 6, s, l]; }
function rgb(h, s, l) { const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); }; return [f(0), f(8), f(4)]; }
function coatTex(n, body, trim) {
  const key = n + body + trim; if (COATS[key]) return COATS[key];
  const img = SRC[n].scene.getObjectByProperty("isMesh", true).material.map.image, cv = document.createElement("canvas"), W = (cv.width = img.width), H = (cv.height = img.height), x = cv.getContext("2d"); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, W, H), px = (X, Y) => { const i = (Y * W + X) * 4; return [d.data[i], d.data[i + 1], d.data[i + 2]]; };
  const B = [1, 3, 5].map((k) => parseInt(body.slice(k, k + 2), 16)), T = [1, 3, 5].map((k) => parseInt(trim.slice(k, k + 2), 16));
  // the coat's hue and saturation; its lightness halfway to the model's own (so a dark coat stays a bright toy), shaded as the strip was
  const tone = (C, e, k) => { const ho = hsl(e), hc = hsl(C), L0 = hc[2] * 0.55 + Math.min(0.85, ho[2] / Math.max(0.2, k)) * 0.45; return rgb(hc[0], hc[1], Math.min(0.95, L0 * Math.min(1.3, k))); };
  const m0 = px(0, 4), m1 = px(W - 1, 4), mh = [hsv(m0), hsv(m1)], ref = Math.max(lum(m0), 1), near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 30;
  const map = (e) => { if (GEAR.has(hex(...e))) return null; const h = hsv(e);
    const main = near(e, m0) || near(e, m1) || mh.some((q) => q[1] > 0.3 && h[1] > 0.3 && Math.min(Math.abs(h[0] - q[0]), 360 - Math.abs(h[0] - q[0])) < 22);
    if (main) return tone(B, e, lum(e) / ref);
    if (h[1] < 0.2 && h[2] > 0.9) return tone(T, e, lum(e) / 245);
    return null; };
  for (let y0 = 0; y0 + 8 <= H; y0 += 8) {
    const a = px(0, y0 + 4), b = px(W - 1, y0 + 4), na = map(a), nb = map(b); if (!na && !nb) continue;
    const A2 = na || a, B2 = nb || b, D = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], dd = D[0] * D[0] + D[1] * D[1] + D[2] * D[2];
    for (let X = 0; X < W; X++) { const p = px(X, y0 + 4), t = dd ? Math.max(0, Math.min(1, ((p[0] - a[0]) * D[0] + (p[1] - a[1]) * D[1] + (p[2] - a[2]) * D[2]) / dd)) : 0;
      for (let Y = y0; Y < y0 + 8; Y++) { const i = (Y * W + X) * 4; for (let k = 0; k < 3; k++) d.data[i + k] = A2[k] * (1 - t) + B2[k] * t; } }
  }
  x.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(cv); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return (COATS[key] = t);
}

// a copy of one: { g (meters, facing +Z, feet at 0), mixer, play(name, once), update(dt), seat, parcel, bone(name) }
export function makeCritter(key, shiny, coat) {   // coat: [body, trim] for Uncommon to Legendary (none: as made)
  const n = MODEL[key], src = SRC[n]; if (!src) return null;
  const inner = SkeletonUtils.clone(src.scene), g = new THREE.Group(); inner.scale.setScalar(STUD); g.add(inner);
  inner.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); if (shiny && SHINY[n]) o.material.map = SHINY[n]; else if (coat) o.material.map = coatTex(n, coat[0], coat[1]); } });
  const mixer = new THREE.AnimationMixer(inner), acts = {};
  for (const c of src.animations) { const k = c.name.slice(n.length + 1); acts[k] = mixer.clipAction(c); }
  const bones = {}; inner.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  g.updateMatrixWorld(true); const at = (b) => { if (!bones[b]) return null; const v = new THREE.Vector3(); bones[b].getWorldPosition(v); return g.worldToLocal(v); };
  let cur = null;
  const C = { g, mixer, acts, bones, seat: at("RiderSeat") || new THREE.Vector3(0, 1, 0), parcel: at("ParcelStack") || new THREE.Vector3(0, 1, -0.6), onceT: 0, hide: false, flip: false,
    // a looping clip (fading over), or a one-off that plays through before the loops come back
    play(name, opt = {}) {
      const a = acts[name]; if (!a) return;
      if (opt.once) { if (cur) cur.fadeOut(0.08); a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = 1; a.time = opt.from || 0; a.fadeIn(0.06).play(); cur = a; C.onceT = a.getClip().duration - a.time; return; }
      if (C.onceT > 0) return;
      if (opt.speed !== undefined) a.timeScale = opt.speed;
      if (cur === a) return; if (opt.hold) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } else a.setLoop(THREE.LoopRepeat, Infinity);
      a.reset().fadeIn(0.12).play(); if (cur) cur.fadeOut(0.12); cur = a;
    },
    update(dt) { if (C.onceT > 0) { C.onceT -= dt; if (C.onceT <= 0) { const a = cur; cur = null; if (a) a.fadeOut(0.1); C.hide = C.flip = false; } } mixer.update(dt); },
    bone: (b) => bones[b] || null,
  };
  C.play("idle"); return C;
}
