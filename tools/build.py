#!/usr/bin/env python3
"""Build release bundles of the game.

    python3 tools/build.py youtube   # dist/youtube/ + dist/cosmic-crusher-youtube.zip
    python3 tools/build.py mobile    # dist/mobile/ (Capacitor's web folder)
    python3 tools/build.py all

Each bundle is the game with:
  * one concatenated js/game.js (readable, not minified or obfuscated)
  * only the sprites the game uses, converted to WebP
  * the bundled fonts and their licences
  * for YouTube, the Playables SDK <script> loaded before any game code

The YouTube Playables technical limits are checked on every build and the
build fails if one is broken: initial bundle < 30 MiB, files < 30 MiB,
<= 8000 files, safe file names, relative paths, and no external URLs.
"""
import json
import os
import re
import shutil
import sys
import zipfile

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")
SDK_URL = "https://www.youtube.com/game_api/v1"
# Strings that look like URLs but are never fetched.
URL_ALLOW = {"http://www.w3.org/2000/svg"}
NAME_RE = re.compile(r"^[A-Za-z0-9_.-]+$")
MiB = 1024 * 1024


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return f.read()


def version():
    try:
        return json.loads(read("mobile/package.json"))["version"]
    except (OSError, KeyError, ValueError):
        return "0.0.0"


def script_order(html):
    return re.findall(r'<script src="(js/[^"]+)"></script>', html)


def sprite_keys():
    """Sprite keys the game asks for (CC.assets KEYS) that exist as PNGs."""
    src = read("js/assets.js")
    block = re.search(r"var KEYS = \[(.*?)\];", src, re.S).group(1)
    keys = re.findall(r"'([a-z0-9_]+)'", block)
    sprite_dir = os.path.join(ROOT, "assets", "sprites")
    extra = [f[:-4] for f in os.listdir(sprite_dir) if f.startswith("weapon_") and f.endswith(".png")]
    return [k for k in keys + sorted(extra) if os.path.exists(os.path.join(sprite_dir, k + ".png"))]


def build(target):
    out = os.path.join(DIST, target)
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(os.path.join(out, "js"))
    os.makedirs(os.path.join(out, "css"))
    os.makedirs(os.path.join(out, "fonts"))
    os.makedirs(os.path.join(out, "assets", "sprites"))

    # Sprites -> WebP (alpha kept).
    keys = sprite_keys()
    for key in keys:
        im = Image.open(os.path.join(ROOT, "assets", "sprites", key + ".png")).convert("RGBA")
        im.save(os.path.join(out, "assets", "sprites", key + ".webp"), "WEBP", quality=88, method=6)

    # One script with a small build header.
    html = read("index.html")
    order = script_order(html)
    header = (
        "// Cosmic Crusher %s build %s. Source: the js/ folder of the repository.\n"
        "window.CC = window.CC || {};\n"
        "CC.BUILD = %s;\n"
        "CC.SPRITES = %s;\n"
        "CC.SPRITE_EXT = 'webp';\n"
    ) % (target, version(), json.dumps({"target": target, "dev": False, "version": version()}), json.dumps(keys))
    parts = [header]
    for path in order:
        parts.append("\n// ---- %s ----\n%s" % (path, read(path)))
    with open(os.path.join(out, "js", "game.js"), "w", encoding="utf-8") as f:
        f.write("".join(parts))

    # index.html: single script, WebP images, SDK first for YouTube.
    first = html.index('<script src="js/')
    last = html.index("</script>", html.rindex('<script src="js/')) + len("</script>")
    html = html[:first] + '<script src="js/game.js"></script>' + html[last:]
    html = re.sub(r'(assets/sprites/[a-z0-9_]+)\.png', r"\1.webp", html)
    if target == "youtube":
        charset = '<meta charset="UTF-8">\n'
        html = html.replace(charset, charset + '  <script src="%s"></script>\n' % SDK_URL, 1)
    with open(os.path.join(out, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)

    for name in ("fonts.css", "style.css"):
        shutil.copy(os.path.join(ROOT, "css", name), os.path.join(out, "css", name))
    for name in os.listdir(os.path.join(ROOT, "fonts")):
        shutil.copy(os.path.join(ROOT, "fonts", name), os.path.join(out, "fonts", name))

    problems, warnings = validate(out, target)
    report(out, target, problems, warnings)
    if problems:
        sys.exit(1)
    if target == "youtube":
        zip_path = os.path.join(DIST, "cosmic-crusher-youtube.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
            for path in walk(out):
                z.write(os.path.join(out, path), path)
        print("  zip: %s (%.0f KiB)" % (os.path.relpath(zip_path, ROOT), os.path.getsize(zip_path) / 1024))


def walk(out):
    files = []
    for base, _, names in os.walk(out):
        for n in names:
            files.append(os.path.relpath(os.path.join(base, n), out).replace(os.sep, "/"))
    return sorted(files)


def validate(out, target):
    problems, warnings = [], []
    files = walk(out)
    total = 0
    if "index.html" not in files:
        problems.append("index.html missing at the bundle root")
    if len(files) > 8000:
        problems.append("%d files (limit 8000)" % len(files))
    for path in files:
        size = os.path.getsize(os.path.join(out, path))
        total += size
        if size >= 30 * MiB:
            problems.append("%s is %.1f MiB (limit 30 MiB)" % (path, size / MiB))
        elif size > 512 * 1024:
            warnings.append("%s is %.0f KiB (YouTube recommends under 512 KiB)" % (path, size / 1024))
        for part in path.split("/"):
            if not NAME_RE.match(part):
                problems.append("file name not allowed: %s" % path)
        if path.endswith((".html", ".js", ".css")):
            text = open(os.path.join(out, path), encoding="utf-8").read()
            for url in re.findall(r"https?://[^\s\"'()<>]+", text):
                if url in URL_ALLOW or (target == "youtube" and url == SDK_URL):
                    continue
                problems.append("external URL in %s: %s" % (path, url))
            if re.search(r"""(?:src|href)=["']/|url\(["']?/""", text):
                problems.append("absolute path in %s" % path)
            if "navigator.language" in text:
                problems.append("%s reads navigator.language (use the SDK's getLanguage)" % path)
    if total >= 30 * MiB:
        problems.append("bundle is %.1f MiB (limit 30 MiB)" % (total / MiB))
    elif total >= 15 * MiB:
        warnings.append("bundle is %.1f MiB (YouTube recommends under 15 MiB)" % (total / MiB))
    if target == "youtube":
        html = open(os.path.join(out, "index.html"), encoding="utf-8").read()
        sdk = html.find(SDK_URL)
        game = html.find('src="js/game.js"')
        if sdk < 0 or sdk > game:
            problems.append("the Playables SDK must load before the game script")
    return problems, warnings


def report(out, target, problems, warnings):
    files = walk(out)
    total = sum(os.path.getsize(os.path.join(out, p)) for p in files)
    biggest = max(files, key=lambda p: os.path.getsize(os.path.join(out, p)))
    print("%s: %d files, %.0f KiB total, largest %s (%.0f KiB)" % (
        target, len(files), total / 1024, biggest, os.path.getsize(os.path.join(out, biggest)) / 1024))
    for w in warnings:
        print("  warning: " + w)
    for p in problems:
        print("  FAIL: " + p)
    if not problems:
        print("  YouTube Playables checks passed")


def main(args):
    targets = ["youtube", "mobile"] if not args or args == ["all"] else args
    for t in targets:
        if t not in ("youtube", "mobile"):
            sys.exit("unknown target %r (use youtube, mobile or all)" % t)
        build(t)


if __name__ == "__main__":
    main(sys.argv[1:])
