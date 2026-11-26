# Performance budget

The directive's requirements, turned into numbers to test against. The
numbers are **proposed** in Chapter 00; Chapter 01 measures the bridge on real
phones and either confirms them or replaces them with evidence.

## Reference devices

| Tier | Example | Why |
| --- | --- | --- |
| Low | Android with 2–3 GB RAM (an entry Samsung Galaxy A series) | the common phone across Central America; every function must work here |
| Mid | the owner's Samsung | daily testing |
| High | a recent flagship | the full visual tier |

## Proposed budgets

| Measure | Low tier | Mid / high tier |
| --- | --- | --- |
| Visible response to a touch | ≤ 100 ms | ≤ 50 ms |
| Frame rate during transitions | steady 30 fps (adaptive) | 60 fps |
| Cold start to first useful screen, on 4G | ≤ 4 s | ≤ 2.5 s |
| Splash time limit (already enforced) | 8 s | 8 s |
| JS heap while idle | ≤ 150 MB | ≤ 250 MB |
| GPU while idle (no animation running) | none | none |
| Download size | preview APK: 71 MB measured (universal, four CPU types); the Play app bundle is split per device and will be smaller, to be measured | — |
| Data for the first screen on a cold cache | ≤ 1.5 MB | ≤ 1.5 MB |

Rules that are not numbers: rendering pauses when the app is in the
background; reduced motion removes particles and parallax; silent mode mutes
all sound; no essential function requires the full graphics tier.

## Measurements

| Date | Build | Device | Measure | Result |
| --- | --- | --- | --- | --- |
| 26 Nov 2026 | Chapter 00 preview | — | APK size | 71 MB (universal) |
| 26 Nov 2026 | Chapter 01 | build machine | JavaScript bundle (Hermes bytecode) | 3.2 MB |
| 26 Nov 2026 | Chapter 01 preview (build 61ed3bd9) | EAS | APK size | 132 MB universal (four CPU types); native code for one modern phone (arm64) 32.7 MB. Skia, Reanimated and Worklets account for most of the growth from 71 MB. Google Play's per-device delivery from the app bundle will be far smaller; to be measured on the first bundle |
| 26 Nov 2026 | Chapter 01 | build machine | Roxi's assets in the app | 46 KB (figure 36, depth 3, face 8) |
| 26 Nov 2026 | Chapter 01 | by design | Reconstruction cost per pixel | 4 texture reads (2 picture, 2 depth) and, while forming, up to 2 layers of inflowing light (an atan and a log); constant whatever the phone |
| 26 Nov 2026 | Chapter 01 | by design | GPU when idle | none: the reconstruction unmounts when done; the Presence animates only while Roxi is active |

No phone measurements yet: frame rate and memory on the owner's Samsung and on
a low-end Android are Chapter 02's first task. (CanvasKit's CPU rasteriser
takes about 18 s per frame for this shader; that is a software interpreter on
the build machine and says nothing about a phone's GPU.)

Chapter 01 records the bridge baseline here before any native rendering is
added, so every later effect is compared with the plain app.
