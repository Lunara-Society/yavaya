# Known issues

Open problems, most important first. Close an entry by moving it to the
chapter record that fixed it, with the evidence.

1. **Google Play production access needs a closed test first.** The developer
   account is personal and was created after 13 November 2023, so Google
   requires a closed test with at least 12 testers opted in for 14 days in a row
   before the account can apply for production access. Verifying the account
   recently does not change this. Owner action: set up the closed testing track
   and invite 12+ testers (Google accounts) once the first app bundle is uploaded.

2. **The app is a bridge.** It shows the website inside a native frame. The
   master directive rules this out as the end product. It is the fallback that
   Synapse replaces screen by screen; until then the app looks like the website.

3. **"Continuar con Google" does not sign in inside the app.** Google blocks
   sign-in in embedded WebViews, so the link opens the phone's browser and the
   session lands there. Email sign-in works in the app.

4. **The package name is `yavaya.lat`.** Valid, but the reverse of the usual
   `lat.yavaya`. It becomes permanent with the first upload to Google Play; if
   the owner wants it changed, it must happen before that upload (new app in
   Play Console, new identifier in Google Cloud and Expo).

5. **Links to yavaya.lat open the browser, not the app.** Android App Links
   are not set up (needs `assetlinks.json` on the website with the signing
   fingerprint, and intent filters in `app.json`). Shared WhatsApp links
   therefore open in Chrome.

6. **The app icon is enlarged from a 512 px image** and may look soft on large
   launchers. A 1024 px master of the Guardian icon from the owner fixes it.

7. **Nothing has been run on a phone yet.** Microphone (Roxi, dictation),
   camera, photo upload, location, Stripe checkout and Play inside the WebView
   are configured but not yet seen working on a device.

8. **The Play service account is assigned but unproven.** Google only confirms
   its Play Console permissions on the first submission.

9. **EAS free-plan builds wait in a queue**, sometimes for a long time. A paid
   EAS plan shortens it; that is a paid change and needs the owner's approval.

10. **Storage permissions arrive from libraries.** The APK's manifest has
    READ_EXTERNAL_STORAGE and WRITE_EXTERNAL_STORAGE although the app does not
    declare them (Android ignores them from Android 13). Before the first Play
    upload, decide whether to block them in `app.json` (`blockedPermissions`);
    blocking WRITE could stop WebView downloads on Android 9 and older.

11. **APK size.** 0.3.0 was 71 MB with code for four CPU types. From 0.4.0
    Android builds carry the two phone types only (D-037), and WebRTC adds its
    libraries. Measure the 0.4.0 APK, and the Play bundle's per-device size
    when the first production bundle is built.

12. **The pre-audit prototype (P-01) has not run on a phone yet.** The reconstruction, the parallax,
    the Presence and the Classic switch are typechecked, unit-tested and (the
    shader) rendered with Skia's own compiler, but frame rate, battery and touch
    feel are unmeasured until the owner installs the build.

13. **A thin dark edge at her boots** when she is fully formed: the depth matte
    reaches a pixel or two past her outline where the source is black. Barely
    visible on the app's night background; a sharper matte would remove it.

14. **The reconstruction is always dark**, even when the phone is in light mode,
    because her picture is lit for a dark room. The website after it follows
    the phone's theme as before.

15. **The Presence can be a step behind on in-page navigation.** Its position
    is checked every 0.7 s; when the website's own button moves (for example
    when a page adds a floating button), the Presence follows within that time.

16. **Meshy is blocked** (free plan; see IMPLEMENTATION_STATUS). **The
    ElevenLabs connector needs reconnecting** with more permissions before Roxi's
    voice can be used for films from here; her live voice in the app is not
    affected (it is the website's).

The entries below come from the Chapter 01 audit; the evidence and the
recommended fix for each are in [BASELINE_AUDIT.md](BASELINE_AUDIT.md) §6.

17. **Digital goods and the stores (R1, release-blocking).** Tokens, Play gems,
    Vault items and Roxi Pro/Max are sold through Stripe. Google Play and the
    App Store expect their own billing for digital goods bought in an app. The
    owner decides before any store release: store billing for those items, or
    no purchase of them in the store builds.

18. **Native code can call API routes but not Server Actions (R2).** Since
    Chapter 09 a bearer request passes the same-origin check, so native code can
    use every API route signed in. Server Actions stay website-only; native
    screens that need them open the website screen, signed in.

19. **Dictation may not work inside the app (R4).** The posting forms use the
    browser's speech recognition; Android's WebView is not known to provide it.
    First check on the phone.

20. **Driver location stops with the screen off (R5).** YavayaGo tracking comes
    from the driver's browser location. A native foreground service is needed
    for a dependable driver app.

21. **Known advisories in the website's dependencies (R6).** Next.js, Zod and
    the Sentry plugin chain have published fixes; 8 advisories in production
    packages (6 moderate, 2 high). Upgrading is a production change, so it
    waits for the owner's go-ahead and runs with the full test suite.

22. **One Railway environment, in US East (R7, R8).** Changes go straight to
    production; Central American latency is unmeasured.

23. **Scanner requests answer 500 (R9).** `POST` to made-up paths reaches the
    action parser and fails (Sentry YAVAYA-WEB-K). Harmless, but noisy.

24. **Small details seen in phone screenshots, to confirm on a device.** On
    district pages one header button renders as an empty circle; the Mercadito
    subtitle runs under its sign illustration.

From Chapters 02–08 (details in [CHAPTERS_02_08.md](CHAPTERS_02_08.md)):

25. **Nothing native has run on a phone yet.** The app was verified by tests,
    Skia's compiler, a browser run and EAS builds. Frame rate, memory, battery,
    haptics, sound on speakers and headphones, silent mode, tilt and native
    start-up times are measured only on a device (the Laboratory shows them).

26. **Browser frame numbers are not phone numbers.** The browser check renders
    the shaders on the CPU (no GPU here): 6–16 fps there means nothing for a
    phone.

27. **Push notifications need credentials** (Firebase for Android, APNs for
    iOS) and a device registry before they can work.

28. **No Apple Developer account**: iOS is limited to simulator builds.

29. **Four districts have native lists; the rest are hubs.** Mercadito,
    Trabajo, Animales and Comunidad show their newest items natively
    (Chapter 09); the others open their full website screen, signed in.

30. **Positional (3D) sound is not implemented**; layered, prioritised sound is.

From Chapter 09 (details in [CHAPTER_09.md](CHAPTER_09.md)):

31. **The 0.4.0 work has not run on a phone.** Above all: the browser tab
    returning to the app after Google, Roxi's voice (microphone, echo
    cancellation, her tools in a real conversation), and a website screen
    opening signed in on Android's WebView.

32. **Production districts are empty.** The native lists show nothing because
    the website has nothing yet in Mercadito, Trabajo or Animales. Not a fault;
    the screens say so honestly.

33. **The `yavaya://` scheme can be claimed by another app.** PKCE makes a
    stolen code useless; App Links would also stop the other app from seeing
    it (D-032).

34. **No current development build.** The last one (`d2a5bee8`, 0.3.0) was
    canceled. The owner does not need it; rebuild before using `Yavaya Dev`.

35. **Android builds run close to the free build server's limits** (4 vCPUs,
    16 GB, 45 minutes). Two 0.4.0 builds ran out of memory; D-038 caps the
    Kotlin compiler and Gradle's parallel tasks. If builds fail again, the paid
    `large` class (8 vCPUs, 32 GB) is the next step, the owner's decision.

36. **Cloud builds start from this machine only.** The Expo project has no
    GitHub repository connected, so Expo cannot build from the repository on
    its own; the EAS CLI here uses the Expo credential saved in the session
    environment.
