# Una vela por alguien

> The owner's brief (20 November 2026): on the prayer wall, a button "light a
> candle for someone"; the person chooses whom by sending it with whatever app
> they have; above the candle being lit, the day's prayer; "really epic and
> comforting". Made with Blender and HeyGen HyperFrames.

## What a member sees

1. On the prayer wall (`/sanctuary/prayer`), a card: *Enciende una vela por
   alguien*, with a still of the lit candle. Anyone sees it; lighting one
   asks to sign in.
2. `/sanctuary/vela`: the chapel's arched window onto night. In the dark above
   the candle, **the day's prayer** (the daily light's prayer for that day,
   `@/i18n/daily`, in the reader's language — real text, so it can be read
   aloud and enlarged). Beneath: *¿Por quién la enciendes?* and *Tu
   intención* (both optional, short, no links) and *No mostrar mi nombre*.
3. *Encender la vela*: a small golden light is born under the prayer, comes
   down trailing sparks and touches the wick; the flame catches with a bloom
   of warm light, the room warms, small lights rise like prayers; "Por Mamá"
   appears beneath the flame; the candle burns on in a seamless loop.
4. *Enviársela* opens **the phone's own share sheet** (Web Share): the apps
   the person has installed appear — WhatsApp, Messenger, Telegram, SMS —
   and they choose the app and then whom. The message: "Mamá, encendí una
   vela por ti, con la oración de hoy 🕯️" and the candle's link.
   *Enviar el video* (where the phone can share files) sends the film itself,
   with the same words and link. Without a share sheet (most computers):
   *Enviar por WhatsApp* and *Copiar el enlace*.
5. The link (`/sanctuary/vela/<id>`) needs no account: the person it is for
   may not have one. It lights itself once — the same descent and catching —
   then shows "Rosa encendió esta vela por ti" (or "Alguien…"), "Por Mamá",
   the intention, and "Arde hasta el sábado 28 de noviembre". The prayer
   above is the one of the day it was lit: what the sender saw. Its WhatsApp
   preview is its own card: the lit candle and "Una vela encendida por ti ·
   Para Mamá". After seven days it rests: "Esta vela ardió del … al …. La
   oración sigue."
6. Both pages say how many candles were lit in the last 24 hours — a real
   count — so no one lights theirs alone.

With reduced motion asked for, nothing plays: the lit candle is a still.

## Rules (Yavaya's own defaults, `SANCTUARY_RULES`)

- A candle burns `candleBurnDays` (7) — the seven-day *veladoras* lit in
  churches across the region.
- Name up to `candleNameMaxLength` (40), intention up to
  `candleIntentionMaxLength` (140); links refused (a domain, `wa.me`, `t.me`).
- `candlesPerDay` (20) per member; reports 10 an hour per member or network.
- Free, always. Members light; anyone may look.

## Safety

The page is public to whoever holds its link and shows a member's words, so:
words are short and link-free; the sender may stay unnamed but is always
known to Yavaya (audit `sanctuary.candle_lit`); and anyone with the link can
**report what is written** — the words are hidden at once (the flame keeps
burning), a high-priority ticket opens in Santuario's moderation queue with
the words, and the sender is on record. Pages are `noindex`.

## The film

Made once, served from `/public/velas` (all small: about 0.2–0.8 MB each):

| File | What |
| --- | --- |
| `encender.mp4` | The lighting, 4 s: unlit; the light comes down (0.45–1.7 s); the flame catches at 1.7 s |
| `arde.mp4` | The burning loop, 4 s; its last frame runs into its first, and the lighting's last into its first |
| `apagada.webp`, `encendida.webp` | Stills: before, and burning |
| `compartir-es.mp4`, `compartir-en.mp4` | The film to send, 12 s, with one line ("Encendí una vela por ti") and the site's name |
| `og.jpg` | The background of the preview card |

How it was made and how to make it again: `tools/sanctuary-candle/README.md`.
Blender draws the candle (wax with light inside it, the wick, the flame and
its mantle, the gold dish, the altar), HyperFrames the surroundings (the warm
dark, distant candles out of focus, a light from above, rising lights) and
the light that comes down to light it, and ffmpeg joins the layers.

## Files

| | |
| --- | --- |
| Schema | `sanctuaryCandles` in `src/server/db/schema/sanctuary.ts`, migration `drizzle/0057_sanctuary_candles.sql` |
| Domain | `src/server/domains/sanctuary/candles.ts` |
| Routes | `POST /api/sanctuary/candles`, `POST /api/sanctuary/candles/[id]/report` |
| Pages | `src/app/sanctuary/vela/page.tsx`, `vela/[id]/page.tsx`, `vela/[id]/image/route.tsx`; the card in `prayer/page.tsx` |
| Client | `src/ui/sanctuary/candle.tsx`, `candle-film.ts`, `candle-report.tsx`; styles in `src/app/sanctuary/barrio.css` |
| Tests | `tests/integration/sanctuary-candles.test.ts` (3); `tests/e2e/sanctuary-candle.cjs` (17 checks on a phone) |
