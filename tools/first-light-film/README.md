# The First Light — master film

Twenty-four seconds that are the First Light page as a film: night lifts over
the volcanoes, the Guardian takes the light, the words arrive, the seven
doors rise one by one, the visitor goes through Mercadito's door, and the
name. It is the reference for the page's motion and a trailer for its
preview (`/first-light`, see `platform/docs/FIRST-LIGHT.md`), made from the
page's own pictures, words, timings and sounds — nothing in it is shown that
the page does not have.

It is a HyperFrames composition: one HTML page whose GSAP timeline is
registered as `window.__timelines.main`, seeked frame by frame and captured.

## Make it

```bash
./prepare.sh                                  # pictures and fonts from platform/public, GSAP 3.14.2 from npm
mkdir -p seg
node render.cjs 0 240 seg/a.mp4 &             # 30 fps, in three parts at once
node render.cjs 240 480 seg/b.mp4 &
node render.cjs 480 720 seg/c.mp4 & wait
node score.cjs                                # the sound, rendered offline → score.wav
printf "file 'a.mp4'\nfile 'b.mp4'\nfile 'c.mp4'\n" > seg/list.txt
ffmpeg -f concat -safe 0 -i seg/list.txt -c copy seg/video.mp4
ffmpeg -i seg/video.mp4 -i score.wav -filter:a volume=16dB -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 192k -movflags +faststart -shortest primera-luz.mp4
node stills.cjs 4,9.6,14.2,17.9,21.8          # stills for checking, into stills/
```

Needs Playwright with Chromium and ffmpeg. About two minutes on four cores.
The result is 1920×1080, 30 fps, H.264 and AAC, about 16 MB, −16 LUFS with
peaks near −4 dBFS (the score is rendered quietly and raised 16 dB here).

## The beats

| Seconds | What happens | Sound |
| --- | --- | --- |
| 0–3 | Night; the stars arrive | six far-off high notes |
| 1–5.5 | The night lifts, the sun rises behind the volcanoes | the pad (A) opens with the light |
| 3–6.2 | The Guardian takes the light | a low swell |
| 5–6.7 | Light passes through its feathers; the eye catches the sun | air, a high bell |
| 6.6 | The wings lift | the page's Guardian cue |
| 7.8–11 | "La Primera Luz", the title, the gold of "nos une.", the lead | a soft chime as the gold arrives |
| 11.6 | The hero lifts away | air |
| 12.4–15.1 | The seven doors rise, each lit as it arrives | the page's door cue, one note of the scale each (pad: D) |
| 16 | Mercadito is chosen; light runs round its arch | Mercadito's note again |
| 17.4–18.5 | Through the door: its picture grows from the arch to the frame | the page's transition cue (pad: E) |
| 19.4–21.3 | The Guardian, the name, "La Primera Luz", Roxi, yavaya.lat | a low swell, the pad home to A, Roxi's cue |
| 23–24 | Fade to black | fade |

## What keeps it honest

- The Guardian is the owner's approved artwork, in the same four layers and
  light maps as the page; it moves only about the pivots measured on it.
- Every word is the site's own copy (`home.hero.*`, `home.districts.*`,
  `home.card.*`, the header's tagline).
- The Mercadito and Comunidad doors show people, so they carry
  "Ilustración", in the row and when Mercadito fills the frame — the same
  rule as on the site.
- Roxi appears as she is: her name and "La asistente de Yavaya", no
  invented conversation, no claim about what she has done.
- The sound is the page's own synthesis (`platform/src/ui/first-light/sound.ts`)
  plus a pad made the same way; nothing is sampled or downloaded.

## Version 1 (6 November 2026)

Rendered in this folder's form; delivered to the owner as
`yavaya_primera_luz_master.mp4`.
