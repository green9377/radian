# Radian — Sales / Orders module review

_A-to-Z architecture + code review, 17 July 2026. Method: `architecture-review` skill
(module-review checklist) + line-by-line read of `apps/api/src/orders/*` and the
admin Orders screens._

**Verdict:** কাঠামো শক্ত (ownership · দুই status track · DEC-MOD-003 · per-line refund
· paisa · audit)। কিন্তু ৫টা critical বাগ ছিল যেগুলো **টাকা আর stock-এর হিসাব ভুল করত**।
সেগুলো + contained major গুলো **এখন ঠিক করা হয়েছে**। বাকিগুলো নিচে "Deferred"-এ,
কারণ ওগুলো নতুন module-সমান কাজ।

---

## ১. FIXED — এই রিভিউতে যা ঠিক করা হলো

প্রতিটা fix কোডে `REV-<id>` comment দিয়ে চিহ্নিত, যাতে খুঁজে পাওয়া যায়।

### 🔴 Critical

**REV-C1 · বাতিলে ভুয়া refund** — `cancel()` line-এর দাম ধরে refund বানাত, **কত টাকা
আসলে জমা পড়েছে তা দেখত না**। COD order (paid ৳0) বাতিল করলেই ভুয়া REFUND transaction
বসে যেত → Payments screen আর Finance দুটোই ভুল।
_Fix:_ per-line হিসাব এখন **entitlement**; আসল payout = `min(entitlement, collected)`।
কিছু জমা না থাকলে refund ০, আর timeline-এ লেখা হয় "কত পাওনা ছিল, কত ছিল হাতে"।
`duePaisa` বাতিলে ০ করা হয়।

**REV-C2 · transition atomic ছিল না → stock দুবার কাটার ঝুঁকি** — `startPreparing`
আগে loop-এ stock কমাত, তারপর status লিখত; মাঝপথে fail করলে stock কমে যেত কিন্তু status
বদলাত না → আবার চাপলে **আরেকবার** কাটত। একই ঝুঁকি `delivered()` (salesCount + LTV) আর
`cancel()`-এ।
_Fix:_ তিনটাই এখন `$transaction`-এ — সব একসাথে হয়, নয়তো কিছুই হয় না।

**REV-C3 · COD নিয়ম edit দিয়ে ফাঁকি** — `assertCodAllowed` শুধু `create()`-এ ছিল, তাই
COD order-এ পরে crafted/advance-required product **যোগ করে দেওয়া যেত**।
_Fix:_ `edit()`-এ `addLines` এলে COD হলে নিয়ম আবার যাচাই হয় (নাম সহ পরিষ্কার error)।

**REV-C5 · টাকা বাকি রেখেই order "completed"** — COD delivered করলে completed হয়ে যেত,
LTV-তে পুরো total যোগ হতো, অথচ `duePaisa` বাকি; order "needs action" থেকেও বেরিয়ে যেত।
_Fix:_ `delivered()` এখন —
· **COD** → হস্তান্তরই টাকা নেওয়ার মুহূর্ত, তাই বকেয়াটা `COD_COLLECTED` হিসেবে record
হয়, paid/status/due আপডেট হয়
· **online + বকেয়া** → **আটকে দেয়** ("আগে payment record করুন")।

**REV-C4 · Report/Overview-এর অঙ্ক শুধু প্রথম ১০০ order থেকে** — ⚠️ **এখনো বাকি**
(নিচে Deferred D1 দেখো)। এটাই একমাত্র critical যেটা রয়ে গেল, কারণ এর জন্য নতুন
server-side aggregate endpoint লাগে।

### 🟠 Major

| id | সমস্যা | fix |
|---|---|---|
| REV-M1 | `failed` dead-end ছিল (retry-র পথ নেই) | `failed → out_for_delivery` অনুমোদিত; timeline-এ "Retrying delivery" |
| REV-M2 | `recomputeMoney` paymentStatus আপডেট করত না; over-payment চুপচাপ হারিয়ে যেত | status এখন re-derive হয়; বেশি জমা থাকলে timeline-এ "Overpaid — refund owed" |
| REV-M4 | stock negative হয়ে যেত | preparing-এর আগে availability check — কম থাকলে কোন product কত কম, নাম সহ error |
| REV-M5 | "What's inside" **সবসময় খালি** (mock-এ slug দিয়ে খুঁজত, আসে DB cuid) | মৃত lookup সরানো; এখন **আসল order line-এর তথ্য** (size · bundle · add-on · perso · type · frozen unit price) + materials-এর জন্য Product-এ link |
| REV-M6 | `CHANNEL_LABEL` hardcoded → `shop`/নতুন channel **ফাঁকা** দেখাত | channel নাম order থেকেই আসে, fallback সহ |
| REV-M8 | payment-এ double-click = দুটো transaction, paid > total | collection বকেয়ার বেশি নয়, refund জমার বেশি নয় — দুটোই আটকানো |

---

## ২. DEFERRED — যা রয়ে গেল (কেন + কী করতে হবে)

| id | কী | কেন এখন নয় | পরিকল্পনা |
|---|---|---|---|
| **D1** 🔴 | **Report/Overview/Payments প্রথম ১০০ order থেকে হিসাব করে** — বেশি হলে revenue/AOV/COD-due **নীরবে ভুল** | server-side aggregate endpoint দরকার | `GET /orders/analytics?days=` (Product-এর `/products/analytics`-এর মতো) → screen সেখান থেকে পড়বে। **সবচেয়ে জরুরি পরের কাজ** |
| **D2** 🟠 | **Order-এ branch/warehouse নেই** — FBR মডেল ৮৪ branch, কোন branch পূরণ করছে বোঝা যায় না | schema migration + Branch module | `Order.branchId` FK; branch-ভিত্তিক report/stock |
| **D3** 🟠 | **Returns & Refunds নেই** (delivery-র পরে) | আলাদা locked module | Returns module — staff-initiated, reason-ভিত্তিক refund method; Sales শুধু initiate করবে |
| **D4** 🟠 | **Recovery-র আসল state নেই** (`awaiting_payment` · `payment_failed` · `abandoned`) | storefront + schema দুটোতেই কাজ | checkout-এ **"Place order" চাপার মুহূর্তেই** order save; তারপর gateway webhook status বদলাবে। এখন screen proxy দেখায় (placed+unpaid) |
| **D5** 🟡 | Settings screen নেই (order-no format · auto-confirm · channel CRUD · SLA) | — | Orders → Settings sub-page |
| **D6** 🟡 | invoice/receipt document নেই (Print পুরো page ছাপে) | — | print-only invoice template |
| **D7** 🟡 | notification automation নেই (এখন manual WhatsApp/email link) | Automation module | order event → template message |
| **D8** 🟡 | order number random (`RAD-xxxxx`), sequential নয় | — | DB sequence / counter table |
| **D9** 🟡 | timeline API **newest-first**, UI গল্পের মতো দেখায়; limit নেই | — | sort ascending + `take` |
| **D10** 🟡 | permission/role নেই — যে কেউ confirm/cancel/refund পারে | Roles & Permissions module | admin-configurable (locked: hardcode নয়) |
| **D11** 🟡 | add-on এখনো **charge**, first-class line নয় | migration | `OrderLine.addOnId` optional FK |
| **D12** 🟡 | partial/split fulfilment নেই (এক order, ভিন্ন সময়ে ভিন্ন item) | — | multi-shipment মডেল |
| **D13** 🟡 | VAT/NBR field নেই | Finance module | Tax module lock হলে |
| **D14** 🟢 | live screen এখনো `_data/orders.ts` mock থেকে type/meta নেয় | — | সব `_data/api.ts`-এ সরানো |

---

## ৩. Checklist ফলাফল (fix-এর পরে)

| Section | আগে | এখন |
|---|---|---|
| Identity · Responsibilities · Entities | ✅ | ✅ |
| Operations · Rules | ⚠️ C3 | ✅ |
| Workflows | ❌ C2, M1 | ✅ |
| Relationships | ✅ | ✅ |
| Reports · Analytics | ❌ C4 | ❌ (D1) |
| Settings | ❌ | ❌ (D5) |
| Bangladesh (bKash/Nagad/VAT) | ⚠️ | ⚠️ (VAT = D13) |
| Scalability | ❌ branch | ❌ (D2) |
| Known critical gaps | ⚠️ | ⚠️ (Returns = D3) |

---

## ৪. যে নিয়মগুলো এই রিভিউতে স্পষ্ট হলো (decision হিসেবে ধরা)

1. **Refund = entitlement নয়, payout** — যা জমা পড়েনি তা কখনো ফেরত যায় না। পাওনা আর
   বাস্তব payout আলাদা করে log-এ থাকে।
2. **Delivered মানে টাকা মীমাংসিত** — COD-তে হস্তান্তরেই collection; online-এ বকেয়া
   থাকলে delivered করা যাবে না।
3. **যোগ করা ≠ বদলানো** — নতুন item রাইডার বেরোনোর আগ পর্যন্ত যোগ করা যায়; পুরোনো line
   Preparing-এ lock (stock committed)।
4. **Failed = retry, dead-end নয়** — জিনিস বানানোই আছে, তাই আবার পাঠানো যায়।
5. **Product-ই price ও material-এর owner** — order কেবল frozen snapshot রাখে; material
   দেখতে Product-এ যেতে হয়।
6. **টাকার সব হিসাব server-side** — screen-এ যোগ করে দেখানো report ভুল হবে (D1)।

---

## ৫. পরের কাজের ক্রম (সুপারিশ)

1. **D1** — `/orders/analytics` endpoint (report-এর সংখ্যা এখন বিশ্বাসযোগ্য নয়)
2. **D4** — checkout-এ click-এই order save (Recovery আসল হবে)
3. **D3** — Returns & Refunds module
4. **D2** — Order-এ branch
5. তারপর D5–D14

---

## ৬. টেস্ট করার demo data

```
docker compose exec api node prisma/seed-orders.js
```
১২টা order, প্রতিটা আলাদা stage-এ (`RAD-D001`…`RAD-D012`) — placed/COD/paid ·
confirmed · preparing · out-for-delivery + courier · delivered · COD collected ·
cancelled (আগে/পরে) · failed · scheduled gift। বারবার চালানো নিরাপদ (নিজের row মুছে নেয়)।
