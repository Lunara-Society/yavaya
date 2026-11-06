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
| Name | Te ayudo | Te acompaño | Lo hacemos realidad |
| Price | $0 | **$4.99 / month** | **$12.99 / month** |
| Credits each month | 1,500 | 4,000 | 10,000 |
| ≈ written answers / voice minutes | 60 / 10 | 160 / 26 | 400 / 66 |
| Goals at once | 1 | 3 | 3 |
| Reminders | 5, one-off | 30, repeating | 100, repeating |
| Watches ("avisame cuando…") | 2 | 10 | 25 |
| Missions at once | — | 5 | 20 |
| Time capsules | — | 10 | 50 |
| Connected tools | — | 3 (Google) | 10 (Google, MCP, API) |
| Family circle | — | — | up to 6 (coming) |

**Why these prices.** Price less card fees (≈ 30¢ + 3%) must be more than the
most the plan's credits can cost, so a member who uses every credit still
does not cost Yavaya money:

- Pro: $4.99 → about $4.54 after fees, against at most $4.00 of credits.
- Max: $12.99 → about $12.30 after fees, against at most $10.00.

The prices are the ones the owner suggested on 6 November 2026 (they replace
the first proposal of $5.99 and $14.99); both still pass the rule.

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

The owner's ideas 1–50. "Live" means it works today; "coming" is shown as
coming on `/roxi`, never as included (`src/config/roxi-skills.ts`; the plan of
each is `ROXI_SKILL_PLANS` in `business-rules.ts`). Basic bookkeeping stays
free, as the proposal asks.

**Free — Te ayudo**

| Skill | State |
| --- | --- |
| Search Yavaya, drafts for every form | live |
| ¿Qué necesitás hoy? (front door, homepage and /roxi/hoy) | live |
| Mi mundo: the day and the community pulse (records only, demo excluded) | live |
| Tus metas, Organizá mi día, No se me olvida (with "después" snooze) | live |
| Avisame cuando… (2 watches) | live |
| Mi negocio: the ledger — sales, stock, expenses, fiado; totals in the database | live |
| Mi camino (records vs what the member told, marked) and milestones | live |
| Hoy hice algo bueno, Sorprendeme, Gracias, Ayudame a resolverlo | live |
| Human connection, second chances, camera eyes, share, real-world memory | live (instructions + existing tools) |
| Empecemos con lo que tenés, habilidades, alguien cerca | live |
| Trusted contact; little celebrations; lost-pet guard | coming |

**Pro — Te acompaño**

| Skill | State |
| --- | --- |
| Algo bueno para vos hoy (one real opportunity a day, or none) | live |
| Missions with steps; time capsules | live |
| More goals, reminders (repeating) and 10 watches | live |
| Gmail and Google Calendar | built; waits on Google (below) |
| Mi barrio, budget finder, sell with me, anticipation, negotiation coach, knowledge vault, cross-district, store rescue | coming |

**Max — Lo hacemos realidad**

| Skill | State |
| --- | --- |
| MCP servers and APIs of the member's own | live |
| 20 missions, 50 capsules, 25 watches | live |
| Family circle, business insights, connects the dots, opportunity radar, chain reaction, storykeeper, mission agent, live world, digital twin, multi-agent, life OS | coming |

"Teach me something" needs fact-checked lessons a person has reviewed; it is
not assigned until they exist.

**Never invented.** Pulse, opportunity and path read only real, non-demo
records; an empty town says it is empty. The ledger's figures are computed by
the database in whole cents, per currency, never by the model.

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
