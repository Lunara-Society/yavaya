#!/usr/bin/env python3
"""
Roxi's pictures for the app (docs/synapse/ASSET_REGISTRY.md).

From the approved full-length image (mobile/art/roxi/roxi-source.png, the
owner's, AI-generated, 26 November 2026) this writes:

  assets/roxi/roxi.webp        the figure the app reconstructs, 720 wide, on black
  assets/roxi/roxi-depth.webp  how near each part of her is (white near, black far),
                               which drives the order she materialises in and the
                               parallax when the phone tilts
  assets/roxi/roxi-face.webp   her face, square, for the Presence dock
  art/roxi/roxi-matte.png      a soft cut-out mask at full size, for Blender

The depth is estimated, not measured: Depth Anything V2 Small (Apache-2.0),
run on this machine from an ONNX file. Nothing is sent anywhere.

    curl -L -o model.onnx \
      https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx
    python3 -I mobile/tools/roxi/make-roxi.py model.onnx mobile
"""
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter

# What the model was trained on (its preprocessor_config.json).
SHORT_SIDE = 518
PATCH = 14
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

FIGURE_WIDTH = 720      # enough for a phone's full height at 2.6x density without visible softness
DEPTH_WIDTH = 240       # a depth map is smooth; the shader samples it with filtering
FACE_SIZE = 320
# Her face in the source image (1440 x 3088): measured from the skin pixels above the shoulders.
FACE_BOX = (550, 110, 910, 470)
# The background of the source is pure black; anything this dark and this far is background.
BACKGROUND_LUMA = 6


def estimate(session: ort.InferenceSession, picture: Image.Image) -> np.ndarray:
    """Relative inverse depth, larger meaning nearer, at the model's own size."""
    w, h = picture.size
    scale = SHORT_SIDE / min(w, h)
    tw = max(PATCH, round(w * scale / PATCH) * PATCH)
    th = max(PATCH, round(h * scale / PATCH) * PATCH)
    resized = picture.convert("RGB").resize((tw, th), Image.BICUBIC)
    pixels = (np.asarray(resized, dtype=np.float32) / 255.0 - MEAN) / STD
    (depth,) = session.run(None, {session.get_inputs()[0].name: pixels.transpose(2, 0, 1)[None]})
    return depth[0]


def unit(values: np.ndarray, lo_pct: float = 1.0, hi_pct: float = 99.0) -> np.ndarray:
    lo, hi = np.percentile(values, [lo_pct, hi_pct])
    return np.clip((values - lo) / max(hi - lo, 1e-6), 0.0, 1.0)


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    model, root = Path(sys.argv[1]), Path(sys.argv[2])
    source = Image.open(root / "art/roxi/roxi-source.png").convert("RGB")
    w, h = source.size
    out = root / "assets/roxi"
    out.mkdir(parents=True, exist_ok=True)

    session = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
    depth = unit(estimate(session, source))
    depth_full = np.asarray(
        Image.fromarray((depth * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), dtype=np.float32
    ) / 255.0

    # The matte: she is wherever the picture is not black, plus the near pixels the
    # model sees as her even where her black hair meets the black background.
    luma = np.asarray(source.convert("L"), dtype=np.float32)
    lit = np.clip((luma - BACKGROUND_LUMA) / 24.0, 0.0, 1.0)
    near = np.clip((depth_full - 0.18) / 0.22, 0.0, 1.0)
    matte = np.maximum(lit, near * (luma > 1.5))
    matte_img = Image.fromarray((matte * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    matte_img.save(root / "art/roxi/roxi-matte.png", optimize=True)

    # Depth for the app: background pinned to black, so it never moves or materialises.
    app_depth = depth_full * np.asarray(matte_img, dtype=np.float32) / 255.0
    dh = round(DEPTH_WIDTH * h / w)
    depth_img = Image.fromarray((app_depth * 255).astype(np.uint8)).resize((DEPTH_WIDTH, dh), Image.LANCZOS)
    depth_img.filter(ImageFilter.GaussianBlur(1.0)).save(out / "roxi-depth.webp", "WEBP", quality=80, method=6)

    fh = round(FIGURE_WIDTH * h / w)
    source.resize((FIGURE_WIDTH, fh), Image.LANCZOS).save(out / "roxi.webp", "WEBP", quality=86, method=6)
    source.crop(FACE_BOX).resize((FACE_SIZE, FACE_SIZE), Image.LANCZOS).save(
        out / "roxi-face.webp", "WEBP", quality=88, method=6
    )

    for name in ("roxi.webp", "roxi-depth.webp", "roxi-face.webp"):
        target = out / name
        with Image.open(target) as im:
            print(f"{name}: {im.size[0]}x{im.size[1]}, {target.stat().st_size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
