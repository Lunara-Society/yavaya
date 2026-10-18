import json, sys, cv2, numpy as np
from crops import path_of, CW
plans = json.load(open("crops_auto.json"))
try: plans.update(json.load(open("crops_fix.json")))
except FileNotFoundError: pass
items = sorted(plans.items())
TW, TH = 384, 216
per = 30
for sheet in range(0, len(items), per):
    tiles = []
    for src, p in items[sheet:sheet + per]:
        im = cv2.resize(cv2.imread(path_of(src)), (TW, TH))
        k = TW / 2048
        for x, col in ((p["x0"], (0, 255, 0)), (p["x1"], (0, 0, 255))):
            cv2.rectangle(im, (int((x - CW / 2) * k), 1), (int((x + CW / 2) * k), TH - 2), col, 2)
        cv2.rectangle(im, (0, 0), (TW, 20), (0, 0, 0), -1)
        cv2.putText(im, f"{src} {p['why']}", (4, 15), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
        tiles.append(im)
    while len(tiles) % 5: tiles.append(np.zeros((TH, TW, 3), np.uint8))
    rows = [np.hstack(tiles[i:i + 5]) for i in range(0, len(tiles), 5)]
    cv2.imwrite(f"qa/crops_{sheet // per}.jpg", np.vstack(rows), [cv2.IMWRITE_JPEG_QUALITY, 78])
print("sheets", (len(items) + per - 1) // per)
