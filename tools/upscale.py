"""4x AI upscaler for sprite cut-outs, used by tools/extract_sprites.py.

The art sheets are only ~1500-2000 px, so most sprites are 100-500 px: too
small to stay sharp on 3x phone screens (YouTube Playables requirement 3.1:
"render all text and graphics clearly"). This runs Real-ESRGAN's anime model
(RealESRGAN_x4plus_anime_6B, BSD-3-Clause, https://github.com/xinntao/Real-ESRGAN)
on the CPU to add real detail instead of just blurring pixels up.

Needs PyTorch (CPU build is enough):
    pip install torch --index-url https://download.pytorch.org/whl/cpu
The weights (18 MB) are downloaded on first use into tools/out/models/ and
checked against their published SHA-256. Set ESRGAN_WEIGHTS to use a copy you
already have.
"""
import hashlib
import os
import urllib.request

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEIGHTS_URL = "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.2.4/RealESRGAN_x4plus_anime_6B.pth"
WEIGHTS_SHA256 = "f872d837d3c90ed2e05227bed711af5671a6fd1c9f7d7e91c911a61f155e99da"
CACHE = os.path.join(ROOT, "tools", "out", "models", "RealESRGAN_x4plus_anime_6B.pth")
SCALE = 4


# ---- Network (RRDBNet, the ESRGAN generator) -------------------------------------

class DenseBlock(nn.Module):
    def __init__(self, feat=64, grow=32):
        super().__init__()
        self.conv1 = nn.Conv2d(feat, grow, 3, 1, 1)
        self.conv2 = nn.Conv2d(feat + grow, grow, 3, 1, 1)
        self.conv3 = nn.Conv2d(feat + 2 * grow, grow, 3, 1, 1)
        self.conv4 = nn.Conv2d(feat + 3 * grow, grow, 3, 1, 1)
        self.conv5 = nn.Conv2d(feat + 4 * grow, feat, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        x5 = self.conv5(torch.cat((x, x1, x2, x3, x4), 1))
        return x5 * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, feat=64, grow=32):
        super().__init__()
        self.rdb1 = DenseBlock(feat, grow)
        self.rdb2 = DenseBlock(feat, grow)
        self.rdb3 = DenseBlock(feat, grow)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    def __init__(self, blocks=6, feat=64, grow=32):
        super().__init__()
        self.conv_first = nn.Conv2d(3, feat, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(feat, grow) for _ in range(blocks)])
        self.conv_body = nn.Conv2d(feat, feat, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(feat, feat, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(feat, feat, 3, 1, 1)
        self.conv_hr = nn.Conv2d(feat, feat, 3, 1, 1)
        self.conv_last = nn.Conv2d(feat, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, inplace=True)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode="nearest")))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode="nearest")))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


# ---- Weights --------------------------------------------------------------------------

def weights_path():
    path = os.environ.get("ESRGAN_WEIGHTS") or CACHE
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        print("downloading Real-ESRGAN anime weights (18 MB)...")
        urllib.request.urlretrieve(WEIGHTS_URL, path + ".part")
        os.replace(path + ".part", path)
    digest = hashlib.sha256(open(path, "rb").read()).hexdigest()
    if digest != WEIGHTS_SHA256:
        raise RuntimeError("%s has SHA-256 %s, expected %s" % (path, digest, WEIGHTS_SHA256))
    return path


_net = None


def net():
    global _net
    if _net is None:
        torch.set_num_threads(max(1, os.cpu_count() or 1))
        state = torch.load(weights_path(), map_location="cpu", weights_only=True)
        model = RRDBNet()
        model.load_state_dict(state.get("params_ema", state), strict=True)
        _net = model.eval()
    return _net


# ---- Upscaling ------------------------------------------------------------------------

def upscale_rgb(arr, tile=160, pad=12):
    """uint8 HxWx3 -> uint8 (4H)x(4W)x3, processed in overlapping tiles."""
    h, w, _ = arr.shape
    x = torch.from_numpy(arr.astype(np.float32) / 255.0).permute(2, 0, 1)[None]
    out = torch.zeros((1, 3, h * SCALE, w * SCALE))
    model = net()
    with torch.no_grad():
        for y0 in range(0, h, tile):
            for x0 in range(0, w, tile):
                y1, x1 = min(h, y0 + tile), min(w, x0 + tile)
                py0, px0 = max(0, y0 - pad), max(0, x0 - pad)
                py1, px1 = min(h, y1 + pad), min(w, x1 + pad)
                res = model(x[:, :, py0:py1, px0:px1])
                oy, ox = (y0 - py0) * SCALE, (x0 - px0) * SCALE
                out[:, :, y0 * SCALE:y1 * SCALE, x0 * SCALE:x1 * SCALE] = \
                    res[:, :, oy:oy + (y1 - y0) * SCALE, ox:ox + (x1 - x0) * SCALE]
    return (out[0].clamp(0, 1).permute(1, 2, 0).numpy() * 255.0 + 0.5).astype(np.uint8)


def upscale_rgba(img):
    """4x a PIL RGBA image. Colour and the cut-out mask both go through the
    model, so outlines stay crisp instead of getting a soft halo."""
    img = img.convert("RGBA")
    rgb = upscale_rgb(np.asarray(img.convert("RGB")))
    alpha = np.asarray(img.getchannel("A"))
    a = upscale_rgb(np.repeat(alpha[:, :, None], 3, axis=2)).mean(axis=2)
    out = Image.fromarray(rgb, "RGB").convert("RGBA")
    out.putalpha(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "L"))
    return out
