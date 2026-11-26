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
