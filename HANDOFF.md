# Handoff: state of Yavaya work (October 16, 2026)

Read this first in a new chat. No secrets here; they live in Railway variables.

## Infrastructure
- **Site:** yavaya.lat. Next.js app in `platform/`. Deploys automatically on Railway from `main`.
- **Railway project id:** 682b2a31-cad5-4e80-a863-51a4dd23f012.
- **Services:**
  - `yavaya-web`
  - `yavaya-scheduler`
  - `Postgres`
  - `whatsapp-bridge` (code in `tools/whatsapp-bridge`, volume mounted at `/data`)
- **Working branch:** `claude/yavaya-lat-migration-uzwusm`. Push to it and to `main`.

## Recent work
- **Places:** 6,531 cities and towns.
  - Central America (7 countries) plus Mexico, which is now an open market.
  - Source: GeoNames.
  - Location bar in the header; searchable place picker; live activity toasts.

## WhatsApp: official API (coexistence)
- **Business number:** +505 5836 5522 (WhatsApp Business app + official API through Dualhook).
  - phone_number_id 1270050959528964, WABA 1585588379886491.
- **Bridge:** https://whatsapp-bridge-production-44bb.up.railway.app
  - MCP connector at `/mcp/<ACCESS_TOKEN>`. The URL is in the service's deploy logs, line "PRIVATE — Claude connector".
  - Owner panel at `/panel/<ACCESS_TOKEN>`.
- **Railway variables:**
  - `DUALHOOK_API_KEY`: the owner should rotate this key, since it was pasted into chat.
  - `CLOUD_WEBHOOK_KEY`, `CLOUD_VERIFY_TOKEN`.
  - `LINKED_DEVICE=off`: the unofficial linked device is retired. WhatsApp removed it on Oct 16.
- **Rules:**
  - Messages that are not templates only go to people who wrote to us in the last 24 hours.
  - A first contact requires an approved template.
  - Templates submitted, both PENDING as of Oct 16:
    - `invitacion_restaurantes`
    - `invitacion_yavayago`
- **Owner instructions:**
  - Only interact with restaurants and businesses, never personal contacts.
  - Messages in Spanish, using "usted".
- **Bridge tools:**
  - Reading: `waiting_for_reply`, `read_chat`, `list_chats`.
  - Sending: `send_message`, `send_media`, `send_template`.
  - Templates: `list_templates`, `create_template`.
- **Media on the site:**
  - yavaya.lat/share/yavayago-restaurantes.jpg (card)
  - yavaya.lat/share/yavaya-centroamerica.jpg
  - yavaya.lat/share/yavaya-video.mp4 (video, 13 MB)

## Restaurant outreach (YavayaGo)
| Restaurant | WhatsApp | Status |
|---|---|---|
| Le Florian (Plaza Once) | +505 8864 8847 | Replied "Hola buenas tardes". We sent the pitch, card and video, and asked for the manager. Awaiting reply. |
| Parrilla Volcánica | +505 8719 9806 | Auto-reply. We sent the pitch, card, video and close. Awaiting a person. |
| Bocados del Mar | +505 7640 6673 | Auto-reply. Pitch, card, video and close sent. The number was listed as "Marea Alta" but belongs to Bocados del Mar. |
| Los Ranchos Managua | +505 8866 3246 | Owner to say "Hola" from the app. |
| Rostipollos Nicaragua | +505 8817 3485 | Owner to say "Hola" from the app. |
| Pechugón | +505 5883 7042; commercial: Ishtar Navarro +505 8812 6986 | Got the invitation on Oct 16 from the old personal number. On Oct 23 Ishtar (área comercial) asked about commission, payments, how orders arrive, and driver coverage and support. Answered the same day: 0% commission, founding year, Plan Negocio; cash only; store panel; Managua, drivers checked by a person, coverage reviewed together; offered a call. Awaiting reply. |

- **Pitch (only what is real):** 0% commission; they set their own prices and delivery fee; drivers checked by a person; live map tracking; cash on delivery. Register at yavaya.lat/yavayago.
- **Calls:** offer a call with the team. The owner makes it from the app.

## Business model and YavayaGo (decided Oct 17, 2026, owner delegated)
- **No commission on orders, ever.** Flat restaurant plan instead: 30 delivered orders/month free, then Plan Negocio US$19/month (billing NOT built; nothing charged).
- **Founding restaurants:** free 12 months from approval, for stores approved by 2027-03-31.
- **Launch city: Managua** (setting `go.launch_place`).
- **Gift orders:** "es para otra persona" at checkout. The recipient pays cash; card from abroad is not built.
- **WhatsApp ordering link** plus ready auto-reply text in each store's dashboard.
- **Viajes y mandados** (/yavayago/viajes): rides, parcels, errands and personal help.
  - Customer proposes the fare; drivers accept or counter; customer chooses; cash; 0% commission.
  - Live map and a share link for a trusted contact.
- **Open for the owner:** legality of paid passenger rides per country, the future driver plan, and ratings.

## Open items
- Owner: rotate the Dualhook key, and add a payment method in WhatsApp Manager if templates stay pending.
- Brand tagline ("…de Centroamérica") with Mexico now open: owner's decision.
- Mexican legal text (LFPDPPP): pending.
- Rotate the dLocal, Stripe, Spaceship and Resend keys that were exposed in earlier chats.
