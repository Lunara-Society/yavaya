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

## Version 2 — planned for late October 2026

The owner's decision on 18 October: re-make the guide with **Higgsfield and
Seedance 2.5**, a real filmed-looking production of the same script (probably
with more added), instead of stills with camera moves. When it ships:

- Raise `GUIDE_VERSION` in `platform/src/config/guide.ts`; every file name
  changes, so cached v1 files are never shown in place of v2.
- Update `GUIDE_SECONDS`, `GUIDE_CHAPTERS` and `GUIDE_PUBLISHED`.
- Re-time both caption tracks from the new narration (the test checks they
  match cue for cue).
- Check every narrated fact against the site as it works that day.
- Deliver 16:9 for the site and 9:16 for social media.
