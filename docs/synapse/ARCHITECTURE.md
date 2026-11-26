# Architecture

## Today

```
 Samsung / Android phone
 ┌──────────────────────────────────────────────┐
 │ Yavaya app (mobile/, Expo SDK 58, RN 0.88)    │
 │  App.tsx ── splash until first paint (≤ 8 s)  │
 │  src/YavayaWeb.tsx                            │
 │   └─ WebView ─────────────► https://yavaya.lat│──► Railway: Next.js platform/
 │      back button, link policy (src/links.ts), │       Postgres, Roxi (ElevenLabs),
 │      mic/camera/location grants, offline view │       Stripe, R2 storage …
 └──────────────────────────────────────────────┘
        ▲ built by EAS Build (cloud), signed with the EAS-held keystore
        └─ submitted by EAS Submit with the Google service account (owner approval)
```

The platform's own architecture (domains, invariants, security) is in
[`platform/docs/ARCHITECTURE.md`](../../platform/docs/ARCHITECTURE.md) and is
not repeated here.

### The bridge's contract (`mobile/`)

| Concern | Behaviour | Where |
| --- | --- | --- |
| Pages | `yavaya.lat` and `www.yavaya.lat` stay in the app; so does Stripe's checkout (`checkout.stripe.com`, `hooks.stripe.com`, `pay.stripe.com`), so a payment returns to Yavaya | `src/links.ts` |
| Other sites and app links | open outside: WhatsApp, the dialer, mail, maps, other sites; an Android `intent:` link opens its browser fallback | `src/links.ts`, `openOutside` in `src/YavayaWeb.tsx` |
| Refused | `javascript:`, `file:`, `content:` and malformed addresses | `src/links.ts` |
| Frames | always load inside their page (Stripe Elements, embeds) | `decide(url, isTopFrame)` |
| Back | goes back a page in Yavaya before it leaves the app | `BackHandler` in `src/YavayaWeb.tsx` |
| Permissions | microphone (Roxi, dictation), camera (photos), location (Cerca de mí); Android asks the person at the moment the site asks; same-host media requests are granted, others prompt | `app.json` permissions, `mediaCapturePermissionGrantType` |
| Identity of the client | the user agent ends in `YavayaApp/<version>`, so the site can tell the app from a browser | `applicationNameForUserAgent` |
| Failure | offline screen with a retry (Spanish or English by the phone's language); a crashed renderer is remounted | `src/YavayaWeb.tsx`, `src/strings.ts` |
| Native project | not committed: generated from `app.json` at build time (Continuous Native Generation) | `.gitignore` (`android/`, `ios/`) |

### Build and release pipeline

| Profile | Output | Distribution | Purpose |
| --- | --- | --- | --- |
| `development` | APK with the Expo dev client | internal | developing native screens against a local bundler |
| `preview` | APK | internal (install link, not the store) | testing on the owner's phone |
| `production` | Android App Bundle, version code auto-incremented | Google Play | store releases |

`eas submit` is configured for the **internal** track as a **draft**
(`eas.json`), so even a submission does not reach anyone until the owner
releases it in Play Console. Version numbers live on EAS
(`appVersionSource: remote`); the first version code is 1.

### Synapse's first layer (Chapter 01)

```
 App.tsx ── YavayaWeb.tsx
             ├─ WebView (yavaya.lat) ◄── injected bridge script (synapse/bridge.ts)
             │     │  roxi:state, where .roxi-launch is  ──►  onMessage (checked, yavaya.lat only)
             │     ◄── open Roxi (clicks her button), cover/uncover her button
             ├─ PresenceDock (synapse/PresenceDock.tsx)   her face, lit by her state
             └─ Reconstruction (synapse/Reconstruction.tsx), over everything while loading
                   Skia canvas ── RECONSTRUCT_SKSL (synapse/reconstruct.ts)
                   UI-thread frame loop ── step() (synapse/timeline.ts) ← real load progress
```

- The reconstruction's inputs are shared values set by the WebView's events
  (progress, loaded, failed) and a tap (skip); a frame callback on the UI
  thread advances the timeline and feeds the shader's uniforms. When it is
  done it unmounts, so nothing keeps drawing.
- Slow frames (over 34 ms, twelve in a row) switch off the inflowing light;
  reduced motion replaces the cells with a fade.
- The look (Synapse or Classic) is read from the phone before the first frame;
  the splash covers the read.

## Direction for Synapse (to be decided chapter by chapter)

The directive asks for an operating environment, not a wrapped website. The
intended path, to be confirmed by measurement before any of it is adopted:

1. **Keep the bridge as the fallback.** Every native Synapse screen replaces
   one web screen; any screen not yet rebuilt stays the web page. The Classic
   switch can always return to it.
2. **Data through the existing platform API.** Native screens call the same
   server endpoints the website uses, with the same server-side authorisation.
   No new backend behaviour is invented in the app. Sharing the member's
   session between the WebView and native code (cookie or token) is the first
   design decision of Chapter 01.
3. **A rendering layer chosen by measurement.** Candidates to evaluate against
   [PERFORMANCE_BUDGET.md](PERFORMANCE_BUDGET.md) on a low-end Android phone:
   React Native Skia, Reanimated, and a GPU 3D layer (expo-gl / three.js), with
   a static fallback for each effect. None is adopted yet.
4. **Roxi as a persistent presence.** Her voice and tools already run on the
   website (`platform/docs/roxi/`); a native Presence layer would host the
   same agent and the same tools rather than a second Roxi.
5. **Quality tiers.** Full, reduced (reduced-motion or low-end) and static
   rendering, selected on the device; nothing essential depends on the full tier.
