#!/usr/bin/env python3
"""
Reduces the medallions Blender rendered (medallions.py) to the size the home
page shows them at, and writes the WebP files it serves.

    venv/bin/python -I tools/depth/finish-medallions.py out/ platform/public/art/depth

A medallion is 46 to 80 CSS pixels across and most often about 60, so 160 is
sharp on a phone that packs three device pixels into one; 192 at a higher
quality was compared side by side at that size and could not be told apart,
at half as much again to download. Rendering larger and reducing here is what
keeps the thin gold lines free of stair-steps.
"""
import sys
from pathlib import Path

from PIL import Image

PUBLISHED = 160


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    rendered, published = Path(sys.argv[1]), Path(sys.argv[2])
    published.mkdir(parents=True, exist_ok=True)
    total = 0
    for source in sorted(rendered.glob("medal-*.png")):
        with Image.open(source) as picture:
            small = picture.convert("RGBA").resize((PUBLISHED, PUBLISHED), Image.LANCZOS)
        target = published / f"{source.stem}.webp"
        small.save(target, "WEBP", quality=76, alpha_quality=85, method=6)
        size = target.stat().st_size
        total += size
        print(f"{target.name}: {size / 1024:.1f} KB")
    print(f"total: {total / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
