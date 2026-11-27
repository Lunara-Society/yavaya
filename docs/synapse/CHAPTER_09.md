# Chapter 09: the app knows the person (app 0.4.0)

Built 26–27 November 2026 after the owner's first phone test of 0.3.0:

> Login with the app alone doesn't work, when trying with Google, it goes to
> the website instead of the app/APK. Can test Roxi yet and all visual stuff
> seems to be almost non existing. […] Make the ultimate and best version you
> can and push hard on everything.

Chapter 09 had been proposed in [NEXT_CHAPTER.md](NEXT_CHAPTER.md) as
"connect the app to the person". The owner's message authorised it and went
further: Roxi's voice in the app, visuals that hold up on a phone, and native
district screens. Taken together with "push hard on everything", it also
covered deploying the new server endpoints to production after staging. They
are additive, and no existing route changed behaviour.

Verification follows the rules in [CHAPTERS_02_08.md](CHAPTERS_02_08.md): unit
tests, Skia's compiler, the app in Chromium at phone size, EAS builds. **None
of the 0.4.0 work has run on a phone yet.**

---

## 1. Sign-in that comes back to the app

**What went wrong in 0.3.0.** The website's sign-in ran inside the app's
WebView. Google refuses OAuth inside embedded web views, so the button sent the
person out to the browser, and the session ended up in the browser, not in the
app.

**What 0.4.0 does** (RFC 8252, "OAuth for native apps"):

1. The app makes a PKCE pair (`expo-crypto`: 32 random bytes, S256 challenge)
   and a random state, then opens
   `/api/mobile/v1/auth/start?redirect_uri=yavaya://auth&state=…&code_challenge=…`
   in the phone's own browser tab (`WebBrowser.openAuthSessionAsync`, a Custom
   Tab on Android).
2. `start` checks every parameter and keeps the hand-off in a sealed cookie
   (`yav_mobile_auth`, 15 minutes, path limited to `/api/mobile/v1/auth`).
   Then it sends the tab to the website's own sign-in: Google
   (`/auth/google?next=…`), or `/login?next=…` for email, password, phone code
   and the rest. Someone already signed in goes straight on, unless they asked
   for another account (`fresh=1`).
3. `finish` runs once the website session exists. It writes a one-time code
   (AES-256-GCM, 120 seconds, bound to the PKCE challenge, without the account
   id in readable form) and redirects the tab (303) to
   `yavaya://auth?code=…&state=…`. A server redirect at the end of a chain the
   person started with a tap is what Android's browser tab follows into an app,
   as Google's own sign-in for installed apps does. The first version answered
   with a page that refreshed itself to the app, which a browser can refuse
   without a tap; it was replaced on 27 November, before any phone ran it.
4. The app checks the state and posts `{code, verifier}` to `exchange`. That
   route is rate limited like the login and opens a normal remembered session
   in the existing sessions table. The app keeps the token in the keystore
   (`SecureStore`, `yavaya.session.v1`).

Every native request sends `Authorization: Bearer <token>`. On the server,
`currentSession()` reads the bearer first, so every existing API route works
for the app without being changed. `sameOrigin()` accepts a bearer request,
because a browser can never send one cross-site (no CORS is answered).

**Website screens open signed in.** A WebView's first request goes to
`/api/mobile/v1/auth/web?next=<page>` with the bearer in its header. The route
sets the same session as the screen's cookie and redirects to the page. The
token never appears in a URL. The website's sign-in links (`/login`,
`/register`, `/auth/google`) are caught in the WebView and run the native
sign-in instead.

**Account panel** in Ajustes and on Roxi's screen when signed out: "Continuar
con Google", "Correo, contraseña u otra forma", "Entrar con otra cuenta",
"Cerrar sesión". Signing out revokes the session on the server.

Files: `platform/src/server/auth/mobile.ts`, `bearer.ts`, `context.ts`;
`platform/src/app/api/mobile/v1/auth/{start,finish,exchange,session,web}`;
`mobile/src/business/api.ts`, `auth.tsx`; `mobile/src/screens/Account.tsx`,
`WebScreen.tsx`.

## 2. Roxi's voice in the app

The same agent, prompt, knowledge, memory and tools as on the website, spoken
over WebRTC with the phone's echo cancellation (ElevenLabs React Native SDK
1.3.0 on LiveKit).

- `POST /api/mobile/v1/roxi/start` opens a conversation exactly as
  `/api/roxi/start` does for the website: allowance, credits, the live status
  register. When the server holds an ElevenLabs key it returns a WebRTC
  conversation token and the conversation id; otherwise it returns the public
  agent id. The app reports the end to `/api/roxi/usage`, which meters it.
- Her 16 client tools are ported (`mobile/src/roxi/tools.ts`) on top of the
  app's own request layer. A unit test holds them to the agent's list in
  `platform/docs/roxi/tools.json`. Pages she opens appear inside the app, and
  drafts she prepares fill the website's forms (`window.__YAVAYA_APP_DRAFT__`
  read by `adoptAppDraft()` on the platform).
- Confirmations (a connection asking to act) use a native dialog. Nothing is
  published or paid without the person.
- Speaking, listening and thinking drive her hologram through shared values
  (volume sampled every 50 ms). A floating island keeps her present, and
  stoppable, on other screens.
- The microphone is asked for when the person first talks to her. If refused,
  the screen says where to allow it.

## 3. The visuals

The owner said the visuals seemed almost non-existent. Two causes were found
and fixed:

- **Too faint.** The atmosphere, panel edges and awakening were tuned for a
  dark monitor. Version 2 of each adds a key light with volumetric rays, a
  nebula in the district's colour, a holographic floor fading to the horizon,
  three depths of particles, a brighter glass edge with an inner accent glow and
  a lit top edge.
- **Panels going blank.** Every glass panel had its own Skia canvas. Grids and
  lists made more than the browser's 16 WebGL contexts, and the extra panels
  rendered white with a broken-image mark. Panels in grids and lists now use a
  `lite` glass made of views only. Heroes and the Roxi stage keep the shader.

**Roxi's hologram** (`ROXI_HOLO_SKSL`, `render/RoxiHologram.tsx`) is her own
picture, cut out of the dark by its depth map and brightness, graded to her
violet. It adds scanlines, a light sweep, rim light, depth parallax from the
phone's tilt, a projector disc and rising light. She forms from light cells
when she appears and brightens with her live voice. She stands on her screen,
on the home stage and in the awakening.

All six shaders compile and render in Skia's compiler
(`npm run check:shaders`). Her hologram was rendered at phone size from her
real picture and depth map.

## 4. Districts with real data

`GET /api/mobile/v1/feed/<district>` returns the newest items exactly as each
website page lists them:

- Mercadito (listings, with search), Trabajo (posts) and Animales (reports):
  public.
- Comunidad: signed-in neighbours only, as on the website.

Each item has a title, a detail (price, pay), a place, a photo, a time and the
page that opens it. The app shows photo cards or text cards, a "Ver más" page,
publish buttons that open the real form inside the app, and honest empty
states ("Aquí solo aparece lo que de verdad se publica"). Home shows a "Nuevo
en Mercadito" strip from the same feed. The other districts keep their full
website screen inside the app, signed in.

## 5. Builds

| Build | Result |
| --- | --- |
| `61e55061` (0.4.0) | failed: Kotlin type mismatch, `livekit.org.webrtc` against `org.webrtc`. WebRTC 144.2.0 is LiveKit's prefixed build. Fixed by pinning 144.1.2 with an npm override |
| `91a52595` (0.4.0, `a889c1f`) | failed: "Gradle build daemon disappeared", the build server out of memory compiling native code for four processor types once WebRTC came in |
| `258b7ac1` (0.4.0, `c3fbcd7`) | phones only; no output after five minutes in native compiles, canceled at the plan's 45-minute limit (memory again) |
| `27cc5ff7` (0.4.0, `146d2ea`) | Kotlin compiler capped at 2 GB, at most two Gradle tasks at once (D-038): **finished** in 15 minutes, [APK](https://expo.dev/artifacts/eas/WULe2u76i-w-fKRaBMYryUYJ6aYBkvQJNxB_WaF8Q2k.apk), 95.6 MB |

## 6. What is still unverified

Only a phone can show these:

- The browser tab returning to the app (`yavaya://auth`) after Google, and the
  exchange that follows.
- Roxi's WebRTC voice: microphone, echo cancellation, speaker, the volume
  driving her hologram, her tools from a real conversation.
- Frame rate of the new shaders on the Samsung.
- A website screen opening signed in from the bearer hand-off on Android's
  WebView.

The test steps are in [NEXT_CHAPTER.md](NEXT_CHAPTER.md).
