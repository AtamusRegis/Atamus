# Cuts the owner's module icon sheet (2026-10-11) into website/assets/icons/modules/: per family <family>.png (64,
# tier I), <family>_s.png (32), <family>_2.png and <family>_2_s.png (tier II, with its badge); drones and fuel too.
# Usage: python3 scripts/gen/module_icons.py sheet.png
import sys, os
from PIL import Image
sheet = Image.open(sys.argv[1]).convert("RGBA")
out = os.path.join(os.path.dirname(__file__), "../../website/assets/icons/modules")
def crop(x0, y0, x1, y1):
    c = sheet.crop((x0, y0, x1, y1)); bb = c.getbbox()
    return c.crop(bb) if bb else c
COLS = [24, 276, 528, 780, 1032, 1284]
ROWS = {  # top and bottom of each row's art (labels excluded)
    "a1": (45, 120), "a2": (155, 221), "a3": (255, 325), "p1": (398, 471), "p2": (502, 575)}
GRID = {
    "a1": ["mining_laser", "strip_miner", "drone_link", "tractor_beam", "shield_recharger", "shield_extender"],
    "a2": ["afterburner", "microwarp_drive", "missile", "beam", "slug", "railgun"],
    "a3": ["warp_scrambler", "stasis_webifier", "remote_shield_booster", "remote_shield_extender", "repair_drone"],
    "p1": ["cargo_upgrade", "yield_upgrade", "cycle_upgrade", "range_upgrade", "target_range_upgrade", "armor_upgrade"],
    "p2": ["drone_upgrade", "gyroscope", "locking_upgrade", "target_tracker", "speed_upgrade", "drone_bay_extender"]}
for row, fams in GRID.items():
    y0, y1 = ROWS[row]
    for cx, fam in zip(COLS, fams):
        x = cx - 4
        cells = {"": (0, 72), "_s": (72, 108), "_2": (108, 184), "_2_s": (184, 250)} if row.startswith("p") else {"": (0, 70), "_s": (70, 106), "_2": (106, 180), "_2_s": (180, 250)}
        for name, (a, b) in cells.items():
            crop(x + a, y0, x + b, y1).save(os.path.join(out, fam + name + ".png"))
# drones and fuel: each a big icon and a small one beside it
DRONES = [("drone_fuel", 20, 650, 716), ("drone_mining", 182, 650, 716), ("drone", 322, 650, 716), ("drone_beam", 460, 650, 716),
          ("drone_missile", 598, 650, 716), ("drone_slug", 738, 650, 716), ("drone_railgun", 20, 765, 820)]
for name, x, y0, y1 in DRONES:
    big = crop(x, y0, x + 70, y1); big.save(os.path.join(out, name + ".png"))
    crop(x + 70, y0, x + 110, y1).save(os.path.join(out, name + "_s.png"))
print("ok")
