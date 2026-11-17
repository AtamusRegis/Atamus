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

// a copy of one: { g (meters, facing +Z, feet at 0), mixer, play(name, once), update(dt), seat, parcel, bone(name) }
export function makeCritter(key, shiny) {
  const n = MODEL[key], src = SRC[n]; if (!src) return null;
  const inner = SkeletonUtils.clone(src.scene), g = new THREE.Group(); inner.scale.setScalar(STUD); g.add(inner);
  inner.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); if (shiny && SHINY[n]) o.material.map = SHINY[n]; } });
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
