# Decision log

Newest last. Each entry: what was decided, why, what else was considered, and
how to undo it.

### D-001 · 26 Nov 2026 · The mobile codebase lives in `mobile/`
No mobile codebase existed in the repository (the only candidate,
`Lunara-Society/YavayaGo`, is out of scope by the owner's rule). A new Expo app
was created at the repository root beside `platform/`. Undo: delete `mobile/`;
nothing else depends on it.

### D-002 · 26 Nov 2026 · Chapter 00 ships a bridge, not Synapse
The first app opens the live yavaya.lat in a native frame. Reason: Chapter 00
forbids redesigning or replacing the product, and the owner asked to test on a
Samsung phone now; the bridge keeps every working system (accounts,
districts, Roxi, payments, Play) exactly as on the web, with nothing copied or
mocked. The directive rules out a wrapped website as the end product, so the
bridge is a fallback that later chapters replace screen by screen.
Considered: rebuilding screens natively first (out of scope for Chapter 00 and
would duplicate backend behaviour); a Trusted Web Activity (no native layer to
grow into).

### D-003 · 26 Nov 2026 · Expo SDK 58, managed workflow, native folders generated
Expo SDK 58 (React Native 0.88, React 19.3, TypeScript 6), with `android/` and
`ios/` generated from `app.json` at build time rather than committed. Reason:
EAS builds it as configured, upgrades stay small, and the same code base can
target iOS later. Undo: `npx expo prebuild` and commit the native folders.

### D-004 · 26 Nov 2026 · Package name `yavaya.lat`
Set by the owner in Google Cloud, Play Console and Expo. It is valid, but it is
the reverse of the usual convention (`lat.yavaya`) and cannot be changed once
an app bundle is uploaded to Google Play. Kept as given; flagged to the owner.

### D-005 · 26 Nov 2026 · Versions are kept on EAS
`appVersionSource: remote`, version code starting at 1; production builds
increment it automatically. Reason: no one has to remember to bump it, and two
builds never collide. Undo: `appVersionSource: local` and set `versionCode`.

### D-006 · 26 Nov 2026 · The upload keystore is generated and held by EAS
No keystore existed for the project. The first build, run non-interactively,
had EAS generate one and store it on Expo's servers. It is never in the
repository. Google Play App Signing will hold the app signing key; this
keystore is the upload key. To back it up: `eas credentials` → Android →
download (owner only).

### D-007 · 26 Nov 2026 · Only `mobile/` is uploaded to EAS
A repository-root `.easignore` excludes everything but `mobile/` (and mobile's
own ignores). Reason: the web platform, its assets and its history do not
belong in a mobile build, and uploading them would leak unrelated files to the
build service.

### D-008 · 26 Nov 2026 · Submissions go to the internal track as drafts
`eas.json` submit profile: track `internal`, release status `draft`. Reason:
"do not publish anything publicly without my approval". A submission creates a
draft the owner must release in Play Console.

### D-009 · 26 Nov 2026 · Which links stay in the app
Yavaya's own pages and Stripe's hosted checkout stay inside; everything else
opens in the app it belongs to. Reason: a payment must come back to Yavaya,
and WhatsApp, the dialer or Instagram belong in their own apps. The decision
is a pure function with tests (`mobile/src/links.ts`, `links.test.ts`).

### D-010 · 26 Nov 2026 · Synapse memory lives at `docs/synapse/`
The directive's path, at the repository root, because Synapse spans the mobile
app and the platform. The platform's own docs stay in `platform/docs/`.

### D-011 · 26 Nov 2026 · The Play service account is linked to the app on EAS
The service account key the owner uploaded to the Expo account
(`yavaya-expo@…`) is assigned to `yavaya.lat` as its Google Play submission
key, so `eas submit` needs no file. Nothing has been submitted.
See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for its verified state.
