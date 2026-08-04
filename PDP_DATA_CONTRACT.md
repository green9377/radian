# PDP Data Contract — Admin Panel-এর Spec

**তারিখ:** 14 July 2026
**উৎস:** `apps/web/app/_data/productDetails.ts` (frontend যা যা চায়)
**উদ্দেশ্য:** Ecommerce module lock করার সময় এই ফাইলটাই schema-র spec। Frontend আগে বানানো হয়েছে — তাই এখানে লেখা আছে **frontend ঠিক কী কী field চায়**, কে সেগুলোর owner, আর কোনটা admin থেকে বদলানো যাবে।

---

## ১. মূল নীতি — Content vs Structure

| | Admin বদলাতে পারবে | Code-এ locked |
|---|---|---|
| **Content** | নাম, দাম, ছবি, video, variant, size, bundle, add-on, spec row, FAQ, craft point, offer, trust badge-এর লেখা, section on/off | — |
| **Structure** | — | Section-এর **order**, layout, কোন block কোথায় বসবে |

**কেন structure locked:** PDP-র order হলো `ছবি → দাম → variant → size → bundle → add-on → countdown → CTA`। এটা conversion-এর ক্রম। Admin যদি add-on-কে দামের আগে টেনে আনে, page দেখতে ঠিকই থাকবে কিন্তু বিক্রি পড়ে যাবে — আর কেউ ধরতে পারবে না কেন। ১০টা block যেকোনো order-এ = লক্ষ combination = QA অসম্ভব।

এটাই Category page-এর **D2** সিদ্ধান্তের ধারাবাহিকতা।

---

## ২. তিন স্তরের Variant Model (locked)

PDP-তে তিনটা আলাদা প্রশ্ন, তিনটা আলাদা UI:

| স্তর | কী বদলায় | UI | Data |
|---|---|---|---|
| **Variant** | পুরো product (নিজস্ব ছবি, stock, SEO page) | Colour = গোল swatch<br>Flavour = ছবির pill | **আলাদা Product row** + `variantGroupId` |
| **Size** | শুধু দাম | ছোট pill row | `ProductSize` (একই product-এর child) |
| **Bundle** | নতুন product যোগ হয় | Photo card | `Bundle` (অন্য product-এর reference) |

**দাম = size.price + bundle.addPrice + Σ add-on.price** — সব **integer paisa**।

**Colour আর Flavour একই জিনিস।** দুটোই "একই আইটেম, একটা attribute আলাদা, নিজের ছবি ও stock দরকার"। তাই এক table, এক admin screen। পার্থক্য শুধু `kind` field-এ (`colour` | `flavour`) — যা ঠিক করে UI-তে রঙের গোল বসবে না ছবির pill।

---

## ৩. Frontend যে shape চায়

```ts
ProductDetail {
  product          Product          // products.ts — বিদ্যমান
  crumb            { catLabel, catSlug, subLabel, short }
  nature           { type: "fresh" | "artificial", label }   // ★ customer-এর ১ নম্বর প্রশ্ন
  deliveryChip     string
  gallery          string[]         // ছবির URL (এখন gradient placeholder)
  videoId          string?          // YouTube id — admin শুধু link দেবে
  trust            TrustItem[]      // { icon, label, sub } × 3
  variant          VariantGroup?    // { kind, label, options[] }  ← colour/flavour
  sizes            SizeOption[]     // { id, label, sub, pricePaisa }
  sizeLabel        string           // "Stem Count" / "Weight" / "Box Size"
  bundles          BundleOption[]   // { id, label, addPaisa, bg, tag, best }
  bundleHint       string
  addonTabs        string[]         // tab id — occasion অনুযায়ী group
  perso            Perso?           // { title, fields[] } — শুধু যেখানে লাগে
  spec             SpecRow[]        // { item, qty } ← Specification table
  craft            CraftPoint[]     // { icon, title, text } × 3
  faqs             Faq[]            // { q, a }
  custom           { title, sub }   // WhatsApp customization enquiry
  crossSlugs       string[]         // related products
  ozReason         string           // out-of-zone panel-এর কারণ
  reviews          { rating, count, live }
}
```

---

## ৪. প্রস্তাবিত Schema (Prisma)

```prisma
model Product {              // বিদ্যমান — যা যা যোগ হবে
  variantGroupId  String?    // ← নতুন
  natureType      NatureType // fresh | artificial
  natureLabel     String     // "100% Fresh Flowers"
  videoId         String?
  ozReason        String?
  prepaidOnly     Boolean    // ★ Checkout (14 July) — true হলে COD বন্ধ
}

model VariantGroup {         // colour + flavour, এক table
  id      String
  kind    VariantKind        // colour | flavour
  label   String             // "Colour" / "Flavour"
  products Product[]
}

model ProductVariantMeta {   // group-এর ভেতরে product-এর label + swatch
  productId  String
  label      String          // "Red" / "Black Forest"
  swatch     String          // hex বা gradient
  sortOrder  Int
}

model ProductSize {          // size axis — নিজস্ব SKU + stock
  id          String
  productId   String
  label       String         // "24 Stems" / "2 lb"
  sub         String?        // "serves 12–15"
  pricePaisa  Int            // ⚠️ integer paisa
  sku         String
  stock       Int
  sortOrder   Int
}

model Bundle {               // "+ Chocolates" — অন্য product যোগ
  id           String
  productId    String        // কোন PDP-তে দেখাবে
  label        String
  addsProductId String?      // catalog product (One Data One Owner)
  addPaisa     Int
  imageUrl     String?
  isBest       Boolean
  sortOrder    Int
}

model Addon {                // add-on tray
  id            String
  key           String
  productRefId  String?      // catalog product হলে slug reference
  name          String       // inline service হলে (card, wrap, video)
  pricePaisa    Int
  imageUrl      String?
}

model AddonTab {             // occasion group — Most Added / Birthday / …
  id     String
  label  String
  addons Addon[]
}

model ProductSpec {          // Specification table
  productId String
  item      String
  qty       String
  sortOrder Int
}

model ProductFaq   { productId, question, answer, sortOrder }
model ProductCraft { productId, icon, title, text, sortOrder }
model ProductTrust { productId, icon, label, sub, sortOrder }
```

**Category template:** ৭১টা product-এর প্রত্যেকটার জন্য spec/FAQ/craft হাতে লেখা অসম্ভব। তাই DB-তেও একই নীতি — `CategoryDetailTemplate` table (per-category default), আর `Product*` table-গুলো শুধু **override**। খালি থাকলে template থেকে আসবে। এটাই এখন frontend-এ `TEMPLATES` + `DETAIL_OVERRIDES` হিসেবে চলছে।

---

## ৫. ⇄ SWAP HERE — একটাই জায়গা

```ts
// apps/web/app/_data/productDetails.ts
export function getProductDetail(slug: string): ProductDetail | null
```

এই function-এর **ভেতরটা** `fetch()` হবে। **কোনো component-এ একটা লাইনও বদলাবে না।**

একই নীতি Category page-এ: `getCategoryConfig(slug)`।

---

## ৬. ⚠️ Business সিদ্ধান্ত বাকি — schema lock করার আগে

Frontend এগুলো ধরে নিয়েছে, কিন্তু business এখনো নিশ্চিত করেনি:

1. **Per-variant stock** — লাল গোলাপ আছে, সাদা নেই — দোকান কি এভাবে গোনে? না গুনলে variant = আলাদা product রাখার মানে কমে যায়।
2. **Per-size SKU + stock** — "24 stems শেষ, 12 আছে" — track হবে?
3. **Bundle-এর দাম** — component product-এর দামের যোগফল, নাকি আলাদা bundle price (discount সহ)?
4. **Offer engine** — bKash cashback, NEW15 coupon, "৳3,000-এর উপরে free midnight" — এগুলো **Marketing module**-এর rule, admin-এর free text নয়। Marketing locked নয়।
5. **Countdown cut-off** (6 PM) — Operations module-এর delivery rule, নাকি per-product config?
6. **was-price (কাটা দাম)** — এখন `price ÷ 0.81` দিয়ে display-only হিসাব হয়। আসল MRP field লাগবে কি না — এটা pricing policy।
7. **Review rating** — এখন সব product-এ hardcoded 4.9/412। Google Business profile থেকে আসবে, নাকি per-product review table?
8. **`prepaidOnly` কে ঠিক করে** — এখন product-এর নিজস্ব flag (admin on/off)। কিন্তু এটা কি আসলে **category** rule (সব personalised = advance) নাকি সত্যিই per-product? Category হলে template-এ যাবে, product-এ override।

---

## ৭. Constitution মিলিয়ে

- ✅ Money = integer paisa
- ✅ One Data One Owner — add-on/bundle catalog product-এর slug reference করে, duplicate করে না
- ✅ Zone rule — `zoneFilter()` প্রতিটা product list-এ
- ✅ GBE order locked — Reviews → Visit Store → Footer
- ⚠️ Build order (Schema → API → Frontend) **উল্টো** হয়েছে — prototype হিসেবে ইচ্ছাকৃত। এই ফাইলটাই সেই debt শোধ করে: frontend যা চায়, তা-ই schema-র spec।
- ❌ Real photos — এখনো gradient placeholder। **Hard launch dependency**।
