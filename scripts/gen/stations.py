# Cuts the player-station art (owner, 2026-10-11) out of the two reference sheets in scripts/gen/stations/:
#   parts_sheet.png  each station's body (arms retracted, no tip caps) and every arm part, at native size
#   arms_sheet.png   each station with its arms retracted and fully extended
# Writes website/assets/stations/*.webp and packages/server/src/game/stations.json: per size, each arm state's sprite
# and where the body sits in it (so the station doesn't move when its arms extend). Run: python3 scripts/gen/stations.py
import json
import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "scripts/gen/stations/"
OUT = "website/assets/stations/"
M_PER_PX = 1.875                     # the game's art scale (a Prospector is 68 px = 128 m)

def sprites(path):
    """Every sprite on a sheet as (x, y, w, h), labels included (filtered by size below)."""
    a = np.array(Image.open(path).convert("RGBA"))[:, :, 3] > 0
    lab, _ = ndimage.label(ndimage.binary_dilation(a, iterations=3))
    out = []
    for sl in ndimage.find_objects(lab):
        ys, xs = np.nonzero(a[sl])
        out.append((sl[1].start + xs.min(), sl[0].start + ys.min(), xs.max() - xs.min() + 1, ys.max() - ys.min() + 1))
    return out

def crop_near(img, boxes, w, h, x0=None, y0=None):
    """The sprite of exactly w × h (its label may be stuck to it: then the bottom w × h of that box)."""
    if x0 is not None: boxes = sorted(boxes, key=lambda b: abs(b[0] - x0) + abs(b[1] - y0))
    for (x, y, bw, bh) in boxes:
        if x0 is not None and abs(x - x0) > 40: continue
        if y0 is not None and abs(y - y0) > 60: continue
        if bw == w and bh == h: return img.crop((x, y, x + w, y + h))
        if abs(bw - w) <= 30 and bh >= h and bh - h <= 40:          # label above it, merged by the dilation
            sub = np.array(img.crop((x, y + bh - h, x + bw, y + bh)))[:, :, 3] > 0
            xs = np.nonzero(sub.any(axis=0))[0]
            return img.crop((x + xs.min(), y + bh - h, x + xs.min() + w, y + bh))
    raise SystemExit(f"no {w}x{h} sprite near {x0},{y0}")

def hub(comp):
    """The station's center: the middle of the blue dot at its hub (the blue blob nearest the sprite's middle)."""
    px = np.array(comp).astype(int); r, g, b, al = px[..., 0], px[..., 1], px[..., 2], px[..., 3]
    blue = (al > 200) & (b > 150) & (b - r > 60) & (b - g > 25)
    lab, n = ndimage.label(blue); h, w = blue.shape; best = None
    for i, sl in enumerate(ndimage.find_objects(lab), 1):
        ys, xs = np.nonzero(lab[sl] == i); cy, cx = sl[0].start + ys.mean(), sl[1].start + xs.mean()
        hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if len(ys) < 12 or abs(hh - ww) > max(2, 0.25 * max(hh, ww)): continue          # round blobs only
        d = (cx - w / 2) ** 2 + (cy - h / 2) ** 2
        if best is None or d < best[0]: best = (d, cx, cy)
    return best[1], best[2]

parts, arms = Image.open(SRC + "parts_sheet.png").convert("RGBA"), Image.open(SRC + "arms_sheet.png").convert("RGBA")
pb, ab = sprites(SRC + "parts_sheet.png"), sprites(SRC + "arms_sheet.png")
SIZES = {   # body w × h (parts sheet), retracted, extended (from the sheets' labels)
    "small": ((157, 228), (160, 228), (182, 228)),
    "medium": ((482, 519), (482, 522), (482, 598)),
    "large": ((1551, 1401), (1551, 1401), (1760, 1401)),
}
manifest = {"mPerPx": M_PER_PX, "sizes": {}}
# where each arm part sits on the parts sheet (under its label), so a label of the same size is never taken for it
PART_AT = {"small_arm_full_extended": (1384, 1741), "small_arm_tip_cap": (24, 1835), "medium_arm_full_extended": (1744, 1501), "medium_arm_tip_cap": (277, 1835),
           "large_arm_full_extended": (374, 1501), "large_arm_tip_cap": (1471, 1501)}

def small_station(state):
    """(owner) The small station is built from its full body on the parts sheet (the arms sheet's retracted one is missing
    its docking port): the arm's tip cap (retracted) or the whole arm (extended) out of the socket on its left."""
    body = crop_near(parts, pb, 157, 228)
    a = np.array(body)[:, :, 3] > 0; ys = np.nonzero(a[:, 0])[0]; cy = (ys.min() + ys.max() + 1) // 2   # the socket's middle
    piece = crop_near(parts, pb, 3, 12, *PART_AT["small_arm_tip_cap"]) if state == "retracted" else crop_near(parts, pb, 37, 16, *PART_AT["small_arm_full_extended"])
    out_w = 3 if state == "retracted" else 25                                                          # how far it sticks out
    comp = Image.new("RGBA", (body.width + out_w, body.height), (0, 0, 0, 0))
    comp.alpha_composite(piece, (0, cy - piece.height // 2))
    comp.alpha_composite(body, (out_w, 0))
    return comp

for name, (bwh, rwh, ewh) in SIZES.items():
    entry = {}
    for state, wh in (("retracted", rwh), ("extended", ewh)):
        comp = small_station(state) if name == "small" else crop_near(arms, ab, *wh)
        wh = comp.size
        hx, hy = hub(comp)
        comp.save(OUT + f"{name}_{state}.webp", lossless=True)
        # the sprite's center relative to the hub (the station's position), in px, so extending the arms moves nothing else
        entry[state] = {"sprite": f"stations/{name}_{state}.webp", "w": wh[0], "h": wh[1], "dx": round(wh[0] / 2 - hx, 2), "dy": round(wh[1] / 2 - hy, 2)}
        print(name, state, wh, "hub at", (round(hx, 1), round(hy, 1)))
    manifest["sizes"][name] = entry
for nm, wh in {"small_arm_full_extended": (37, 16), "small_arm_tip_cap": (3, 12), "medium_arm_full_extended": (40, 124), "medium_arm_tip_cap": (28, 6),
               "large_arm_full_extended": (364, 190), "large_arm_tip_cap": (16, 130)}.items():
    crop_near(parts, pb, *wh, *PART_AT[nm]).save(OUT + nm + ".webp", lossless=True)
json.dump(manifest, open("packages/server/src/game/stations.json", "w"), indent=1)
