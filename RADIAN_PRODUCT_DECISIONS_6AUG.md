# Product page — ৬ আগস্ট ২০২৬-এর সিদ্ধান্তগুলো (DEC-PRD-031 … 032)

আগের অংশ: `RADIAN_PRODUCT_DECISIONS_3AUG.md` (DEC-PRD-022 … 029)।

সব সিদ্ধান্ত মালিকের নিজের কথা থেকে। কোনোটাই অনুমান করে বসানো হয়নি —
ব্যবসার নিয়ম মালিক দেন, এই নথি শুধু সেটা কেন আর কীভাবে বসল তা রাখে।

---

## DEC-PRD-031 — Short description PDP-তে, title-এর নিচে

**Business Problem.** Admin-এর "Short description" field-এর পাশে লেখা
ছিল "On cards only" — মানে এটা শুধু product card-এ দেখানোর কথা, product-এর
নিজের page-এ না। কিন্তু বাস্তবে API সবসময় `shortDesc` পাঠাত, অথচ
`apps/web/app/_data/productApi.ts`-এর `fetchProductDetail()` কখনো সেটা
read করত না, আর PDP-তে কোথাও একটা "description" section-ই ছিল না। ফলে
মালিক লেখা সেভ করলেও তা কোথাও দেখা যেত না — card-এও না (sales/new-arrival
override করে ফেলত, DEC নিচে) আর page-এও না।

মালিক, ৬ আগস্ট ২০২৬: *"ata dorkar bolei to rakhsi. ha title niche short
descripton."*

**Decision.** PDP-তে title (`<h1>`)-এর ঠিক নিচে, review সারির উপরে, একটা
লাইনে short description বসবে — খালি থাকলে লাইনটাই থাকবে না।

**Reason.** মালিক নিজে লিখেছেন এই জন্যই যে এটা দরকার। খালি বাক্স বা বানানো
কিছু না দেখিয়ে, লেখা থাকলে দেখানো — এটাই honest default।

**Alternatives.** "On cards only" লেবেলটাই সঠিক ধরে card-এ আরও prominently
বসানো। **বাতিল:** মালিক স্পষ্ট বলেছেন page-এ দরকার; card-এ থাকা বা না থাকা
আলাদা সিদ্ধান্ত (এটা অপরিবর্তিত)।

**Impact.** `productDetails.ts` (ProductDetail type) · `productApi.ts`
(fetchProductDetail) · `PdpView.tsx`।

---

## DEC-PRD-032 — Publish-এর গেট: ছবি, দাম, category, delivery speed

**Business Problem.** কোনো mandatory check ছাড়াই একটা product publish হয়ে
যেত — ছবি না থাকলেও, দাম ০ রাখলেও। ফলে storefront-এ রঙিন placeholder বাক্স
নিয়ে একটা "লাইভ" product ঘুরত। Admin-এর কোনো form field-এও mandatory কিনা
তার কোনো sign ছিল না।

মালিক, ৬ আগস্ট ২০২৬: *"ami jodi product image na dei taw amr published
hoy... ata biroktikor... pura product uplaod page konta mendatory ar
konta na atar kon sign nai."*

জিজ্ঞেস করা প্রশ্নের উত্তরে মালিকের সিদ্ধান্ত:
1. ছবি ছাড়া publish আটকাবে (draft হিসেবে save করা যাবে, publish না)
2. এছাড়াও বাধ্যতামূলক: দাম শূন্যের বেশি, category বাছা, অন্তত একটা
   delivery speed (Express/Same Day/Midnight) টিক করা

**Decision.** `products.service.ts`-এ নতুন `assertPublishReady()` — `create()`
আর `update()` দুটোতেই, `isPublished: true` হওয়ার মুহূর্তে ৪টা শর্ত check
করে, একটাও না মিললে `BadRequestException` (Draft save-কে কখনো আটকায় না)।
Admin-এ সংশ্লিষ্ট ৪টা field-এর পাশে লাল `*` (নতুন `Req`/`L required` prop) —
Product name-এর পাশে না (নাম আলাদা reason-এ mandatory, publish-gate না),
বরং Category, Selling price, Photos card, Zone & delivery card-এ।

**Reason.** মালিকের নিজের সিদ্ধান্ত — placeholder ছবি নিয়ে লাইভ product আর
বন্ধ করতে চান। Draft আটকানো হয়নি যাতে অসম্পূর্ণ কাজ সেভ করে পরে ফেরা যায়।

**Alternatives.** শুধু warning badge দেখানো, publish না আটকানো। **বাতিল:**
মালিক স্পষ্ট বলেছেন আটকাতে হবে ("Image ছাড়া publish আটকাবে")।

**Impact.** `apps/api/src/products/products.service.ts` (create, update,
assertPublishReady) · `apps/admin/app/_components/ProductEditor.tsx`
(Req, L{required}, Card titles)।

**Note.** `leadTimeDays`/baseline delivery (DEC-DLV-011 — "Schedule It" /
"Nationwide Courier") সবসময় কাজ করে speed টিক ছাড়াও। এই গেট সেটা বদলায়নি —
শুধু owner-কে বাধ্য করে প্রতিটা product-এ ইচ্ছাকৃতভাবে অন্তত একটা speed
বেছে দিতে, যাতে "delivery configure করতে ভুলে গেছি" অবস্থায় publish না হয়।

---
