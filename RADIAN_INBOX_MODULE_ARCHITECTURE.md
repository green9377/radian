# Radian — Unified Inbox & AI Support Module Architecture (draft, 5 Aug 2026)

> Owner set the three founding rulings in chat, 5 Aug 2026 (table in §3).
> Companion docs: `RADIAN_ADMIN_PROGRESS.md`, `RADIAN_DELIVERY_MODULE_ARCHITECTURE.md`
> (doc mould), `CLAUDE.md` (house rules — soft delete, audit, admin-configurable).
> **Status: DRAFT — awaiting owner approval before any code.**

---

## 1. Purpose

Every channel a customer talks on — website live chat, Facebook Messenger,
Instagram DM, WhatsApp, SMS — lands in ONE admin inbox. An AI agent answers
first, using read-only access to the business's own data (orders, stock,
delivery areas, policies). When the AI can't handle it, it notifies the
assigned responsible person. The moment a human replies, the AI goes quiet in
that conversation.

**Core Purpose:**
> No customer message is ever missed, and no staff member wastes time on a
> question the system already knows the answer to.

---

## 2. Module responsibilities

**Owns / does:**
- `Conversation` + `Message` — the single record of every customer chat,
  whatever channel it arrived on.
- Website live chat widget (storefront side) and its delivery to the inbox.
- Channel connectors (Phase 3): Messenger, Instagram DM, WhatsApp Cloud API,
  SMS gateway — webhook in, reply out.
- The AI first-responder: drafting and sending replies, deciding when to
  escalate, logging every answer it gave and why.
- Escalation — notifying the assigned responsible person(s).
- Human takeover — per-conversation AI pause, audit-logged.
- Inbox settings — all of it admin-configurable, nothing hardcoded.

**Does NOT own / do:**
- `Customer` → Customers module. Inbox links a conversation to a customer by
  FK (matched on phone/email), never copies customer data.
- `Order`, order status, cancel/refund → Sales. The AI READS order state
  through existing services; it never writes.
- Stock, prices, delivery config → their owner modules. Read-only for AI.
- Marketing broadcasts / campaign messages → Marketing. Inbox is 1-to-1
  support conversation, not bulk messaging.
- Creating discounts, promising refunds, changing delivery commitments —
  **no path in this module does this, human or AI** (money actions live in
  their owner modules with PIN).

---

## 3. Owner rulings (chat, 5 Aug 2026)

| id | Ruling |
|---|---|
| DEC-INB-001 | The AI never promises money or commitments: no discount, no refund, no delivery-time change. Those intents ALWAYS escalate to a human. |
| DEC-INB-002 | The AI replies in the customer's language — Bangla, English, or Banglish, mirroring what the customer used. |
| DEC-INB-003 | The responsible person is NOT fixed. Admin assigns who handles escalations, changeable any time (branch-ready for the 84-branch future). |
| DEC-INB-004 | When a staff member replies in a conversation, the AI switches off **for that conversation only**. Re-enabling is manual, per conversation. |
| DEC-INB-005 | The AI is read-only. It answers from business data through controlled read endpoints; it never mutates orders, stock, prices, or customer records. |
| DEC-INB-006 | Live chat identity: a signed-in customer is never asked anything — the system identifies them automatically. A guest is asked name + phone with a visible skip option; skipping still allows chat, and the AI asks for a phone/order number only when the question actually needs one. |
| DEC-INB-007 | The AI is a shopping assistant, not just a status desk. "Budget ৳2000, show me bouquets" → the AI searches the PUBLISHED catalog and shows product cards (photo, name, price, View, Add-to-cart) inside the chat. Still read-only: it quotes the shop's published prices, never invents one; Add-to-cart runs in the customer's own browser, the AI writes nothing. Two providers (Claude + OpenAI) will be tested head-to-head on the same script before one is chosen; the provider stays a swappable setting. |

---

## 4. Business entities owned

### Entity: Conversation
- **Definition:** One customer's one thread on one channel.
- **Created when:** First inbound message from a new visitor/number/handle on
  a channel (or customer opens live chat).
- **Key fields:** `channel` (WEB_CHAT / MESSENGER / INSTAGRAM / WHATSAPP / SMS),
  `customerId?` (FK, matched by phone/email when known), `guestName`,
  `guestPhone`, `status` (OPEN / WAITING_CUSTOMER / RESOLVED),
  `aiEnabled` (bool, default from settings), `assigneeId?` (FK AppUser),
  `lastMessageAt`, `escalatedAt?`, `deletedAt`.
- **Lifecycle:** OPEN → (WAITING_CUSTOMER ↔ OPEN) → RESOLVED. Reopens on new
  inbound message.
- **Deleted:** soft only (`deletedAt`), house rule.

### Entity: Message
- **Definition:** One message inside a conversation, either direction.
- **Key fields:** `conversationId`, `direction` (IN / OUT),
  `authorType` (CUSTOMER / AI / STAFF / SYSTEM), `authorUserId?`,
  `body`, `attachments[]`, `externalMessageId?` (channel's own id, dedupe),
  `aiMeta?` (JSON: confidence, tools used, escalation reason), `readAt?`.
- **Created when:** Webhook/in-app event (IN) or staff/AI sends (OUT).
- **Deleted:** never hard-deleted; conversations are business record.

### Entity: EscalationEvent
- **Definition:** A moment the AI (or a rule) handed a conversation to humans.
- **Key fields:** `conversationId`, `reason` (MONEY_TOPIC / LOW_CONFIDENCE /
  CUSTOMER_ASKED_HUMAN / ANGRY_CUSTOMER / OFF_SCRIPT / MANUAL), `notifiedUserIds[]`,
  `acknowledgedBy?`, `acknowledgedAt?`.
- **Why an entity, not just a notification:** reports need "how often does the
  AI give up, and why" — that history must survive.

### Entity: InboxSetting (singleton, admin-editable)
- All settings in §10. Follows the `common/singleton.ts` pattern
  (the 30 Jul lesson — lazily-created row behind a unique column).

---

## 5. Business rules

### INB-RULE-001: Money topics always escalate (DEC-INB-001)
- **Condition:** Inbound message intent involves discount, refund, payment
  dispute, or changing a promised delivery time.
- **Action:** AI does not answer the substance. It sends a polite holding line
  (in the customer's language), creates `EscalationEvent(MONEY_TOPIC)`,
  notifies assignees.
- **Exception:** none. Not configurable off.

### INB-RULE-002: Reply in the customer's language (DEC-INB-002)
- **Condition:** Every AI reply.
- **Action:** Detect the language of the customer's latest messages
  (Bangla script, English, or romanised Banglish) and mirror it.
- **Exception:** none.

### INB-RULE-003: Human reply pauses AI, per conversation (DEC-INB-004)
- **Trigger:** Any OUT message with `authorType=STAFF` in a conversation.
- **Action:** Set `aiEnabled=false` on that conversation. Audit-log who took
  over and when. The inbox UI shows the switch state on every thread.
- **Exception:** Staff can flip `aiEnabled` back on, per conversation. That
  flip is also audited.

### INB-RULE-004: AI reads, never writes (DEC-INB-005)
- **Condition:** Always.
- **Action:** The AI's tool belt contains ONLY read endpoints: order status by
  phone/order-no, product price/stock/availability, **catalog search with
  budget/category/occasion filters (DEC-INB-007)**, delivery areas & fees,
  published policies/FAQ, shop hours. No mutation endpoint is ever exposed
  to it.
- **Exception:** none. New AI tools require owner approval and a DEC entry.

### INB-RULE-010: Product suggestions are cards, from the shop's own truth (DEC-INB-007)
- **Condition:** The AI recommends products (budget ask, occasion ask, "show
  me…").
- **Action:** It calls the catalog-search tool (published products only, the
  same filter the storefront uses), and the reply carries structured product
  refs — the widget renders photo + name + price + View + Add-to-cart. The
  AI's text may describe; the numbers on the card come from the API, never
  from the AI's own mouth.
- **Exception:** none. If the search returns nothing in budget, the AI says so
  and offers the nearest options — it never invents a product or a price.

### INB-RULE-005: Escalation notifies the assigned humans (DEC-INB-003)
- **Trigger:** `EscalationEvent` created.
- **Action:** In-admin notification to every user in
  `InboxSetting.escalationAssignees`. (Later: optional WhatsApp ping to those
  same users — Phase 3, needs WhatsApp connector anyway.)
- **Exception:** If the assignee list is empty, notify all OWNER-role users —
  the inbox must never escalate into silence.

### INB-RULE-006: One thread per customer per channel
- **Condition:** Inbound message arrives.
- **Action:** Match on channel + external identity (phone/handle/session).
  Existing non-deleted conversation → append; else create. Prevents the same
  customer scattering across ten threads.
- **Exception:** A RESOLVED conversation older than a configurable window
  (default 30 days) starts a fresh thread instead of reopening.

### INB-RULE-007: Identity linking is read-side, not copy
- **Condition:** Guest phone/email matches a Customer record.
- **Action:** Set `customerId` FK. The inbox panel then shows their orders
  (read from Sales) beside the chat. Customer data itself is never copied
  into inbox tables (One Data One Owner).

### INB-RULE-009: Chat-open identity (DEC-INB-006)
- **Condition:** Customer opens the live chat widget.
- **Action:** Signed-in → conversation linked to their account instantly,
  nothing asked. Guest → name + phone form with a clear skip. Skipped →
  anonymous conversation; the AI asks for phone/order-no only when a question
  needs it (order status), and a later-given phone links the thread
  retroactively (INB-RULE-007).
- **Exception:** none.

### INB-RULE-008: Off-hours auto-reply
- **Condition:** Inbound message outside configured support hours AND
  AI globally disabled (if AI is on, it answers 24/7 — that's its job).
- **Action:** Send the configured off-hours message once per conversation
  per day.

---

## 6. Workflows

### Workflow: Inbound message
1. Message arrives (webhook or live-chat socket) → dedupe on
   `externalMessageId` → store as Message(IN).
2. Conversation found-or-created (INB-RULE-006), customer matched
   (INB-RULE-007).
3. If conversation `aiEnabled` AND global AI on → AI reply workflow.
   Else → unread badge for humans; off-hours rule may fire.
- **End state:** Message stored, answered or waiting on a human — never lost.

### Workflow: AI reply
1. Build context: last N messages, customer's orders (read-only), relevant
   policy/product data fetched via tools.
2. Intent gate FIRST: money topic (INB-RULE-001), "talk to a human", abuse /
   anger detection → escalate, stop.
3. Draft reply in customer's language (INB-RULE-002). Confidence below
   threshold → escalate instead of guessing.
4. Send as Message(OUT, authorType=AI, aiMeta filled).
- **End state:** Customer answered, or EscalationEvent + holding line.
- **Exception handling:** AI provider down/timeout → conversation flagged
  unread for humans; customer gets the configured "we'll be right with you"
  line once. The inbox never depends on the AI being alive.

### Workflow: Escalation
1. EscalationEvent created with reason.
2. Assignees notified (INB-RULE-005). Thread badge turns "needs human".
3. First assignee to open the thread can acknowledge → their name lands on
   `acknowledgedBy`.
- **End state:** A named human owns the thread.

### Workflow: Human takeover
1. Staff opens thread, sees full history (customer + AI messages, AI's
   escalation reason).
2. Staff types a reply → AI off for this conversation (INB-RULE-003), audited.
3. Staff resolves (`status=RESOLVED`) when done.
- **End state:** Human-handled thread; AI stays off until manually re-enabled.

---

## 7. Module relationships

| Module | Direction | What |
|---|---|---|
| Customers | ← read | Match guest→customer, show profile beside chat |
| Sales/Orders | ← read | Order status/history for the AI and the staff panel |
| Products/Inventory | ← read | Price, stock, availability answers |
| Delivery | ← read | Areas, fees, slots ("do you deliver to Savar?") |
| Content/SEO | ← read | Policies, FAQ — the AI quotes what the shop publishes |
| Administration | ← read / → notify | AppUser list for assignees; in-admin notifications; audit log |
| Marketing | none (boundary) | Bulk/broadcast stays in Marketing; Inbox is 1-to-1 |

---

## 8. Reports

- **Response time** — first-reply time per channel, AI vs human. (The number
  customers feel.)
- **AI resolution rate** — conversations closed with zero human messages.
- **Escalation breakdown** — by reason; rising MONEY_TOPIC = pricing page
  unclear, rising LOW_CONFIDENCE = AI needs more data sources.
- **Volume by channel/hour** — staffing evidence for the future branches.

## 9. Analytics (feeds Intelligence)

- Support load vs order volume (do chats convert?).
- Top question intents — what the website fails to answer; feeds Content/FAQ.

---

## 10. Settings (all admin-editable — house rule)

| Setting | Default | Notes |
|---|---|---|
| AI globally on/off | on | Kill-switch without touching per-thread flags |
| AI default for new conversations | on | DEC-INB-004 flips per thread |
| Escalation assignees | [] → falls back to OWNERs | DEC-INB-003; multi-select of AppUsers |
| Support hours + off-hours message | 9:00–22:00 | INB-RULE-008 |
| Confidence threshold | medium | Below it → escalate, never guess |
| Money-topic keywords (extra) | built-in list | Owner can add Bangla/Banglish phrasings |
| Thread reopen window | 30 days | INB-RULE-006 |
| Per-channel enable | WEB_CHAT only (Phase 1) | Others unlock as connectors ship |
| AI provider + key | — | Stored server-side only, never in the browser |

---

## 11. Build phases (one at a time, owner approves each)

| Phase | Scope | Depends on |
|---|---|---|
| **1 — Inbox core + live chat** | Conversation/Message/settings schema → API → storefront chat widget → admin inbox screen (threads, reply, resolve, assign). No AI yet — humans answer. | nothing external |
| **2 — AI first-responder** | Tool belt (read endpoints), intent gate, language mirroring, escalation + notifications, per-thread pause. | Phase 1 |
| **3 — Channels** | Messenger + Instagram (one Meta app), then WhatsApp Cloud API, then SMS gateway. Each is "webhook in → same inbox". | Phase 1 (2 recommended); real FB Page/IG/WA accounts; Meta app review |

Phase order follows the house rule: schema → API/business rules → frontend.

---

## Open questions (need owner's word before the relevant phase)

- [ ] **AI provider & budget** (Phase 2): Claude API / OpenAI — monthly cap?
- [x] **Live chat identity** — RESOLVED as DEC-INB-006 (owner, 5 Aug 2026).
- [ ] **Retention** (Phase 1): conversations kept forever (soft-delete only),
      or archived to cold view after N months?
- [ ] **Branch routing** (future): when branches exist, do escalations route
      by the customer's delivery area?

## Decision log references
- DEC-INB-001 … 005 — §3 above (owner, 5 Aug 2026).
- Depends on existing: DEC-FIN-028 (auth/PIN), One-Data-One-Owner (CLAUDE.md §4).
