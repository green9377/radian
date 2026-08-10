/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  ছাড়ের মেয়াদ — DEC-PRD-028
 *
 *  মালিকের নির্দেশ, ৩ আগস্ট ২০২৬:
 *
 *  > "amra jodi nirdisto product a kono offer chalai like discount, tar
 *  >  timing dewar jayga nei — start date and end date. ja frontend and
 *  >  admin panel akoi sathe dekhabe ar kaj korbe."
 *
 *  ⚠️ এই ফাইলটা কেন আছে
 *
 *  ছাড়ের অঙ্কটা কোড জুড়ে **ছয় জায়গায়** আলাদা করে লেখা ছিল — storefront
 *  grid, product page, admin margin, order, POS, offers। তারিখের নিয়মটা
 *  যোগ করার দিন সেটাই ধরা পড়ল: page-এ ছাড় বন্ধ হলো, grid-এ চলতেই থাকল,
 *  আর order লাইনে পুরনো দামই বসল। গ্রাহক এক পাতায় ৳২,১৬০ দেখে অন্য পাতায়
 *  ৳২,৪০০ দিত।
 *
 *  তাই নিয়মটা এখন **একটাই জায়গায়**। নতুন কোথাও দাম বসাতে হলে এখান থেকে
 *  ডাকো — নিজের হাতে আরেকবার লিখো না।
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface DiscountWindow {
  /** `null`/`undefined` = এখনই শুরু */
  discountStartsAt?: Date | null;
  /** `null`/`undefined` = শেষ নেই */
  discountEndsAt?: Date | null;
}

/**
 * ছাড়টা এই মুহূর্তে চলছে কি না।
 *
 * ⚠️ শেষ তারিখটা **সহ**। মালিক "১০ আগস্ট পর্যন্ত" লিখলে ১০ তারিখ দিনটাও
 * ছাড়ে থাকে — দুপুরে হঠাৎ দাম বেড়ে যাওয়াটা তিনি বাগ বলতেন, আর ঠিকই
 * বলতেন। তাই শেষ তারিখকে ওই দিনের ২৩:৫৯:৫৯ ধরা হয়।
 *
 * ⚠️ বাংলাদেশ সময় (UTC+6)। server UTC-তে চললেও দিনটা দোকানের দিন।
 */
export function discountLive(w: DiscountWindow, at: Date = new Date()): boolean {
  const now = at.getTime();
  const s = windowStartMs(w.discountStartsAt);
  const e = windowEndMs(w.discountEndsAt);
  if (s !== null && s > now) return false;
  if (e !== null && e < now) return false;
  return true;
}

/**
 * DEC-PRD-042 (১০ আগস্ট ২০২৬) — মালিক এখন সময়ও বসাতে চান।
 *
 * আগের নিয়মটা পুরো দিন ধরত: শুরু = ওই দিনের ০০:০০, শেষ = ২৩:৫৯:৫৯。 ফলে
 * "রাত ৯টায় শেষ" বলার কোনো উপায় ছিল না — সময় পাঠালেও ফেলে দেওয়া হতো。
 *
 * এখন: **মালিক সময় দিলে সেই সময়টাই**, না দিলে আগের আচরণই — শুরুর দিনের
 * শুরু, শেষ দিনের শেষ。 তাঁর ৩ আগস্টের রায় ("১০ তারিখ পর্যন্ত মানে ১০
 * তারিখ দিনটাও") তাই অক্ষত থাকল, আর মধ্যরাতের অফার এখন সম্ভব。
 *
 * ⚠️ "সময় দেওয়া হয়েছে" চেনার উপায় — বাংলাদেশ সময়ে মধ্যরাত কি না。 admin
 * তারিখ-মাত্র হলে ঠিক 00:00:00 BD পাঠায়; সময় বসালে অন্য কিছু。 সীমারেখার
 * ঠিক উপরের এক সেকেন্ড (রাত ১২টায় শেষ) তাই দিনের শেষ ধরা হবে — সেটাই
 * মালিকের বোঝানো জিনিস。
 */
function windowStartMs(d?: Date | null): number | null {
  if (!d) return null;
  return hasTimeOfDay(d) ? d.getTime() : startOfBdDay(d);
}
function windowEndMs(d?: Date | null): number | null {
  if (!d) return null;
  return hasTimeOfDay(d) ? d.getTime() : endOfBdDay(d);
}
function hasTimeOfDay(d: Date): boolean {
  return (d.getTime() + BD_OFFSET_MS) % DAY_MS !== 0;
}

/** the moment this discount stops, in epoch ms — `null` = no end (storefront countdown) */
export function discountEndsMs(w: DiscountWindow): number | null {
  return windowEndMs(w.discountEndsAt);
}
/** the moment it starts, in epoch ms — `null` = already running */
export function discountStartsMs(w: DiscountWindow): number | null {
  return windowStartMs(w.discountStartsAt);
}

const BD_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** ওই তারিখের বাংলাদেশ-দিনের শুরু, epoch ms-এ */
function startOfBdDay(d: Date): number {
  return Math.floor((d.getTime() + BD_OFFSET_MS) / DAY_MS) * DAY_MS - BD_OFFSET_MS;
}
/** ওই তারিখের বাংলাদেশ-দিনের শেষ মুহূর্ত */
function endOfBdDay(d: Date): number {
  return startOfBdDay(d) + DAY_MS - 1;
}

/**
 * গ্রাহক যা দেয়।
 *
 * ⚠️ PERCENT basis point-এ: 1000 = 10%। FLAT paisa-তে।
 * ⚠️ মেয়াদের বাইরে হলে ছাড়ের সংখ্যাটা **মোছা হয় না** — শুধু বসে না।
 *    তারিখ বাড়ালেই আবার চলবে, কিছু আবার লিখতে হয় না।
 */
export function paidPaisa(
  p: {
    sellingPricePaisa: number;
    discountType: 'NONE' | 'FLAT' | 'PERCENT' | string;
    discountValue: number;
  } & DiscountWindow,
): number {
  if (!discountLive(p)) return p.sellingPricePaisa;
  if (p.discountType === 'FLAT') return Math.max(0, p.sellingPricePaisa - p.discountValue);
  if (p.discountType === 'PERCENT')
    return Math.max(0, Math.round(p.sellingPricePaisa * (1 - p.discountValue / 10000)));
  return p.sellingPricePaisa;
}
