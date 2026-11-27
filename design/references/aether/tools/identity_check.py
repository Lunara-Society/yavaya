#!/usr/bin/env python3
"""Face identity check: how close is each reference's face to Roxi's source image?

Usage:
    python3 identity_check.py <models_dir> <source_image> <out_dir> <ref files...>

Needs OpenCV (opencv-python-headless) and two models from the OpenCV model zoo,
kept outside the repository:
    face_detection_yunet_2023mar.onnx   (YuNet face detector)
    face_recognition_sface_2021dec.onnx (SFace face recognizer)
Both from https://huggingface.co/opencv (face_detection_yunet, face_recognition_sface).

For every frame of every reference it finds faces, aligns them, and compares
each with the source face by cosine similarity of SFace features. OpenCV
gives 0.363 as SFace's same-person threshold for cosine similarity; the score is
a measurement to support a human judgement, not a verdict on its own.

Faces narrower than MIN_FACE_PX are reported but not scored: below that size
the aligned 112 x 112 crop is mostly upsampling and the score means little.

Writes <out_dir>/identity.json and <out_dir>/faces-sheet.jpg (each scored face
beside its score; the source face first).
"""
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageSequence

MIN_FACE_PX = 60
DETECT_SCORE = 0.7
SAME_PERSON_COSINE = 0.363  # OpenCV's published SFace threshold


def frames_bgr(path):
    im = Image.open(path)
    out = []
    for fr in ImageSequence.Iterator(im):
        rgb = np.asarray(fr.convert("RGB"))
        out.append(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    return out


def detect(detector, img):
    h, w = img.shape[:2]
    detector.setInputSize((w, h))
    _, faces = detector.detect(img)
    return [] if faces is None else faces


def main():
    models, source, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    refs = sys.argv[4:]
    os.makedirs(out_dir, exist_ok=True)
    detector = cv2.FaceDetectorYN.create(
        os.path.join(models, "face_detection_yunet_2023mar.onnx"), "", (320, 320), DETECT_SCORE, 0.3, 5000)
    recognizer = cv2.FaceRecognizerSF.create(os.path.join(models, "face_recognition_sface_2021dec.onnx"), "")

    src = frames_bgr(source)[0]
    src_faces = detect(detector, src)
    if not len(src_faces):
        sys.exit("no face found in the source image")
    best = max(src_faces, key=lambda f: f[-1])
    src_crop = recognizer.alignCrop(src, best)
    src_feat = recognizer.feature(src_crop)
    crops = [("source", src_crop, 1.0)]

    results = []
    for path in refs:
        name = os.path.splitext(os.path.basename(path))[0]
        rec = {"ref": name.split("-")[0], "file": os.path.basename(path), "frames": 0, "faces_scored": 0,
               "faces_too_small": 0, "scores": []}
        best_crop = None
        best_score = -1.0
        feats = []
        for i, img in enumerate(frames_bgr(path)):
            rec["frames"] += 1
            for face in detect(detector, img):
                width = float(face[2])
                if width < MIN_FACE_PX:
                    rec["faces_too_small"] += 1
                    continue
                crop = recognizer.alignCrop(img, face)
                feat = recognizer.feature(crop)
                score = float(recognizer.match(src_feat, feat, cv2.FaceRecognizerSF_FR_COSINE))
                rec["scores"].append({"frame": i, "face_px": round(width), "cosine": round(score, 3)})
                rec["faces_scored"] += 1
                feats.append(feat.flatten() / (np.linalg.norm(feat) + 1e-9))
                if score > best_score:
                    best_score, best_crop = score, crop
        if rec["scores"]:
            s = np.array([x["cosine"] for x in rec["scores"]])
            rec["cosine_median"] = round(float(np.median(s)), 3)
            rec["cosine_min"] = round(float(s.min()), 3)
            rec["cosine_max"] = round(float(s.max()), 3)
            rec["same_person_share"] = round(float((s >= SAME_PERSON_COSINE).mean()), 2)
            rec["_mean_feat"] = np.mean(feats, axis=0)
            crops.append((rec["ref"], best_crop, rec["cosine_median"]))
        results.append(rec)

    # Pairwise similarity between the references' average faces
    scored = [r for r in results if "_mean_feat" in r]
    pairs = {}
    for a in scored:
        for b in scored:
            if a["ref"] < b["ref"]:
                va = a["_mean_feat"] / np.linalg.norm(a["_mean_feat"])
                vb = b["_mean_feat"] / np.linalg.norm(b["_mean_feat"])
                pairs[f'{a["ref"]}-{b["ref"]}'] = round(float(va @ vb), 3)
    for r in results:
        r.pop("_mean_feat", None)

    with open(os.path.join(out_dir, "identity.json"), "w") as fh:
        json.dump({"threshold_same_person_cosine": SAME_PERSON_COSINE, "min_face_px": MIN_FACE_PX,
                   "source": os.path.basename(source), "references": results, "pairwise_mean_faces": pairs},
                  fh, indent=1)

    # Sheet of the best aligned face per reference with its median score
    cell = 140
    cols = 7
    rows = (len(crops) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * (cell + 20)), (10, 10, 10))
    draw = ImageDraw.Draw(sheet)
    for k, (label, crop, score) in enumerate(crops):
        x, y = (k % cols) * cell, (k // cols) * (cell + 20)
        face = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)).resize((cell - 8, cell - 8))
        sheet.paste(face, (x + 4, y + 4))
        text = label if label == "source" else f"{label}  {score:.2f}"
        draw.text((x + 6, y + cell - 2), text, fill=(240, 220, 160))
    sheet.save(os.path.join(out_dir, "faces-sheet.jpg"), quality=88)


if __name__ == "__main__":
    main()
