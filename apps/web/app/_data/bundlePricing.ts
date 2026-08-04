/*
  ═══════════════════════════════════════════════════════════════════════════
  BUNDLE PRICING — DEC-PRD-018, মালিকের সিদ্ধান্ত ২ আগস্ট ২০২৬

  > *"just main product নিলে কোনো discount নেই, আর সাথে extra কোনো bundle
  >  থেকে product select করলেই সে discount পাবে — এটা আমার concept।"*

  এক product-এ একটাই তালিকা, একটাই ছাড়। মালিক ৩-৪টা জিনিস রাখেন; গ্রাহক
  তার থেকে যা খুশি নেয়, বাকিগুলো skip করে। একটাও নিলেই ছাড় বসে — **main
  product সহ** মোট দামের উপর।

  ⚠️ আগে এখানে "কোন bundle-এ main গোনা হবে" নিয়ে একটা জটিল নিয়ম ছিল
  (DEC-PRD-017)। সেটা এসেছিল আমার ভুল প্রশ্ন থেকে — আমি ধরে নিয়েছিলাম
  bundle মানে আলাদা আলাদা প্যাকেজ। মালিক ধরিয়ে দিয়েছেন: একটাই তালিকা।
  তাই নিয়মটাও উঠে গেছে।

  ⚠️ একটাই জায়গা, আর সেটাই এই ফাইলের কারণ। product page দাম দেখায়, cart
  আবার হিসাব করে (দাম বদলাতে পারে বলে), checkout সেটা যোগ করে। তিন জায়গায়
  তিনটে হিসাব লিখলে একদিন page বলত ৳5,310 আর cart বলত ৳5,900 — আর গ্রাহক
  টাকা দেওয়ার ঠিক আগের মুহূর্তে সংখ্যাটা বদলে যেতে দেখতেন।

  ⚠️ ছাড় server-এ বসানো হয়নি কারণ গ্রাহক কোনগুলো নেবেন সেটা server জানে
  না। কাঁচা সংখ্যা ওখান থেকে আসে, বসানোটা এখানে — একবার।
  ═══════════════════════════════════════════════════════════════════════════
*/

export type DiscountKind = "NONE" | "FLAT" | "PERCENT";

export interface BundleItem {
  /** যোগ হওয়া product-এর id — cart-এ এটাই যায়, নাম নয় */
  id: string;
  name: string;
  imageUrl: string | null;
  /** এটার আজকের দাম, নিজের ছাড় বসানোর পর */
  pricePaisa: number;
}

export interface BundleList {
  discountType: DiscountKind;
  /** FLAT = paisa · PERCENT = basis points (1000 = 10%) */
  discountValue: number;
  items: BundleItem[];
}

/**
 * ছাড় বসানো — Radian-এর সর্বত্র একই নিয়ম।
 *
 * ⚠️ PERCENT basis point-এ (1000 = 10%), আর ভাগটা শেষে একবার। 0.1 দিয়ে গুণ
 * করলে ৳1,299 একদিন ৳1,169.0999999999999 হয়ে বসে।
 */
export function applyDiscount(paisa: number, type: DiscountKind, value: number): number {
  if (type === "FLAT") return Math.max(0, paisa - value);
  if (type === "PERCENT") return Math.max(0, Math.round((paisa * (10000 - value)) / 10000));
  return paisa;
}

export interface BundleTotals {
  /** main + বাছা জিনিস, ছাড় বসানোর পর — এক unit-এর দাম */
  totalPaisa: number;
  /** ছাড় না থাকলে যা পড়ত */
  beforePaisa: number;
  /** কত বাঁচল। ০ = ছাড়ই নেই, বা কিছুই বাছা হয়নি */
  savePaisa: number;
}

/**
 * @param basePaisa গ্রাহক main product-এর জন্য যা দিচ্ছে — রঙ বা মাপ বাছার
 *   পরের দাম। ছাড় এর উপরেই বসে, তাই ২ কেজি কেক নিলে ছাড়ও বড় হয়।
 * @param pickedIds তালিকা থেকে যেগুলো নেওয়া হয়েছে, product id দিয়ে।
 */
export function bundleTotals(
  basePaisa: number,
  list: BundleList | null | undefined,
  pickedIds: string[],
): BundleTotals {
  const picked = (list?.items ?? []).filter((i) => pickedIds.includes(i.id));
  const beforePaisa = basePaisa + picked.reduce((n, i) => n + i.pricePaisa, 0);

  /*
    ⚠️ কিছু না নিলে ছাড় নেই — মালিকের স্পষ্ট নিয়ম: *"just main product
    নিলে কোনো discount নেই"*। এই শর্তটা না থাকলে ছাড়টা একা product-এর
    দামের উপরেও বসে যেত, আর তখন তালিকাটা বানানোর মানেই থাকত না।
  */
  if (!list || picked.length === 0) {
    return { totalPaisa: basePaisa, beforePaisa, savePaisa: 0 };
  }

  const totalPaisa = applyDiscount(beforePaisa, list.discountType, list.discountValue);
  return { totalPaisa, beforePaisa, savePaisa: beforePaisa - totalPaisa };
}
