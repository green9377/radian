-- ─────────────────────────────────────────────────────────────────────────────
--  মজুদ শূন্য হলে কী হবে — DEC-PDP-09, মালিকের সিদ্ধান্ত ১ আগস্ট ২০২৬
--
--  "stock 0 হলে order দেওয়া যাবে না। হয় stock out আসবে, বা pre-order আসবে।"
--
--  এতদিন শূন্য মজুদের product পুরোপুরি কেনা যেত — Add to Cart, Buy Now, সব
--  চালু। শুধু bundle-এর ভেতর থাকলে বাদ পড়ত (৩১ জুলাইয়ের নিয়ম), নিজের
--  page-এ কোনো বাধা ছিল না।
--
--  দুটো column যোগ হচ্ছে:
--    1. Product.soldOutMode   — STOCK_OUT (default) | PRE_ORDER, প্রতি product
--    2. Product.preorderDate  — PRE_ORDER হলে মালিকের লেখা "Expected back on"
--
--  পুরনো সব সারি নিরাপদ দিকেই যায়: STOCK_OUT, তারিখ NULL। মানে migration
--  চালানোর পর শূন্য-মজুদ product গুলো বিক্রি বন্ধ হয়ে যাবে — এটাই উদ্দেশ্য,
--  কিন্তু এটাই সেই একটা লাইন যা চালানোর সাথে সাথে দোকানের আচরণ বদলে দেয়।
--
--  ⚠️ যা এই migration সারায় না — এবং architecture project-এ ঠিক হওয়া দরকার:
--  DEC-MOD-003 অনুযায়ী stock কমে Delivery Processing-এ, order confirm-এ নয়।
--  তাই শেষ ১টা জিনিস একাধিক গ্রাহক কিনে ফেলতে পারে — delivery না হওয়া
--  পর্যন্ত সংখ্যাটা ১-ই থাকে। এই গেট শূন্যে বন্ধ করে, কিন্তু দেরিতে।
--  প্রস্তাবিত সমাধান (এখনো অনুমোদিত নয়): আলাদা `reservedQty` counter —
--  confirm-এ বাড়ে, delivery-তে কমে; website দেখে stockQty − reservedQty।
--  তাতে DEC-MOD-003 ভাঙে না, stock তখনো Delivery Processing-এই কমে।
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TYPE "SoldOutMode" AS ENUM ('STOCK_OUT', 'PRE_ORDER');

ALTER TABLE "Product"
  ADD COLUMN "soldOutMode" "SoldOutMode" NOT NULL DEFAULT 'STOCK_OUT',
  ADD COLUMN "preorderDate" TIMESTAMP(3);
