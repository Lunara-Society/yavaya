# Mirador's end card

`public/mirador/endcard.mp4` (720×1280, 2.6 s, silent) closes every video
Yavaya builds from a member's photos (`src/server/domains/mirador/process.ts`).

Made on 20 November 2026 with the owner's tools:

1. **Blender 4.5** — `emblem.py` renders the gold lookout ring and volcano
   turning into place on Mirador's obsidian (Cycles, CPU, 45 frames at 30 fps):
   `blender -b -P emblem.py`, then `ffmpeg -framerate 30 -i frames/f_%04d.png -c:v libx264 -pix_fmt yuv420p emblem.mp4`
   and the last frame held 1.2 s (`tpad=stop_mode=clone:stop_duration=1.2`).
2. **HyperFrames** — `composition.html` sets the emblem over obsidian with
   "Mirador", "Desde aquí se ve todo" and YAVAYA.LAT in the site's own faces
   (`public/fonts`): `npx hyperframes init card --example blank --resolution portrait`,
   replace its `index.html` with `composition.html`, copy `emblem.mp4` and the
   two fonts beside it, `npx hyperframes render --output endcard-1080.mp4`.
3. **ffmpeg** — `-vf scale=720:1280,fps=30,format=yuv420p -c:v libx264 -crf 22 -an -movflags +faststart`.

The line is Spanish on purpose: it is the brand's tagline, the same in
every language, like the name.
