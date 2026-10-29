# The guide in video — version 2 plan

Prepared 29 October 2026, when the reminder for v2 fired. Filming is **on hold
until the Higgsfield account is topped up** (22 credits that day; one shot
costs 35 or more). Everything below that costs nothing is done, so the shoot
can start the day credits arrive.

## Decisions

| Question | Answer | Who, when |
| --- | --- | --- |
| Narration | Carito, as in v1. Only new or changed sections are recorded again; every other section keeps its v1 take (`best_takes.json`). | Owner, 29 Oct |
| 9:16 for social media | Cropped from the 16:9 shots, as in v1 (subject kept in the centre third). Only the teaser is shot upright. | Owner, 29 Oct |
| How much is filmed | **Open** — pilot, key shots or full (costs below). Waits for the top-up. | — |
| Roxi | **Open** — no preference given. The script below drafts her own chapter (the recommendation); it can be cut down to the intro line alone. | — |

## The v1 narration, checked against the site on 29 October

Nothing the live guide says has stopped being true. Each claim was checked in
the code that runs yavaya.lat:

| Claim (section) | Where it holds |
| --- | --- |
| Up to five active listings free; featured for seven days (Mercadito) | `MERCADITO_RULES.freeOpenListings` = 5, `featureDays` = 7 |
| New accounts start with few listings (Mercadito) | `newSellerMaxListings` = 3 in the first 7 days |
| The seven categories named (Mercadito) | `mercadito.category.*` |
| Payment between buyer and seller, in cash; Yavaya doesn't touch it | Stripe sells tokens only; listings have no payment |
| Two open job posts free (Trabajo) | `WORK_RULES.freeOpenPosts` = 2 |
| Cash on delivery, no commission; orders for someone else; Viajes y mandados; starting in Managua (YavayaGo) | `launchPlaceCode` = Managua; gift orders and trips shipped before v1 |
| Room messages gone after 30 days, private ones after 90; Escape twice (Espacio Violeta) | `SAFE_SPACE_RULES` 30 / 90; `ui/violeta/client.tsx` |
| Reminder a month after an adoption (Animales) | `followUpDays` = 30 |
| From the plaza, doors to Santuario and Espacio Violeta (Comunidad) | `app/community/page.tsx` links both |
| YAY ID of 8 digits; reputation 0–1000 (Confianza) | `yayIdDigits` = 8; trust score 0–1000 |
| Welcome tokens in the first week; more for inviting friends | 2 a day for 7 days; 3 to the inviter, 2 to the friend |
| Tokens from under a dollar | Smallest package: 2 tokens for US$0.99 |
| Language, light/dark theme and location precision are yours to choose | `app/settings/page.tsx` |

Check again on the day v2 is recorded: rules can change in between.

## What v2 must change, whatever the budget

1. **Every screen recording.** All 27 in `capture.cjs` show the site before
   the redesign of 21–25 October (each district's own colours, sign and
   layout; the new home page; the token price list). Re-capture them with a
   test member's account (`CAPTURE_EMAIL` / `CAPTURE_PASSWORD`, never a real
   person's):
   `/mercadito`, `/mercadito/about`, `/mercadito/publish`, `/services`,
   `/services/new`, `/services/about`, `/work` (2), `/yavayago` (2),
   `/yavayago/viajes` (3), `/community/about`, `/community/new`, `/violeta`
   (2), `/sanctuary` (2), `/sanctuary/prayer`, `/animals`, `/animals/learn`,
   `/animals/lost`, `/trust`, `/tokens`, `/status`, `/reputation`, `/login`.
2. **Roxi**, launched 20 October, is not in the guide. Add at least the intro
   line; the recommendation is her own chapter (below), with real screen
   recordings of her panel, settings and a prepared listing.

## Script changes — the only lines Carito records again

Same conventions as `scripts.py` (tags in brackets direct the voice and are
stripped from captions).

**Intro** — the whole intro is recorded again (60 s; one changed sentence
does not splice cleanly). The district walk becomes:

> [excited] En esta guía te llevo de la mano, distrito por distrito. Vamos a
> pasear por el Mercadito, Servicios y Trabajo. Nos subimos a YavayaGo, con
> sus viajes y mandados. Entramos a la Comunidad y al Espacio Violeta. Hacemos
> una pausa en el Santuario, conocemos a los peluditos de Animales, te
> presento a Roxi… [laughs softly] y al final te cuento el secreto que lo
> sostiene todo: la confianza.

**New chapter `roxi`** — "Roxi, tu asistente", between Animales and
Confianza, about 70 s:

```
("roxi", "Roxi, tu asistente", "/guia", """
[curious] ¿Y si no sabes por dónde empezar? [warmly] Para eso está Roxi.
Roxi es la asistente de Yavaya, con inteligencia artificial. Con tu sesión iniciada, tocas su botón… y le hablas, o le escribes.
[happy] Te explica cómo funciona cada distrito, busca por ti, y te dice cuántos tokens tienes o cuántas publicaciones gratis te quedan.
[excited] ¿Quieres vender algo? Mándale una foto. Roxi te prepara la publicación: el título, la descripción, la categoría… [laughs softly] Tú pones el precio, la revisas, y tocas «Publicar».
También te ayuda a pedir un servicio, a escribir tu perfil de Trabajo, o a avisar que se perdió tu perrito.
[softly] Y algo importante: Roxi nunca publica, ni paga, ni envía nada por ti. Solo ve las fotos que tú le mandas, y la cámara se abre solo cuando tú la tocas. Al Espacio Violeta, Roxi no entra. Y como toda inteligencia artificial, puede equivocarse: revisa siempre antes de publicar.
¿Prefieres que no te salude? En sus ajustes eliges: silenciosa, disponible… o proactiva.
[warmly] Roxi está aquí para echarte una mano. Tú decides.
"""),
```

Every statement in it matches what Roxi does (`docs/roxi/README.md`): her
tools (search, account, drafts for Mercadito, Servicios, Trabajo and lost
animals), that she never publishes or pays, photos only when sent, the camera
only on a tap, absent from Espacio Violeta, the panel's own "puede
equivocarse" notice, and the three presence modes.

The chapter also needs: a key in `GuideKey` and `GUIDE_SECONDS`, a chapter in
`GUIDE_CHAPTERS`, English captions (`captions_en.py`), and, if it gets its
own page film, a home for it (Roxi has no page; it can live on `/guia` only).

## How to film it: animate the v1 stills

Use each chosen v1 still as the **first frame** of a Seedance 2.5
image-to-video shot. Each shot keeps the people and places viewers already
know from v1 (Carlos and his bicycle, the market, the families), the art
direction is already approved, and the 9:16 crop windows already exist
(`crops_auto.json`, `crops_fix.json`); check each crop again once things
move.

Settings: 16:9, 5 s, no sound (the score and Carito carry the audio).
Lessons from the home page film (`tools/hero-film/README.md`): the model
moves the camera more than asked, so ask for "locked-off" or "slow push-in"
explicitly and expect re-rolls; keep the main subject in the centre third so
the vertical crop still holds once things move.

Every brief ends with the line in `pilot_shots.json` → `suffix` (the Roxi
shots, which have no first frame: `suffix_text_to_video`).

## Shots and credits

Known price: **7 credits a second at 720p** (a 5 s shot costs 35; Higgsfield
history, 15 and 24 October). The 1080p price is not known: make **one 1080p
test shot first** and scale the table. Re-rolls are planned at 30%.

| Option | Shots | Seconds filmed | Credits at 720p | With re-rolls |
| --- | --- | --- | --- | --- |
| Pilot — intro + Mercadito | 17 | 85 | ~600 | **~780** |
| Key shots — 4 per section, 12 sections | 48 | 240 | ~1,700 | **~2,200** |
| Full — every still + 6 for Roxi | 102 | 510 | ~3,600 | **~4,650** |

Seedance 2.5 can also make 480p drafts and finalise the chosen ones at 1080p
within seven days; if drafts are cheap, re-rolls cost less than planned.

The pilot's 17 motion briefs are written (`pilot_shots.json`), and so are the
Roxi chapter's 6 (in the same file, as `roxi`).

## The day credits arrive

1. One 1080p test shot (pilot `m1`) to learn the price; settle the option.
2. Film the pilot; the owner judges the look before anything more is spent.
3. Record Carito: the new intro and, if kept, the Roxi chapter.
4. Re-capture the 27 screens on the redesigned site, plus Roxi's panel.
5. Re-time (`asr.py` → `timeline.py`), render, mix, assemble; 9:16 cuts.
6. Raise `GUIDE_VERSION` to 2, update `GUIDE_SECONDS`, `GUIDE_CHAPTERS`,
   `GUIDE_PUBLISHED`; re-time both caption tracks (the test checks they
   match cue for cue); check every narrated fact again; upload; deploy.
