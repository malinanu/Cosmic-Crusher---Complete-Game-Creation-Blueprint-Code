#!/usr/bin/env python3
"""Write the app icon and launch screen into the Android and iOS projects.

    python3 tools/install_app_art.py

Reads the masters in mobile/resources/ (made by tools/make_store_art.js, or
replace them with your own art at the same sizes):
    icon.png             1024x1024, opaque
    icon-foreground.png  1024x1024, transparent; keep the art in the middle 61%
    splash.png           2732x2732, opaque; keep the art in the middle third
"""
import os

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "mobile", "resources")
ANDROID = os.path.join(ROOT, "mobile", "android", "app", "src", "main", "res")
IOS = os.path.join(ROOT, "mobile", "ios", "App", "App", "Assets.xcassets")
ICON_BACKGROUND = "#0B1233"

DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
SPLASH_PORT = {"mdpi": (320, 480), "hdpi": (480, 800), "xhdpi": (720, 1280), "xxhdpi": (960, 1600), "xxxhdpi": (1280, 1920)}


def cover(im, w, h):
    """Scale to fill w x h, cropping the overflow from the centre."""
    s = max(w / im.width, h / im.height)
    r = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (r.width - w) // 2, (r.height - h) // 2
    return r.crop((x, y, x + w, y + h))


def save(im, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, optimize=True)
    print("wrote " + os.path.relpath(path, ROOT))


def main():
    icon = Image.open(os.path.join(RES, "icon.png")).convert("RGB")
    fg = Image.open(os.path.join(RES, "icon-foreground.png")).convert("RGBA")
    splash = Image.open(os.path.join(RES, "splash.png")).convert("RGB")

    for name, k in DENSITIES.items():
        folder = os.path.join(ANDROID, "mipmap-" + name)
        size = round(48 * k)
        save(icon.resize((size, size), Image.LANCZOS), os.path.join(folder, "ic_launcher.png"))
        round_icon = icon.resize((size, size), Image.LANCZOS).convert("RGBA")
        mask = Image.new("L", (size * 4, size * 4), 0)
        ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
        round_icon.putalpha(mask.resize((size, size), Image.LANCZOS))
        save(round_icon, os.path.join(folder, "ic_launcher_round.png"))
        fsize = round(108 * k)
        save(fg.resize((fsize, fsize), Image.LANCZOS), os.path.join(folder, "ic_launcher_foreground.png"))

        pw, ph = SPLASH_PORT[name]
        save(cover(splash, pw, ph), os.path.join(ANDROID, "drawable-port-" + name, "splash.png"))
        save(cover(splash, ph, pw), os.path.join(ANDROID, "drawable-land-" + name, "splash.png"))
    save(cover(splash, 480, 320), os.path.join(ANDROID, "drawable", "splash.png"))

    colors = os.path.join(ANDROID, "values", "ic_launcher_background.xml")
    with open(colors, "w") as f:
        f.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
                '    <color name="ic_launcher_background">%s</color>\n</resources>\n' % ICON_BACKGROUND)
    print("wrote " + os.path.relpath(colors, ROOT))

    # iOS: the App Store wants an opaque 1024 icon with no alpha channel.
    save(icon.resize((1024, 1024), Image.LANCZOS), os.path.join(IOS, "AppIcon.appiconset", "AppIcon-512@2x.png"))
    for suffix in ("", "-1", "-2"):
        save(splash, os.path.join(IOS, "Splash.imageset", "splash-2732x2732%s.png" % suffix))


if __name__ == "__main__":
    main()
