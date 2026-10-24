# Roxi

Roxi is Yavaya's assistant. A signed-in member talks or writes to her from the
button at the bottom of every page (except Espacio Violeta and the sign-in
pages), and can send her photos. She explains how Yavaya works, searches the
districts, reads the member's own account, opens pages, and prepares drafts —
a Mercadito listing from a photo, a Comunidad post, a prayer request, a
Servicios request, a lost or found animal. **She never publishes, pays or
sends anything**: a draft opens in the real form, filled in, and the member
taps the button.

## How it fits together

```
member's browser ──(voice/text, photos)──► ElevenLabs agent (speech, model, knowledge)
       ▲                                         │
       │  client tools run here, with the        │ tool call
       │  member's own session cookie            ▼
       └──── src/ui/roxi/tools.ts ──► /api/roxi/{search,me}   (read only)
                                 └──► opens /mercadito/publish etc. with the draft
```

- **The agent** lives at ElevenLabs (IDs below). It holds the prompt, the
  voice, the knowledge base and the tool *descriptions*.
- **The tools run in the browser** (`src/ui/roxi/tools.ts`), so every look-up
  goes through Yavaya's own routes with the member's session: Roxi can see
  exactly what the member could open themselves, nothing more. ElevenLabs
  never holds a Yavaya credential.
- **Drafts** wait in memory in the tab (`src/ui/roxi/drafts.ts`) until the
  form takes them; `RoxiPrefill` fills the fields and attaches the photos.
  Nothing is stored, and the server checks the form like any other. A listing
  published from a draft is marked `assistedBy: 'roxi'` in the audit record.
- **Live status.** Every conversation starts with the capability register
  (`src/server/domains/roxi/status.ts`) passed as `platform_status`, so Roxi
  never offers what `/status` says is not working.

## The interface

`src/ui/roxi/` — the launcher (`roxi-root.tsx`), the conversation (`roxi-panel.tsx`)
and the orb (`orb.tsx`); styles in the "Roxi" block of `src/app/site.css`.

- **Wide screens:** a full-height column on the right. From 1280px the page
  moves over to make room (`html[data-roxi="open"]`), so a form Roxi opens
  stays in full view beside her.
- **Phones:** a sheet from the bottom. When Roxi opens a page or a form she
  shrinks to an island above the dock, showing what she is saying, and the
  member brings her back with a tap.
- **The orb** is a WebGL shader of liquid gold driven by the live voice level
  and Roxi's state (idle, listening, speaking, thinking). It caps its
  resolution on modest phones, stops when the tab is hidden, draws a still
  frame with reduced motion, and falls back to a CSS sphere without WebGL.
- Obsidian glass and gold in both themes, on purpose: she looks the same
  wherever she appears.

## The agent

| | |
| --- | --- |
| Agent | `agent_6601m5ddjn5deqwr34g8zrx41ap4` ("Roxi · Yavaya") |
| Prompt | `docs/roxi/prompt.md` — the copy on the agent must match it |
| Model | OpenAI's top conversational model, reasoning low; backups from Google, cascading after 6 s |
| Voice | "Sarah" (premade, multilingual), until a Latin American voice is added — see below |
| Language | Spanish, switching to English when the member speaks it |
| Photos | file input on: up to 12 per conversation, 6 kept in memory |
| Length | 10 minutes per conversation |
| Limits | 25 at once, 1 500 a day across all members (queue of 3 minutes when full) |

Claude models are listed by ElevenLabs but did not answer on this workspace
(every attempt ended "all LLM attempts exhausted", with no usage recorded), so
they are not in the cascade. Worth retrying if the workspace changes plan.

### Tools

| Tool | ID | Browser side |
| --- | --- | --- |
| `search_yavaya` | `tool_1901m5ddkcwpe9b82jv3dbb6103a` | `GET /api/roxi/search` |
| `my_account` | `tool_0701m5ddkf7gfkk97gtr63s6q8np` | `GET /api/roxi/me` |
| `prepare_listing` | `tool_9901m5ddkrk8fdc9creqg18rvhnv` | opens `/mercadito/publish` |
| `prepare_post` | `tool_7301m5ddkzpjf1frtx89d7dm5y7k` | opens the matching form |
| `open_page` | `tool_3601m5ddm6w8fs6td388d50p5mzd` | navigates (`ROXI_PAGES`) |
| `open_result` | `tool_5901m5ddm8s2erabeqjvyq863gfv` | navigates to a search result |

Their definitions are kept in `docs/roxi/tools.json`. `tests/unit/roxi-tools.test.ts`
holds the three copies together: the browser functions, `tools.json`, and the
server's own value lists (categories, conditions, species, scopes, pages). A
new category or page fails that test until all three agree — and then the
tool at ElevenLabs must be updated from `tools.json` too.

### Knowledge base

Generated from the site's own sources by `scripts/roxi-knowledge.ts`, so
nothing is typed twice:

| Document | ID | Use |
| --- | --- | --- |
| `knowledge/sitio.md` — every public page | `ZwVWes6v2RdA5G3MO8E6` | retrieval |
| `knowledge/textos-de-la-plataforma.md` — every form, notice and error | `npIKOVGVrFaXvdYQLDut` | retrieval |
| `knowledge/reglas.md` — member-facing business rules | `SKLpYnPf1hJZmddBMqXg` | always in the prompt |
| `knowledge/guia-narrada.md` — the video guide's narration | `L9cayZOfF2vdeYW1szOv` | retrieval |

Retrieval uses the multilingual embedding model. The rules document leaves
out anti-abuse thresholds and plumbing on purpose (`INTERNAL_FIELD` in the
script).

The IDs above are the current documents; a replacement gets a new ID (see
"Changing the knowledge"), so check the agent before trusting this table.

### Tests

Nine behaviour tests are attached to the agent and run from its Tests tab:

| Test | ID |
| --- | --- |
| vender una camiseta (borrador sin precio) — simulation | `test_8201m5ddvq71e50b0r2htwn6d4de` |
| buscar bicicleta en León — tool call | `test_9201m5ddvvqzeg99egkea9esfsvd` |
| abrir notificaciones — tool call | `test_1501m5ddvz5ffrm9pq46jv9k4qem` |
| publicaciones gratis en Mercadito | `test_8901m5ddw3kgfzna8e5fz9apba5d` |
| nunca dice que publicó | `test_8301m5ddw8htennbae136qwfgjpp` |
| no ofrece lo que no funciona | `test_3001m5ddwd9qfbcbrk5h5b0f41gp` |
| cuidado ante autolesión | `test_4901m5ddwjjge20az6wnq7ftnjb6` |
| resiste inyección de instrucciones | `test_7001m5ddwqpyezpt9152sttve54g` |
| responde en inglés | `test_7701m5ddwvhger0s2bjrnkn9w96c` |

Run them after every change to the prompt, the model or the knowledge.

Since 24 October 2026 the injection test ends "failed" with *Unknown error
occurred whilst attempting to evaluate*, no agent reply and no model usage:
the prompt-injection guardrail now stops that message before the model runs,
so the evaluator has nothing to grade. That is the guardrail working, not a
regression — check `agent_responses` is empty before treating it as one, and
do not switch the guardrail off to make the test green.

## Keeping Roxi current

### Changing what she says or does

Edit `docs/roxi/prompt.md`, paste the same text into the agent's system
prompt, run the tests, commit. The two must not drift.

### Changing the knowledge

After changing site texts, dictionaries or business rules:

1. `npx tsx scripts/roxi-knowledge.ts` and commit the result.
2. For each changed file, add a URL document pointing at the raw file **at
   that commit**
   (`https://raw.githubusercontent.com/Lunara-Society/yavaya/<commit>/platform/docs/roxi/knowledge/<file>`),
   index it with the multilingual model, swap it into the agent's knowledge
   base in place of the old one (keeping `reglas` in prompt mode), then delete
   the old document.
3. Run the tests.

Pinning to a commit, not a branch, means the agent's knowledge changes only
when someone decides it should.

### Changing the voice

Library voices must be added to the workspace ("My Voices") before an agent
can use them; otherwise the agent fails with `voice_not_found`. Two warm Latin
American voices were picked and are waiting for that step:
"Alma – Voz Latina Cálida" (`3ttovAt5bt3Kk38UGIob`) and
"Jhenny – Warm, Fluid and Smooth" (`FXGrCtY3PEyfqczBAlqm`). Once one is added,
set it on the agent's Voice tab.

## Privacy and safety on the agent

- Voice is **not recorded**; audio is deleted. Transcripts are kept 30 days,
  to review quality and abuse, then deleted. The privacy page says this
  (`/privacy#roxi`).
- Automatic redaction of names and numbers in transcripts needs an enterprise
  plan and is off; the prompt tells Roxi never to ask for or repeat passwords,
  codes, card or document numbers.
- The prompt-injection guardrail is on. The content guardrails are off on
  purpose: in streaming mode their only action is to end the conversation,
  which would cut off a member who mentions self-harm — exactly when Roxi
  should stay (one of the tests).
- Only `yavaya.lat` and `www.yavaya.lat` may open a conversation, and the
  origin header is required. See `docs/SECURITY.md`, "Roxi", and
  `docs/CONFIGURATION.md`, "Roxi".
