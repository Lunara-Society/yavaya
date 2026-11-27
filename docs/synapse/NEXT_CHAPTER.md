# Next chapter: handoff

## Now (owner): test app 0.4.0 on the phone

1. **Install the preview APK 0.4.0** on the Samsung: [download](https://expo.dev/artifacts/eas/WULe2u76i-w-fKRaBMYryUYJ6aYBkvQJNxB_WaF8Q2k.apk)
   (build `27cc5ff7`, link valid until 11 Dec 2026). It installs over 0.3.0
   (same package, `yavaya.lat`).
2. **Sign in:** Ajustes → "Continuar con Google". The phone's browser opens
   Yavaya's sign-in. After choosing the Google account it should come straight
   back to the app with "Hola, <nombre>" on the home screen. If it stops on a
   browser page instead, a screenshot of that page is the most useful thing to
   send.
3. **Roxi:** open her (the stage at the top of home), tap the round button,
   allow the microphone, and talk to her. Check: she answers aloud, her
   hologram brightens while she speaks, "Tú:" lines appear as you speak, and
   asking her to open Mercadito opens it inside the app while she keeps
   talking. The round button ends the call.
4. **Look:** does home look like a lit space now (light rays, a coloured haze,
   the floor grid, Roxi standing in light)? Do panels in the district grid stay
   visible while scrolling?
5. **Districts:** open Mercadito: an empty list that says so is correct today
   (the website has no listings yet). "Publicar un anuncio" should open the
   form already signed in.
6. **Answer yes or no for each step** (a few words are enough), plus
   screenshots of anything that looks wrong.

## Also waiting (owner): the black-and-gold look

- Watch the concept film "Presencia Oro" (private page:
  https://claude.ai/artifact/JLZ1LkLch8aUbRz4hQxVDf) and answer its three
  questions: keep Roxi in black and gold? which moment first? too much or too
  little? Notes: [VISUAL_DIRECTION.md](VISUAL_DIRECTION.md),
  [`design/films/oro/REVIEW.md`](../../design/films/oro/REVIEW.md).
- Choose two or three of the ten directions in VISUAL_DIRECTION.md.
  Noche de Luz has a fixed date: 7 December.

## Waiting on the owner

- HeyGen API key in the app (#57); ElevenLabs connector reconnect; Meshy plan.
- Apple Developer Program, only if iOS devices are wanted (KNOWN_ISSUES 28).
- A Firebase project for Android push notifications (KNOWN_ISSUES 27).

## Proposed Chapter 10 (not authorised)

From what Chapter 09 left open ([CHAPTER_09.md](CHAPTER_09.md) §6):

1. **Fix what the phone test shows**, first of all.
2. **Push notifications**: device registry, sending from the scheduler, the
   bell's preferences; needs the Firebase credentials above.
3. **Native publishing** for Mercadito (photos, price, place) on the API
   routes the bearer now reaches, instead of the website form.
4. **App Links** (`/.well-known/assetlinks.json`) so only Yavaya can receive
   the sign-in return (KNOWN_ISSUES 33).
5. **Store billing** for digital items through Google Play and Apple billing
   (D-031; KNOWN_ISSUES 17), still release-blocking.
6. **The phone numbers** from the Laboratorio recorded in
   [PERFORMANCE_BUDGET.md](PERFORMANCE_BUDGET.md), and fixes for what they show.

## Files to read first

[CHAPTER_09.md](CHAPTER_09.md), [CHAPTERS_02_08.md](CHAPTERS_02_08.md), [MASTER_DIRECTIVE.md](MASTER_DIRECTIVE.md),
[PROJECT_MEMORY.md](PROJECT_MEMORY.md), [BASELINE_AUDIT.md](BASELINE_AUDIT.md) §7,
[KNOWN_ISSUES.md](KNOWN_ISSUES.md), `mobile/src/business/`,
`platform/src/server/auth/`, and
[`platform/docs/SECURITY.md`](../../platform/docs/SECURITY.md).
