# Cuts the owner's module icon sheet (2026-10-11, second version: weapons by role, ammo) into
# website/assets/icons/modules/: per item <name>.png (64, tier I), <name>_s.png (32), <name>_2.png, <name>_2_s.png
# (tier II, with its badge). Usage: python3 scripts/gen/module_icons.py sheet.png
import sys, os
from PIL import Image
sheet = Image.open(sys.argv[1]).convert("RGBA")
out = os.path.join(os.path.dirname(__file__), "../../website/assets/icons/modules")
os.makedirs(out, exist_ok=True)
def crop(x0, y0, x1, y1):
    c = sheet.crop((x0, y0, x1, y1)); bb = c.getbbox()
    return c.crop(bb) if bb else c
def four(name, x, y0, y1, cells):
    for suf, (a, b) in zip(["", "_s", "_2", "_2_s"], cells):
        crop(x + a, y0, x + b, y1).save(os.path.join(out, name + suf + ".png"))
ACT = [(0, 70), (70, 106), (106, 180), (180, 250)]
PAS = [(0, 72), (72, 108), (108, 184), (184, 250)]
COLS = [24, 276, 528, 780, 1032, 1284]
GRID = [  # (row's top, bottom, cells, families)
    (45, 120, ACT, ["mining_laser", "strip_miner", "drone_link", "tractor_beam", "shield_recharger", "shield_extender"]),
    (150, 222, ACT, ["afterburner", "microwarp_drive", "warp_scrambler", "stasis_webifier", "remote_shield_booster", "remote_shield_extender"]),
    (255, 325, ACT, ["repair_drone"]),
    (398, 471, PAS, ["cargo_upgrade", "yield_upgrade", "cycle_upgrade", "range_upgrade", "target_range_upgrade", "armor_upgrade"]),
    (502, 575, PAS, ["drone_upgrade", "gyroscope", "locking_upgrade", "target_tracker", "speed_upgrade", "drone_bay_extender"])]
for y0, y1, cells, fams in GRID:
    for cx, fam in zip(COLS, fams): four(fam, cx - 4, y0, y1, cells)
# weapons: a column per system, a row per role; ammo: a row per kind
WCELLS = [(0, 70), (70, 108), (108, 184), (184, 230)]
WCOLS = [(150, "missile"), (450, "beam"), (750, "repeater"), (1050, "coilgun")]
for y0, y1, role in [(682, 749, ""), (786, 853, "_shield"), (890, 957, "_armor"), (994, 1061, "_long")]:
    for x, sys_ in WCOLS: four(sys_ + role, x, y0, y1, WCELLS)
for y0, y1, sub in [(1178, 1236, "swift"), (1280, 1340, "std"), (1382, 1444, "heavy")]:
    for x, sys_ in WCOLS: four("ammo_" + sys_ + "_" + sub, x, y0, y1, WCELLS)
# drones and fuel: a big icon and a small one beside it
for name, x, y0, y1, w in [("drone_fuel", 20, 1520, 1589, 70), ("drone_mining", 185, 1520, 1589, 68), ("drone", 323, 1520, 1589, 68), ("drone_beam", 461, 1520, 1589, 68),
                           ("drone_missile", 599, 1520, 1589, 68), ("drone_repeater", 739, 1520, 1589, 68), ("drone_coilgun", 20, 1632, 1692, 70)]:
    crop(x, y0, x + w, y1).save(os.path.join(out, name + ".png")); crop(x + w, y0, x + w + 42, y1).save(os.path.join(out, name + "_s.png"))
print("ok")
