# Roxi as an interactive digital human: the production pipeline (AX-03)

Evaluation of the available Roxi assets and the choice of pipeline, 27
November 2026. Result in one line: **one front image cannot give an exact 3D
Roxi; the pipeline is chosen, the inputs it needs are listed, and no 3D
master was made in this chapter** (making a generic body and calling it Roxi
would break the identity rule).

## 1. What exists

| Asset | Facts (measured) |
| --- | --- |
| `mobile/art/roxi/roxi-source.png` | the owner's image; 1440 × 3088 RGB; front view, full length, standing, arms down, on black; AI-generated, Yavaya's own (owner, 26 Nov). The owner's upload R09 is pixel-identical |
| Her face in it | box (550, 110)–(910, 470): about 360 × 360 px including hair; the face itself about 250 px wide |
| Clothing | purple jacket with lilac piping and a stand collar, open zip; black top; dark purple trousers; black ankle boots; a small pendant necklace |
| Hair | long, straight, black, centre parting, over both shoulders |
| `roxi-matte.png` | soft cut-out mask, full size |
| `mobile/assets/roxi/roxi.webp`, `roxi-depth.webp`, `roxi-face.webp` | 720 × 1544 figure; 240 × 515 depth map **estimated** by Depth Anything V2 Small (relative, smooth, not geometry); 320 × 320 face |
| `design/films/oro/assets/roxi*.{png,js}` | graded figure and a particle point set for the concept film |
| Tools | `mobile/tools/roxi/make-roxi.py` (depth, matte, crops); `film.py` (Blender film). Blender is **not installed** in this container; the Blender download site and the extension site are reachable through the proxy |

Missing: any other view (profile, three-quarter, back), the back of her hair
and jacket, hands in detail, any expression other than a slight smile, her
height or scale.

The owner's second send (R27–R39) adds side, back and walking silhouettes,
gestures and expressions of a Roxi-like woman. They are movement references:
the faces measure as other faces and the clothes drift (REFERENCE_MATRIX §7),
so they do not replace the identity-true views S0 needs. The back of the
jacket and hair in R29 and R32 can guide the unseen back only if the owner
confirms them as hers.

## 2. What one front image can and cannot give

| Can | Cannot |
| --- | --- |
| her front silhouette and proportions | the depth of nose, jaw, cheekbones and ears |
| a front texture of the face (about 250 px: enough for a 512 px mobile face texture, not for skin detail) | anything at the sides or back: hair volume, jacket back, boot heels |
| clothing colours and cut from the front | true scale, height, weight distribution |
| hair colour and length at the front | how she moves, how her face looks speaking |

So "exact 3D reconstruction" is not possible from these assets. Every
pipeline below either adds views or invents what is unseen; the difference
is whether an artist controls the invention.

## 3. The techniques the constitution lists, against our assets

| Technique | With today's assets | What it needs | Tool (licence) |
| --- | --- | --- | --- |
| Photogrammetry | not applicable: it needs dozens of photos of a real subject; Roxi is generated | — | — |
| Image-based reconstruction | 2.5D only (today's hologram: picture + estimated depth) | consistent new views for anything 3D | Depth Anything V2 (Apache-2.0), in use |
| Facial geometry | a base head fitted to her front landmarks | three-quarter and profile views, then sculpting | Blender (GPL; output is ours) |
| Retopology | not needed on a parametric base (it has animation topology); needed if a generated mesh is used | wrap or shrinkwrap onto the base | Blender |
| UV mapping | the base mesh's UVs | projection from each view, inpainting of unseen areas | Blender |
| PBR materials | colours from the photo, light baked into it | de-lighting; roughness and normal maps from the sculpt | Blender |
| Hair | front only | strands for the master, baked to hair cards for phones | Blender hair curves |
| Skeletal rigging | — | humanoid skeleton with fingers, about 60–70 bones | MPFB game-engine rig or Rigify |
| Facial blendshapes | — | 52 ARKit-style shapes (expressions and visemes), sculpted or transferred and corrected | Blender shape keys |
| Inverse kinematics | — | two-bone IK for reach and point, look-at for head and eyes, in the runtime | runtime (chosen in AX-04) |
| Animation retargeting | — | clips (licensed library or the owner's phone motion capture) retargeted to the rig | Blender |
| Clothing deformation | — | skinned jacket and trousers with corrective shapes; a few spring bones for hem and hair; no cloth simulation on phones | Blender |
| Mesh optimisation and LODs | — | decimation per LOD, meshopt compression, KTX2 textures | Blender, gltf-transform |
| Runtime format | — | glTF 2.0 binary (GLB) with skins, morph targets, `EXT_meshopt_compression`, `KHR_texture_basisu`; master kept as `.blend` | — |

## 4. Pipelines compared

Scores 1 (poor) to 5 (strong). "Identity" means fidelity to R09.

| Pipeline | Identity | Animation-ready | Phone performance | Licence | Cost | Feasible now |
| --- | --- | --- | --- | --- | --- | --- |
| P1 2.5D portrait (today: picture, depth, shader) | 5 (it is the photo) | 1 (slight head motion, no body) | 5 | 5 | free | yes, live |
| P2 image-to-3D generators (TRELLIS, Hunyuan3D, Meshy, Tripo) | 2–3 (drift; unseen sides invented) | 1 (triangle soup, no rig, light baked in) | 3 after retopology | mixed: TRELLIS licence unclear for commercial use, Hunyuan3D has territory limits, Meshy needs a paid plan | low to medium | blocked: sends her image outside (needs approval); Meshy refused on the free plan (26 Nov) |
| P3 Blender master on an MPFB base, fitted to her and new views | 4 with good views and artist time | 5 | 4 with LODs | 5: MPFB add-on is GPL, its asset packs CC0 or CC-BY, commercial use allowed | free tools; artist time | yes, after the inputs in §6 |
| P4a Character Creator + Headshot (Reallusion) | 4 | 5 (ARKit shapes included) | 3–4 with LODs | commercial licence | paid, Windows | needs approval and a Windows machine |
| P4b MetaHuman (Epic) | 3 (its own face space; likeness by hand) | 5 | 2 (heavy even at low LODs) | since June 2025 usable in other engines, commercially ([licence](https://www.metahuman.com/license)) | free | needs Unreal on the owner's computer |
| P5 server-rendered video avatar (HeyGen and similar) | 4 | n/a (video) | 5 (it is video) | provider terms | per minute | for pre-rendered clips only; never the interactive Roxi |
| P6 neural or Gaussian head avatars | — | — | 1 on phones today | research | — | rejected: needs video capture of a real person |

## 5. Decision (AX-D008)

1. **Live now:** P1 stays Roxi's on-screen presence (the Aether tier) until
   the 3D Roxi passes the identity test (PRODUCTION_TESTS T-ID-01). Nothing
   the member uses waits for 3D.
2. **Production digital human:** P3. A Blender master on an MPFB base,
   shaped to her proportions, the head sculpted from new reference views,
   textures projected and de-lit, hair cards, the clothes as separate skinned
   meshes, a humanoid rig with fingers, 52 facial shapes, then GLB exports
   per LOD.
3. **Fallbacks, each needing the owner's approval:** P4a if the likeness
   cannot be reached by hand; P4b if the owner wants to work in Unreal on
   their own computer; P2 only for blockouts and props (for example the
   Guardian's feather) and only after approval to send images outside.
4. **Cinematic clips:** P5 may make pre-rendered moments (HeyGen credits
   until 4 Dec 2026; her voice is ElevenLabs). Pre-rendered video is never
   presented as the interactive Roxi.
5. **Material states** (crystal body, gold light, dissolving into particles:
   IMPOSSIBILIS) are shader parameters on the same mesh, not separate
   models, so identity cannot drift between them.

## 6. Stages and their checks

| Stage | Work | Done when |
| --- | --- | --- |
| S0 Inputs | a reference sheet of Roxi in the same outfit and light: three-quarter left and right, profile left and right, back; face close-ups (front, three-quarter, profile); hands; back of hair; jacket details | each view passes a landmark comparison with R09 and the owner approves the sheet |
| S1 Body | MPFB base with her proportions, matched to the front image with an orthographic camera | silhouette overlap with the R09 matte ≥ 95 % (target) |
| S2 Head | sculpt over the base from the views | front and three-quarter renders score at least 0.80 against her source (T-ID-01) and the owner recognises her |
| S3 Texture | project, de-light, inpaint; skin PBR maps | 2k master; renders side by side with R09 approved |
| S4 Hair | strand master, baked to cards | silhouette matches front; cards under the LOD budget |
| S5 Clothing | jacket (with its piping), top, trousers, boots; corrective shapes | no clipping through the standard animation set |
| S6 Rig and face | skeleton with fingers, IK targets, 52 shapes plus visemes | the expression and viseme sheet renders cleanly |
| S7 States | standard, gold light, crystal, dissolve: shader parameters | each state renders from the same mesh |
| S8 Export | LOD0–LOD3 GLB, meshopt, KTX2 | sizes inside §7, loaded in a glTF validator without errors |
| S9 Runtime spike (AX-04) | the same GLB in react-native-filament and in expo-gl + three on the owner's Samsung and a 120 USD-class Android | frame time, memory and APK growth measured; renderer chosen (AX-D009); identity test run |

## 7. Phone budgets (targets to measure, not measurements)

| Variant | Use | Triangles | Face shapes | Textures | GLB |
| --- | --- | --- | --- | --- | --- |
| LOD0 | close-ups on capable phones | ≤ 40 000 | 52 + visemes | 2048 KTX2 | ≤ 10 MB |
| LOD1 | half body, mid phones | ≤ 20 000 | 52 | 1024 | ≤ 5 MB |
| LOD2 | full body small, weak phones | ≤ 8 000 | about 15 visemes | 512 | ≤ 2 MB |
| LOD3 | hologram silhouette | ≤ 3 000 | none | light shader only | ≤ 0.5 MB |

Bones ≤ 70 for every LOD. The LODs share one skeleton so animation and
behaviour do not change between phones.

## 8. Runtime renderer (decided by measurement, AX-D009)

| Candidate | Facts (npm, 27 Nov 2026) | Risk |
| --- | --- | --- |
| `react-native-filament` 1.11.0 | native Filament renderer; glTF with skins and morph targets; peer `react-native-worklets-core` ≥ 1.3.2 | the app already runs Reanimated 4.7.1 with `react-native-worklets` 0.13.0; both libraries running together must be proven in a build; compatibility with RN 0.88 and Expo SDK 58 unproven |
| `expo-gl` 58.0.4 + `three` 0.187.0 (optionally `@react-three/fiber` 9.8.2) | matches Expo SDK 58; three has skinning, morph targets and an IK solver; full control over shaders for the material states | GL calls from the JS thread; frame time on weak phones unknown |
| `react-native-wgpu` 0.5.17 | WebGPU in React Native | young; noted for later |

The 3D view must be a single shared canvas for Roxi and the Guardian (the
canvas budget, D-036).

## 9. What the owner must decide

1. **New reference views (S0):** made by the owner, or generated with an
   image tool that keeps her identity (which tool, and its cost, to be
   proposed first).
2. **Sending her image outside** (image-to-3D services, motion libraries,
   commercial character tools): allowed or not.
3. **Paid tools** (Character Creator and Headshot; a paid Meshy plan): not
   used without approval.
4. **Her outfit:** the constitution keeps her recognisable clothing (the
   purple jacket); the palette avoids purple, and her glow is now gold (AX-D013).
   Recommendation: keep her outfit as her identity, and use the gold-light and
   crystal looks as material states.
5. **Where masters live:** the repository is public, so a 3D master of Roxi
   committed there could be downloaded and reused by anyone.
   Recommendation: masters in private storage; only optimised runtime files
   ship inside the app.
