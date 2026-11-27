# Presencia Oro: review (first cut, 27 Nov 2026)

## Where it is

- Private page for the owner: https://claude.ai/artifact/JLZ1LkLch8aUbRz4hQxVDf
  (video, poster, the moments list, the decisions and three questions).
- Master render: `renders/presencia-oro-v1.mp4` (52.9 MB, 22.1 Mbps). Kept out
  of git with `assets/audio/`; re-render after fetching the audio again (ids in
  `SPEC.md`).
- Page copy: H.264 2-pass 6000k, preset slower, tune grain, AAC 160k, volume
  −1.2 dB, faststart, 14.6 MB (the page limit is 15 MB). SSIM to the master
  0.970 (a 5200k copy measured 0.965 and looked gritty in the release).

## Creative calls

- Roxi's outfit graded to obsidian; its violet piping turned gold. Her only
  violet is a faint rim of light on one side (0.12, and only while in focus).
- Every assembly and dissolve is light following eased paths with a swirl that
  dies as it lands. No glitch, scanlines or flash.
- The five cards carry the app's real district names and lines (Trabajo,
  Servicios, Mercadito, YavayaGo, Barrio). No listings are shown: production
  has none.
- Sound from HeyGen's catalog: dark swell for her arrival, a whoosh per card,
  an air burst on the release, near silence for the breath, a sub hit when the
  eagle forms, the music returning under the end card.

## Measured, not looked or heard

- `hyperframes check` passes. Warnings kept on purpose: safe-zone (this is a
  preview, not a social post), file size, the nested end card.
- Sound measured, not listened to: eagle hit at 15.00 s, whooshes from 6.35 s,
  release at 11.75 s, the breath at −23 to −35 dB, −12.9 LUFS, true peak
  −1 dBTP.
- Frames reviewed from snapshots and the final MP4 at the QA frames in `SPEC.md`.

## Weakest part

- The release (11.6–13 s): the densest particle field, so it's where the web
  copy loses most detail.
- Roxi is her flat picture with points and light around it. A real 3D Roxi is
  direction 3 in `docs/synapse/VISUAL_DIRECTION.md`.

## Waiting on the owner

1. Roxi in black and gold: keep it, or back to her purple outfit?
2. Which moment should the app do first: Roxi assembling, the arc of cards, or
   the eagle signature?
3. Anything too much or too little?
