# The guide in video — production sources

Everything that made version 1 of the video guide (the films on every district
page and the full guide at `/guia`), except the heavy media. Kept so the guide
can be re-cut or re-shot without starting from a blank page.

## Version 1 (October 2026)

Spanish narration by Carito (ElevenLabs `eleven_v4`), one continuous score
(`eleven_music_v2_5`), stills generated 2048×1152 (`gpt-image-2.5`, two takes per
brief), real screen captures of the live site, cut together here with a sub-pixel
Ken Burns, dissolves, title cards and callouts. The voice, music and images live
in the ElevenLabs account's flows from 17–18 October 2026; the finished MP4s live
in the media bucket under `guide/` and posters/captions in
`platform/public/guide/`.

| File | What it is |
| --- | --- |
| `scripts.py` → `scripts.json` | The narration, section by section: TTS text with delivery tags, and caption lines. **This is the script.** |
| `shots.py` → `shots.json` | One image brief per shot (96), in the order they appear. |
| `plan.py` | The edit: which picture lands on which spoken phrase, title cards, callouts, dissolves. |
| `asr.py`, `score_takes.py`, `best_takes.json` | Word timestamps of every take (local Whisper) and the take chosen per section. |
| `timeline.py` → `timeline.json` | Plan + word timings → exact times for every shot, overlay and caption cue. |
| `overlays.py`, `ovshot*.cjs` | Title cards, callouts, the intro's district list, end cards, poster (HTML → PNG). |
| `capture.cjs` | Screen captures of the live site (member pages use a test account from `CAPTURE_EMAIL` / `CAPTURE_PASSWORD`). |
| `render.py` | Picture only, 1920×1080, 30 fps. |
| `mix.py` | Voice levelled and placed, score ducked under it, loudness −16 LUFS; captions and chapters. |
| `assemble.py` | Final 1080p and 720p cuts, end cards, the stitched guide. |
| `captions_en.py`, `make_en_vtt.py` | English subtitles, cue for cue on the Spanish timings. |
| `upload.py` | Puts finished files in the bucket through `/api/ops/guide-upload` (token read from a local file, never committed). |

### The 9:16 cuts for social media

Every film re-made upright (1080×1920) from the same timeline and the same
mixes, plus the intro on its own as a teaser that starts a beat before the
first word. Served at `/video/<key>-v1-916.mp4` (see `SOCIAL_KEYS`).

| File | What it is |
| --- | --- |
| `crops.py` → `crops_auto.json` | Where the tall window sits on each still: on the faces (YuNet face detector, `models/yunet.onnx` from opencv_zoo), panning between two people who don't fit, on the salient region when there are none. |
| `crops_fix_src.py` → `crops_fix.json`, `crop_sheet.py` | Crops corrected by eye on contact sheets (animals the detector can't see, handshakes, a pan from Carlos to his bike). |
| `overlays_v.py`, `ovshot_v.cjs` | Vertical title cards, callouts, the district list, end cards and the real screens as large browser cards, all clear of the platforms' own buttons. |
| `captions_v.py` | Burned-in captions (social video plays muted): short phrases, the spoken word in gold, from the narration's word timings. |
| `render_v.py`, `teaser_audio.py`, `assemble_v.py`, `pipeline_v.sh` | Picture, teaser sound, final cuts. |

## Version 2 — planned, filming on hold

The owner's decision on 18 October: re-make the guide with **Higgsfield and
Seedance 2.5**, a real filmed-looking production of the same script (probably
with more added), instead of stills with camera moves. On 29 October filming
was put on hold until the Higgsfield account is topped up; everything that
costs nothing is ready in `v2/`:

| File | What it is |
| --- | --- |
| `v2/PLAN.md` | Decisions, the v1 narration checked against the site, what must change (all screens, Roxi), the new intro and Roxi chapter, the credit estimate, and the steps for the day credits arrive. |
| `v2/pilot_shots.json` | Seedance motion briefs: the pilot (intro and Mercadito, animating the v1 stills) and the Roxi chapter. |

When it ships:

- Raise `GUIDE_VERSION` in `platform/src/config/guide.ts`; every file name
  changes, so cached v1 files are never shown in place of v2.
- Update `GUIDE_SECONDS`, `GUIDE_CHAPTERS` and `GUIDE_PUBLISHED`.
- Re-time both caption tracks from the new narration (the test checks they
  match cue for cue).
- Check every narrated fact against the site as it works that day.
- Deliver 16:9 for the site and 9:16 for social media.
