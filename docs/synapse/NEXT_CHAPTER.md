# Next chapter: handoff

## Now (owner): the first phone test of the native app

1. **Install the preview APK 0.3.0** on the Samsung: [download](https://expo.dev/artifacts/eas/ArVKb_rVZ0bhsYQtpjx7TFCs7GyVgoBTJE9pk9sqR6Q.apk)
   (build `6d7af8c1`, link valid until 10 Dec 2026). It replaces the 0.2.0
   prototype (same package, `yavaya.lat`).
2. **Open it, close it fully, open it again.** The first launch plays the
   awakening and downloads an update in the background; the second launch
   applies it and adds **Ajustes → Laboratorio**.
3. **Look at these and answer yes or no** (a few words are enough):
   - Awakening: about 5 s from darkness to Roxi; "Saltar" stops it at once; it
     does not play again on the next launch.
   - Home: the district objects follow the phone's tilt; opening a district
     grows out of the tile you touched; a swipe from the left edge goes back
     (and can be abandoned halfway); the Android back button works.
   - Roxi (dock), Buscar, Mapa: each opens and closes smoothly.
   - Sound with the speaker, with headphones, and with the phone on vibrate or
     silent; Ajustes → Sonido off silences everything.
   - Vibration on touches and on the awakening's pulses.
   - **Laboratorio → Movimiento, Holograma and Arranque:** a screenshot of each
     (they show frames per second, slow frames, the device tier and the start-up
     time on the phone, the numbers this machine cannot produce).

The development build (`Yavaya Dev`, staging data) needs a computer running
`npx expo start`; the owner does not need it.

## Waiting on the owner

- HeyGen API key in the app (#57); ElevenLabs connector reconnect; Meshy plan.
- Apple Developer Program, only if iOS devices are wanted (KNOWN_ISSUES 28).
- A Firebase project for Android push notifications (KNOWN_ISSUES 27).

## Proposed Chapter 09: connect the app to the person (not authorised)

From BASELINE_AUDIT §7 and the open items of Chapters 02–08:

1. **Mobile sessions and the first mobile API**: token sessions from the
   existing sessions table (the secure-store slot exists in
   `mobile/src/business/session.ts`); read-only endpoints first (me,
   notifications), each wrapping the domain function the website uses.
2. **Google sign-in through the system browser**, returning by App Link
   (`/.well-known/assetlinks.json`, the one additive website change).
3. **Push notifications**: device registry, sending from the scheduler, the
   bell's preferences; needs the Firebase credentials above.
4. **Store billing** for digital items through Google Play and Apple billing
   (D-031; KNOWN_ISSUES 17), still release-blocking.
5. **The phone numbers** from step 3 above recorded in
   [PERFORMANCE_BUDGET.md](PERFORMANCE_BUDGET.md), and fixes for what they show.

## Files to read first

[CHAPTERS_02_08.md](CHAPTERS_02_08.md), [MASTER_DIRECTIVE.md](MASTER_DIRECTIVE.md),
[PROJECT_MEMORY.md](PROJECT_MEMORY.md), [BASELINE_AUDIT.md](BASELINE_AUDIT.md) §7,
[KNOWN_ISSUES.md](KNOWN_ISSUES.md), `mobile/src/business/`,
`platform/src/server/auth/`, and
[`platform/docs/SECURITY.md`](../../platform/docs/SECURITY.md).
