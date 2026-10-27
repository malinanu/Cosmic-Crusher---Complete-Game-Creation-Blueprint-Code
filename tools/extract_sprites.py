#!/usr/bin/env python3
"""Cut game sprites out of the art sheets in art/ and save them as
transparent PNGs in assets/sprites/.

Usage:  python3 tools/extract_sprites.py [name ...]

Each entry in SPRITES names a source image, a crop box (x0, y0, x1, y1) in
source pixels, and how to separate the sprite from the dark sheet background:

  mode="flood"   flood-fill the dark background in from the crop border and
                 keep what it can't reach (default; suits sticker-style art)
  mode="circle"  keep a circle inscribed in the box (planets, round props)
  mode="rect"    keep the whole box (framed icons)

Options: dark = luminance below which a pixel counts as background (default
58), erase = rects forced to background (labels that touch a sprite), keep =
drop specks smaller than this fraction of the largest piece, seal = close
outline gaps this many px wide before filling.

A contact sheet of every sprite on a checkerboard is written to
tools/out/contact_sheet.png so the cut-outs can be checked by eye.

To replace a sprite with your own art, drop a PNG with the same file name
into assets/sprites/ and remove its entry here (or leave the entry out of the
next run by passing only the names you want regenerated).
"""
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "art")
OUT = os.path.join(ROOT, "assets", "sprites")
SHEET_OUT = os.path.join(ROOT, "tools", "out")

# Source images. Uploaded files can be added here under any file name.
SOURCES = {
    "suits": "sheet_suits.jpg",
    "aliens": "sheet_aliens.jpg",
    "menus": "mock_menus.jpg",
    "boss_hud": "mock_final_boss.jpg",
}

# name, source, box, options. max = longest side of the saved PNG.
SPRITES = [
    # Classic White suit
    dict(name="astro_idle", src="suits", box=(305, 190, 615, 670), max=320,
         erase=[(565, 190, 615, 262)]),
    dict(name="astro_run1", src="suits", box=(105, 1615, 335, 1902), max=256),
    dict(name="astro_run2", src="suits", box=(340, 1615, 568, 1902), max=256),
    dict(name="astro_run3", src="suits", box=(566, 1620, 800, 1902), max=256),
    dict(name="astro_leap", src="suits", box=(815, 1598, 1045, 1910), max=256),
    dict(name="astro_splat", src="suits", box=(1045, 1620, 1445, 1890), max=320),
    dict(name="fx_shield", src="suits", box=(1090, 295, 1372, 612), max=256, dark=45),
    dict(name="icon_suit_white", src="suits", box=(84, 211, 247, 386), mode="rect", max=128),
    # Later suits (Phase 2) are cut now so the art is ready
    dict(name="suit_magma_idle", src="suits", box=(278, 682, 612, 1118), max=320,
         erase=[(565, 682, 612, 748)]),
    dict(name="suit_void_idle", src="suits", box=(287, 1132, 568, 1543), max=320, dark=34, seal=2),
    # Aliens
    dict(name="alien_bouncer", src="aliens", box=(392, 292, 708, 588), max=200),
    dict(name="alien_roller", src="aliens", box=(434, 595, 722, 875), max=200),
    dict(name="alien_crawler", src="aliens", box=(78, 900, 740, 1142), max=320,
         erase=[(78, 900, 340, 932)]),
    dict(name="alien_splicer", src="aliens", box=(372, 1175, 766, 1438), max=240),
    dict(name="boss_blob", src="aliens", box=(158, 1440, 685, 1858), max=420),
    # UI
    dict(name="logo", src="menus", box=(36, 86, 460, 306), max=640, dark=40),
    dict(name="icon_boost", src="boss_hud", box=(560, 1784, 670, 1906), max=128),
    dict(name="icon_shield", src="boss_hud", box=(744, 1780, 866, 1912), max=128),
    dict(name="icon_trophy", src="menus", box=(852, 1150, 968, 1268), max=128),
    # Props
    dict(name="prop_asteroid", src="boss_hud", box=(760, 1335, 910, 1492), max=160, keep=0.3),
]


def luminance(rgb):
    return rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114


def flood_background(dark):
    """Mark dark pixels 4-connected to the crop border."""
    h, w = dark.shape
    bg = np.zeros_like(dark)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if dark[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if dark[y, x] and not bg[y, x]:
                bg[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and dark[ny, nx] and not bg[ny, nx]:
                bg[ny, nx] = True
                q.append((ny, nx))
    return bg


def components(mask):
    """Label 8-connected components; returns (labels, sizes)."""
    h, w = mask.shape
    labels = np.zeros(mask.shape, dtype=np.int32)
    sizes = [0]
    ys, xs = np.nonzero(mask)
    for sy, sx in zip(ys, xs):
        if labels[sy, sx]:
            continue
        lab = len(sizes)
        labels[sy, sx] = lab
        q = deque([(sy, sx)])
        n = 0
        while q:
            y, x = q.popleft()
            n += 1
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = lab
                        q.append((ny, nx))
        sizes.append(n)
    return labels, sizes


def cut_flood(img, spec):
    rgb = np.asarray(img, dtype=np.float32)
    lum = luminance(rgb)
    thresh = spec.get("dark", 58)
    dark = lum < thresh
    for (x0, y0, x1, y1) in spec.get("erase", []):
        bx0, by0 = spec["box"][:2]
        dark[max(0, y0 - by0):y1 - by0, max(0, x0 - bx0):x1 - bx0] = True
    seal = spec.get("seal", 0)
    if seal:
        # Shrink the dark area first so the fill can't leak through thin
        # gaps in a sprite's outline, then grow it back.
        size = seal * 2 + 1
        dark_img = Image.fromarray((dark * 255).astype(np.uint8))
        sealed = np.asarray(dark_img.filter(ImageFilter.MinFilter(size))) > 0
        bg = flood_background(sealed)
        bg_img = Image.fromarray((bg * 255).astype(np.uint8))
        bg = (np.asarray(bg_img.filter(ImageFilter.MaxFilter(size))) > 0) & dark
    else:
        bg = flood_background(dark)
    fg = ~bg
    for (x0, y0, x1, y1) in spec.get("erase", []):
        bx0, by0 = spec["box"][:2]
        fg[max(0, y0 - by0):y1 - by0, max(0, x0 - bx0):x1 - bx0] = False

    # Drop specks (stars, grid noise) far smaller than the main sprite.
    labels, sizes = components(fg)
    if len(sizes) > 1:
        biggest = max(sizes[1:])
        keep_min = max(40, biggest * spec.get("keep", 0.015))
        keep = np.array([s >= keep_min for s in sizes])
        keep[0] = False
        fg = keep[labels]

    # Soft edge: inside a thin band at the boundary, fade by brightness so
    # glows blend out instead of ending in a hard cut.
    hard = Image.fromarray((fg * 255).astype(np.uint8))
    inner = np.asarray(hard.filter(ImageFilter.MinFilter(5))) > 0
    band = fg & ~inner
    soft = np.clip((lum - (thresh - 20)) / 50.0, 0.0, 1.0)
    alpha = np.where(inner, 1.0, np.where(band, soft, 0.0))
    alpha_img = Image.fromarray((alpha * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
    out = img.convert("RGBA")
    out.putalpha(alpha_img)
    return out


def cut_circle(img, spec):
    w, h = img.size
    scale = 4
    mask = Image.new("L", (w * scale, h * scale), 0)
    ImageDraw.Draw(mask).ellipse((2, 2, w * scale - 3, h * scale - 3), fill=255)
    mask = mask.resize((w, h), Image.LANCZOS)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def trim_and_scale(im, max_side):
    bbox = im.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
    if bbox:
        x0, y0, x1, y1 = bbox
        pad = 2
        im = im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))
    longest = max(im.size)
    if longest > max_side:
        f = max_side / longest
        im = im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)
    return im


def contact_sheet(paths):
    cells = []
    for p in paths:
        im = Image.open(p)
        im.thumbnail((220, 220))
        cells.append((os.path.basename(p), im))
    cols = 5
    cw, chh = 240, 260
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cw, rows * chh), (40, 40, 40))
    tile = 12
    d = ImageDraw.Draw(sheet)
    for y in range(0, sheet.height, tile):
        for x in range(0, sheet.width, tile):
            if (x // tile + y // tile) % 2:
                d.rectangle((x, y, x + tile - 1, y + tile - 1), fill=(70, 70, 70))
    for i, (name, im) in enumerate(cells):
        cx, cy = (i % cols) * cw, (i // cols) * chh
        sheet.paste(im, (cx + (cw - im.width) // 2, cy + 10 + (220 - im.height) // 2), im)
        d.text((cx + 6, cy + chh - 22), name, fill=(255, 255, 0))
    return sheet


def main(only):
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(SHEET_OUT, exist_ok=True)
    cache = {}
    written = []
    for spec in SPRITES:
        if only and spec["name"] not in only:
            continue
        src_name = SOURCES[spec["src"]]
        src_path = os.path.join(ART, src_name)
        if not os.path.exists(src_path):
            print(f"skip {spec['name']}: missing art/{src_name}")
            continue
        if src_path not in cache:
            cache[src_path] = Image.open(src_path).convert("RGB")
        crop = cache[src_path].crop(spec["box"])
        mode = spec.get("mode", "flood")
        if mode == "circle":
            out = cut_circle(crop, spec)
        elif mode == "rect":
            out = crop.convert("RGBA")
        else:
            out = cut_flood(crop, spec)
        out = trim_and_scale(out, spec.get("max", 256))
        path = os.path.join(OUT, spec["name"] + ".png")
        out.save(path, optimize=True)
        written.append(path)
        print(f"{spec['name']:>18}  {out.width}x{out.height}")
    all_pngs = sorted(os.path.join(OUT, f) for f in os.listdir(OUT) if f.endswith(".png"))
    contact_sheet(all_pngs).save(os.path.join(SHEET_OUT, "contact_sheet.png"))
    print(f"wrote {len(written)} sprites; contact sheet in tools/out/contact_sheet.png")


if __name__ == "__main__":
    main(set(sys.argv[1:]))
