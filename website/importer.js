// (owner, 2026-10-15) The Importer, titled RAW ASSETS (head admin): I (or the [I] button in the staff column) opens it. It holds the game's
// imported assets (models, images and sounds), kept on the server, which the Object Creator uses (its models). Three
// one row: the search ("Search assets"), the filter button (All / Models / Images / Audio) and a green Import; below, the
// scrolling grid; each asset a slot showing its icon (hover: its name). A model's icon is a picture rendered
// from the model itself (made when it's imported; older models get theirs the first time the Importer sees them); an
// image's is the image. IMPORT (or a file dropped on the panel) picks a file: a pop-up shows its icon and a Name (the file's
// name to start), CANCEL / IMPORT; a model's icon is a live view there to set (owner, 2026-10-15). Right-click an asset:
// Edit (its name; a model's icon view) / Delete (a model can't go while an object uses it).
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
// (owner, 2026-10-15) its view can be set (the import / edit pop-up): turned around (yaw), tilted (pitch), zoomed (1 = just
// filling the picture) and shifted (px, py: in the model's radius); kept with the asset
export const VIEW0 = { yaw: 45, pitch: 28, zoom: 1, px: 0, py: 0 };
function stage(obj) {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a4658, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.6); scene.add(sun);
  const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), r = Math.max(box.getBoundingSphere(new THREE.Sphere()).radius, 1e-6);
  const holder = new THREE.Group(); obj.position.sub(c); holder.add(obj); scene.add(holder);
  // (owner, 2026-10-15) its Front: the model turned so its nose points the game's way (+Z), shown by an arrow on the
  // ground under it while editing (never in the icon)
  const arrow = new THREE.Group(), am = new THREE.MeshBasicMaterial({ color: 0x38c6ff, transparent: true, opacity: 0.85, depthTest: false });
  { const y = box.min.y - c.y, shaft = new THREE.Mesh(new THREE.BoxGeometry(r * 0.06, r * 0.01, r * 1.1), am), head = new THREE.Mesh(new THREE.ConeGeometry(r * 0.16, r * 0.35, 16), am);
    shaft.position.set(0, y, r * 0.45); head.rotation.x = Math.PI / 2; head.position.set(0, y, r * 1.15); arrow.add(shaft, head); arrow.renderOrder = 10; arrow.visible = false; scene.add(arrow); }
  const corners = []; for (let i = 0; i < 8; i++) corners.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c));
  const cam = new THREE.PerspectiveCamera(30, 1, r / 100, r * 100), D = THREE.MathUtils.degToRad;
  function aim(v) {
    const dir = new THREE.Vector3(Math.cos(D(v.pitch)) * Math.sin(D(v.yaw)), Math.sin(D(v.pitch)), Math.cos(D(v.pitch)) * Math.cos(D(v.yaw)));
    const up = Math.abs(v.pitch) > 89.5 ? new THREE.Vector3(0, 0, -Math.sign(v.pitch)) : new THREE.Vector3(0, 1, 0); cam.up.copy(up);
    let dist = r / Math.sin(D(15));
    for (let k = 0; k < 4; k++) {                // pulled in until it fills the picture (a little margin)
      cam.position.copy(dir).multiplyScalar(dist); cam.lookAt(0, 0, 0); cam.near = dist / 100; cam.far = dist * 10; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      let m = 0; for (const p of corners) { const q = p.clone().applyAxisAngle(Y_AXIS, holder.rotation.y).project(cam); m = Math.max(m, Math.abs(q.x), Math.abs(q.y)); }
      dist *= Math.max(0.3, m / 0.9);
    }
    dist /= v.zoom; cam.position.copy(dir).multiplyScalar(dist); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), upv = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const t = right.multiplyScalar(-v.px * r).add(upv.multiplyScalar(-v.py * r));
    cam.position.add(t); cam.near = dist / 100; cam.far = dist * 10 + r * 4; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    sun.position.copy(cam.position).add(new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).multiplyScalar(dist * 0.8)).add(new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(dist * 0.5));
    return cam;
  }
  return { scene, aim, arrow, setFront(deg) { holder.rotation.y = D(deg || 0); } };
}
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const toPng = (canvas) => new Promise((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error("render"))), "image/png"));
let ren = null;
function renderIcon(obj, view = VIEW0, front = 0) {
  if (!ren) { ren = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); ren.setSize(256, 256, false); ren.setClearColor(0x000000, 0); }
  const st = stage(obj); st.setFront(front); ren.render(st.scene, st.aim(view)); return toPng(ren.domElement);
}
// the pop-up's live view: drag turns it, right-drag (or Shift-drag) shifts it, the wheel zooms; Reset puts it back
function viewer(obj, view0, el, front0) {
  const v = { ...VIEW0, ...(view0 || {}) }, st = stage(obj); let front = front0 || 0; st.setFront(front); st.arrow.visible = true;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); r.setClearColor(0x000000, 0); r.setPixelRatio(1); r.setSize(256, 256, false);
  const cv = r.domElement; cv.className = "imp-view"; el.replaceChildren(cv);
  const draw = () => r.render(st.scene, st.aim(v)); draw();
  let drag = null;
  cv.addEventListener("pointerdown", (e) => { e.preventDefault(); drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.button === 1 || e.shiftKey, id: e.pointerId }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    if (drag.pan) { const k = 2.2 / (cv.clientWidth * v.zoom); v.px = clamp(v.px - dx * k, -3, 3); v.py = clamp(v.py + dy * k, -3, 3); }
    else { v.yaw = ((v.yaw - dx * 0.6) % 360 + 360) % 360; v.pitch = clamp(v.pitch + dy * 0.6, -90, 90); }
    draw();
  });
  const end = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  cv.addEventListener("wheel", (e) => { e.preventDefault(); v.zoom = clamp(v.zoom * Math.exp(-e.deltaY * 0.0015), 0.2, 8); draw(); }, { passive: false });
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  return {
    get view() { return { yaw: round(v.yaw), pitch: round(v.pitch), zoom: round(v.zoom, 1000), px: round(v.px, 1000), py: round(v.py, 1000) }; },
    reset() { Object.assign(v, VIEW0); draw(); },
    shot() { st.arrow.visible = false; draw(); const p = toPng(cv); st.arrow.visible = true; draw(); return p; },
    get front() { return front; },
    setFront(deg) { front = ((Math.round(deg) % 360) + 360) % 360; st.setFront(front); draw(); },
    dispose() { r.dispose(); try { r.forceContextLoss(); } catch {} },
  };
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), round = (x, k = 10) => Math.round(x * k) / k;
const parseGlb = (buf) => new Promise((ok, no) => gltf.parse(buf, "", (g) => ok(g.scene), no));
const loadGlb = (file) => new Promise((ok, no) => gltf.load(BASE() + "/game/models/" + file, (g) => ok(g.scene), undefined, no));
async function upload(body) {
  const r = await fetch(BASE() + "/game/assets", { method: "POST", credentials: "include", headers: { "Content-Type": "application/octet-stream" }, body });
  const j = await r.json().catch(() => ({})); if (!r.ok || !j.file) throw new Error(j.error || "The upload failed."); return j;
}

// ---- the panel ----
let api = null, perr = null, win = null, ibtn = null, grid = null, fbtn = null, search = null, fileIn = null, tab = "all", menu = null, pop = null;
const pending = new Map(); let seq = 1;          // n -> { done, fail } waiting for the server's answer
const rendering = new Set();                     // models getting their icon made
function mount(a) {
  api = a; if (win) return;
  ibtn = btn("I"); ibtn.id = "imp-btn"; ibtn.title = "Raw Assets"; ibtn.addEventListener("click", () => toggle());
  (document.getElementById("staff-col") || document.body).appendChild(ibtn);
  win = $("div"); win.id = "imp-panel"; win.hidden = true;
  const top = $("div", "we-top"); top.append($("span", "we-title", "RAW ASSETS"), btn("×", "we-x", () => toggle(false)));
  if (window.WinPos) window.WinPos.watch(top, win, "assets");   // (owner, 2026-10-15) remembered per account
  top.addEventListener("pointerdown", (e) => {   // dragged by its top bar
    if (e.button !== 0 || e.target.closest("button")) return; e.preventDefault();
    const r0 = win.getBoundingClientRect(), ox = e.clientX - r0.left, oy = e.clientY - r0.top;
    win.style.transform = "none"; win.style.left = r0.left + "px"; win.style.top = r0.top + "px";
    const move = (ev) => { const r = win.getBoundingClientRect(); win.style.left = Math.max(0, Math.min(innerWidth - r.width, ev.clientX - ox)) + "px"; win.style.top = Math.max(0, Math.min(innerHeight - r.height, ev.clientY - oy)) + "px"; };
    const up = () => { removeEventListener("pointermove", move); removeEventListener("pointerup", up); };
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  });
  // (owner, 2026-10-15) one row: the search, the filter (All / Models / Images / Audio) and Import
  search = $("input", "imp-search"); search.maxLength = 32; search.placeholder = "Search assets"; search.addEventListener("input", () => draw());
  fbtn = btn("", "imp-filter", (e) => filterMenu(e)); fbtn.title = "Filter";
  fbtn.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M2 3h12l-4.6 5.4V13l-2.8 1.4V8.4Z" fill="currentColor"/></svg>';
  const tools = $("div", "imp-tools"); tools.append(search, fbtn, btn("Import", "imp-go", () => fileIn.click()));
  grid = $("div", "we-list imp-grid");
  grid.addEventListener("contextmenu", (e) => { e.preventDefault(); const d = e.target.closest("[data-id]"); if (d) openMenu(d.dataset.id, e.clientX, e.clientY); });
  fileIn = $("input"); fileIn.type = "file"; fileIn.hidden = true; fileIn.accept = ".glb,.png,.jpg,.jpeg,.webp,.mp3,.ogg,.wav";
  fileIn.addEventListener("change", () => { const f = fileIn.files[0]; fileIn.value = ""; if (f) importBox(f); });
  perr = $("p", "we-err"); perr.hidden = true;
  win.append(top, tools, grid, perr, fileIn); document.body.appendChild(win);
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
  if (!win.hidden) { draw(); iconsDue(); if (window.WinPos) window.WinPos.place(win, "assets"); } else closeMenu();
}
function draw() {
  if (!win || win.hidden) return;
  fbtn.classList.toggle("on", tab !== "all");
  const q = search.value.trim().toLowerCase();
  const list = assets.filter((a) => (tab === "all" || a.kind === tab) && (!q || a.name.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
  const cells = list.map((a) => { const d = $("div", "inv-slot imp-slot"); d.dataset.id = a.id; d.title = a.name; d.appendChild(slotPic(a, 34)); return d; });
  for (let i = cells.length; i < Math.max(12, Math.ceil(cells.length / 6) * 6); i++) cells.push($("div", "inv-slot"));
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
    try { const obj = await loadGlb(a.file), j = await upload(await renderIcon(obj, { ...VIEW0, ...(a.view || {}) }, a.front || 0)); api.send({ t: "aset", id: a.id, asset: { kind: a.kind, name: a.name, file: a.file, thumb: j.file, view: a.view, front: a.front || 0 } }); }
    catch (e) { console.error("model icon", a.file, e); }
  }
}

function openMenu(id, x, y) {
  const a = assets.find((o) => o.id === id); if (!a) return; closeMenu();
  menu = $("div", "we-ctx");
  menu.append(btn("Edit", "", () => { closeMenu(); renameBox(a); }), btn("Delete", "", () => { closeMenu(); api.send({ t: "adel", id: a.id }); }));
  document.body.appendChild(menu); const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, innerWidth - r.width - 4) + "px"; menu.style.top = Math.min(y, innerHeight - r.height - 4) + "px";
}
function filterMenu(e) {
  closeMenu(); menu = $("div", "we-ctx imp-fmenu");
  for (const [k, label] of [["all", "All"], ...KINDS]) { const b = btn(label, k === tab ? "on" : "", () => { closeMenu(); tab = k; draw(); }); menu.appendChild(b); }
  document.body.appendChild(menu); const r = fbtn.getBoundingClientRect(), m = menu.getBoundingClientRect();
  menu.style.left = Math.min(r.left, innerWidth - m.width - 4) + "px"; menu.style.top = Math.min(r.bottom + 4, innerHeight - m.height - 4) + "px";
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
  const close = () => { back.remove(); if (pop === me) pop = null; if (me.onClose) me.onClose(); };
  const fail = (m) => { ok.disabled = false; err.textContent = m; err.hidden = false; };
  const go = () => { const n = name.value.trim(); if (!n) { fail("Give it a name."); return; } ok.disabled = true; err.hidden = true; onOk(n, { close, fail }); };
  cancel.addEventListener("click", close); ok.addEventListener("click", go);
  back.addEventListener("pointerdown", (e) => { if (e.target === back) close(); });
  back.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") close(); if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); go(); } });
  back.addEventListener("contextmenu", (e) => e.preventDefault());
  const reset = btn("Reset View", "imp-reset"); reset.hidden = true; box.insertBefore(reset, grid);
  // (owner, 2026-10-15) a model's Front: degrees it's turned (the arrow shows the nose); the buttons turn it a quarter
  const fRow = $("div", "imp-front"), fIn = $("input"); fIn.type = "number"; fIn.min = 0; fIn.max = 359; fIn.step = 1; fRow.hidden = true;
  const fL = btn("\u27f2", "imp-turn"), fR = btn("\u27f3", "imp-turn"); fL.title = "Turn Left"; fR.title = "Turn Right"; fRow.append(fL, fIn, fR);
  const fLab = $("label", "we-label", "Front"); fLab.hidden = true; grid.prepend(fLab, fRow);
  const front = (vw) => {
    fLab.hidden = fRow.hidden = false; fIn.value = String(vw.front);
    fIn.addEventListener("input", () => { const n = Number(fIn.value); if (Number.isFinite(n)) vw.setFront(n); });
    fIn.addEventListener("change", () => { fIn.value = String(vw.front); });
    fL.addEventListener("click", () => { vw.setFront(vw.front + 90); fIn.value = String(vw.front); });
    fR.addEventListener("click", () => { vw.setFront(vw.front - 90); fIn.value = String(vw.front); });
  };
  const me = pop = { close, pic, ok, fail, reset, front, onClose: null }; setTimeout(() => { name.focus(); name.select(); }, 0);
  return me;
}
const kindOf = (f) => { const x = (f.name.split(".").pop() || "").toLowerCase(); return x === "glb" ? "model" : ["png", "jpg", "jpeg", "webp"].includes(x) ? "image" : ["mp3", "ogg", "wav"].includes(x) ? "audio" : null; };
const MAX = { model: 50, image: 10, audio: 25 };
async function importBox(file) {
  const kind = kindOf(file);
  const p = popup("IMPORT", "IMPORT", null, file.name.replace(/\.[^.]+$/, "").slice(0, 32), async (name, { close, fail }) => {
    try {
      const j = await upload(file);
      let thumb = null, view = undefined, front = 0; if (j.kind === "model" && vw) { view = vw.view; front = vw.front; thumb = (await upload(await vw.shot())).file; }
      const n = seq++; pending.set(n, { done: () => { close(); if (tab !== "all") tab = j.kind; draw(); }, fail });
      api.send({ t: "aset", n, asset: { kind: j.kind, name, file: j.file, thumb, view, front } });
    } catch (e) { fail(e.message || "The upload failed."); }
  });
  let vw = null;
  if (!kind) { p.fail("That isn't a model, image or sound the game can use."); p.ok.disabled = true; return; }
  if (file.size > MAX[kind] * 1024 * 1024) { p.fail("That file is over " + MAX[kind] + " MB."); p.ok.disabled = true; return; }
  if (kind === "image") { const im = $("img", "imp-pic"); im.width = im.height = 96; im.src = URL.createObjectURL(file); p.pic.appendChild(im); }
  else if (kind === "audio") p.pic.appendChild($("span", "build-letter imp-big", "♪"));
  else {                                        // a model: its icon's view, set here; rendered and sent with it
    p.ok.disabled = true;
    try { vw = viewer(await parseGlb(await file.arrayBuffer()), null, p.pic, 0); p.front(vw); p.onClose = () => vw.dispose(); p.reset.hidden = false; p.reset.addEventListener("click", () => vw.reset()); p.ok.disabled = false; }
    catch (e) { p.fail("That model couldn't be read."); }
  }
}
// Edit: its name, and a model's icon view (re-rendered when the view changed)
function renameBox(a) {
  let vw = null;
  const p = popup("EDIT ASSET", "SAVE", slotPic(a, 96), a.name, async (name, { close, fail }) => {
    try {
      let thumb = a.thumb, view = a.view, front = a.front || 0;
      if (vw) { const nv = vw.view; front = vw.front; if (!a.thumb || front !== (a.front || 0) || JSON.stringify(nv) !== JSON.stringify({ ...VIEW0, ...(a.view || {}) })) { view = nv; thumb = (await upload(await vw.shot())).file; } }
      const n = seq++; pending.set(n, { done: close, fail });
      api.send({ t: "aset", id: a.id, n, asset: { kind: a.kind, name, file: a.file, thumb, view, front } });
    } catch (e) { fail(e.message || "The upload failed."); }
  });
  if (a.kind === "model") loadGlb(a.file).then((obj) => { if (pop !== p) return; vw = viewer(obj, a.view, p.pic, a.front || 0); p.front(vw); p.onClose = () => vw.dispose(); p.reset.hidden = false; p.reset.addEventListener("click", () => vw.reset()); }).catch(() => {});
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
