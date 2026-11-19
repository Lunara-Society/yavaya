# Roxi's flagship: photos, price and place to a published listing

The one workflow the owner's "Roxi Sovereign" brief (19 November 2026,
phases I and II) asked to perfect first: a member gives Roxi photos, a price
and a place, by text or voice, and ends with a reviewed, published Mercadito
listing. The owner chose "website first, then WhatsApp". This page is the
first slice, the website. The WhatsApp slice (photos sent on WhatsApp, a
one-tap link to the same review and form) builds on the same drafts.

## How it works

1. **Photos.** The member sends Roxi photos in her panel (camera or gallery,
   with the photo coach's advice). Counted: `listing_photos`.
2. **Draft.** Roxi writes the listing (`prepare_listing`). The panel keeps
   it on the server with the photos (`POST /api/roxi/drafts`) and shows it
   as a **review card**. Nothing opens and nothing is published. Counted:
   `listing_drafted`.
3. **Review.** On the card the member can change the title, price and
   description, and take photos out. Every change is saved at once
   (`PATCH /api/roxi/drafts/<id>`), so the card is the same on any device. A
   draft waiting on the server comes back as its card whenever Roxi's panel
   opens: another tab, another device, after closing everything.
4. **Form.** "Revisar y publicar" opens the real form at
   `/mercadito/publish?draft=<id>`, filled in from the server's copy, photos
   included (shown through their private route, not uploaded again).
   Counted once per draft: `listing_opened`.
5. **Publish.** The member taps Publicar. The listing route publishes under
   the **draft's id**, takes the photos the member kept from the draft
   (`claimDraftForPublish`, in the same transaction as `publishListing`),
   and ends the draft. Counted: `listing_published`.
6. **Receipt.** Roxi's panel shows what publishing came to: the listing, its
   price, whether it was free (and how many free open listings are left) or
   what it cost in tokens, and how to edit or withdraw it. Every figure comes
   from the server's record of the publish (its audit event), through
   `/api/roxi/receipt`. A live conversation is told the same facts, so Roxi
   confirms only what happened.

The funnel is on Admin → Visitas, "Roxi: de fotos a anuncio publicado":
anonymous counts per day, each step as a share of the first.

## What keeps it honest

- **Roxi never publishes, pays or makes anything public.** The member's own
  tap on the form's publish button is the authorisation, as before. The card
  says so.
- **Publishing twice publishes once.** The draft's id is the listing's id, so
  a second tap, a second tab or a second device gets the first result
  (`publishListing` deduplicates) and is never charged twice.
- **A refused publish changes nothing.** Not enough tokens, a wrong currency,
  anything the server refuses: the transaction rolls back, and the draft and
  its photos are waiting as they were.
- **Photos are private until published.** Purpose `roxi_draft` is in
  `PRIVATE_MEDIA_PURPOSES`: the public `/media` route never serves them, and
  `/api/roxi/drafts/photo/<id>` serves them to their owner only. Publishing
  turns them into listing photos. Discarding a draft, replacing it, or its
  expiry deletes them.
- **A draft is not kept forever.** `ROXI_RULES.draftKeepDays` (7 days,
  retunable as `roxi.draft_keep_days`); an edit gives it the full time again.
  The `roxi-upkeep` job deletes expired drafts and their photos.
- **One draft per member and form.** A new listing replaces the waiting one.
  The same listing worked on again in the conversation (a new photo, a better
  title) keeps its id and adds the new photos (`continue`).

## Switch and rollback

Admin → Diseño del sitio → "Roxi: borradores, revisión y recibo de anuncios"
(`roxi.review`), **off** by default. While it is off, only someone who may
change switches has the flagship (the owner tries it first); everyone else
has Roxi as she was: `prepare_listing` opens the filled-in form in the tab,
in memory, as before. Every route checks the switch on the server, not only
the panel.

Turning it off sends everyone back to that behaviour at once. Waiting drafts
stay on the server, unseen, until they expire; nothing published changes.
Nothing new is charged: publishing costs exactly what it did (free within
the open-listing allowance, then the listed token cost).

## Where it lives

| Part | File |
|---|---|
| Drafts (the rules above) | `server/domains/roxi/drafts.ts`, table `roxi_drafts` |
| Draft API | `app/api/roxi/drafts/` (list/create, one draft, private photo) |
| Receipt | `publishReceipt` in `server/domains/mercadito/service.ts`, `app/api/roxi/receipt` |
| Publishing from a draft | `app/api/mercadito/listings/route.ts` (`roxiDraft`), `publishListing(attachedImages)` |
| The form from a draft | `app/mercadito/publish/page.tsx` (`?draft=`), `ui/mercadito/listing-form.tsx` (`draft`) |
| Card and receipt | `ui/roxi/review-card.tsx`, `ui/roxi/receipt-card.tsx`, `ui/roxi/receipt.ts`, the panel and root |
| What Roxi is told | `prepare_listing` in `ui/roxi/tools.ts`, `docs/roxi/tools.json`, the selling playbook in `docs/roxi/prompt.md` |
| Funnel | `ROXI_FUNNEL_EVENTS` in `server/domains/roxi/help-stats.ts`, `app/admin/visitas` |

Tests: `tests/integration/roxi-drafts.test.ts` (privacy, replacing and
continuing, edits, expiry, publishing once, rollback, another member's
photos, the receipt, the switch) and `tests/e2e/roxi-flagship.cjs` (the whole
flow in a browser against a stand-in agent and bucket; tests/e2e/README.md).

## Names (Roxi Sovereign)

The brief's twelve systems and six engines map onto modules that already
exist (the audit of 19 November 2026). Members only ever meet "Roxi"; the
names below are for us.

- **Presence**: Roxi's visual system, the orb and its states
  (`ui/roxi/orb.tsx`, `state-bus.ts`). The brief called it Genesis; that
  name belongs to the Play character (docs/GENESIS.md), so the owner chose
  "Presence" (19 November 2026). Not to be confused with `ui/roxi/presence.tsx`,
  which is her check-ins and simulated calls (Omnipresence).
- **Morphogenesis / the Mirror**: the review card and the real forms.
- **Eternity**: drafts on the server, memory, goals.
- **Command / Aegis**: the member's own tap as the approval, the server's
  checks, private photos, the receipt from the record.
- **Ascension**: the funnel, Web Vitals (Admin → Visitas).
