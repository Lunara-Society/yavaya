# Roxi's identity consistency specification (AX-04)

What must stay true for Roxi to be Roxi in every medium (3D, 2.5D hologram,
portrait, video, stills), how it is measured and who signs it off. Written
27 November 2026 from the owner's AX-04 text: "Preserve original
violet-and-black clothing. Remove tactical gloves, holsters and combat
accessories." Companion documents: [ROXI_ENGINE.md](ROXI_ENGINE.md),
[ROXI_PIPELINE.md](ROXI_PIPELINE.md), [ROXI_CAPABILITIES.md](ROXI_CAPABILITIES.md).

## 1. The canonical reference

| Item | Value |
| --- | --- |
| Image | `mobile/art/roxi/roxi-source.png`: 1440 × 3088, front, full length; SHA-256 `83b37f266d542799d0e33d4e129eff481e1b97a897e00e2d30653cdc4568fbf7` |
| Matte | `mobile/art/roxi/roxi-matte.png`: 1440 × 3088, her silhouette, used by the hologram; SHA-256 `7bcb7598f29ec9618afe229de45b393211e01acf44e982d339ac308141462623` |
| Face box in the source | (550, 110) to (910, 470) |
| Origin | Yavaya's own image, AI-generated, not a real person (the owner, 26 Nov) |

Nothing replaces this image as the reference except the owner's explicit
decision. Generated or modelled versions are measured against it, never
against each other, so small errors cannot accumulate.

## 2. Invariants

| Part | Must stay | Measured colour (source, k-means on the matte) |
| --- | --- | --- |
| Face | her face as in the source: shape, proportions, age, features | skin lit `#C68671`, shadow `#9D6554` |
| Eyes | their shape, spacing and colour as in the source | colour to measure (T-ID-04) |
| Hair | long, straight, black, centre parting | `#100C14` |
| Build | slim, her height-to-width proportions | — |
| Jacket | purple, stand collar, lilac piping | base `#3E2949`, lit `#5C3677`, piping `#8E54CB` |
| Top | black, under the jacket | `#100C14` |
| Trousers | dark purple | `#2E1F36`, `#211928` |
| Boots | black ankle boots | `#1A1420` (darkest) |
| Pendant | a small pendant | — |

The clothing stays violet and black (AX-D020): it is who she is. The
interface around her stays champagne and never borrows her violet
(VISUAL_LANGUAGE §2).

## 3. Never part of her

Unrequested items and clothing changes introduced by the generated
references, all refused (ROXI_CAPABILITIES §1):

- tactical or fingerless gloves;
- holsters, thigh pouches and harness straps;
- tall or lace-up combat boots, cargo or tactical trousers, belts with
  pouches, and any belt not in the source;
- weapons, badges, logos, insignia and any mark from a reference
  (AX-D017);
- wavy hair, violet streaks, brown hair, a leather jacket or any other
  reference woman's hair or clothes;
- any other face: the references give movement only (AX-D016).

Also never: a violet glow (hers is champagne gold), a change of age, skin
tone, eye colour or body shape, or sexualised framing.

## 4. What may vary

Pose, gesture and expression; hair and cloth movement; lighting (the
champagne key light, darkness around her); her material state (light body,
reconstruction, transparency) while she is being built or leaving; level of
detail within the budgets of [ROXI_PIPELINE.md](ROXI_PIPELINE.md) §7. Every
variation must still pass §5.

## 5. How identity is measured

Every character asset, material, facial animation and rendering variant is
checked. Run on every new or changed Roxi asset, on renders of it (a neutral-light
identity render, not the stylised look): front view at the canonical
framing, three-quarter left and right, and the expressions the asset
supports.

| Test | What | Pass | Tool | Status |
| --- | --- | --- | --- | --- |
| T-ID-01 | face similarity, SFace cosine against the source face | ≥ 0.80 on front and three-quarter renders, faces at least 60 px wide (her own images score 0.95–0.99, and 0.88–0.90 at GIF size) | `design/references/aether/tools/identity_check.py` | REAL (tool exists and is calibrated) |
| T-ID-03 | face proportions from the five YuNet landmarks: eye distance to face width, eye line to nose, eye line to mouth, mouth width, each against eye distance | each within ±6 % of the source, on front renders (yaw within ±10°) | to add to `identity_check.py` | NOT IMPLEMENTED |
| T-ID-04 | colour of each part in §2, ΔE2000 against the source colours | skin ≤ 5, hair ≤ 5, jacket, piping, top, trousers and boots ≤ 8 | to build beside `identity_check.py` | NOT IMPLEMENTED |
| T-ID-05 | silhouette, IoU of the front render's matte against `roxi-matte.png` at the same framing | ≥ 0.95 | to build | NOT IMPLEMENTED |
| T-ID-06 | items in §3 absent | a reviewer ticks the list for every view | checklist in the asset's record | REAL (manual) |
| T-ID-07 | recognition | the owner, shown a sheet of renders without prompting, says it is Roxi | the owner | REAL (manual) |

A score is a measurement that supports a judgement; the owner's recognition
(T-ID-07) is the final gate. An asset that fails any test does not ship;
until a 3D Roxi passes, the 2.5D hologram made from her real picture stays
her body in the app.

## 6. The identity record for each asset

Every Roxi asset gets a row in [ASSET_REGISTRY.md](ASSET_REGISTRY.md) with:
file and SHA-256; medium and level of detail; the source hash it was
measured against; each test's value (T-ID-01, 03, 04, 05) and pass or fail;
the T-ID-06 checklist; the owner's T-ID-07 answer and its date; the
reviewer. Measurement files go in `design/references/aether/` as
`identity-<asset>-<date>.json`, as the reference checks do today.

## 7. Where the checks run

At the end of each pipeline stage that changes her look (ROXI_PIPELINE §6:
S1 Body, S2 Head, S3 Texture, S4 Hair, S5 Clothing, S7 States, S8 Export),
in spike S9 for both 3D candidates, before
any build that changes her renderer or assets, and whenever the owner
supplies new views of her (AX-D021).
