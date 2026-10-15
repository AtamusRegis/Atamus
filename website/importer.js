// (owner, 2026-10-15) The Importer (head admin): I (or the [I] button in the staff column) opens it. It holds the game's
// imported assets (models, images and sounds), kept on the server, which the Object Creator uses (its models). Three
// tabs: Models, Images, Audio; each asset a slot showing its icon (hover: its name). A model's icon is a picture rendered
// from the model itself (made when it's imported; older models get theirs the first time the Importer sees them); an
// image's is the image. IMPORT (or a file dropped on the panel) picks a file: a pop-up shows its icon and a Name (the file's
// name to start), CANCEL / IMPORT. Right-click an asset: Rename / Delete (a model can't go while an object uses it).
// The server checks what each file really is.
import * as THREE from "./vendor/three.module.js";
import { GLTFLoader } from "./vendor/GLTFLoader.js";

const BASE = () => (typeof API_BASE !== "undefined" ? API_BASE : location.origin);
const KINDS = [["model", "Models"], ["image", "Images"], ["audio", "Audio"]];
const $ = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const btn = (text, cls, fn) => { const b = $("button", cls, text); b.type = "button"; if (fn) b.addEventListener("click", fn); return b; };

// ---- the assets, and their pictures (fetched once each, shown from blob: URLs) ----
let assets = [];
const subs = new Set(), pics = new Map();       // file -> blob: URL (or a Promise while it loads)
function picUrl(file) {
  const v = pics.get(file); if (typeof v === "string") return Promise.resolve(v); if (v) return v;
  const p = fetch(BASE() + "/game/assets/" + file).then((r) => (r.ok ? r.blob() : Promise.reject(new Error(r.status)))).then((b) => { const u = URL.createObjectURL(b); pics.set(file, u); return u; }).catch((e) => { pics.delete(file); throw e; });
  pics.set(file, p); return p;
}
function picture(file, px) {                     // an <img> of an image file, filled in once it's here
  const im = $("img", "imp-pic"); im.width = im.height = px; im.alt = ""; im.draggable = false;
  const v = pics.get(file); if (typeof v === "string") im.src = v; else picUrl(file).then((u) => { im.src = u; }).catch(() => {});
  return im;
}
window.Assets = {
  get list() { return assets; },
  models() { return assets.filter((a) => a.kind === "model"); },
  picture,
  on(f) { subs.add(f); },
};

// ---- a model's icon: rendered once, three-quarters from above, on a clear background ----
const gltf = new GLTFLoader();
let ren = null;
function renderIcon(obj) {
  if (!ren) { ren = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); ren.setSize(256, 256, false); ren.setClearColor(0x000000, 0); }
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4658, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.6); sun.position.set(2, 3, 2.5); scene.add(sun);
  const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), r = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 1e-6);
  const holder = new THREE.Group(); obj.position.sub(c); holder.add(obj); scene.add(holder);
  const cam = new THREE.PerspectiveCamera(30, 1, r / 100, r * 100), dir = new THREE.Vector3(1, 0.75, 1).normalize();
  let dist = r / Math.sin(THREE.MathUtils.degToRad(15));
  const corners = []; for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c));
  for (let k = 0; k < 4; k++) {                  // pulled in until it fills the picture (a little margin)
    cam.position.copy(dir).multiplyScalar(dist); cam.lookAt(0, 0, 0); cam.near = dist / 100; cam.far = dist * 10; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    let m = 0; for (const p of corners) { const q = p.clone().project(cam); m = Math.max(m, Math.abs(q.x), Math.abs(q.y)); }
    dist *= Math.max(0.3, m / 0.9);
  }
  ren.render(scene, cam);
  return new Promise((ok, no) => ren.domElement.toBlob((b) => (b ? ok(b) : no(new Error("render"))), "image/png"));
}
const parseGlb = (buf) => new Promise((ok, no) => gltf.parse(buf, "", (g) => ok(g.scene), no));
const loadGlb = (file) => new Promise((ok, no) => gltf.load(BASE() + "/game/models/" + file, (g) => ok(g.scene), undefined, no));
async function upload(body) {
  const r = await fetch(BASE() + "/game/assets", { method: "POST", credentials: "include", headers: { "Content-Type": "application/octet-stream" }, body });
  const j = await r.json().catch(() => ({})); if (!r.ok || !j.file) throw new Error(j.error || "The upload failed."); return j;
}

// ---- the panel ----
let api = null, perr = null, win = null, ibtn = null, grid = null, tabs = null, search = null, fileIn = null, tab = "model", menu = null, pop = null;
const pending = new Map(); let seq = 1;          // n -> { done, fail } waiting for the server's answer
const rendering = new Set();                     // models getting their icon made
function mount(a) {
  api = a; if (win) return;
  ibtn = btn("I"); ibtn.id = "imp-btn"; ibtn.title = "Importer"; ibtn.addEventListener("click", () => toggle());
  (document.getElementById("staff-col") || document.body).appendChild(ibtn);
  win = $("div"); win.id = "imp-panel"; win.hidden = true;
  const top = $("div", "we-top"); top.append($("span", "we-title", "IMPORTER"), btn("×", "we-x", () => toggle(false)));
  top.addEventListener("pointerdown", (e) => {   // dragged by its top bar
    if (e.button !== 0 || e.target.closest("button")) return; e.preventDefault();
    const r0 = win.getBoundingClientRect(), ox = e.clientX - r0.left, oy = e.clientY - r0.top;
    win.style.transform = "none"; win.style.left = r0.left + "px"; win.style.top = r0.top + "px";
    const move = (ev) => { const r = win.getBoundingClientRect(); win.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - ox)) + "px"; win.style.top = Math.max(0, Math.min(innerHeight - r.height, ev.clientY - oy)) + "px"; };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  });
  tabs = $("div", "we-tabs");
  for (const [k, label] of KINDS) { const b = btn(label, "", () => { tab = k; draw(); }); b.dataset.k = k; tabs.appendChild(b); }
  search = $("input", "imp-search"); search.maxLength = 32; search.addEventListener("input", () => draw());
  grid = $("div", "we-list imp-grid");
  grid.addEventListener("contextmenu", (e) => { e.preventDefault(); const d = e.target.closest("[data-id]"); if (d) openMenu(d.dataset.id, e.clientX, e.clientY); });
  fileIn = $("input"); fileIn.type = "file"; fileIn.hidden = true; fileIn.accept = ".glb,.png,.jpg,.jpeg,.webp,.mp3,.ogg,.wav";
  fileIn.addEventListener("change", () => { const f = fileIn.files[0]; fileIn.value = ""; if (f) importBox(f); });
  const make = $("div", "we-make"); make.append(btn("IMPORT", "imp-go", () => fileIn.click()));
  perr = $("p", "we-err"); perr.hidden = true;
  win.append(top, tabs, search, grid, perr, make, fileIn); document.body.appendChild(win);
  win.addEventListener("dragover", (e) => { e.preventDefault(); win.classList.add("drop"); });
  win.addEventListener("dragleave", (e) => { if (!win.contains(e.relatedTarget)) win.classList.remove("drop"); });
  win.addEventListener("drop", (e) => { e.preventDefault(); win.classList.remove("drop"); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) importBox(f); });
  win.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.code === "KeyI" && e.target.tagName !== "INPUT" && !e.repeat) { toggle(false); return; } if (e.key === "Escape") { if (document.activeElement) document.activeElement.blur(); toggle(false); } });
  addEventListener("keydown", (e) => {
    if (e.code !== "KeyI" || e.ctrlKey || e.metaKey || e.altKey || e.repeat || pop) return;
    const t = document.activeElement; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
    e.preventDefault(); toggle();
  });
  addEventListener("pointerdown", (e) => { if (menu && !menu.contains(e.target)) closeMenu(); }, true);
}
function toggle(v) {
  if (!win) return; win.hidden = v === undefined ? !win.hidden : !v; ibtn.classList.toggle("on", !win.hidden);
  if (!win.hidden) { draw(); iconsDue(); } else closeMenu();
}
function draw() {
  if (!win || win.hidden) return;
  for (const b of tabs.children) b.classList.toggle("on", b.dataset.k === tab);
  const q = search.value.trim().toLowerCase();
  const list = assets.filter((a) => a.kind === tab && (!q || a.name.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
  const cells = list.map((a) => { const d = $("div", "inv-slot imp-slot"); d.dataset.id = a.id; d.title = a.name; d.appendChild(slotPic(a, 34)); return d; });
  for (let i = cells.length; i < Math.max(10, Math.ceil(cells.length / 5) * 5); i++) cells.push($("div", "inv-slot"));
  grid.replaceChildren(...cells);
}
function slotPic(a, px) {
  const f = a.kind === "image" ? a.file : a.thumb; if (f) return picture(f, px);
  const s = $("span", "build-letter", a.kind === "audio" ? "♪" : (a.name || "?").slice(0, 1).toUpperCase()); return s;
}
// (models imported before the Importer have no icon yet: rendered and saved here, one at a time)
async function iconsDue() {
  for (const a of assets) {
    if (a.kind !== "model" || a.thumb || rendering.has(a.file)) continue;
    rendering.add(a.file);
    try { const obj = await loadGlb(a.file), j = await upload(await renderIcon(obj)); api.send({ t: "aset", id: a.id, asset: { kind: a.kind, name: a.name, file: a.file, thumb: j.file } }); }
    catch (e) { console.error("model icon", a.file, e); }
  }
}

function openMenu(id, x, y) {
  const a = assets.find((o) => o.id === id); if (!a) return; closeMenu();
  menu = $("div", "we-ctx");
  menu.append(btn("Rename", "", () => { closeMenu(); renameBox(a); }), btn("Delete", "", () => { closeMenu(); api.send({ t: "adel", id: a.id }); }));
  document.body.appendChild(menu); const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, innerWidth - r.width - 4) + "px"; menu.style.top = Math.min(y, innerHeight - r.height - 4) + "px";
}
function closeMenu() { if (menu) { menu.remove(); menu = null; } }

// a pop-up: the asset's icon, its Name, CANCEL / (ok)
function popup(title, okText, picEl, name0, onOk) {
  if (pop) pop.close();
  const back = $("div", "we-back"), box = $("div", "we-modal imp-pop"); back.appendChild(box); document.body.appendChild(back);
  const pic = $("div", "imp-preview"); if (picEl) pic.appendChild(picEl);
  const grid = $("div", "we-grid"), name = $("input"); name.maxLength = 32; name.value = name0;
  grid.append($("label", "we-label", "Name"), name);
  const err = $("p", "we-err"); err.hidden = true;
  const btns = $("div", "we-btns"), cancel = btn("CANCEL"), ok = btn(okText, "we-ok"); btns.append(cancel, ok);
  box.append($("p", "we-title", title), pic, grid, err, btns);
  const close = () => { back.remove(); if (pop === me) pop = null; };
  const fail = (m) => { ok.disabled = false; err.textContent = m; err.hidden = false; };
  const go = () => { const n = name.value.trim(); if (!n) { fail("Give it a name."); return; } ok.disabled = true; err.hidden = true; onOk(n, { close, fail }); };
  cancel.addEventListener("click", close); ok.addEventListener("click", go);
  back.addEventListener("pointerdown", (e) => { if (e.target === back) close(); });
  back.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") close(); if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); go(); } });
  back.addEventListener("contextmenu", (e) => e.preventDefault());
  const me = pop = { close, pic, ok, fail }; setTimeout(() => { name.focus(); name.select(); }, 0);
  return me;
}
const kindOf = (f) => { const x = (f.name.split(".").pop() || "").toLowerCase(); return x === "glb" ? "model" : ["png", "jpg", "jpeg", "webp"].includes(x) ? "image" : ["mp3", "ogg", "wav"].includes(x) ? "audio" : null; };
const MAX = { model: 50, image: 10, audio: 25 };
async function importBox(file) {
  const kind = kindOf(file);
  const p = popup("IMPORT", "IMPORT", null, file.name.replace(/\.[^.]+$/, "").slice(0, 32), async (name, { close, fail }) => {
    try {
      const j = await upload(file);
      let thumb = null; if (j.kind === "model") thumb = (await upload(icon || await renderIcon(await parseGlb(await file.arrayBuffer())))).file;
      const n = seq++; pending.set(n, { done: () => { close(); tab = j.kind; draw(); }, fail });
      api.send({ t: "aset", n, asset: { kind: j.kind, name, file: j.file, thumb } });
    } catch (e) { fail(e.message || "The upload failed."); }
  });
  let icon = null;
  if (!kind) { p.fail("That isn't a model, image or sound the game can use."); p.ok.disabled = true; return; }
  if (file.size > MAX[kind] * 1024 * 1024) { p.fail("That file is over " + MAX[kind] + " MB."); p.ok.disabled = true; return; }
  if (kind === "image") { const im = $("img", "imp-pic"); im.width = im.height = 96; im.src = URL.createObjectURL(file); p.pic.appendChild(im); }
  else if (kind === "audio") p.pic.appendChild($("span", "build-letter imp-big", "♪"));
  else {                                        // a model: its icon rendered now, shown here and sent with it
    p.ok.disabled = true;
    try { icon = await renderIcon(await parseGlb(await file.arrayBuffer())); const im = $("img", "imp-pic"); im.width = im.height = 96; im.src = URL.createObjectURL(icon); p.pic.appendChild(im); p.ok.disabled = false; }
    catch (e) { p.fail("That model couldn't be read."); }
  }
}
function renameBox(a) {
  popup("RENAME", "SAVE", slotPic(a, 96), a.name, (name, { close, fail }) => {
    const n = seq++; pending.set(n, { done: close, fail });
    api.send({ t: "aset", id: a.id, n, asset: { kind: a.kind, name, file: a.file, thumb: a.thumb } });
  });
}

function set(list) {
  assets = Array.isArray(list) ? list.filter((a) => a && typeof a.id === "string" && typeof a.file === "string") : [];
  draw(); if (win && !win.hidden) iconsDue(); for (const f of subs) f();
}
function onMsg(m) {
  if (m.t === "assets") { set(m.list); return true; }
  if (m.t === "asaved") {
    const w = m.n != null ? pending.get(m.n) : null; if (w) pending.delete(m.n);
    if (m.error) { if (w) w.fail(m.error); else if (pop) pop.fail(m.error); else if (perr) { perr.textContent = m.error; perr.hidden = false; clearTimeout(perr.t); perr.t = setTimeout(() => { perr.hidden = true; }, 4000); } } else if (w) w.done();
    return true;
  }
  return false;
}
export const Importer = { mount, set, onMsg, toggle };
