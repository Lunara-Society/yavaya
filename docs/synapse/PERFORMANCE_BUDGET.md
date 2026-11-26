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
| Download size of the preview APK | measure in Chapter 01; record here | — |
| Data for the first screen on a cold cache | ≤ 1.5 MB | ≤ 1.5 MB |

Rules that are not numbers: rendering pauses when the app is in the
background; reduced motion removes particles and parallax; silent mode mutes
all sound; no essential function requires the full graphics tier.

## Measurements

| Date | Build | Device | Measure | Result |
| --- | --- | --- | --- | --- |
| — | — | — | — | No measurements yet. The Chapter 00 build has not been run on a phone by this project. |

Chapter 01 records the bridge baseline here before any native rendering is
added, so every later effect is compared with the plain app.
