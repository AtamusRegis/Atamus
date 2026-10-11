# Builds packages/server/src/game/rockmasks.json: for each rock sprite, points well inside its opaque part
# (owner: mining lasers aim only at the rock itself, never its transparent corners). Points are [u, v] as
# fractions of the sprite's width from its center (v down, as drawn). Run: python3 scripts/gen/rockmasks.py
import glob, json, os, re
from PIL import Image, ImageFilter
out = {}
for f in sorted(glob.glob("website/assets/rocks/rock_*_*.webp")):
    fam, size = re.match(r".*rock_(\w+)_(\d+)\.webp$", f).groups()
    im = Image.open(f).convert("RGBA"); W, H = im.size
    a = im.getchannel("A").point(lambda v: 255 if v > 200 else 0)
    m = max(3, int(W * 0.07)) | 1                      # stay about 7% of the width inside the edge
    a = a.filter(ImageFilter.MinFilter(m))
    pts = []; N = 24; step = W / N
    y = step / 2
    while y < H:
        x = step / 2
        while x < W:
            if a.getpixel((int(x), int(y))): pts.append([round((x - W / 2) / W, 4), round((y - H / 2) / W, 4)])
            x += step
        y += step
    out[fam + "_" + size] = pts
    print(fam, size, len(pts))
json.dump(out, open("packages/server/src/game/rockmasks.json", "w"), separators=(",", ":"))
