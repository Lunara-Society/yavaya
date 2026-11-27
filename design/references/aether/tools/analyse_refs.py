#!/usr/bin/env python3
"""Measure the owner's visual references (GIF/PNG) for the Aether x Anima programme.

Usage:
    python3 -I analyse_refs.py <out_dir> <ref files...>

Writes <out_dir>/metrics.json and, per reference, <out_dir>/<name>-sheet.jpg
(a contact sheet of evenly spaced frames with frame number and time).

What it measures, per reference:
  - identity: SHA-256, bytes, pixel size, frame count, duration, mean fps, loop flag
  - colour: share of lit pixels by hue family (gold, white/silver, green, blue,
    violet...), dark-background share, and the measured gold values (hex)
  - motion: mean frame-to-frame change, its peaks in time, how seamless the loop is
  - photosensitivity (heuristic, not a certified test): general flashes per
    second, using the WCAG 2.3.1 definition (opposing relative-luminance
    changes of at least 0.1, darker image below 0.8) applied to the share of
    the frame that changes together (at least 25%)

The references are illustrative design material. Nothing measured here is
product data.
"""
import colorsys
import hashlib
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageSequence


def srgb_to_linear(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def rel_luminance(rgb):
    lin = srgb_to_linear(rgb.astype(np.float64))
    return 0.2126 * lin[..., 0] + 0.7152 * lin[..., 1] + 0.0722 * lin[..., 2]


def frames_of(path):
    im = Image.open(path)
    frames, durations = [], []
    for fr in ImageSequence.Iterator(im):
        frames.append(fr.convert("RGB"))
        durations.append(fr.info.get("duration", im.info.get("duration", 0)) or 0)
    loop = im.info.get("loop")
    return frames, durations, loop


HUE_FAMILIES = [
    # name, hue range in degrees (inclusive start, exclusive end)
    ("red", (345, 360)), ("red", (0, 18)), ("gold_amber", (18, 58)),
    ("yellow_green", (58, 75)), ("green_teal", (75, 190)), ("blue", (190, 250)),
    ("violet_purple", (250, 330)), ("magenta", (330, 345)),
]


def colour_shares(rgb_frames, sample_every=2):
    """Classify lit pixels (value >= 0.25) of every other frame by hue family."""
    counts = {}
    gold_hi, gold_body = [], []
    total = lit_total = dark = 0
    for fr in rgb_frames[::sample_every]:
        a = np.asarray(fr.resize((fr.width // 2, fr.height // 2)), dtype=np.float64) / 255.0
        flat = a.reshape(-1, 3)
        mx = flat.max(1)
        mn = flat.min(1)
        v = mx
        s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-9), 0)
        total += len(flat)
        dark += int((v < 0.10).sum())
        lit = v >= 0.25
        lit_total += int(lit.sum())
        # hue in degrees
        r, g, b = flat[:, 0], flat[:, 1], flat[:, 2]
        d = np.maximum(mx - mn, 1e-9)
        h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60.0
        neutral = lit & (s < 0.18)
        counts["white_silver"] = counts.get("white_silver", 0) + int((neutral & (v >= 0.6)).sum())
        counts["grey"] = counts.get("grey", 0) + int((neutral & (v < 0.6)).sum())
        chroma = lit & (s >= 0.18)
        for name, (lo, hi) in HUE_FAMILIES:
            m = chroma & (h >= lo) & (h < hi)
            counts[name] = counts.get(name, 0) + int(m.sum())
            if name == "gold_amber":
                gm = m & (s >= 0.35)
                gold_hi.append(flat[gm & (v >= 0.75)])
                gold_body.append(flat[gm & (v >= 0.4) & (v < 0.75)])
    shares = {k: round(100.0 * c / max(lit_total, 1), 1) for k, c in sorted(counts.items(), key=lambda kv: -kv[1])}

    def med_hex(chunks):
        arr = np.concatenate([c for c in chunks if len(c)]) if any(len(c) for c in chunks) else np.zeros((0, 3))
        if len(arr) < 50:
            return None
        m = np.median(arr, axis=0) * 255.0
        return "#%02X%02X%02X" % tuple(int(round(x)) for x in m)

    return {
        "lit_share_pct": round(100.0 * lit_total / max(total, 1), 1),
        "dark_background_pct": round(100.0 * dark / max(total, 1), 1),
        "lit_pixels_by_family_pct": shares,
        "gold_highlight_hex": med_hex(gold_hi),
        "gold_body_hex": med_hex(gold_body),
    }


def motion_and_flash(rgb_frames, durations):
    small = [np.asarray(f.resize((max(1, f.width // 2), max(1, f.height // 2))), dtype=np.float64) for f in rgb_frames]
    lum = [rel_luminance(s) for s in small]
    n = len(small)
    if n < 2:
        return {"animated": False}
    diffs = [float(np.abs(small[i + 1] - small[i]).mean()) for i in range(n - 1)]
    loop_gap = float(np.abs(small[0] - small[-1]).mean())
    t = np.cumsum([0] + [d / 1000.0 for d in durations[:-1]])
    # Flash transitions: >= 25% of the frame moves the same way by >= 0.1 luminance,
    # with the darker state below 0.8.
    events = []  # (time, +1 up / -1 down)
    for i in range(n - 1):
        a, b = lum[i], lum[i + 1]
        delta = b - a
        darker_ok = np.minimum(a, b) < 0.8
        up = ((delta >= 0.1) & darker_ok).mean()
        down = ((delta <= -0.1) & darker_ok).mean()
        if up >= 0.25:
            events.append((float(t[i + 1]), 1))
        elif down >= 0.25:
            events.append((float(t[i + 1]), -1))
    # A flash is a pair of opposing transitions; count pairs in any 1 s window.
    max_flashes = 0.0
    for i, (ti, _) in enumerate(events):
        window = [e for e in events if ti <= e[0] < ti + 1.0]
        opposing = sum(1 for j in range(1, len(window)) if window[j][1] != window[j - 1][1])
        max_flashes = max(max_flashes, (opposing + 1) / 2.0 if window else 0)
    mean_lum = [round(float(l.mean()), 4) for l in lum]
    d = np.array(diffs)
    peaks = [round(float(t[i + 1]), 2) for i in range(len(d)) if d[i] >= max(d.mean() + 1.5 * d.std(), 1e-9)]
    return {
        "animated": True,
        "mean_change_per_frame": round(float(d.mean()), 2),
        "max_change_per_frame": round(float(d.max()), 2),
        "change_peaks_s": peaks[:12],
        "loop_seam_ratio": round(loop_gap / max(float(d.mean()), 1e-9), 2),
        "mean_rel_luminance_min_max": [round(min(mean_lum), 4), round(max(mean_lum), 4)],
        "flash_transitions": len(events),
        "max_general_flashes_per_s": max_flashes,
        "wcag_2_3_1_heuristic": "pass" if max_flashes <= 3 else "FAIL",
    }


def contact_sheet(frames, durations, out_path, cols=4, rows=3, thumb_w=256):
    n = len(frames)
    k = min(cols * rows, n)
    idx = sorted(set(int(round(i * (n - 1) / max(k - 1, 1))) for i in range(k))) if n > 1 else [0]
    t = np.cumsum([0] + [d / 1000.0 for d in durations[:-1]]) if n > 1 else [0.0]
    w0, h0 = frames[0].size
    th = int(round(thumb_w * h0 / w0))
    label_h = 18
    rows_needed = (len(idx) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * thumb_w, rows_needed * (th + label_h)), (20, 20, 20))
    draw = ImageDraw.Draw(sheet)
    for j, i in enumerate(idx):
        x, y = (j % cols) * thumb_w, (j // cols) * (th + label_h)
        sheet.paste(frames[i].resize((thumb_w, th)), (x, y + label_h))
        draw.text((x + 4, y + 3), "f%d  t=%.2fs" % (i, float(t[i])), fill=(240, 220, 160))
    sheet.save(out_path, quality=85)
    return idx


def main():
    out_dir = sys.argv[1]
    os.makedirs(out_dir, exist_ok=True)
    results = []
    for path in sys.argv[2:]:
        name = os.path.splitext(os.path.basename(path))[0]
        with open(path, "rb") as fh:
            data = fh.read()
        frames, durations, loop = frames_of(path)
        total_ms = sum(durations)
        rec = {
            "ref": name.split("-")[0],
            "owner_file": "-".join(name.split("-")[1:]) + os.path.splitext(path)[1],
            "sha256": hashlib.sha256(data).hexdigest(),
            "bytes": len(data),
            "size_px": list(frames[0].size),
            "frames": len(frames),
            "duration_s": round(total_ms / 1000.0, 2) if len(frames) > 1 else 0,
            "mean_fps": round(len(frames) / (total_ms / 1000.0), 1) if total_ms else None,
            "frame_ms_min_max": [min(durations), max(durations)] if len(frames) > 1 else None,
            "loop_flag": loop,
        }
        rec["colour"] = colour_shares(frames)
        rec["motion"] = motion_and_flash(frames, durations)
        rec["sheet_frames"] = contact_sheet(frames, durations, os.path.join(out_dir, name.split("-")[0] + "-sheet.jpg"))
        results.append(rec)
        print(rec["ref"], rec["size_px"], rec["frames"], "frames", rec["duration_s"], "s", file=sys.stderr)
    with open(os.path.join(out_dir, "metrics.json"), "w") as fh:
        json.dump(results, fh, indent=1)


if __name__ == "__main__":
    main()
