#!/usr/bin/env python3
"""
Depth maps for the home page's district cards (the "Distritos en 3D" look).

Each card photograph gets a small greyscale picture of how far away each part
of it is (white near, black far). The browser uses it to shift the near parts
of the photograph more than the far ones as the card tilts, which is what
makes the scene look like a place rather than a picture
(platform/src/ui/depth/photo.ts).

The depth is estimated, not measured: Depth Anything V2 Small (Apache-2.0),
run here, on this machine, from an ONNX file. Nothing is sent anywhere.

    python3 -m venv venv && venv/bin/pip install onnxruntime pillow numpy
    curl -L -o model.onnx \
      https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx
    venv/bin/python -I tools/depth/make-depth.py model.onnx platform/public/art

Writes platform/public/art/depth/home-card-<district>.webp, one per card, and
prints what each weighs. Run it again after replacing a card photograph.
"""
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageFilter

# The thirteen cards, in the order the home page shows them.
CARDS = [
    "mercadito", "services", "work", "yavayago", "community", "sanctuary", "animals",
    "hogar", "movilidad", "salud", "aprender", "negocios", "campo",
]
# What the model was trained on (its preprocessor_config.json).
SHORT_SIDE = 518
PATCH = 14
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)
# A depth map is smooth: 256 wide holds everything the shift can show.
OUT_WIDTH = 256


def estimate(session: ort.InferenceSession, picture: Image.Image) -> np.ndarray:
    """Relative inverse depth for one picture, larger meaning nearer, at the model's own size."""
    w, h = picture.size
    scale = SHORT_SIDE / min(w, h)
    tw = max(PATCH, round(w * scale / PATCH) * PATCH)
    th = max(PATCH, round(h * scale / PATCH) * PATCH)
    resized = picture.convert("RGB").resize((tw, th), Image.BICUBIC)
    pixels = (np.asarray(resized, dtype=np.float32) / 255.0 - MEAN) / STD
    tensor = pixels.transpose(2, 0, 1)[None]
    (depth,) = session.run(None, {session.get_inputs()[0].name: tensor})
    return depth[0]


def to_map(depth: np.ndarray, size: tuple[int, int]) -> Image.Image:
    """Stretch to the full grey range, ignoring the odd extreme pixel, and soften the edges between near and far."""
    lo, hi = np.percentile(depth, [1.0, 99.0])
    unit = np.clip((depth - lo) / max(hi - lo, 1e-6), 0.0, 1.0)
    grey = Image.fromarray((unit * 255.0 + 0.5).astype(np.uint8), mode="L")
    w, h = size
    out = grey.resize((OUT_WIDTH, max(1, round(OUT_WIDTH * h / w))), Image.LANCZOS)
    # A hard edge in the map tears the photograph where near meets far; a soft one bends it.
    return out.filter(ImageFilter.GaussianBlur(1.6))


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    model, art = Path(sys.argv[1]), Path(sys.argv[2])
    out_dir = art / "depth"
    out_dir.mkdir(exist_ok=True)
    session = ort.InferenceSession(str(model), providers=["CPUExecutionProvider"])
    total = 0
    for card in CARDS:
        source = art / f"home-card-{card}-960.webp"
        with Image.open(source) as picture:
            depth = estimate(session, picture)
            result = to_map(depth, picture.size)
        target = out_dir / f"home-card-{card}.webp"
        result.save(target, "WEBP", quality=72, method=6)
        size = target.stat().st_size
        total += size
        print(f"{target.name}: {result.size[0]}x{result.size[1]}, {size / 1024:.1f} KB")
    print(f"total: {total / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
