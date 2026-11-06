# Roxi's plans: Free, Pro, Max

The owner's request (5 November 2026): three tiers — Free ("what we have
now"), Pro and Max — with prices and skills worked out here; both paid plans
have credit limits so nobody can use them without end; extra credits can be
bought; and Roxi can carry connectors (Gmail and as much as possible, custom
connectors, MCP, APIs). The numbers below are business numbers chosen on that
instruction. They live in `src/config/business-rules.ts` and the owner may
retune them.

## What a credit is

**1 credit = US$0.001 of what Roxi really costs to run**, read back from
ElevenLabs after every conversation (`metadata.cost_fiat`). Measured on real
conversations in November 2026 (model `gpt-6.1-sol`, voice `eleven_v4_turbo`):

| What | Real cost | Credits |
| --- | --- | --- |
| One written answer | about $0.025 | about 25 |
| One minute of voice | about $0.15 | about 150 |
| A typical short conversation | $0.05 – $0.40 | 50 – 400 |

Credits follow the real cost, not a count of messages. If the model or voice
changes and gets dearer, plans cannot silently start losing money.

## The plans

| | Free | Pro | Max |
| --- | --- | --- | --- |
| Price | $0 | **$5.99 / month** | **$14.99 / month** |
| Credits each month | 1,500 | 4,000 | 10,000 |
| ≈ written answers / voice minutes | 60 / 10 | 160 / 26 | 400 / 66 |
| Goals at once | 1 | 3 | 3 |
| Reminders | 5, one-off | 30, repeating | 100, repeating |
| Connected tools | — | 3 (Google) | 10 (Google, MCP, API) |
| Family circle | — | — | up to 6 (coming) |

**Why these prices.** Price less card fees (≈ 30¢ + 3%) must be more than the
most the plan's credits can cost, so a member who uses every credit still
does not cost Yavaya money:

- Pro: $5.99 → about $5.51 after fees, against at most $4.00 of credits.
- Max: $14.99 → about $14.24 after fees, against at most $10.00.

`tests/integration/roxi-plans.test.ts` holds the prices to that rule. Most
members use well under their allowance, which is the margin.

**Free.** "What we have now" stays free: search, drafts and every skill that
help for people with little must never sit behind a payment (finding work
without money, a lost animal, help between neighbours). Free gets 1,500
credits a month once credits are counted, because without any limit every
free account is an open-ended bill. The allowance is a starting point to
retune once real usage per member can be measured.

**Extra credits** (any plan, Free included): 1,000 for $1.99, 3,000 for $4.99,
10,000 for $14.99. Used after the month's credits, valid 12 months from the
latest purchase.

### Rules

- A conversation needs at least 150 credits to start (about a minute of
  voice). One already open is never cut off: it may take the balance below
  zero, and the next month's credits start from that debt.
- Plan credits renew each period and do not roll over. Bought credits are not
  touched by the renewal.
- Pro → Max: Max starts at once; what was left of Pro's credits is added; the
  Pro subscription is cancelled at Stripe.
- Max → Pro: cancel Max, choose Pro when it ends (no refunds to calculate).
- Cancel anytime: no further charge, the plan lasts to the end of what was
  paid, then Free. Nothing Roxi kept is deleted.
- Connector calls (a Gmail search, an MCP tool) use 2 credits each.

## Skills, by plan

Numbers are the proposal's. "Live" means it works today; "coming" is shown as
coming on `/roxi`, never as included (`src/config/roxi-skills.ts`).

| # | Skill | Plan | State |
| --- | --- | --- | --- |
| — | Search Yavaya, drafts for every form | Free | live |
| 1 | Tus metas conmigo (1 goal Free, 3 Pro/Max) | Free | live |
| 3 | Organizá mi día (a checklist) | Free | live |
| 5 | No se me olvida (reminders; repeating on Pro/Max) | Free | live |
| 6 | Sorprendeme | Free | live (search + instructions) |
| 7 | Hoy hice algo bueno (private journal) | Free | live |
| 8 | Little celebrations | Free | coming — needs confirmed-event triggers |
| 10 | Gracias por ayudarme (Roxi drafts, the member sends) | Free | live |
| 11 | Ayudame a resolverlo (safe checks → Servicios request) | Free | live |
| 14 | Busquemos juntos (lost pet) | Free | coming — the draft exists; WhatsApp image, match and neighbour alerts do not |
| 16 | Empecemos con lo que tenés | Free | live |
| 17 | Tenés más habilidades de las que creés | Free | live |
| 18 | Alguien cerca puede ayudarte | Free | live |
| 2 | Algo bueno para vos hoy (one opportunity a day) | Pro | coming |
| 4 | Mi barrio | Pro | coming |
| 12 | Cuidemos tu dinero (budget search) | Pro | coming — search has no price filter yet |
| 15 | Vendelo conmigo (follow-ups, comparable prices) | Pro | coming |
| — | Gmail and Google Calendar | Pro | built; waits on Google (below) |
| 13 | Ayudá a mi familia (family circle) | Max | coming |
| — | Mi negocio (the pulpería: am I making money?) | Max | coming |
| — | MCP servers and APIs of the member's own | Max | live |

Skill 9 ("teach me something") needs 30 fact-checked lessons a person has
reviewed; it is not assigned until they exist.

## Connectors

`src/server/domains/roxi/connectors/`. A member connects tools on
`/roxi/connections`; Roxi reaches them through two client tools,
`connected_tools` and `use_connected_tool`, which call Yavaya's server with the
member's session. Nothing reaches a connector from ElevenLabs directly.

- **Google (Pro, Max).** OAuth with `gmail.readonly`, `gmail.compose` and
  `calendar.events`; the refresh token is sealed with `ROXI_KEY`. Tools: search
  and read mail, save a draft, send, list and add events.
- **MCP (Max).** Any remote MCP server over Streamable HTTP, with an optional
  token. Its tools are read on connecting (and on "Actualizar").
- **API (Max).** Any HTTPS API with a key; Roxi calls paths under the address
  given, with the member's notes on what the API does.

**Safety.**

1. *Nothing outside Yavaya changes without the member's tap.* Sending or
   drafting mail, adding an event, an MCP tool not marked read-only, an API
   call other than GET: the server answers with a confirmation token bound
   (HMAC) to that member, connection, tool and exact arguments, valid five
   minutes; the panel shows the action as a card; only the member's "Permitir"
   releases the token. Roxi cannot approve for them.
2. *No reaching Yavaya's own network.* Member-typed addresses must be https and
   resolve only to public addresses; the check runs inside the socket's own
   DNS look-up, so a name cannot pass the check and then connect elsewhere.
   No redirects are followed; answers are time- and size-limited.
3. *What comes back is data.* Tool results are marked as untrusted, and Roxi's
   instructions say never to follow instructions found in an email or page.
4. Secrets are sealed at rest with `ROXI_KEY`, never shown again, and deleted
   (Google: revoked) when the connection is removed.

## What is not live yet, and why

- **Paid plans cannot be bought until credits can be counted.** That needs
  `ELEVENLABS_API_KEY` in production (Agents permission), and then the agent's
  authentication switched on so every conversation starts from a signed link
  Yavaya recorded. Until then `/roxi` shows the plans without buy buttons and
  says why; Roxi works exactly as before (20 conversations a day).
- **Gmail and Calendar** wait on the Google Cloud project: enable both APIs,
  add the scopes to the consent screen, register
  `https://yavaya.lat/api/roxi/connectors/google/callback`, then set
  `ROXI_GOOGLE_CONNECTOR=enabled`. Gmail's scopes are restricted: until Google
  verifies the app, at most 100 accounts can connect, with a warning screen.
